/*
 * Dead-man switch del pipeline pg_cron (auditoría v3 · #15).
 *
 * Los crons HTTP (migraciones 015, 016, 021 y 032) se agendan en pg_cron; si CRON_SECRET se rota, el
 * dominio cambia, o los secretos del Vault faltan, TODOS reciben 401 en runtime y dejan de correr
 * — y como el sistema de alertas ES un cron, ese fallo sería TOTALMENTE SILENCIOSO. Dos capas de
 * detección reutilizando el modelo AlertState (sin migración nueva):
 *   1. Interna: cada cron registra su latido al terminar OK; evaluateAlerts marca "overdue" los que
 *      no corrieron en 2× su intervalo (detecta todos menos a sí mismo).
 *   2. Externa: /api/health/crons devuelve 503 si algún cron está overdue → para un monitor de
 *      uptime EXTERNO (UptimeRobot/BetterStack) que cubra también la caída del cron de alertas.
 *
 * Jobs deshabilitados por ambiente (CRON_JOBS_DISABLED, comma-separado): un job desagendado A
 * PROPÓSITO (ej. los 5 crons de email en STG, 2026-08-05) se reporta `disabled: true` y NUNCA
 * cuenta como overdue — sin esto el monitor externo quedaría en falso degraded eterno.
 *
 * Backups (N-19a, 2026-09-11): el backup diario a R2 NO es un job pg_cron — corre en GitHub
 * Actions (backup.yml), fuera de la app, y su salud era invisible desde el panel. Reutiliza el
 * mismo mecanismo: tras un backup exitoso el workflow hace POST a /api/cron/backup-heartbeat,
 * que hace upsert de AlertState["backup:last-success"]. La regla `backup_stale` (alerts.ts) y
 * el tile de /admin/observability leen getBackupHealth: sin latido en >36h, algo está roto.
 */

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/** Los crons HTTP versionados en pg_cron (migraciones 015/016/021/023/032) con su intervalo. */
export const CRON_JOBS: Record<string, { intervalMs: number; label: string }> = {
  alerts: { intervalMs: 5 * 60 * 1000, label: "Alertas" },
  "daily-summary": { intervalMs: 24 * 60 * 60 * 1000, label: "Resumen diario" },
  "review-request": { intervalMs: 24 * 60 * 60 * 1000, label: "Solicitud de reseñas" },
  "cart-recovery": { intervalMs: 60 * 60 * 1000, label: "Recuperación de carritos" },
  "back-in-stock": { intervalMs: 30 * 60 * 1000, label: "Aviso de reposición" },
  "purge-anon-designs": { intervalMs: 24 * 60 * 60 * 1000, label: "Purga diseños anónimos" },
  "purge-event-logs": { intervalMs: 24 * 60 * 60 * 1000, label: "Purga logs con PII (180d)" },
  "cms-publish-scheduled": { intervalMs: 5 * 60 * 1000, label: "Publicación programada CMS" },
  // N-12 — migración 032: expira órdenes WOMPI en PENDING_PAYMENT > PENDING_PAYMENT_EXPIRY_HOURS.
  "expire-pending-orders": { intervalMs: 60 * 60 * 1000, label: "Expiración de pedidos sin pagar" },
};

/**
 * Jobs deshabilitados por ambiente vía `CRON_JOBS_DISABLED` (comma-separado, p.ej.
 * "alerts,daily-summary,review-request,cart-recovery,back-in-stock" en STG, donde los crons de
 * email quedaron desagendados a propósito el 2026-08-05 — docs/OPERATIONS.md). Nombres que no
 * existan en CRON_JOBS se ignoran. En local/prd la var va vacía.
 */
export function getDisabledCronJobs(): string[] {
  return (process.env.CRON_JOBS_DISABLED ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s in CRON_JOBS);
}

const KEY_PREFIX = "cron:";

/**
 * Latido de un cron. Se llama SOLO en el camino de ÉXITO (dentro del try, antes de responder OK).
 * Best-effort: nunca lanza (no debe tumbar el cron por un fallo al registrar el latido).
 */
export async function recordCronHeartbeat(job: string, detail?: string): Promise<void> {
  try {
    const now = new Date();
    const key = `${KEY_PREFIX}${job}`;
    await prisma.alertState.upsert({
      where: { key },
      create: { key, lastSentAt: now, lastDetail: detail ?? null },
      update: { lastSentAt: now, lastDetail: detail ?? null },
    });
  } catch (err) {
    logger.error({
      event: "cron.heartbeat_fail",
      job,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export type CronHealth = {
  job: string;
  label: string;
  intervalMs: number;
  lastRunAt: Date | null;
  overdue: boolean;
  /** Desagendado a propósito en este ambiente (CRON_JOBS_DISABLED): nunca cuenta como overdue. */
  disabled: boolean;
};

/**
 * Estado de cada cron: `overdue` si no corrió en 2× su intervalo (o nunca corrió).
 * Los jobs de CRON_JOBS_DISABLED devuelven `disabled: true, overdue: false` — están
 * desagendados a propósito en este ambiente y no deben degradar el health ni alertar.
 */
export async function getCronHealth(now: Date = new Date()): Promise<CronHealth[]> {
  const rows = await prisma.alertState.findMany({
    where: { key: { startsWith: KEY_PREFIX } },
    select: { key: true, lastSentAt: true },
  });
  const byJob = new Map(rows.map((r) => [r.key.slice(KEY_PREFIX.length), r.lastSentAt]));
  const disabledJobs = new Set(getDisabledCronJobs());
  return Object.entries(CRON_JOBS).map(([job, { intervalMs, label }]) => {
    const disabled = disabledJobs.has(job);
    const lastRunAt = byJob.get(job) ?? null;
    const overdue =
      !disabled && (!lastRunAt || now.getTime() - lastRunAt.getTime() > 2 * intervalMs);
    return { job, label, intervalMs, lastRunAt, overdue, disabled };
  });
}

// ──────────────────────────── Backups (GitHub Actions → R2) ────────────────────────────

/** Clave AlertState del latido de backups (la escribe /api/cron/backup-heartbeat). */
export const BACKUP_HEARTBEAT_KEY = "backup:last-success";

/**
 * Tope de frescura del backup: el workflow corre DIARIO (~02:13 Bogotá), así que
 * 36h da un margen amplio para retrasos/reintentos sin falsos positivos — y aun así
 * detecta un backup muerto en menos de 2 corridas perdidas. Mismo tope que usa el
 * DR drill (dr-drill-lib.mjs, DRILL_MAX_BACKUP_AGE_HOURS).
 */
export const BACKUP_STALE_MS = 36 * 60 * 60 * 1000;

/**
 * Latido del backup diario. A DIFERENCIA de recordCronHeartbeat NO es best-effort:
 * este endpoint existe SOLO para persistir el latido — si el upsert falla, el caller
 * (la API route) debe responder 500 para que el workflow de GitHub salga ROJO y el
 * fallo sea visible ahí también (un "ok" falso silenciaría backup_stale 36h después).
 */
export async function recordBackupHeartbeat(detail?: string): Promise<void> {
  const now = new Date();
  await prisma.alertState.upsert({
    where: { key: BACKUP_HEARTBEAT_KEY },
    create: { key: BACKUP_HEARTBEAT_KEY, lastSentAt: now, lastDetail: detail ?? null },
    update: { lastSentAt: now, lastDetail: detail ?? null },
  });
}

export type BackupHealth = {
  lastSuccessAt: Date | null;
  /** true si nunca llegó un latido o el último supera BACKUP_STALE_MS. */
  stale: boolean;
};

/** Salud del backup diario a R2 (GitHub Actions — distinto de los jobs pg_cron de arriba). */
export async function getBackupHealth(now: Date = new Date()): Promise<BackupHealth> {
  const row = await prisma.alertState.findUnique({
    where: { key: BACKUP_HEARTBEAT_KEY },
    select: { lastSentAt: true },
  });
  const lastSuccessAt = row?.lastSentAt ?? null;
  return {
    lastSuccessAt,
    stale: !lastSuccessAt || now.getTime() - lastSuccessAt.getTime() > BACKUP_STALE_MS,
  };
}

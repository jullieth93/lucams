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
 * F-04 (auditoría 2026-09-19): un cron recién agendado NO tiene latido hasta su primera corrida
 * (hasta 24h en crons diarios) y `!lastRunAt → overdue` dejaba el health en 503 y disparaba la
 * alerta `cron_stale_*` en falso todo ese tiempo (pasó en PRD con purge-delivered-designs,
 * migración 035). Hoy un job sin primer latido queda `pending` (warning visible, NO degrada el
 * health ni alerta) y la migración que agenda el cron SIEMBRA su latido inicial en AlertState
 * (ver supabase/migrations 037) → si el cron nuevo nunca corre, el latido sembrado se vence a los
 * 2× intervalo y el dead-man switch alerta igual. El test "siembra de latido inicial" de
 * cron-heartbeat.test.ts hace cumplir la convención para crons futuros.
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
  // Migración 035 (feedback Lucy 2026-09-18): purga post-entrega de fotos + renders (≥90d DELIVERED).
  "purge-delivered-designs": {
    intervalMs: 24 * 60 * 60 * 1000,
    label: "Purga diseños entregados",
  },
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
  /**
   * F-04: agendado pero AÚN sin primer latido (ni siquiera el sembrado). Warning
   * visible en el panel/health detallado — NUNCA cuenta como overdue: un cron
   * nuevo no debe degradar /api/health/crons ni disparar `cron_stale_*` antes de
   * su primera ventana de ejecución.
   */
  pending: boolean;
  /** Desagendado a propósito en este ambiente (CRON_JOBS_DISABLED): nunca cuenta como overdue. */
  disabled: boolean;
};

/**
 * Estado de cada cron: `overdue` si su último latido supera 2× su intervalo; `pending`
 * si NUNCA ha latido (ni sembrado — F-04: un cron recién agendado no degrada el health).
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
    const pending = !disabled && lastRunAt === null;
    const overdue =
      !disabled && lastRunAt !== null && now.getTime() - lastRunAt.getTime() > 2 * intervalMs;
    return { job, label, intervalMs, lastRunAt, overdue, pending, disabled };
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

// ─────────────────── Monitor externo de uptime (VM → POST /api/cron/monitor-heartbeat) ───────────────────

/** Clave AlertState del latido del monitor de uptime de la VM. */
export const MONITOR_HEARTBEAT_KEY = "uptime-monitor:last-run";

/**
 * Tope de frescura del monitor: corre cada 12 min desde el crontab de la VM, así
 * que 30 min ≈ 2.5 corridas perdidas — si no hay latido más allá de eso, la VM
 * está apagada o el cron murió y NO hay monitor externo (la limitación declarada
 * de la solución por VM; esta regla es su dead-man).
 */
export const MONITOR_STALE_MS = 30 * 60 * 1000;

/**
 * Latido del monitor de uptime. A diferencia de recordCronHeartbeat NO es
 * best-effort: el endpoint existe solo para esto — si el upsert falla, la route
 * responde 500 para que el script de la VM lo loguee como error (y la regla
 * uptime_monitor_stale lo delate a los 30 min).
 * `detail`: resumen de la corrida (p.ej. "OK 5/5" o "FALLA 2/5: /api/health/wompi, …").
 */
export async function recordMonitorHeartbeat(detail?: string): Promise<void> {
  const now = new Date();
  await prisma.alertState.upsert({
    where: { key: MONITOR_HEARTBEAT_KEY },
    create: { key: MONITOR_HEARTBEAT_KEY, lastSentAt: now, lastDetail: detail ?? null },
    update: { lastSentAt: now, lastDetail: detail ?? null },
  });
}

export type MonitorHealth = {
  lastRunAt: Date | null;
  /** Resumen de la última corrida ("OK 5/5" | "FALLA n/5: …"). */
  lastDetail: string | null;
  /** true si nunca llegó un latido o el último supera MONITOR_STALE_MS (VM apagada). */
  stale: boolean;
  /** true si la última corrida reportó fallas (su detail empieza con "FALLA"). */
  failing: boolean;
};

/** Salud del monitor externo de uptime (crontab de la VM — independiente de la app). */
export async function getMonitorHealth(now: Date = new Date()): Promise<MonitorHealth> {
  const row = await prisma.alertState.findUnique({
    where: { key: MONITOR_HEARTBEAT_KEY },
    select: { lastSentAt: true, lastDetail: true },
  });
  const lastRunAt = row?.lastSentAt ?? null;
  const lastDetail = row?.lastDetail ?? null;
  return {
    lastRunAt,
    lastDetail,
    stale: !lastRunAt || now.getTime() - lastRunAt.getTime() > MONITOR_STALE_MS,
    failing: lastDetail?.startsWith("FALLA") ?? false,
  };
}

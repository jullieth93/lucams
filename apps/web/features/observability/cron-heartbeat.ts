/*
 * Dead-man switch del pipeline pg_cron (auditoría v3 · #15).
 *
 * Los 8 crons HTTP (migraciones 015, 016 y 021) se agendan en pg_cron; si CRON_SECRET se rota, el
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
 */

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/** Los 8 crons HTTP versionados en pg_cron (migraciones 015/016/021) con su intervalo. */
export const CRON_JOBS: Record<string, { intervalMs: number; label: string }> = {
  alerts: { intervalMs: 5 * 60 * 1000, label: "Alertas" },
  "daily-summary": { intervalMs: 24 * 60 * 60 * 1000, label: "Resumen diario" },
  "review-request": { intervalMs: 24 * 60 * 60 * 1000, label: "Solicitud de reseñas" },
  "cart-recovery": { intervalMs: 60 * 60 * 1000, label: "Recuperación de carritos" },
  "back-in-stock": { intervalMs: 30 * 60 * 1000, label: "Aviso de reposición" },
  "purge-anon-designs": { intervalMs: 24 * 60 * 60 * 1000, label: "Purga diseños anónimos" },
  "purge-event-logs": { intervalMs: 24 * 60 * 60 * 1000, label: "Purga logs con PII (180d)" },
  "cms-publish-scheduled": { intervalMs: 5 * 60 * 1000, label: "Publicación programada CMS" },
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

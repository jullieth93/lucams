/*
 * Purga de logs de eventos con PII (auditoría v3 · #10 · Ley 1581 minimización/retención).
 *
 * EmailEvent (.to = email del cliente) y WebhookEvent (.payload = JSON crudo de Wompi con
 * customer_email) se acumulaban SIN límite. Los retenemos 180 días (deliverability + conciliación de
 * pagos) y luego los borramos. Espeja el patrón de purgeAbandonedAnonymousDesigns.
 *
 * Auditoría 2026-08-24 (F-6): ErrorLog/ErrorReport persisten message+stack de errores (con PII
 * embebida ya redactada por scrubPii al capturar, pero igual son datos de diagnóstico) y no
 * tenían retención → acumulación indefinida. Se purgan a los 90 días: ErrorLog por createdAt;
 * ErrorReport por lastSeenAt (un error que sigue ocurriendo NO se borra aunque sea viejo).
 *
 * Auditoría 2026-09-11 (N-13): dos tablas más crecían sin tope:
 *   - Notification (centro de avisos del admin): su valor es la BANDEJA actual. Las LEÍDAS
 *     con createdAt > 90 días se purgan (el histórico durable de lo que importa ya vive en
 *     AuditLog/ErrorLog); las NO leídas se conservan siempre — purgar un aviso sin leer
 *     podría borrar la única señal de un problema que nadie vio.
 *   - WebVital (métricas RUM crudas): serie de alta frecuencia cuyo uso es el diagnóstico
 *     reciente (percentiles por ruta, /admin/performance). Se purgan a los 35 días: cubre
 *     la comparación mes-a-mes sin acumulación indefinida.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const DAY_MS = 24 * 60 * 60 * 1000;
// Decisión de Lucy (2026-07-18): 180 días para ambos.
export const EMAIL_EVENT_RETENTION_DAYS = 180;
export const WEBHOOK_EVENT_RETENTION_DAYS = 180;
// F-6: 90 días para errores server (ErrorLog) y reportes de cliente (ErrorReport).
export const ERROR_LOG_RETENTION_DAYS = 90;
export const ERROR_REPORT_RETENTION_DAYS = 90;
// N-13 (2026-09-11): notificaciones LEÍDAS > 90 días; WebVitals > 35 días.
export const NOTIFICATION_RETENTION_DAYS = 90;
export const WEB_VITAL_RETENTION_DAYS = 35;

export async function purgeExpiredEventLogs(opts?: {
  emailOlderThanDays?: number;
  webhookOlderThanDays?: number;
  errorLogOlderThanDays?: number;
  errorReportOlderThanDays?: number;
  notificationOlderThanDays?: number;
  webVitalOlderThanDays?: number;
}): Promise<{
  emailEventsPurged: number;
  webhookEventsPurged: number;
  errorLogsPurged: number;
  errorReportsPurged: number;
  notificationsPurged: number;
  webVitalsPurged: number;
}> {
  const emailCutoff = new Date(
    Date.now() - (opts?.emailOlderThanDays ?? EMAIL_EVENT_RETENTION_DAYS) * DAY_MS,
  );
  const webhookCutoff = new Date(
    Date.now() - (opts?.webhookOlderThanDays ?? WEBHOOK_EVENT_RETENTION_DAYS) * DAY_MS,
  );
  const errorLogCutoff = new Date(
    Date.now() - (opts?.errorLogOlderThanDays ?? ERROR_LOG_RETENTION_DAYS) * DAY_MS,
  );
  const errorReportCutoff = new Date(
    Date.now() - (opts?.errorReportOlderThanDays ?? ERROR_REPORT_RETENTION_DAYS) * DAY_MS,
  );
  const notificationCutoff = new Date(
    Date.now() - (opts?.notificationOlderThanDays ?? NOTIFICATION_RETENTION_DAYS) * DAY_MS,
  );
  const webVitalCutoff = new Date(
    Date.now() - (opts?.webVitalOlderThanDays ?? WEB_VITAL_RETENTION_DAYS) * DAY_MS,
  );

  const emailRes = await prisma.emailEvent.deleteMany({
    where: { createdAt: { lt: emailCutoff } },
  });
  // `processedAt: not null` evita borrar eventos aún en ventana de reintento/idempotencia (el dedup
  // por @@unique[source,externalId] solo importa mientras el proveedor pueda reenviar — plazo << 180d).
  const webhookRes = await prisma.webhookEvent.deleteMany({
    where: { createdAt: { lt: webhookCutoff }, processedAt: { not: null } },
  });
  const errorLogRes = await prisma.errorLog.deleteMany({
    where: { createdAt: { lt: errorLogCutoff } },
  });
  // lastSeenAt (no firstSeenAt): un fingerprint que sigue recurrente hoy es diagnóstico
  // vigente y no debe purgarse aunque su primera aparición sea anterior al cutoff.
  const errorReportRes = await prisma.errorReport.deleteMany({
    where: { lastSeenAt: { lt: errorReportCutoff } },
  });
  // `readAt: not null` — solo LEÍDAS: una notificación sin leer es un aviso pendiente
  // y se conserva por vieja que sea (purgarla escondería el problema que anuncia).
  const notificationRes = await prisma.notification.deleteMany({
    where: { readAt: { not: null }, createdAt: { lt: notificationCutoff } },
  });
  const webVitalRes = await prisma.webVital.deleteMany({
    where: { createdAt: { lt: webVitalCutoff } },
  });

  logger.info({
    event: "retention.purge_event_logs",
    emailEventsPurged: emailRes.count,
    webhookEventsPurged: webhookRes.count,
    errorLogsPurged: errorLogRes.count,
    errorReportsPurged: errorReportRes.count,
    notificationsPurged: notificationRes.count,
    webVitalsPurged: webVitalRes.count,
  });
  return {
    emailEventsPurged: emailRes.count,
    webhookEventsPurged: webhookRes.count,
    errorLogsPurged: errorLogRes.count,
    errorReportsPurged: errorReportRes.count,
    notificationsPurged: notificationRes.count,
    webVitalsPurged: webVitalRes.count,
  };
}

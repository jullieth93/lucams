/*
 * Purga de logs de eventos con PII (auditoría v3 · #10 · Ley 1581 minimización/retención).
 *
 * EmailEvent (.to = email del cliente) y WebhookEvent (.payload = JSON crudo de Wompi con
 * customer_email) se acumulaban SIN límite. Los retenemos 180 días (deliverability + conciliación de
 * pagos) y luego los borramos. Espeja el patrón de purgeAbandonedAnonymousDesigns.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const DAY_MS = 24 * 60 * 60 * 1000;
// Decisión de Lucy (2026-07-18): 180 días para ambos.
export const EMAIL_EVENT_RETENTION_DAYS = 180;
export const WEBHOOK_EVENT_RETENTION_DAYS = 180;

export async function purgeExpiredEventLogs(opts?: {
  emailOlderThanDays?: number;
  webhookOlderThanDays?: number;
}): Promise<{ emailEventsPurged: number; webhookEventsPurged: number }> {
  const emailCutoff = new Date(
    Date.now() - (opts?.emailOlderThanDays ?? EMAIL_EVENT_RETENTION_DAYS) * DAY_MS,
  );
  const webhookCutoff = new Date(
    Date.now() - (opts?.webhookOlderThanDays ?? WEBHOOK_EVENT_RETENTION_DAYS) * DAY_MS,
  );

  const emailRes = await prisma.emailEvent.deleteMany({
    where: { createdAt: { lt: emailCutoff } },
  });
  // `processedAt: not null` evita borrar eventos aún en ventana de reintento/idempotencia (el dedup
  // por @@unique[source,externalId] solo importa mientras el proveedor pueda reenviar — plazo << 180d).
  const webhookRes = await prisma.webhookEvent.deleteMany({
    where: { createdAt: { lt: webhookCutoff }, processedAt: { not: null } },
  });

  logger.info({
    event: "retention.purge_event_logs",
    emailEventsPurged: emailRes.count,
    webhookEventsPurged: webhookRes.count,
  });
  return { emailEventsPurged: emailRes.count, webhookEventsPurged: webhookRes.count };
}

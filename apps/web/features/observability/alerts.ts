/*
 * Alertas por email (Bloque D, sin Sentry). Evalúa reglas contra la DB y envía un
 * email al operador cuando algo se rompe. Mandato: cada alerta dice QUÉ SE ROMPIÓ
 * + QUÉ HACER. Anti-spam: no re-enviar la misma alerta dentro de 30 min (AlertState).
 *
 * Se dispara desde /api/cron/alerts, agendado por pg_cron en Supabase (no Vercel
 * Cron, mandato #11) — ver docs/OPERATIONS.md para el SQL de agendamiento.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/resend";
import { getSettingValue } from "@/lib/cms";
import { logger } from "@/lib/logger";

const DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 min

export type FiringAlert = {
  key: string;
  severity: "crítica" | "alta" | "media";
  title: string;
  detail: string; // qué se rompió
  action: string; // qué hacer
};

/** Evalúa todas las reglas contra la DB. Devuelve las que están disparando. */
export async function evaluateAlerts(now: Date = new Date()): Promise<FiringAlert[]> {
  const firing: FiringAlert[] = [];

  const [errs5m, recon, stuck] = await Promise.all([
    prisma.errorLog.count({
      where: { createdAt: { gte: new Date(now.getTime() - 5 * 60 * 1000) } },
    }),
    prisma.order.count({ where: { needsReconciliation: true, deletedAt: null } }),
    prisma.webhookEvent.count({
      where: { processedAt: null, createdAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) } },
    }),
  ]);

  if (errs5m >= 5) {
    firing.push({
      key: "errors_spike",
      severity: "alta",
      title: `${errs5m} errores del servidor en 5 minutos`,
      detail: "Un pico de errores 5xx del servidor.",
      action:
        "Abre /admin/observability (top errores) y revisa la ruta afectada. Si hubo un deploy reciente, considera rollback.",
    });
  }
  if (recon > 0) {
    firing.push({
      key: "reconciliation",
      severity: "crítica",
      title: `${recon} orden(es) necesitan reconciliación`,
      detail:
        "Un pago quedó inconsistente con el stock (p.ej. Wompi cobró pero se agotó la unidad).",
      action:
        "Abre /admin/pedidos (filtro 'Necesitan atención'): reembolsa o repón stock según el caso.",
    });
  }
  if (stuck > 0) {
    firing.push({
      key: "webhooks_stuck",
      severity: "media",
      title: `${stuck} webhook(s) sin procesar hace más de 1 hora`,
      detail: "Eventos de Wompi/Aveonline encolados sin resolverse.",
      action: "Verifica el consumer de webhooks y el estado de Wompi/Aveonline.",
    });
  }

  return firing;
}

function buildAlertEmail(alerts: FiringAlert[]): { subject: string; html: string; text: string } {
  const subject =
    alerts.length === 1
      ? `⚠️ Alerta Lucams: ${alerts[0].title}`
      : `⚠️ ${alerts.length} alertas Lucams`;
  const rows = alerts
    .map(
      (a) => `
<div style="border-left:4px solid #E85B9F;padding:8px 12px;margin:8px 0;background:#FFF8F0;">
  <div style="font-weight:700;color:#3D2E5C;">[${a.severity}] ${escapeHtml(a.title)}</div>
  <div style="font-size:14px;color:#3D2E5C;">${escapeHtml(a.detail)}</div>
  <div style="font-size:14px;color:#3D2E5C;"><strong>Qué hacer:</strong> ${escapeHtml(a.action)}</div>
</div>`,
    )
    .join("");
  const html = `<h1 style="font-size:20px;color:#3D2E5C;">Alertas del sistema</h1>${rows}
<p style="font-size:12px;color:#3D2E5C;opacity:0.6;">Panel: /admin/observability</p>`;
  const text = alerts
    .map((a) => `[${a.severity}] ${a.title}\n${a.detail}\nQué hacer: ${a.action}`)
    .join("\n\n");
  return { subject, html, text };
}

/**
 * Evalúa + envía las alertas que disparan, respetando el anti-spam por `key`
 * (30 min). `now` inyectable para tests.
 */
export async function dispatchAlerts(
  now: Date = new Date(),
): Promise<{ sent: string[]; skipped: string[] }> {
  const firing = await evaluateAlerts(now);
  const sent: string[] = [];
  const skipped: string[] = [];
  if (firing.length === 0) return { sent, skipped };

  const toSend: FiringAlert[] = [];
  for (const a of firing) {
    const state = await prisma.alertState.findUnique({ where: { key: a.key } });
    if (state && now.getTime() - state.lastSentAt.getTime() < DEDUP_WINDOW_MS) {
      skipped.push(a.key);
    } else {
      toSend.push(a);
    }
  }
  if (toSend.length === 0) return { sent, skipped };

  const to = await getSettingValue("ALERT_EMAIL", "hola@lucamsshop.co");
  const { subject, html, text } = buildAlertEmail(toSend);
  const result = await sendEmail({ to, subject, html, text });

  // Auditoría 2026-07-13: si el email NO se envió, NO marcamos lastSentAt → la alerta se
  // reintenta en el próximo ciclo (antes se marcaba "enviada" pase lo que pase, silenciando
  // la alerta 30 min justo cuando el sistema falla — punto ciego en el peor momento).
  if (!result.sent) {
    logger.error({
      event: "alerts.email_failed",
      keys: toSend.map((a) => a.key),
      reason: result.reason ?? "unknown",
    });
    return { sent, skipped };
  }
  logger.info({ event: "alerts.sent", keys: toSend.map((a) => a.key), emailed: result.sent });

  for (const a of toSend) {
    await prisma.alertState.upsert({
      where: { key: a.key },
      create: { key: a.key, lastSentAt: now, lastDetail: a.title },
      update: { lastSentAt: now, lastDetail: a.title },
    });
    sent.push(a.key);
  }
  return { sent, skipped };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

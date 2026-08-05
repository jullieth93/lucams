/*
 * Alertas del sistema (Bloque D, sin Sentry). Evalúa reglas contra la DB y avisa al
 * operador cuando algo se rompe. Mandato: cada alerta dice QUÉ SE ROMPIÓ + QUÉ HACER.
 *
 * Política 2026-08-05 (centro de notificaciones — docs/PLAN_CENTRO_NOTIFICACIONES.md):
 * CADA alerta que dispara deja notificación in-app en /admin/notificaciones (fuente
 * de verdad; dedupKey = key de la alerta → la que persiste actualiza, no duplica).
 * El EMAIL del lote solo sale si alguna es "crítica" — anti-spam: no re-enviar la
 * misma alerta dentro de 30 min (AlertState).
 *
 * Se dispara desde /api/cron/alerts, agendado por pg_cron en Supabase (no Vercel
 * Cron, mandato #11) — ver docs/OPERATIONS.md para el SQL de agendamiento.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/resend";
import { getCronHealth } from "./cron-heartbeat";
import { getSettingValue } from "@/lib/cms";
import { logger } from "@/lib/logger";
import { notify, type NotificationSeverity } from "@/features/notifications/service";

const DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 min

// Severidad de la regla (es-CO) → severidad del centro de notificaciones.
const SEVERITY_TO_NOTIFICATION: Record<FiringAlert["severity"], NotificationSeverity> = {
  crítica: "critical",
  alta: "warning",
  media: "info",
};

/** Módulo del admin donde se atiende cada alerta (deep link desde el centro). */
function actionUrlFor(key: string): string {
  if (key === "reconciliation" || key === "pending_payment_wompi_stale") return "/admin/pedidos";
  return "/admin/observability";
}

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

  const [errs5m, recon, stuck, stalePendingWompi] = await Promise.all([
    prisma.errorLog.count({
      where: { createdAt: { gte: new Date(now.getTime() - 5 * 60 * 1000) } },
    }),
    prisma.order.count({ where: { needsReconciliation: true, deletedAt: null } }),
    prisma.webhookEvent.count({
      where: { processedAt: null, createdAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) } },
    }),
    // #9 — backstop: orden Wompi que lleva >2h en PENDING_PAYMENT. El pago PUDO capturarse en Wompi
    // pero ni el webhook ni el redirect confirmaron la orden. Gateado en WOMPI (no COD, que queda
    // legítimamente PENDING_PAYMENT). Cubre el caso en que ni siquiera existe fila WebhookEvent.
    prisma.order.count({
      where: {
        status: "PENDING_PAYMENT",
        paymentMethod: "WOMPI",
        deletedAt: null,
        createdAt: { lt: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
      },
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
  if (stalePendingWompi > 0) {
    firing.push({
      key: "pending_payment_wompi_stale",
      severity: "crítica",
      title: `${stalePendingWompi} orden(es) Wompi llevan >2h sin confirmarse`,
      detail:
        "El pago pudo cobrarse en Wompi pero el webhook y el redirect no confirmaron la orden.",
      action:
        "Abre /admin/pedidos (PENDING_PAYMENT) y verifica en el panel Wompi por la referencia (número de orden): si el cobro aparece APPROVED, confirma/produce; si no, cancela.",
    });
  }

  // #15 — dead-man switch (capa interna): un cron que no corre en 2× su intervalo probablemente dejó
  // de ejecutarse (CRON_SECRET rotado, dominio cambiado, secreto de Vault ausente). Detecta todos
  // los jobs menos el PROPIO cron de alertas; su caída la cubre el monitor externo vía
  // /api/health/crons. Los jobs de CRON_JOBS_DISABLED llegan con overdue=false: no alertan.
  const cronHealth = await getCronHealth(now);
  for (const c of cronHealth) {
    if (c.job === "alerts") continue; // el cron de alertas no puede detectar su propia caída
    if (c.overdue) {
      firing.push({
        key: `cron_stale_${c.job}`,
        severity: "media",
        title: `El cron "${c.label}" no se ha ejecutado en su ventana`,
        detail: c.lastRunAt
          ? `Última ejecución: ${c.lastRunAt.toISOString()}. Debería correr cada ${Math.round(c.intervalMs / 60000)} min.`
          : "No hay registro de ninguna ejecución.",
        action:
          "Revisa que pg_cron esté agendado y que CRON_SECRET + la URL base estén en el Vault de Supabase (docs/OPERATIONS.md). Consulta cron.job_run_details / net._http_response.",
      });
    }
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
<p style="font-size:12px;color:#3D2E5C;opacity:0.6;">Bandeja de avisos: /admin/notificaciones</p>`;
  const text = alerts
    .map((a) => `[${a.severity}] ${a.title}\n${a.detail}\nQué hacer: ${a.action}`)
    .join("\n\n");
  return { subject, html, text };
}

/**
 * Evalúa + registra las alertas que disparan. CADA una deja notificación in-app;
 * el EMAIL del lote solo sale si alguna es "crítica", respetando el anti-spam por
 * `key` (30 min, AlertState). `now` inyectable para tests.
 */
export async function dispatchAlerts(
  now: Date = new Date(),
): Promise<{ sent: string[]; skipped: string[] }> {
  const firing = await evaluateAlerts(now);
  const sent: string[] = [];
  const skipped: string[] = [];
  if (firing.length === 0) return { sent, skipped };

  // SIEMPRE notificación in-app (fuente de verdad). dedupKey = key de la alerta:
  // una alerta que persiste varios ciclos actualiza la misma fila no leída.
  for (const a of firing) {
    await notify({
      type: "ALERT",
      severity: SEVERITY_TO_NOTIFICATION[a.severity],
      title: a.title,
      detail: `${a.detail} Qué hacer: ${a.action}`,
      actionUrl: actionUrlFor(a.key),
      actionLabel: "Revisar",
      dedupKey: a.key,
    });
  }

  // El dedup AlertState (30 min) ahora gatea SOLO el email (el feed ya registró todo).
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

  // Política anti-spam 2026-08-05: sin críticas en el lote NO hay email (las no
  // críticas ya quedaron en el centro; si luego aparece una crítica, viajan en
  // ese mismo correo como contexto — por eso tampoco se sella lastSentAt acá).
  if (!toSend.some((a) => a.severity === "crítica")) {
    logger.info({ event: "alerts.email_skipped_no_critical", keys: toSend.map((a) => a.key) });
    return { sent, skipped };
  }

  const to = await getSettingValue("ALERT_EMAIL", "hola@lucamsshop.com");
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

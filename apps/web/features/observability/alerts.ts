/*
 * Alertas del sistema (Bloque D, sin Sentry). Evalúa reglas contra la DB y avisa al
 * operador cuando algo se rompe. Mandato: cada alerta dice QUÉ SE ROMPIÓ + QUÉ HACER.
 *
 * Política 2026-08-05 (centro de notificaciones):
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
import {
  getCronHealth,
  getBackupHealth,
  getMonitorHealth,
  BACKUP_STALE_MS,
} from "./cron-heartbeat";
import { getEmailDeliverabilityStats } from "./email-deliverability";
import { getSettingValue } from "@/lib/cms";
import { logger } from "@/lib/logger";
import { PENDING_PAYMENT_EXPIRY_HOURS } from "@/features/orders/constants";
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
  if (key === "reconciliation") return "/admin/pedidos";
  // pending_payment_wompi_stale (N-12b): lo roto es la auto-cancelación (un cron),
  // no la orden — el panel de crons es donde se diagnostica primero.
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

  const [errGroups, recon, stuck, stalePendingWompi] = await Promise.all([
    // N-33 — errors_spike agrupa por RUTA (routePath): el doc (OBSERVABILITY.md)
    // define el pico como "5+ errores 500 en 5 min en una misma ruta", no un
    // conteo global (ruido repartido en N rutas sanas no es un incidente).
    // ErrorLog solo registra errores de servidor (captureServerError), así que
    // "500" es preciso. Filas sin routePath no son atribuibles a una ruta →
    // no disparan esta regla. groupBy sin `having` (mismo patrón que
    // daily-summary.ts) y el umbral se aplica acá: ventana chica y acotada.
    prisma.errorLog.groupBy({
      by: ["routePath"],
      where: { createdAt: { gte: new Date(now.getTime() - 5 * 60 * 1000) } },
      _count: { _all: true },
    }),
    prisma.order.count({ where: { needsReconciliation: true, deletedAt: null } }),
    prisma.webhookEvent.count({
      where: { processedAt: null, createdAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) } },
    }),
    // #9 + N-12b (2026-09-11) — orden Wompi que supera PENDING_PAYMENT_EXPIRY_HOURS
    // en PENDING_PAYMENT. Antes alertaba a las 2h: un checkout abandonado es ESPERADO
    // (la mayoría no paga) y la alerta ardía en falso. Hoy el cron expire-pending-orders
    // auto-cancela al vencer la ventana → una orden que la SUPERA sin cancelarse significa
    // que la auto-cancelación NO corrió (fallo real del sistema) o que el pago se capturó
    // sin confirmación. Mismo umbral que el cron (features/orders/constants).
    prisma.order.count({
      where: {
        status: "PENDING_PAYMENT",
        paymentMethod: "WOMPI",
        deletedAt: null,
        createdAt: {
          lt: new Date(now.getTime() - PENDING_PAYMENT_EXPIRY_HOURS * 60 * 60 * 1000),
        },
      },
    }),
  ]);

  const spikes = errGroups
    .filter((g) => g.routePath !== null && g._count._all >= 5)
    .map((g) => ({ route: g.routePath as string, count: g._count._all }))
    .sort((a, b) => b.count - a.count);
  if (spikes.length > 0) {
    const top = spikes[0];
    firing.push({
      key: "errors_spike",
      severity: "alta",
      title: `${top.count} errores 500 en ${top.route} en 5 minutos`,
      detail: `Pico de errores 500 del servidor en una misma ruta (umbral 5 en 5 min): ${spikes
        .map((s) => `${s.route} (${s.count})`)
        .join(" · ")}.`,
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
      title: `${stalePendingWompi} orden(es) Wompi superaron ${PENDING_PAYMENT_EXPIRY_HOURS}h sin auto-cancelarse`,
      detail:
        "La auto-cancelación de pendientes debió cancelarlas al vencer la ventana y no lo hizo — el cron expire-pending-orders no está corriendo (o falla). Hasta que corra, esas órdenes pueden esconder pagos capturados sin confirmar.",
      action:
        "Revisa el cron expire-pending-orders en /admin/observability (trabajos automáticos) y su último error. Después verifica cada orden en /admin/pedidos contra el panel Wompi por la referencia (número de orden): si el cobro está APPROVED, confírmala; si no, cancélala manual.",
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

  // N-04 (2026-09-11) — email_bounce_rate: los bounces de Resend se guardaban en
  // EmailEvent sin que nadie los viera (un ~50 % sostenido era invisible). Severidad
  // ALTA a propósito (in-app; NO crítica): la entregabilidad tarda en limpiarse
  // (DKIM, reputación, listas) y una crítica re-emailaría cada 30 min sobre un
  // problema que no se resuelve hoy.
  const emailStats = await getEmailDeliverabilityStats(now);
  if (emailStats.bounceRateAlert && emailStats.bounceRatePct !== null) {
    const terminal = emailStats.delivered + emailStats.bounced;
    firing.push({
      key: "email_bounce_rate",
      severity: "alta",
      title: `Tasa de rebote de email en ${emailStats.bounceRatePct.toFixed(1)}% (7 días)`,
      detail: `${emailStats.bounced} rebotados de ${terminal} eventos terminales en ${emailStats.windowDays} días (umbral 5% con ≥20 eventos). Los clientes pueden no estar recibiendo confirmaciones de pedido ni recuperaciones de clave.`,
      action:
        "Abre /admin/observability (entregabilidad de email) y el dashboard de Resend: revisa DKIM/SPF/DMARC del dominio y las direcciones rebotadas antes de seguir enviando.",
    });
  }

  // N-19a (2026-09-11) — backup_stale: el backup diario a R2 corre en GitHub Actions
  // (fuera de pg_cron) y su salud era invisible desde la app. Tras cada backup exitoso
  // el workflow hace POST a /api/cron/backup-heartbeat; sin latido en >36h hay que mirar.
  // ALTA (in-app): un backup roto es grave pero no amerita email cada 30 min.
  const backup = await getBackupHealth(now);
  if (backup.stale) {
    const hoursSince = backup.lastSuccessAt
      ? Math.floor((now.getTime() - backup.lastSuccessAt.getTime()) / (60 * 60 * 1000))
      : null;
    firing.push({
      key: "backup_stale",
      severity: "alta",
      title: hoursSince
        ? `El backup diario no reporta éxito hace ${hoursSince}h`
        : "Ningún backup ha reportado éxito",
      detail: backup.lastSuccessAt
        ? `Último backup exitoso: ${backup.lastSuccessAt.toISOString()} (tope ${Math.round(BACKUP_STALE_MS / (60 * 60 * 1000))}h). Sin backup diario, un desastre en Supabase deja a la tienda solo con el PITR.`
        : "El workflow de backups nunca ha reportado un éxito a la app (o el latido no está configurado). Sin backup diario, un desastre en Supabase deja a la tienda solo con el PITR.",
      action:
        "Revisa el workflow backup.yml en GitHub (Actions → Backup DB → R2): si el job falla o le faltan secrets (R2_*/BACKUP_*/CRON_SECRET), el backup diario no se está haciendo. El DR drill mensual (dr-drill.yml) también exige un dump fresco.",
    });
  }

  // Monitor externo de uptime (2026-09-13, decisión Lucy: solución por VM, sin SaaS
  // ni Actions). El script de la VM sondea los 5 healthchecks de PRD cada 12 min y
  // reporta cada corrida a /api/cron/monitor-heartbeat. Dos reglas complementarias:
  //  - uptime_monitor_stale: sin corrida en >30 min → la VM está apagada o el cron
  //    murió y NO hay monitor externo (el dead-man de la propia solución).
  //  - uptime_monitor_failing: la última corrida reportó fallas → los probes de PRD
  //    están cayendo (el script ya envió email; esto lo deja visible en el centro).
  // Ambas ALTA (in-app): el email del script es el canal primario para fallas reales.
  const monitor = await getMonitorHealth(now);
  if (monitor.failing) {
    firing.push({
      key: "uptime_monitor_failing",
      severity: "alta",
      title: `El monitor externo reporta healthchecks caídos: ${monitor.lastDetail}`,
      detail: `Última corrida del monitor de la VM: ${monitor.lastRunAt?.toISOString() ?? "—"}. El monitor sondea /api/health/{all,crons,resend,wompi,aveonline} de PRD cada 12 min desde la VM. Detalle: ${monitor.lastDetail ?? "—"}.`,
      action:
        "Abre /api/health/all de PRD y el panel /admin/integraciones para identificar el servicio caído (Vercel/DB/Storage/Wompi/Aveonline/Resend). El email del monitor tiene el detalle de cada probe.",
    });
  } else if (monitor.stale) {
    const minutesSince = monitor.lastRunAt
      ? Math.floor((now.getTime() - monitor.lastRunAt.getTime()) / (60 * 1000))
      : null;
    firing.push({
      key: "uptime_monitor_stale",
      severity: "alta",
      title: minutesSince
        ? `El monitor externo no reporta hace ${minutesSince} min`
        : "El monitor externo nunca ha reportado",
      detail: `El crontab de la VM corre el sondeo cada 12 min (tope 30). Sin latido, la tienda NO tiene monitoreo externo de uptime (la limitación declarada de la solución por VM).`,
      action:
        "Revisa la VM: que esté encendida, que crond esté activo (`systemctl is-active crond`) y el log del monitor (`tmp/uptime-monitor.log`). El crontab se instala con la entrada `*/12 * * * * … uptime-monitor.mjs`.",
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

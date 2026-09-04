/*
 * Resumen diario de operación (Bloque D — OBSERVABILITY.md § Dashboard "Operación
 * diaria"). Lo que la dueña revisa cada mañana con lo de las últimas 24h: pedidos,
 * ingresos, qué falta despachar, stock crítico, reseñas pendientes, carritos
 * abandonados y errores. A diferencia de las alertas (solo cuando algo se rompe), esto
 * se publica SIEMPRE una vez al día.
 *
 * Política 2026-08-05 (centro de notificaciones):
 * el resumen ya NO va por email — queda como notificación in-app en
 * /admin/notificaciones (fuente de verdad, cero spam de correo).
 *
 * Se dispara desde /api/cron/daily-summary, agendado por pg_cron (no Vercel Cron,
 * mandato #11) — ver docs/OPERATIONS.md para el SQL de agendamiento (8am America/Bogota).
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { notify } from "@/features/notifications/service";
import { getCodReconciliationTotals } from "@/features/orders/cod-reconciliation";
import { getSloStatus } from "./slos";

// Estados en los que el dinero YA entró (para contar ingresos).
const PAID_STATES = ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"] as const;
// No re-enviar el resumen si ya se mandó hace < 12h (idempotencia ante reintentos de cron).
const RESEND_GUARD_MS = 12 * 60 * 60 * 1000;

export type DailySummary = {
  windowHours: number;
  ordersLast24h: number; // pedidos nuevos (no-DRAFT)
  // Ingresos = efectivo REALMENTE cobrado en 24h: Wompi capturado online + COD ENTREGADO.
  // NO cuenta COD confirmado-pero-no-entregado (el efectivo aún no entró) — revisión adversarial.
  revenueLast24hCop: number;
  codToCollectCop: number; // COD confirmado en 24h, pendiente de cobrar al entregar
  // ADR-064 — COD ENTREGADO cuyo efectivo el mensajero ya cobró pero aún no remitió a la tienda
  // (saldo pendiente, todo el histórico) + discrepancias abiertas + faltante confirmado en pesos.
  codPendingRemitCop: number;
  codDiscrepancies: number;
  codShortfallCop: number;
  paidOrdersLast24h: number;
  pendingPayment: number; // checkouts en pago sin completar
  toShip: number; // pagadas sin despachar (PAID + FULFILLING)
  lowStock: number; // variantes activas con stock <= 5
  pendingReviews: number; // reseñas sin aprobar
  retractsPending: number; // solicitudes de retracto PENDING (reloj legal de 15 días corriendo)
  abandonedCarts24h: number;
  recoveredCarts24h: number;
  errors24h: number;
  topErrorRoute: string | null;
  needsReconciliation: number;
  // ADR-066 — SLOs incumplidos (con datos suficientes) para alertar en el resumen.
  breachedSlos: string[];
};

const _since = (hours: number) => new Date(Date.now() - hours * 3600 * 1000);

export async function getDailySummary(now: Date = new Date()): Promise<DailySummary> {
  const from = new Date(now.getTime() - 24 * 3600 * 1000);

  const [
    ordersLast24h,
    wompiRevenueAgg,
    codDeliveredAgg,
    codToCollectAgg,
    paidOrdersLast24h,
    pendingPayment,
    toShip,
    lowStock,
    pendingReviews,
    retractsPending,
    abandonedCarts24h,
    recoveredCarts24h,
    errors24h,
    topErrorRaw,
    needsReconciliation,
    codRecon,
    slos,
  ] = await Promise.all([
    prisma.order.count({
      where: { createdAt: { gte: from }, deletedAt: null, status: { not: "DRAFT" } },
    }),
    // Wompi: efectivo capturado online (aprox. al crear).
    prisma.order.aggregate({
      _sum: { total: true },
      where: {
        createdAt: { gte: from },
        deletedAt: null,
        paymentMethod: "WOMPI",
        status: { in: [...PAID_STATES] },
      },
    }),
    // COD: efectivo cobrado SOLO al entregar (deliveredAt en la ventana).
    prisma.order.aggregate({
      _sum: { total: true },
      where: {
        deletedAt: null,
        paymentMethod: "COD",
        status: "DELIVERED",
        deliveredAt: { gte: from },
      },
    }),
    // COD confirmado en 24h pero aún NO entregado → efectivo por cobrar.
    prisma.order.aggregate({
      _sum: { total: true },
      where: {
        createdAt: { gte: from },
        deletedAt: null,
        paymentMethod: "COD",
        status: { in: ["PAID", "FULFILLING", "SHIPPED"] },
      },
    }),
    prisma.order.count({
      where: { createdAt: { gte: from }, deletedAt: null, status: { in: [...PAID_STATES] } },
    }),
    prisma.order.count({ where: { status: "PENDING_PAYMENT", deletedAt: null } }),
    prisma.order.count({ where: { status: { in: ["PAID", "FULFILLING"] }, deletedAt: null } }),
    prisma.productVariant.count({
      where: {
        stock: { lte: 5 },
        isActive: true,
        deletedAt: null,
        product: { isActive: true, deletedAt: null },
      },
    }),
    prisma.review.count({ where: { isApproved: false, deletedAt: null } }),
    // H7 (auditoría v3) — retractos PENDING: el reembolso legal vence a los 15 días calendario.
    prisma.retractRequest.count({ where: { status: "PENDING" } }),
    prisma.abandonedCart.count({ where: { createdAt: { gte: from } } }),
    prisma.abandonedCart.count({ where: { createdAt: { gte: from }, recoveredAt: { not: null } } }),
    prisma.errorLog.count({ where: { createdAt: { gte: from } } }),
    prisma.errorLog.groupBy({
      by: ["routePath"],
      where: { createdAt: { gte: from } },
      _count: { _all: true },
      orderBy: { _count: { routePath: "desc" } },
      take: 1,
    }),
    prisma.order.count({ where: { needsReconciliation: true, deletedAt: null } }),
    // ADR-064 — fuente ÚNICA de los KPIs de conciliación COD (evita divergencia con /admin/finanzas).
    getCodReconciliationTotals(),
    // ADR-066 — SLOs incumplidos con datos suficientes.
    getSloStatus(),
  ]);

  return {
    windowHours: 24,
    ordersLast24h,
    revenueLast24hCop: (wompiRevenueAgg._sum.total ?? 0) + (codDeliveredAgg._sum.total ?? 0),
    codToCollectCop: codToCollectAgg._sum.total ?? 0,
    codPendingRemitCop: codRecon.pendingCop,
    codDiscrepancies: codRecon.discrepancyCount,
    codShortfallCop: codRecon.shortfallCop,
    paidOrdersLast24h,
    pendingPayment,
    toShip,
    lowStock,
    pendingReviews,
    retractsPending,
    abandonedCarts24h,
    recoveredCarts24h,
    errors24h,
    topErrorRoute: topErrorRaw[0]?.routePath ?? null,
    needsReconciliation,
    breachedSlos: slos.filter((s) => s.status === "breached").map((s) => s.label),
  };
}

function fmtCop(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("es-CO")}`;
}

export function buildDailySummaryEmail(
  s: DailySummary,
  now: Date = new Date(),
): { subject: string; html: string; text: string } {
  const dateLabel = now.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Bogota",
  });
  const subject = `☀️ Resumen Lucams — ${s.ordersLast24h} pedido(s), ${fmtCop(s.revenueLast24hCop)} en 24h`;

  // Filas "necesitan tu atención" — solo las que aplican, con acción.
  const attention: string[] = [];
  if (s.needsReconciliation > 0)
    attention.push(
      `🔴 <strong>${s.needsReconciliation}</strong> orden(es) necesitan reconciliación — /admin/pedidos (filtro "Necesitan atención")`,
    );
  for (const slo of s.breachedSlos)
    attention.push(`📉 SLO incumplido: <strong>${escapeHtml(slo)}</strong> — /admin/observability`);
  if (s.codDiscrepancies > 0)
    attention.push(
      `💸 <strong>${s.codDiscrepancies}</strong> discrepancia(s) de efectivo contra entrega${s.codShortfallCop > 0 ? ` (${fmtCop(s.codShortfallCop)} que no llegó)` : ""} — /admin/finanzas/conciliacion`,
    );
  if (s.codPendingRemitCop > 0)
    attention.push(
      `🚚 <strong>${fmtCop(s.codPendingRemitCop)}</strong> de contra entrega por remitir (el mensajero ya cobró) — /admin/finanzas/conciliacion`,
    );
  if (s.toShip > 0)
    attention.push(`📦 <strong>${s.toShip}</strong> pagada(s) por despachar — /admin/pedidos`);
  if (s.pendingReviews > 0)
    attention.push(
      `💬 <strong>${s.pendingReviews}</strong> reseña(s) por aprobar — /admin/resenas`,
    );
  if (s.retractsPending > 0)
    attention.push(
      `⏱️ <strong>${s.retractsPending}</strong> retracto(s) por gestionar (reembolso ≤15 días) — /admin/retractos`,
    );
  if (s.lowStock > 0)
    attention.push(
      `📉 <strong>${s.lowStock}</strong> variante(s) con stock bajo (≤5) — /admin/inventario`,
    );
  if (s.errors24h > 0)
    attention.push(
      `⚠️ <strong>${s.errors24h}</strong> error(es) del servidor en 24h${s.topErrorRoute ? ` (top: ${escapeHtml(s.topErrorRoute)})` : ""} — /admin/observability`,
    );

  const recoveryPct =
    s.abandonedCarts24h > 0 ? Math.round((s.recoveredCarts24h / s.abandonedCarts24h) * 100) : 0;

  const stat = (label: string, value: string) => `
<td style="padding:10px 14px;border:1px solid #E8E0F0;">
  <div style="font-size:12px;color:#7C6AAD;text-transform:uppercase;letter-spacing:.5px;">${label}</div>
  <div style="font-size:22px;font-weight:700;color:#3D2E5C;">${value}</div>
</td>`;

  const html = `
<div style="font-family:system-ui,sans-serif;max-width:560px;">
  <h1 style="font-size:20px;color:#3D2E5C;margin:0 0 2px;">☀️ Buenos días</h1>
  <p style="font-size:13px;color:#7C6AAD;margin:0 0 16px;text-transform:capitalize;">${escapeHtml(dateLabel)} · últimas 24 horas</p>

  <table style="border-collapse:collapse;margin-bottom:8px;"><tr>
    ${stat("Pedidos", String(s.ordersLast24h))}
    ${stat("Ingresos", fmtCop(s.revenueLast24hCop))}
    ${stat("Pagadas", String(s.paidOrdersLast24h))}
  </tr><tr>
    ${stat("En pago", String(s.pendingPayment))}
    ${stat("Por despachar", String(s.toShip))}
    ${stat("Carritos abandon.", `${s.abandonedCarts24h}${s.abandonedCarts24h > 0 ? ` (${recoveryPct}% rec.)` : ""}`)}
  </tr></table>

  ${
    s.codToCollectCop > 0
      ? `<p style="margin:4px 0 0;font-size:13px;color:#3D2E5C;">💵 <strong>${fmtCop(s.codToCollectCop)}</strong> en contra entrega <em>por cobrar</em> (efectivo, se recauda al entregar — no incluido en Ingresos).</p>`
      : ""
  }

  ${
    attention.length > 0
      ? `<div style="margin-top:16px;"><div style="font-weight:700;color:#3D2E5C;margin-bottom:6px;">Necesitan tu atención</div>
    ${attention.map((a) => `<div style="font-size:14px;color:#3D2E5C;padding:4px 0;">${a}</div>`).join("")}</div>`
      : `<p style="font-size:14px;color:#5D8A3D;margin-top:16px;">✅ Nada pendiente de atención. ¡Buen día!</p>`
  }

  <p style="font-size:12px;color:#3D2E5C;opacity:0.55;margin-top:20px;">Panel completo: /admin/observability · /admin/pedidos</p>
</div>`;

  const lines = [
    `Resumen Lucams — ${dateLabel} (últimas 24h)`,
    ``,
    `Pedidos nuevos: ${s.ordersLast24h}`,
    `Ingresos (cobrado): ${fmtCop(s.revenueLast24hCop)} (${s.paidOrdersLast24h} confirmadas)`,
    s.codToCollectCop > 0 ? `COD por cobrar (al entregar): ${fmtCop(s.codToCollectCop)}` : null,
    `En pago (sin completar): ${s.pendingPayment}`,
    `Por despachar: ${s.toShip}`,
    `Carritos abandonados: ${s.abandonedCarts24h} (${recoveryPct}% recuperados)`,
    ``,
    `Necesitan atención:`,
    s.needsReconciliation > 0 ? `- ${s.needsReconciliation} orden(es) a reconciliar` : null,
    s.pendingReviews > 0 ? `- ${s.pendingReviews} reseña(s) por aprobar` : null,
    s.lowStock > 0 ? `- ${s.lowStock} variante(s) con stock bajo (<=5)` : null,
    s.errors24h > 0
      ? `- ${s.errors24h} error(es) del servidor${s.topErrorRoute ? ` (top: ${s.topErrorRoute})` : ""}`
      : null,
    attention.length === 0 ? `- Nada pendiente ✅` : null,
  ].filter((l): l is string => l !== null);

  return { subject, html, text: lines.join("\n") };
}

/**
 * Construye + publica el resumen diario como notificación in-app (centro de
 * notificaciones — ya NO se envía email, política 2026-08-05). Idempotente:
 * si ya se publicó hace < 12h, no re-publica (protege ante reintentos del cron).
 * `now` inyectable para tests.
 */
export async function sendDailySummary(
  now: Date = new Date(),
): Promise<{ sent: boolean; skipped?: "already_sent"; summary: DailySummary }> {
  const summary = await getDailySummary(now);

  const state = await prisma.alertState.findUnique({ where: { key: "daily_summary" } });
  if (state && now.getTime() - state.lastSentAt.getTime() < RESEND_GUARD_MS) {
    logger.info({ event: "daily_summary.skipped_recent", lastSentAt: state.lastSentAt });
    return { sent: false, skipped: "already_sent", summary };
  }

  const { text } = buildDailySummaryEmail(summary, now);
  try {
    await notify({
      type: "SYSTEM",
      severity: "info",
      title: "☀️ Resumen Lucams",
      detail: text, // resumen en texto plano (el detalle del feed es solo texto)
      actionUrl: "/admin/metricas",
      actionLabel: "Ver métricas",
      dedupKey: "daily_summary", // si quedó sin leer, se actualiza en vez de duplicar
    });
  } catch (err) {
    // #17 — mismo criterio que antes con el email: si la notificación NO se creó,
    // NO sellar lastSentAt → el próximo ciclo del cron reintenta en vez de quedar
    // bloqueado 12h por RESEND_GUARD_MS.
    logger.error({
      event: "daily_summary.notify_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    return { sent: false, summary };
  }

  await prisma.alertState.upsert({
    where: { key: "daily_summary" },
    create: { key: "daily_summary", lastSentAt: now, lastDetail: "☀️ Resumen Lucams" },
    update: { lastSentAt: now, lastDetail: "☀️ Resumen Lucams" },
  });
  logger.info({
    event: "daily_summary.sent",
    notified: true,
    orders: summary.ordersLast24h,
    revenueCop: summary.revenueLast24hCop,
  });
  return { sent: true, summary };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

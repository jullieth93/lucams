/*
 * Wrappers para enviar los 3 emails transaccionales de Order desde la saga.
 *
 * Patrón: try/catch interno — un fallo de email NUNCA debe propagarse y
 * romper la transición de la Order. Solo loggear.
 *
 * Idempotency: usamos idempotencyKey de Resend con
 * `${orderNumber}-${eventType}` para evitar duplicados si la saga corre
 * dos veces (ej. webhook reintenta).
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { designDisplayUnits } from "@/features/personalization/design-units";
import {
  renderOrderConfirmationEmail,
  renderOrderShippedEmail,
  renderOrderDeliveredEmail,
  renderOrderPaymentFailedEmail,
  renderOrderPaymentDeclinedEmail,
  renderOrderReturnedEmail,
  renderOrderCancelledEmail,
  renderRefundIssuedEmail,
  renderOrderAdminNotificationEmail,
} from "@/features/emails/registry";

type ShippingAddrSnapshot = {
  fullName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  department?: string;
  zip?: string;
};

function formatAddressLine(ship: ShippingAddrSnapshot): string {
  const line1 = [ship.addressLine1, ship.addressLine2].filter(Boolean).join(" ");
  const city = [ship.city, ship.department].filter(Boolean).join(", ");
  return [line1, city, ship.zip].filter(Boolean).join(" · ");
}

/**
 * Unidades FÍSICAS de una línea de pedido para el ×N del correo (modelo
 * multi-unidad 2026-09-09): unidades del diseño × qty de la línea (la línea
 * suele tener qty=1 con el pack en unitPrice, pero el mismo diseño agregado
 * dos veces agrupa en qty=2). null = línea sin diseño → el template usa qty.
 */
function lineDisplayUnits(item: {
  qty: number;
  design: { canvasData: unknown; metadata: unknown } | null;
}): number | undefined {
  const perDesign = designDisplayUnits(item.design);
  return perDesign === null ? undefined : perDesign * item.qty;
}

/** Envia order-confirmation tras Order PAID. */
export async function sendOrderConfirmation(orderId: string): Promise<boolean> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        items: {
          include: {
            variant: { select: { sku: true, product: { select: { name: true } } } },
            // Modelo multi-unidad (2026-09-09): la línea tiene qty=1 y el pack
            // va en unitPrice; las unidades reales salen del diseño (canvas o
            // metadata.unitCount) para mostrar ×N en el correo.
            design: { select: { canvasData: true, metadata: true } },
          },
        },
      },
    });
    if (!order) return false;

    const ship = order.shippingAddress as ShippingAddrSnapshot;
    const customerName = ship.fullName ?? "Cliente";

    const tpl = await renderOrderConfirmationEmail({
      orderNumber: order.number,
      customerName,
      total: order.total,
      subtotal: order.subtotal,
      shipping: order.shipping,
      discount: order.discount,
      shippingCarrier: order.shippingCarrier
        ? order.shippingCarrier.toUpperCase().replace(/-/g, " ")
        : null,
      items: order.items.map((it) => ({
        name: it.variant.product.name,
        qty: it.qty,
        units: lineDisplayUnits(it),
        lineTotal: it.unitPrice * it.qty,
      })),
      shippingAddress: formatAddressLine(ship),
      // F-11 — el token público ya no se guarda en claro y este email se manda
      // tras PAID (otro proceso): no hay link /pedido/<token>. El invitado
      // rastrea con número + correo en /rastrear.
      publicTrackingToken: null,
      paymentMethod: order.paymentMethod,
    });

    const result = await sendEmail({
      to: order.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      idempotencyKey: `${order.number}-confirmation`,
      tags: [
        { name: "type", value: "order_confirmation" },
        { name: "order_number", value: order.number },
      ],
    });
    logger.info({
      event: "order.email.confirmation.sent",
      orderNumber: order.number,
      to: order.email,
      result: result.sent ? "ok" : `skip:${result.reason}`,
    });
    return result.sent;
  } catch (err) {
    logger.error({
      event: "order.email.confirmation.fail",
      orderId,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * #2 (post-launch Bloque A) — Envía el email de confirmación SOLO si no se
 * envió antes (confirmationSentAt null), marcando el timestamp al lograrlo.
 *
 * Recuperable + idempotente: si la saga crashea entre el commit de PAID y este
 * envío, un reintento de processPaidOrder lo manda (sigue null). Si ya se envió,
 * no-op. El timestamp se setea SOLO tras un envío exitoso, así que un fallo de
 * Resend deja confirmationSentAt null y el próximo reintento lo reintenta.
 *
 * Doble-defensa: sendOrderConfirmation usa idempotencyKey en Resend, así que
 * incluso si dos procesos concurrentes pasan el guard, Resend dedupe el email.
 */
export async function sendOrderConfirmationOnce(orderId: string): Promise<void> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: { id: true, confirmationSentAt: true },
  });
  if (!order || order.confirmationSentAt) return;

  // P2 (verificación post-launch) — marcar confirmationSentAt SOLO si el envío
  // fue exitoso. Antes se marcaba siempre: un fallo de Resend (circuito abierto,
  // sin API key, 4xx, retries agotados) dejaba al cliente sin email y la saga
  // nunca lo reintentaba. Ahora un envío fallido deja confirmationSentAt null →
  // el próximo processPaidOrder (o reenvío admin) lo reintenta. Idempotencia
  // ante éxito: el flag + el idempotencyKey de Resend evitan el doble email.
  const sent = await sendOrderConfirmation(orderId);
  if (!sent) {
    logger.warn({ event: "order.email.confirmation.not_marked_will_retry", orderId });
    return;
  }

  try {
    await prisma.order.update({
      where: { id: orderId },
      data: { confirmationSentAt: new Date() },
    });
  } catch (err) {
    // P3 — no propagamos: el email YA se envió; un fallo al marcar el timestamp
    // solo causaría un reintento que el idempotencyKey de Resend deduplica.
    logger.error({
      event: "order.email.confirmation.mark_failed",
      orderId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Envia order-shipped tras transición a SHIPPED. */
export async function sendOrderShipped(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        number: true,
        email: true,
        shippingAddress: true,
        shippingCarrier: true,
        trackingNumber: true,
        trackingUrl: true,
      },
    });
    if (!order || !order.trackingNumber) return;

    const ship = order.shippingAddress as ShippingAddrSnapshot;
    const tpl = await renderOrderShippedEmail({
      orderNumber: order.number,
      customerName: ship.fullName ?? "Cliente",
      carrier: order.shippingCarrier
        ? order.shippingCarrier.toUpperCase().replace(/-/g, " ")
        : "Transportadora",
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      estimatedDays: null,
      publicTrackingToken: null, // F-11 — ver sendOrderConfirmation
    });

    const result = await sendEmail({
      to: order.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      idempotencyKey: `${order.number}-shipped`,
      tags: [
        { name: "type", value: "order_shipped" },
        { name: "order_number", value: order.number },
      ],
    });
    logger.info({
      event: "order.email.shipped.sent",
      orderNumber: order.number,
      to: order.email,
      result: result.sent ? "ok" : `skip:${result.reason}`,
    });
  } catch (err) {
    logger.error({
      event: "order.email.shipped.fail",
      orderId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Envia order-payment-failed tras transición a CANCELLED por pago rechazado. */
export async function sendOrderPaymentFailed(orderId: string, reason: string): Promise<void> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        number: true,
        email: true,
        total: true,
        shippingAddress: true,
      },
    });
    if (!order) return;
    const ship = order.shippingAddress as ShippingAddrSnapshot;
    const tpl = await renderOrderPaymentFailedEmail({
      orderNumber: order.number,
      customerName: ship.fullName ?? "Cliente",
      total: order.total,
      reason,
      publicTrackingToken: null, // F-11 — ver sendOrderConfirmation
    });
    const result = await sendEmail({
      to: order.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      idempotencyKey: `${order.number}-payment-failed`,
      tags: [
        { name: "type", value: "order_payment_failed" },
        { name: "order_number", value: order.number },
      ],
    });
    logger.info({
      event: "order.email.payment_failed.sent",
      orderNumber: order.number,
      to: order.email,
      result: result.sent ? "ok" : `skip:${result.reason}`,
    });
  } catch (err) {
    logger.error({
      event: "order.email.payment_failed.fail",
      orderId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * N-22a — Anti-spam del aviso "pago no aprobado": máx. 1 email por orden cada
 * PAYMENT_DECLINED_NOTIFY_COOLDOWN_HOURS horas, aunque el cliente reintente el
 * pago muchas veces (cada intento DECLINED/ERROR dispara este sender).
 */
const PAYMENT_DECLINED_NOTIFY_COOLDOWN_HOURS = 6;

/**
 * N-22a — Avisa al cliente que su pago NO fue aprobado (webhook Wompi
 * DECLINED/ERROR) y que su pedido sigue vivo y reintentable. Antes era un noop
 * deliberado sin aviso: el cliente se enteraba solo si volvía a la tienda.
 *
 * Garantías:
 *  - Idempotente POR TRANSACCIÓN: idempotencyKey `${number}-payment-declined-${txId}`
 *    (un reintento de entrega del MISMO evento Wompi no reenvía).
 *  - Anti-spam POR ORDEN: claim atómico sobre Order.paymentFailedNotifiedAt
 *    (updateMany gateado por el cooldown) ANTES de enviar. Si el claim cuenta 0,
 *    ya se avisó hace < N horas (u otro proceso lo hizo justo ahora) → skip.
 *    Si el envío falla tras el claim, NO se libera: la prioridad es no spamear
 *    (el próximo DECLINED tras el cooldown reintenta el aviso).
 *  - Por qué COLUMNA y no metadata: es la única forma de hacer el claim
 *    atómico con un updateMany gateado (dos webhooks concurrentes no pasan los
 *    dos), es consultable/indexable y espeja confirmationSentAt/
 *    reviewRequestedAt. Un flag dentro de un JSON no se puede gatear atómicamente.
 *  - Solo si la orden SIGUE PENDING_PAYMENT + WOMPI: si ya avanzó (pagó con
 *    otro intento, la cancelaron, la expiró el cron) no se avisa nada.
 *
 * Best-effort total: captura TODOS sus errores (el caller es el webhook: un
 * fallo de email JAMÁS debe caer en el catch que marca needsReconciliation).
 */
export async function sendOrderPaymentDeclined(input: {
  orderId: string;
  txId: string;
  reason: string;
}): Promise<void> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: input.orderId, deletedAt: null },
      select: {
        id: true,
        number: true,
        email: true,
        total: true,
        status: true,
        paymentMethod: true,
        shippingAddress: true,
      },
    });
    if (!order) return;
    if (order.status !== "PENDING_PAYMENT" || order.paymentMethod !== "WOMPI") {
      logger.info({
        event: "order.email.payment_declined.skip_not_pending",
        orderId: input.orderId,
        status: order.status,
        paymentMethod: order.paymentMethod,
      });
      return;
    }

    // Claim atómico anti-spam (ver header). El gate incluye status por si la
    // orden avanzó entre el findFirst y este update (carrera con APPROVED).
    const cooldownBoundary = new Date(
      Date.now() - PAYMENT_DECLINED_NOTIFY_COOLDOWN_HOURS * 60 * 60 * 1000,
    );
    const claim = await prisma.order.updateMany({
      where: {
        id: order.id,
        status: "PENDING_PAYMENT",
        OR: [
          { paymentFailedNotifiedAt: null },
          { paymentFailedNotifiedAt: { lt: cooldownBoundary } },
        ],
      },
      data: { paymentFailedNotifiedAt: new Date() },
    });
    if (claim.count === 0) {
      logger.info({
        event: "order.email.payment_declined.skip_cooldown",
        orderId: input.orderId,
        txId: input.txId,
        cooldownHours: PAYMENT_DECLINED_NOTIFY_COOLDOWN_HOURS,
      });
      return;
    }

    const ship = order.shippingAddress as ShippingAddrSnapshot;
    const tpl = await renderOrderPaymentDeclinedEmail({
      orderNumber: order.number,
      customerName: ship.fullName ?? "Cliente",
      total: order.total,
      reason: input.reason,
    });
    const result = await sendEmail({
      to: order.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      idempotencyKey: `${order.number}-payment-declined-${input.txId}`,
      tags: [
        { name: "type", value: "order_payment_declined" },
        { name: "order_number", value: order.number },
      ],
    });
    logger.info({
      event: "order.email.payment_declined.sent",
      orderNumber: order.number,
      to: order.email,
      txId: input.txId,
      result: result.sent ? "ok" : `skip:${result.reason}`,
    });
  } catch (err) {
    logger.error({
      event: "order.email.payment_declined.fail",
      orderId: input.orderId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Envia order-delivered tras transición a DELIVERED. */
export async function sendOrderDelivered(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        number: true,
        email: true,
        shippingAddress: true,
      },
    });
    if (!order) return;

    const ship = order.shippingAddress as ShippingAddrSnapshot;
    const tpl = await renderOrderDeliveredEmail({
      orderNumber: order.number,
      customerName: ship.fullName ?? "Cliente",
      publicTrackingToken: null, // F-11 — ver sendOrderConfirmation
    });

    const result = await sendEmail({
      to: order.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      idempotencyKey: `${order.number}-delivered`,
      tags: [
        { name: "type", value: "order_delivered" },
        { name: "order_number", value: order.number },
      ],
    });
    logger.info({
      event: "order.email.delivered.sent",
      orderNumber: order.number,
      to: order.email,
      result: result.sent ? "ok" : `skip:${result.reason}`,
    });
  } catch (err) {
    logger.error({
      event: "order.email.delivered.fail",
      orderId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Envia order-cancelled tras una cancelación MANUAL (admin). NO para cancelaciones por
 * pago rechazado (esas usan sendOrderPaymentFailed). Best-effort + idempotente.
 */
export async function sendOrderCancelled(orderId: string, reason?: string | null): Promise<void> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { number: true, email: true, shippingAddress: true },
    });
    if (!order) return;

    const ship = order.shippingAddress as ShippingAddrSnapshot;
    const tpl = await renderOrderCancelledEmail({
      orderNumber: order.number,
      customerName: ship.fullName ?? "Cliente",
      reason: reason ?? null,
    });

    const result = await sendEmail({
      to: order.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      idempotencyKey: `${order.number}-cancelled`,
      tags: [
        { name: "type", value: "order_cancelled" },
        { name: "order_number", value: order.number },
      ],
    });
    logger.info({
      event: "order.email.cancelled.sent",
      orderNumber: order.number,
      to: order.email,
      result: result.sent ? "ok" : `skip:${result.reason}`,
    });
  } catch (err) {
    logger.error({
      event: "order.email.cancelled.fail",
      orderId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/** F2 — email al cliente confirmando el reembolso emitido. Best-effort. */
export async function sendOrderRefunded(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        number: true,
        email: true,
        shippingAddress: true,
        refundAmount: true,
        total: true,
        refundReason: true,
      },
    });
    if (!order) return;

    const ship = order.shippingAddress as ShippingAddrSnapshot;
    const tpl = await renderRefundIssuedEmail({
      orderNumber: order.number,
      customerName: ship.fullName ?? "Cliente",
      amount: order.refundAmount ?? order.total,
      reason: order.refundReason,
    });

    const result = await sendEmail({
      to: order.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      idempotencyKey: `${order.number}-refunded`,
      tags: [
        { name: "type", value: "order_refunded" },
        { name: "order_number", value: order.number },
      ],
    });
    logger.info({
      event: "order.email.refunded.sent",
      orderNumber: order.number,
      to: order.email,
      result: result.sent ? "ok" : `skip:${result.reason}`,
    });
  } catch (err) {
    logger.error({
      event: "order.email.refunded.fail",
      orderId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────
// Aviso al ADMIN de pedido nuevo pagado (Lucy 2026-08-11: "¿cómo me
// entero de un nuevo pedido?") — email a ALERT_EMAIL + registro en el
// centro de notificaciones. Best-effort total: nunca lanza ni retrasa la saga.
// ─────────────────────────────────────────────────────────────────────

import { getSettingValue } from "@/lib/cms";
import { notify } from "@/features/notifications/service";

/**
 * Avisa al negocio que un pedido quedó PAGADO (o COD confirmado). Se llama en
 * processPaidOrder junto al email de confirmación del cliente. dedupKey por
 * orden: un retry de la saga no duplica el aviso in-app; el email usa
 * idempotencyKey propio por orden.
 */
export async function notifyNewOrderToAdmin(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        items: {
          include: {
            variant: { select: { product: { select: { name: true } } } },
            // Multi-unidad: unidades reales del diseño para el ×N del aviso.
            design: { select: { canvasData: true, metadata: true } },
          },
        },
      },
    });
    if (!order) return;

    const ship = order.shippingAddress as ShippingAddrSnapshot;
    const customerName = ship.fullName ?? "Cliente";
    const totalLabel = new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(order.total / 100);

    // 1) Registro duradero en el centro de notificaciones (la fuente de verdad
    //    del aviso; se crea aunque el email falle).
    await notify({
      type: "ORDER",
      severity: "info",
      title: `Nuevo pedido ${order.number}`,
      detail: `${customerName} · ${totalLabel} · ${ship.city ?? "ciudad?"}, ${ship.department ?? "depto?"}`,
      actionUrl: `/admin/pedidos/${order.number}`,
      actionLabel: "Ver pedido",
      dedupKey: `new-order-${order.id}`,
      metadata: {
        orderId: order.id,
        orderNumber: order.number,
        total: order.total,
        paymentMethod: order.paymentMethod,
      },
    });

    // 2) Email al buzón interno (mismo destinatario que las alertas operativas).
    const to = await getSettingValue("ALERT_EMAIL", "hola@lucamsshop.com");
    const tpl = await renderOrderAdminNotificationEmail({
      orderId: order.id,
      orderNumber: order.number,
      customerName,
      customerPhone: order.phone,
      customerEmail: order.email,
      city: ship.city ?? "",
      department: ship.department ?? "",
      paymentMethod: order.paymentMethod,
      subtotal: order.subtotal,
      shipping: order.shipping,
      shippingCarrier: order.shippingCarrier,
      discount: order.discount,
      total: order.total,
      items: order.items.map((it) => ({
        name: it.variant.product.name,
        qty: it.qty,
        units: lineDisplayUnits(it),
        lineTotal: it.unitPrice * it.qty,
      })),
    });
    const result = await sendEmail({
      to,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      replyTo: tpl.replyTo,
      idempotencyKey: `order:admin-notification:${order.id}`,
      tags: [
        { name: "type", value: "order_admin_notification" },
        { name: "order_number", value: order.number },
      ],
    });
    logger.info({
      event: "order.admin_notification.sent",
      orderNumber: order.number,
      to,
      result: result.sent ? "ok" : `skip:${result.reason}`,
    });
  } catch (err) {
    logger.error({
      event: "order.admin_notification.fail",
      orderId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * N-22b — Pedido DEVUELTO / CON NOVEDAD por la transportadora (webhook
 * Aveonline RETURNED/EXCEPTION). Antes solo se marcaba el flag admin
 * (needsReconciliation): el cliente no se enteraba de que su paquete venía de
 * vuelta hasta que preguntaba.
 *
 * Dos avisos, ambos best-effort e idempotentes por evento (el dedup de
 * WebhookEvent ya garantiza una sola corrida por evento del carrier):
 *  1) Centro de notificaciones admin con la ACCIÓN ESPERADA explícita
 *     (revisar y decidir reenvío / reembolso / reposición de stock). NO se
 *     automatiza ninguna de las tres: es decisión operativa. dedupKey por
 *     orden: eventos repetidos actualizan la misma notificación (anti-ruido).
 *  2) Email al cliente con copy honesto, sin promesas ("tu pedido viene de
 *     vuelta, te contactamos"). idempotencyKey `${number}-returned`.
 */
export async function notifyOrderReturned(input: {
  orderId: string;
  carrierStatusRaw: string;
}): Promise<void> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: input.orderId, deletedAt: null },
      select: {
        id: true,
        number: true,
        email: true,
        status: true,
        paymentMethod: true,
        trackingNumber: true,
        shippingAddress: true,
      },
    });
    if (!order) return;

    // 1) Notificación in-app al centro admin — la acción esperada va explícita.
    const moneyHint =
      order.paymentMethod === "WOMPI"
        ? "si el pago fue en línea, evalúa reembolso en Wompi (botón Reembolsar del pedido)"
        : "es contra entrega: no hay dinero que devolver si no se cobró";
    await notify({
      type: "ORDER",
      severity: "warning",
      title: `Pedido ${order.number} devuelto por la transportadora`,
      detail:
        `El carrier reportó "${input.carrierStatusRaw}" (guía ${order.trackingNumber ?? "—"}). ` +
        `Acción esperada: revisa el pedido y decide — reenvío al cliente, reembolso (${moneyHint}) ` +
        `o reposición del stock cuando el paquete llegue de vuelta. Nada de esto es automático.`,
      actionUrl: `/admin/pedidos/${order.number}`,
      actionLabel: "Revisar pedido",
      dedupKey: `order-returned-${order.id}`,
      metadata: {
        orderId: order.id,
        orderNumber: order.number,
        trackingNumber: order.trackingNumber,
        carrierStatusRaw: input.carrierStatusRaw,
        orderStatus: order.status,
        paymentMethod: order.paymentMethod,
      },
    });

    // 2) Email al cliente (sin promesas: "te contactamos").
    const ship = order.shippingAddress as ShippingAddrSnapshot;
    const tpl = await renderOrderReturnedEmail({
      orderNumber: order.number,
      customerName: ship.fullName ?? "Cliente",
    });
    const result = await sendEmail({
      to: order.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      idempotencyKey: `${order.number}-returned`,
      tags: [
        { name: "type", value: "order_returned" },
        { name: "order_number", value: order.number },
      ],
    });
    logger.info({
      event: "order.returned_notification.sent",
      orderNumber: order.number,
      to: order.email,
      result: result.sent ? "ok" : `skip:${result.reason}`,
    });
  } catch (err) {
    logger.error({
      event: "order.returned_notification.fail",
      orderId: input.orderId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

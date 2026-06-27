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
import { orderConfirmationEmail } from "@/features/emails/templates/order-confirmation";
import { orderShippedEmail } from "@/features/emails/templates/order-shipped";
import { orderDeliveredEmail } from "@/features/emails/templates/order-delivered";
import { orderPaymentFailedEmail } from "@/features/emails/templates/order-payment-failed";

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

/** Envia order-confirmation tras Order PAID. */
export async function sendOrderConfirmation(orderId: string): Promise<boolean> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        items: {
          include: {
            variant: { select: { sku: true, product: { select: { name: true } } } },
          },
        },
      },
    });
    if (!order) return false;

    const ship = order.shippingAddress as ShippingAddrSnapshot;
    const customerName = ship.fullName ?? "Cliente";

    const tpl = await orderConfirmationEmail({
      orderNumber: order.number,
      customerName,
      total: order.total,
      subtotal: order.subtotal,
      shipping: order.shipping,
      shippingCarrier: order.shippingCarrier
        ? order.shippingCarrier.toUpperCase().replace(/-/g, " ")
        : null,
      items: order.items.map((it) => ({
        name: it.variant.product.name,
        qty: it.qty,
        lineTotal: it.unitPrice * it.qty,
      })),
      shippingAddress: formatAddressLine(ship),
      publicTrackingToken: order.publicAccessToken ?? null,
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
        publicAccessToken: true,
      },
    });
    if (!order || !order.trackingNumber) return;

    const ship = order.shippingAddress as ShippingAddrSnapshot;
    const tpl = await orderShippedEmail({
      orderNumber: order.number,
      customerName: ship.fullName ?? "Cliente",
      carrier: order.shippingCarrier
        ? order.shippingCarrier.toUpperCase().replace(/-/g, " ")
        : "Transportadora",
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      estimatedDays: null,
      publicTrackingToken: order.publicAccessToken ?? null,
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
        publicAccessToken: true,
      },
    });
    if (!order) return;
    const ship = order.shippingAddress as ShippingAddrSnapshot;
    const tpl = await orderPaymentFailedEmail({
      orderNumber: order.number,
      customerName: ship.fullName ?? "Cliente",
      total: order.total,
      reason,
      publicTrackingToken: order.publicAccessToken ?? null,
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

/** Envia order-delivered tras transición a DELIVERED. */
export async function sendOrderDelivered(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        number: true,
        email: true,
        shippingAddress: true,
        publicAccessToken: true,
      },
    });
    if (!order) return;

    const ship = order.shippingAddress as ShippingAddrSnapshot;
    const tpl = await orderDeliveredEmail({
      orderNumber: order.number,
      customerName: ship.fullName ?? "Cliente",
      publicTrackingToken: order.publicAccessToken ?? null,
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

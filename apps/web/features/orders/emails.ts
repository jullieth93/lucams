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
export async function sendOrderConfirmation(orderId: string): Promise<void> {
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
    if (!order) return;

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
  } catch (err) {
    logger.error({
      event: "order.email.confirmation.fail",
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

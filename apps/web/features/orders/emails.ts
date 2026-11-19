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
import { prisma, Prisma } from "@/lib/db";
import { logger, scrubPii } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { designDisplayUnits } from "@/features/personalization/design-units";
import {
  describeVariantAttributes,
  parseVariantAttributes,
} from "@/features/products/variant-schemas";
import { getSiteUrl } from "@/features/emails/layout";
import { createReviewToken } from "@/features/reviews/review-token";
import { rotateOrderPublicAccessToken } from "./public-token";
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
import { carrierDisplayName, LUCAMS_CARRIER } from "@/features/shipping/lucams-shipping";
import { getSettingValue } from "@/lib/cms";
import { notify } from "@/features/notifications/service";

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
  designUnits?: number;
  design: { canvasData: unknown; metadata: unknown } | null;
}): number | undefined {
  if (typeof item.designUnits === "number" && item.designUnits > 1) {
    return item.designUnits * item.qty;
  }
  const perDesign = designDisplayUnits(item.design);
  return perDesign === null ? undefined : perDesign * item.qty;
}

function lineBreakdownWithBatch(item: {
  qty: number;
  designUnits?: number;
  design: { canvasData: unknown; metadata: unknown } | null;
  variant: { attributes: unknown; product: { personalizationSchema: unknown } };
}): string[] {
  const base = describeVariantAttributes(
    parseVariantAttributes(item.variant.attributes),
    item.variant.product.personalizationSchema,
  );
  const perCopy =
    typeof item.designUnits === "number" && item.designUnits > 1
      ? item.designUnits
      : (designDisplayUnits(item.design) ?? 1);
  if (item.design && perCopy > 1 && item.qty > 1) {
    return [...base, `${perCopy} diseños × ${item.qty} copias (${perCopy * item.qty} uds.)`];
  }
  return base;
}

/** Envia order-confirmation tras Order PAID. */
export async function sendOrderConfirmation(orderId: string): Promise<boolean> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        items: {
          include: {
            variant: {
              select: {
                sku: true,
                product: { select: { name: true, personalizationSchema: true } },
                // Paquete H — desglose de la variante (tamaño, fotos, imán…) bajo
                // el nombre de cada línea del correo.
                attributes: true,
              },
            },
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

    // Paquete H (2026-10-02) — destino del botón "Ver mi pedido":
    //  · Cliente REGISTRADO → su pedido en la cuenta (/mi-cuenta/pedidos/<number>).
    //  · INVITADO no-COD → token público FRESCO rotado al enviar (F-11: el plano
    //    nunca se persiste; los links previos quedan invalidados) y CTA a
    //    /pedido/<token>. Seguro en el flujo Wompi: este email sale tras el
    //    webhook APPROVED y el invitado nunca recibió el token original (la
    //    página /checkout/gracias llega por txId de Wompi y su CTA es /rastrear).
    //  · INVITADO COD → /rastrear (SIN rotar): con COD el cliente sí recibe el
    //    token original (redirect del checkout a /pedido/<token>?nueva=1) y el
    //    email puede llegar antes de que lo use — rotarlo rompería ese link.
    let publicTrackingToken: string | null = null;
    let accountOrderUrl: string | null = null;
    if (order.customerId) {
      accountOrderUrl = `${await getSiteUrl()}/mi-cuenta/pedidos/${order.number}`;
    } else if (order.paymentMethod !== "COD") {
      publicTrackingToken = await rotateOrderPublicAccessToken(order.id);
    }

    const tpl = await renderOrderConfirmationEmail({
      orderNumber: order.number,
      customerName,
      total: order.total,
      subtotal: order.subtotal,
      shipping: order.shipping,
      // Puntos Lucams (2026-10-12): la fila "Descuento" suma cupón + redención
      // de puntos para que el desglose cuadre con el total cobrado.
      discount: order.discount + order.loyaltyDiscount,
      shippingCarrier: order.shippingCarrier ? carrierDisplayName(order.shippingCarrier) : null,
      items: order.items.map((it) => ({
        name: it.variant.product.name,
        qty: it.qty,
        units: lineDisplayUnits(it),
        lineTotal: it.unitPrice * it.qty,
        breakdown: lineBreakdownWithBatch(it),
        warrantyMonths: it.warrantyMonths,
      })),
      shippingAddress: formatAddressLine(ship),
      publicTrackingToken,
      accountOrderUrl,
      paymentMethod: order.paymentMethod,
      internalDelivery: order.shippingCarrier === LUCAMS_CARRIER,
      // FLUJO REGALO — con isGift el template oculta los precios del correo.
      isGift: order.isGift,
      recipientName: order.recipientName,
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
      carrier: carrierDisplayName(order.shippingCarrier),
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      estimatedDays: null,
      publicTrackingToken: null, // F-11 — ver sendOrderConfirmation
      internalDelivery: order.shippingCarrier === LUCAMS_CARRIER,
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
        id: true,
        number: true,
        email: true,
        customerId: true,
        shippingAddress: true,
        shippingCarrier: true,
        // E3 — productos del pedido para el token de reseña (dedup por id).
        items: { select: { variant: { select: { product: { select: { id: true } } } } } },
      },
    });
    if (!order) return;

    // E3 (2026-10-07, F-11 cerrado) — el CTA "Dejar una reseña" lleva token REAL:
    // /resena/<token> HMAC stateless (features/reviews/review-token.ts, TTL 30d),
    // sin login, válido para invitados y registrados. Antes publicTrackingToken
    // iba siempre null y la plantilla caía a /rastrear con copy de reseña — un
    // callejón sin salida. Si la emisión FALLA (p. ej. CSRF_SECRET ausente) el
    // correo NO se sacrifica: el CTA pasa a "Ver mi pedido" con el fallback
    // (registrado → su pedido en la cuenta; invitado → /rastrear).
    const siteUrl = await getSiteUrl();
    const productIds = [...new Set(order.items.map((it) => it.variant.product.id))];
    let reviewUrl: string | null = null;
    if (productIds.length > 0) {
      try {
        reviewUrl = `${siteUrl}/resena/${createReviewToken({
          orderId: order.id,
          orderNumber: order.number,
          email: order.email,
          productIds,
        })}`;
      } catch (err) {
        logger.error({
          event: "order.email.delivered.review_token_fail",
          orderNumber: order.number,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    const fallbackUrl = order.customerId
      ? `${siteUrl}/mi-cuenta/pedidos/${order.number}`
      : `${siteUrl}/rastrear`;

    const ship = order.shippingAddress as ShippingAddrSnapshot;
    const tpl = await renderOrderDeliveredEmail({
      orderNumber: order.number,
      customerName: ship.fullName ?? "Cliente",
      reviewUrl,
      fallbackUrl,
      internalDelivery: order.shippingCarrier === LUCAMS_CARRIER,
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
            variant: {
              select: {
                product: { select: { name: true, personalizationSchema: true } },
                // Paquete H — desglose de la variante en el aviso (qué producir).
                attributes: true,
              },
            },
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
      detail: `${customerName} · ${totalLabel} · ${ship.city ?? "ciudad?"}, ${ship.department ?? "depto?"}${order.isGift ? " · 🎁 regalo" : ""}`,
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
      shippingCarrier: order.shippingCarrier ? carrierDisplayName(order.shippingCarrier) : null,
      // Puntos Lucams (2026-10-12): cupón + redención de puntos sumados para
      // que el desglose cuadre con el total.
      discount: order.discount + order.loyaltyDiscount,
      total: order.total,
      // FLUJO REGALO — destinatario de la guía + mensaje para la tarjeta
      // (producción empaca sin precios visibles si isGift).
      recipientName: order.recipientName,
      recipientPhone: order.recipientPhone,
      isGift: order.isGift,
      giftMessage: order.giftMessage,
      items: order.items.map((it) => ({
        name: it.variant.product.name,
        qty: it.qty,
        units: lineDisplayUnits(it),
        lineTotal: it.unitPrice * it.qty,
        breakdown: lineBreakdownWithBatch(it),
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

function sanitizeCarrierNote(value?: string): string {
  if (!value) return "";
  const collapsed = value.trim().split(/\s+/).join(" ");
  return scrubPii(collapsed).slice(0, 240);
}

function buildIncidentKey(normalizedRawKey: string, occurredAt?: Date): string {
  if (!occurredAt) return `${normalizedRawKey}:no-ts`;
  return `${normalizedRawKey}:${Math.floor(occurredAt.getTime() / 60_000)}`;
}

function matchesSameCarrierIncident(
  prevIncidentKey: string | null,
  incidentKey: string,
  normalizedRawKey: string,
): boolean {
  if (prevIncidentKey === null) return false;
  const noTsKey = `${normalizedRawKey}:no-ts`;
  if (prevIncidentKey === incidentKey || prevIncidentKey === noTsKey) return true;
  return incidentKey === noTsKey && prevIncidentKey.startsWith(`${normalizedRawKey}:`);
}

function formatShippingExceptionCopy(params: {
  orderNumber: string;
  shippingCarrier: string | null;
  trackingNumber: string | null;
  cleanRaw: string;
  carrierContext: string;
  isVoidedGuide: boolean;
}): { title: string; detail: string } {
  const carrierLabel = params.shippingCarrier
    ? carrierDisplayName(params.shippingCarrier)
    : "La transportadora";
  const guideLabel = params.trackingNumber ?? "—";

  if (params.isVoidedGuide) {
    const contextSuffix = params.carrierContext ? ` (${params.carrierContext})` : "";
    return {
      title: `Guía anulada en pedido ${params.orderNumber}`,
      detail: `${carrierLabel} reportó "${params.cleanRaw}" en la guía ${guideLabel}${contextSuffix}. Acción esperada: verifica en Aveonline y genera una nueva guía o coordina el despacho; no se envió correo de devolución al cliente.`,
    };
  }

  const contextSuffix = params.carrierContext ? `: ${params.carrierContext}` : "";
  return {
    title: `Novedad de entrega en pedido ${params.orderNumber}`,
    detail: `${carrierLabel} reportó "${params.cleanRaw}" en la guía ${guideLabel}${contextSuffix}. Suele corresponder a un inconveniente operativo de ruta con reintento al siguiente día hábil; verifica en el panel de Aveonline solo si requiere aclarar dirección o teléfono. Al cliente no se le notificó devolución ni se activó reconciliación de pago.`,
  };
}

function resolvePaymentRefundHint(paymentMethod: string): string {
  if (paymentMethod === "WOMPI") {
    return "si el pago fue en línea, evalúa reembolso en Wompi (botón Reembolsar del pedido)";
  }
  if (paymentMethod === "DIRECT_TRANSFER") {
    return "fue pago directo verificado (Bre-B / Transferencia): evalúa reembolso bancario desde el pedido";
  }
  return "es contraentrega: no hay dinero que devolver si no se cobró";
}

function isEmailPermanentlyHandled(result: { sent: boolean; reason?: string }): boolean {
  if (result.sent || result.reason === "disabled-by-env") return true;
  return result.reason === "no-api-key" && process.env.NODE_ENV !== "production";
}

async function upsertOrderReturnedNotification(params: {
  orderId: string;
  orderNumber: string;
  dedupKey: string;
  title: string;
  detail: string;
  cleanRaw: string;
  carrierContext: string;
  buildMetadata: (emailSentAt: string | null) => Prisma.InputJsonObject;
}): Promise<{ notifId: string; alreadyEmailed: boolean }> {
  const existing = await prisma.notification.findFirst({
    where: { dedupKey: params.dedupKey },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    const prevMeta = (existing.metadata ?? null) as Record<string, unknown> | null;
    const prevEmailSentAt =
      typeof prevMeta?.customerEmailSentAt === "string" ? prevMeta.customerEmailSentAt : null;
    const prevRaw =
      typeof prevMeta?.carrierStatusRaw === "string" ? prevMeta.carrierStatusRaw : null;
    const prevHadContext = Boolean(prevMeta?.carrierDescription || prevMeta?.carrierClarification);
    const shouldEnrich =
      prevRaw !== params.cleanRaw || (!prevHadContext && params.carrierContext.length > 0);

    if (shouldEnrich) {
      await prisma.notification.update({
        where: { id: existing.id },
        data: {
          title: params.title,
          detail: params.detail,
          metadata: params.buildMetadata(prevEmailSentAt),
        },
      });
    }
    return { notifId: existing.id, alreadyEmailed: Boolean(prevEmailSentAt) };
  }

  const created = await notify({
    type: "ORDER",
    severity: "warning",
    title: params.title,
    detail: params.detail,
    actionUrl: `/admin/pedidos/${params.orderNumber}`,
    actionLabel: "Revisar pedido",
    dedupKey: params.dedupKey,
    metadata: params.buildMetadata(null),
  });
  return { notifId: created.id, alreadyEmailed: false };
}

/**
 * Novedad operativa o guía anulada reportada por la transportadora (`EXCEPTION`:
 * `NOVEDAD`, `EXCEPCION`, `ANULADA` — caso real LCM-2026-0006).
 *
 * Separación estricta frente a `notifyOrderReturned`:
 *  1) SOLO avisa al admin en `/admin/notificaciones` (JAMÁS envía correo de
 *     «viene de vuelta» al cliente, porque una novedad operativa suele salir a
 *     reintento al siguiente día hábil o resolverse aclarando dirección en Aveonline).
 *  2) Dedup determinista en PostgreSQL incluso si la notificación ya fue marcada
 *     como leída (`readAt != null`), evitando que `tracking-sync` (cada 15 min)
 *     recree avisos o suba `createdAt` en bucle. Si el webhook llegó sin detalle y
 *     el polling posterior trae `descripcion`/`aclaracion` del mismo incidente,
 *     enriquece el texto una sola vez sin reabrir `readAt`.
 */
export async function notifyOrderShippingException(input: {
  orderId: string;
  carrierStatusRaw: string;
  carrierDescription?: string;
  carrierClarification?: string;
  occurredAt?: Date;
  isVoidedGuide?: boolean;
}): Promise<void> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: input.orderId, deletedAt: null },
      select: {
        id: true,
        number: true,
        status: true,
        paymentMethod: true,
        shippingCarrier: true,
        trackingNumber: true,
      },
    });
    if (!order) return;

    const cleanRaw = sanitizeCarrierNote(input.carrierStatusRaw) || "NOVEDAD";
    const cleanDesc = sanitizeCarrierNote(input.carrierDescription);
    const cleanClar = sanitizeCarrierNote(input.carrierClarification);
    const carrierContext = [cleanDesc, cleanClar].filter(Boolean).join(" · ");
    const normalizedRawKey = cleanRaw.toUpperCase();
    const incidentKey = buildIncidentKey(normalizedRawKey, input.occurredAt);
    const isVoidedGuide = Boolean(input.isVoidedGuide);
    const dedupKey = `order-exception-${order.id}`;

    const { title, detail } = formatShippingExceptionCopy({
      orderNumber: order.number,
      shippingCarrier: order.shippingCarrier,
      trackingNumber: order.trackingNumber,
      cleanRaw,
      carrierContext,
      isVoidedGuide,
    });

    const existing = await prisma.notification.findFirst({
      where: { dedupKey },
      orderBy: { createdAt: "desc" },
    });
    const prevMeta = (existing?.metadata ?? null) as Record<string, unknown> | null;
    const prevIncidentKey = typeof prevMeta?.incidentKey === "string" ? prevMeta.incidentKey : null;
    const prevHadContext = Boolean(prevMeta?.carrierDescription || prevMeta?.carrierClarification);

    const metadata = {
      orderId: order.id,
      orderNumber: order.number,
      trackingNumber: order.trackingNumber,
      carrierStatusRaw: cleanRaw,
      carrierDescription: cleanDesc || null,
      carrierClarification: cleanClar || null,
      incidentKey,
      isVoidedGuide,
      orderStatus: order.status,
      paymentMethod: order.paymentMethod,
    };

    if (existing && matchesSameCarrierIncident(prevIncidentKey, incidentKey, normalizedRawKey)) {
      if (!prevHadContext && carrierContext.length > 0) {
        await prisma.notification.update({
          where: { id: existing.id },
          data: { title, detail, metadata },
        });
      }
      return;
    }

    await notify({
      type: "ORDER",
      severity: "warning",
      title,
      detail,
      actionUrl: `/admin/pedidos/${order.number}`,
      actionLabel: "Revisar pedido",
      dedupKey,
      metadata,
    });
  } catch (err) {
    logger.error({
      event: "order.shipping_exception_notification.fail",
      orderId: input.orderId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * N-22b — Pedido DEVUELTO al remitente confirmado por la transportadora (`RETURNED`:
 * `DEVUELTO`, `DEVOLUCIÓN`, `RETORNADO`). NUNCA se invoca para novedades operativas
 * (`EXCEPTION`).
 *
 * Dos avisos, ambos best-effort e idempotentes en PostgreSQL:
 *  1) Centro de notificaciones admin con la acción esperada explícita (reenvío,
 *     reembolso o reposición de stock al recibir el paquete). Sin re-subir `createdAt`
 *     ni recrear filas cada 15 min en `tracking-sync` si el estado no cambió.
 *  2) Email honesto al cliente («tu pedido viene de vuelta, te contactamos») enviado
 *     máximo UNA vez por pedido (guarda `customerEmailSentAt` persistida en `metadata`
 *     más `idempotencyKey` de Resend como segunda capa).
 */
export async function notifyOrderReturned(input: {
  orderId: string;
  carrierStatusRaw: string;
  carrierDescription?: string;
  carrierClarification?: string;
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

    const cleanRaw = sanitizeCarrierNote(input.carrierStatusRaw) || "DEVUELTO";
    const cleanDesc = sanitizeCarrierNote(input.carrierDescription);
    const cleanClar = sanitizeCarrierNote(input.carrierClarification);
    const carrierContext = [cleanDesc, cleanClar].filter(Boolean).join(" · ");
    const contextSuffix = carrierContext ? `: ${carrierContext}` : "";
    const moneyHint = resolvePaymentRefundHint(order.paymentMethod);
    const dedupKey = `order-returned-${order.id}`;
    const title = `Pedido ${order.number} devuelto por la transportadora`;
    const detail =
      `El carrier reportó "${cleanRaw}" (guía ${order.trackingNumber ?? "—"})${contextSuffix}. ` +
      `Acción esperada: revisa el pedido y decide — reenvío al cliente, reembolso (${moneyHint}) ` +
      `o reposición del stock cuando el paquete llegue de vuelta. Nada de esto es automático.`;

    const buildMetadata = (emailSentAt: string | null) => ({
      orderId: order.id,
      orderNumber: order.number,
      trackingNumber: order.trackingNumber,
      carrierStatusRaw: cleanRaw,
      carrierDescription: cleanDesc || null,
      carrierClarification: cleanClar || null,
      orderStatus: order.status,
      paymentMethod: order.paymentMethod,
      ...(emailSentAt ? { customerEmailSentAt: emailSentAt } : {}),
    });

    const { notifId, alreadyEmailed } = await upsertOrderReturnedNotification({
      orderId: order.id,
      orderNumber: order.number,
      dedupKey,
      title,
      detail,
      cleanRaw,
      carrierContext,
      buildMetadata,
    });
    if (alreadyEmailed) return;

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
    if (isEmailPermanentlyHandled(result)) {
      await prisma.notification
        .update({
          where: { id: notifId },
          data: { metadata: buildMetadata(new Date().toISOString()) },
        })
        .catch(() => null);
    }
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

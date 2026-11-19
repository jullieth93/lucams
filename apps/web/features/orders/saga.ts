/*
 * Saga post-PAID — orquesta lo que sucede cuando una Order pasa de
 * PENDING_PAYMENT a PAID (típicamente disparado por el webhook Wompi):
 *
 *   1. transitionOrder(orderId, "PAID") + guardar wompiTransactionId.
 *   2. Intentar createShipment con el provider activo (Aveonline).
 *      - Si OK: guardar trackingNumber/labelUrl/trackingUrl, archivar copia
 *        propia del PDF de la etiqueta en Storage (labelPath, best-effort — fix
 *        1.8) y transitionOrder a FULFILLING (lista para imprimir/despachar).
 *      - Si falla: Order queda en PAID; admin puede reintentar manualmente
 *        desde /admin/pedidos/[id]. No revertimos a PENDING_PAYMENT.
 *
 * Idempotente: si la Order ya tiene trackingNumber, no re-llama Aveonline.
 * Si ya está PAID y la transición a PAID se invoca de nuevo, transitionOrder
 * la trata como no-op (mismo estado).
 */

import "server-only";
import { prisma, Prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { formatCOPExact } from "@/lib/format";
import { getShippingProvider } from "@/features/shipping/provider";
import { isVoidedGuideStatus } from "@/features/shipping/aveonline";
import { getEffectiveShippingDims } from "@/features/products/shipping-schemas";
import { getSettingValue } from "@/lib/cms";
import { invalidateCatalogListings } from "@/lib/catalog";
import { transitionOrder, clearCartAfterPaid, OrderTransitionError } from "./service";
import { FetchTimeoutError } from "@/lib/fetch-with-timeout";
import { decrementStockForOrder } from "./stock";
import { notifyStockSaleLost } from "./stock-alerts";
import {
  inventoryUnitsForOrderItem,
  declaredValueCopPerInventoryUnit,
} from "@/features/personalization/design-units";
import { InsufficientStockError, StockAlreadyAppliedError } from "./errors";
import { LUCAMS_CARRIER } from "@/features/shipping/lucams-shipping";
import { buildShipmentLastError } from "./shipment-error";
import { resolveShipmentRecipient } from "./shipment-recipient";
import { archiveShipmentLabel } from "@/features/shipping/label-archive";
import type { ShippingAddressInput } from "./schemas";
import {
  sendOrderConfirmationOnce,
  notifyNewOrderToAdmin,
  sendOrderShipped,
  sendOrderDelivered,
  sendOrderPaymentFailed,
  sendOrderCancelled,
  sendOrderRefunded,
  notifyOrderReturned,
  notifyOrderShippingException,
} from "./emails";
import { issueReferralRewardsIfFirstPaidOrder } from "@/features/referrals/service";
import { awardLoyaltyPointsForPaidOrder } from "@/features/loyalty/service";
import { isCouponPerCustomerLimitError } from "@/features/coupons/redemption";
import { notify } from "@/features/notifications/service";

export type ProcessPaidOrderInput = {
  orderId: string;
  wompiTransactionId?: string;
};

export type ProcessPaidOrderResult = {
  status: "ok" | "already_processed" | "shipment_failed" | "transition_failed";
  trackingNumber?: string;
  reason?: string;
};

const STALE_CLAIM_MS = 10 * 60 * 1000;
const LOGISTICS_RECONCILIATION_REASON_RE = /^(Envío |Guía anulada|Webhook Aveonline:)/i;

function errorMessageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "number" || typeof err === "boolean") return String(err);
  return "unknown_error";
}

async function markNeedsReconciliation(orderId: string, reason: string): Promise<void> {
  try {
    await prisma.order.updateMany({
      where: { id: orderId, needsReconciliation: false },
      data: { needsReconciliation: true, reconciliationReason: reason },
    });
    logger.warn({ event: "order.saga.flagged_reconciliation", orderId, reason });
  } catch (flagErr) {
    logger.error({
      event: "order.saga.flag_reconciliation_failed",
      orderId,
      err: errorMessageOf(flagErr),
    });
  }
}

/**
 * F-02 — un APPROVED cuya tx es distinta de la que pagó la orden es un segundo cobro real.
 * Marca `needsReconciliation` sin mutar el estado de la orden ni disparar side effects.
 */
export async function flagForeignApprovedPayment(input: {
  orderId: string;
  orderNumber?: string;
  paidTxId: string | null;
  incomingTxId?: string | null;
}): Promise<void> {
  const { orderId, paidTxId, incomingTxId } = input;
  if (!incomingTxId || !paidTxId || incomingTxId === paidTxId) return;
  logger.warn({
    event: "order.saga.paid.foreign_approved_tx",
    orderId,
    orderNumber: input.orderNumber ?? null,
    paidTxId,
    incomingTxId,
  });
  await markNeedsReconciliation(
    orderId,
    `Segundo pago Wompi APROBADO (tx ${incomingTxId}) sobre una orden ya pagada (tx ${paidTxId}). ` +
      `Doble cobro al cliente: contrastar contra el panel Wompi y evaluar el reembolso del duplicado.`,
  );
}

async function flagOrderNeedsReconciliation(
  orderId: string,
  wompiTransactionId: string | null,
  err: InsufficientStockError,
): Promise<void> {
  const availableSuffix = err.available === undefined ? "" : `, había ${err.available}`;
  const reason =
    `Pago Wompi APROBADO pero stock agotado al confirmar (variant ${err.variantId}, ` +
    `pedía ${err.requested}${availableSuffix}). ` +
    `Tx Wompi: ${wompiTransactionId ?? "—"}. Decidir reembolso o producir stock.`;
  await markNeedsReconciliation(orderId, reason);
}

async function loadOrderForPaidSaga(orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: {
      items: {
        include: {
          variant: {
            select: {
              id: true,
              sku: true,
              attributes: true,
              product: {
                select: {
                  slug: true,
                  name: true,
                  physicalSpecs: true,
                  personalizationSchema: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

type PaidSagaOrder = NonNullable<Awaited<ReturnType<typeof loadOrderForPaidSaga>>>;

function resolvePaidStatusNote(
  wompiTransactionId: string | undefined,
  paymentMethod: string,
): string {
  if (wompiTransactionId) return `Pago Wompi aprobado (${wompiTransactionId})`;
  if (paymentMethod === "DIRECT_TRANSFER") return "Pago directo verificado (Bre-B / Transferencia)";
  return "Pago confirmado";
}

async function handleAlreadyTrackedPaidOrder(
  order: PaidSagaOrder,
  wompiTransactionId: string | undefined,
): Promise<ProcessPaidOrderResult> {
  if (wompiTransactionId && order.paymentMethod === "COD" && !order.wompiTransactionId) {
    await markNeedsReconciliation(
      order.id,
      `Pago Wompi (tx ${wompiTransactionId}) sobre una orden YA confirmada como contraentrega ` +
        `(guía ${order.trackingNumber}). Doble cobro: reembolsar el pago en línea o convertir la guía a prepagada.`,
    );
  }
  await flagForeignApprovedPayment({
    orderId: order.id,
    orderNumber: order.number,
    paidTxId: order.wompiTransactionId,
    incomingTxId: wompiTransactionId,
  });
  if (order.status === "PAID") {
    await transitionOrder(order.id, "FULFILLING").catch(() => null);
  }
  logger.info({
    event: "order.saga.paid.already_processed",
    orderId: order.id,
    orderNumber: order.number,
    trackingNumber: order.trackingNumber,
  });
  return {
    status: "already_processed",
    trackingNumber: order.trackingNumber ?? undefined,
  };
}

async function syncB2bProposalPaidTx(
  tx: Prisma.TransactionClient,
  order: PaidSagaOrder,
): Promise<void> {
  if (!order.b2bProposalId) return;
  const prop = await tx.opportunityProposal.findUnique({
    where: { id: order.b2bProposalId },
    select: { id: true, opportunityId: true, approvedAt: true },
  });
  if (!prop) return;

  const paidNow = new Date();
  await tx.opportunityProposal.update({
    where: { id: prop.id },
    data: {
      status: "CONVERTED",
      ...(prop.approvedAt ? {} : { approvedAt: paidNow }),
    },
  });
  await tx.opportunity.update({
    where: { id: prop.opportunityId },
    data: { stage: "WON", convertedOrderId: order.id },
  });
  await tx.task.updateMany({
    where: { opportunityId: prop.opportunityId, status: { in: ["OPEN", "IN_PROGRESS"] } },
    data: { status: "DONE" },
  });
  if (!order.contactId) return;

  const otherOpenOpps = await tx.opportunity.count({
    where: {
      contactId: order.contactId,
      id: { not: prop.opportunityId },
      deletedAt: null,
      stage: { in: ["NEW", "QUALIFYING", "PROPOSAL_SENT"] },
    },
  });
  if (otherOpenOpps === 0) {
    await tx.lifecycleEnrollment.updateMany({
      where: {
        contactId: order.contactId,
        journey: { trigger: "B2B_FOLLOW_UP" },
        status: "ACTIVE",
      },
      data: {
        status: "EXITED",
        exitReason: "OPPORTUNITY_WON",
        completedAt: paidNow,
      },
    });
  }
}

async function redeemOrderCouponAtPayTx(
  tx: Prisma.TransactionClient,
  order: PaidSagaOrder,
): Promise<void> {
  if (!order.couponId || order.discount <= 0) return;

  const inc = await tx.coupon.updateMany({
    where: {
      id: order.couponId,
      OR: [{ maxUses: null }, { usedCount: { lt: prisma.coupon.fields.maxUses } }],
    },
    data: { usedCount: { increment: 1 } },
  });

  if (inc.count !== 1) {
    logger.warn({
      event: "order.saga.coupon_exhausted_at_pay",
      orderId: order.id,
      couponId: order.couponId,
    });
    await tx.order.updateMany({
      where: { id: order.id, needsReconciliation: false },
      data: {
        needsReconciliation: true,
        reconciliationReason: `Cupón agotado al pagar: se otorgó un descuento de ${formatCOPExact(order.discount)} por encima del cupo global (maxUses). El total ya se cobró/autorizó con el descuento — revisa y decide.`,
      },
    });
    return;
  }

  try {
    await tx.couponUsage.create({
      data: {
        couponId: order.couponId,
        customerId: order.customerId,
        email: order.email ? order.email.trim().toLowerCase() : null,
        orderId: order.id,
        amount: order.discount,
      },
    });
  } catch (err) {
    if (!isCouponPerCustomerLimitError(err)) throw err;
    logger.warn({
      event: "order.saga.coupon_per_customer_limit_at_pay",
      orderId: order.id,
      couponId: order.couponId,
    });
    await tx.order.updateMany({
      where: { id: order.id, needsReconciliation: false },
      data: {
        needsReconciliation: true,
        reconciliationReason: `Tope por cliente del cupón excedido al pagar (checkout concurrente con la misma identidad): se cobró un descuento de ${formatCOPExact(order.discount)} por encima de maxUsesPerCustomer. Revisa y decide.`,
      },
    });
  }
}

async function commitPendingToPaidTransaction(
  order: PaidSagaOrder,
  wompiTransactionId: string | undefined,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await decrementStockForOrder(tx, {
      id: order.id,
      number: order.number,
      channel: order.b2bProposalId ? "B2B" : "STOREFRONT",
      items: order.items.map((it) => ({
        variantId: it.variantId,
        qty: inventoryUnitsForOrderItem(it),
      })),
    });

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        ...(wompiTransactionId ? { wompiTransactionId } : {}),
      },
    });

    await tx.orderStatusEvent.create({
      data: {
        orderId: order.id,
        fromStatus: "PENDING_PAYMENT",
        toStatus: "PAID",
        source: wompiTransactionId ? "webhook" : "admin",
        note: resolvePaidStatusNote(wompiTransactionId, order.paymentMethod),
      },
    });

    await syncB2bProposalPaidTx(tx, order);

    const designIds = order.items.flatMap((item) => (item.designId ? [item.designId] : []));
    if (designIds.length > 0) {
      await tx.design.updateMany({
        where: { id: { in: designIds }, status: "READY" },
        data: { status: "USED_IN_ORDER" },
      });
    }

    await redeemOrderCouponAtPayTx(tx, order);

    if (order.cartId) {
      await clearCartAfterPaid(order.cartId, tx, order.id);
    }
  });
}

async function handleConcurrentStockAlreadyApplied(
  order: PaidSagaOrder,
  wompiTransactionId: string | undefined,
): Promise<ProcessPaidOrderResult> {
  const winner = await prisma.order.findUnique({
    where: { id: order.id },
    select: { trackingNumber: true, wompiTransactionId: true },
  });
  await flagForeignApprovedPayment({
    orderId: order.id,
    orderNumber: order.number,
    paidTxId: winner?.wompiTransactionId ?? null,
    incomingTxId: wompiTransactionId,
  });
  logger.info({
    event: "order.saga.paid.concurrent_idempotent_skip",
    orderId: order.id,
    orderNumber: order.number,
    winnerTracking: winner?.trackingNumber ?? null,
  });
  return {
    status: "already_processed",
    trackingNumber: winner?.trackingNumber ?? undefined,
  };
}

async function handleInsufficientStockAtPay(
  order: PaidSagaOrder,
  wompiTransactionId: string | undefined,
  err: InsufficientStockError,
): Promise<ProcessPaidOrderResult> {
  const txIdOrNull = wompiTransactionId ?? null;
  logger.error({
    event: "order.saga.paid.no_stock",
    orderId: order.id,
    orderNumber: order.number,
    wompiTransactionId: txIdOrNull,
    variantId: err.variantId,
    requested: err.requested,
    available: err.available ?? null,
    reason: "Stock agotado entre PENDING_PAYMENT y PAID — refund manual",
  });
  await flagOrderNeedsReconciliation(order.id, txIdOrNull, err);
  await notifyStockSaleLost({
    context: order.paymentMethod === "COD" ? "cod_finalize" : "saga_paid",
    variantId: err.variantId,
    requested: err.requested,
    available: err.available,
    productName: err.productName,
    orderId: order.id,
    orderNumber: order.number,
  }).catch((alertErr) =>
    logger.warn({
      event: "order.saga.paid.stock_alert_failed",
      orderId: order.id,
      err: errorMessageOf(alertErr),
    }),
  );
  return {
    status: "shipment_failed",
    reason: `Stock insuficiente al confirmar pago (variant ${err.variantId}). Requiere reconciliación admin.`,
  };
}

async function handlePendingToPaidFailure(
  order: PaidSagaOrder,
  wompiTransactionId: string | undefined,
  err: unknown,
): Promise<ProcessPaidOrderResult | null> {
  if (err instanceof StockAlreadyAppliedError) {
    return handleConcurrentStockAlreadyApplied(order, wompiTransactionId);
  }
  if (err instanceof InsufficientStockError) {
    return handleInsufficientStockAtPay(order, wompiTransactionId, err);
  }
  if (err instanceof OrderTransitionError) {
    logger.warn({
      event: "order.saga.paid.transition_skipped",
      orderId: order.id,
      from: err.from,
      to: err.to,
    });
    return null;
  }
  throw err;
}

async function ensureOrderPaidBeforeShipment(
  order: PaidSagaOrder,
  wompiTransactionId: string | undefined,
): Promise<ProcessPaidOrderResult | null> {
  if (order.status === "PENDING_PAYMENT") {
    try {
      await commitPendingToPaidTransaction(order, wompiTransactionId);
      invalidateCatalogListings();
      logger.info({
        event: "order.saga.paid.transitioned",
        orderId: order.id,
        orderNumber: order.number,
        wompiTransactionId: wompiTransactionId ?? null,
      });
      return null;
    } catch (err) {
      return handlePendingToPaidFailure(order, wompiTransactionId, err);
    }
  }

  if (order.status !== "PAID" && order.status !== "FULFILLING") {
    logger.warn({
      event: "order.saga.paid.invalid_starting_status",
      orderId: order.id,
      status: order.status,
    });
    if (wompiTransactionId) {
      await markNeedsReconciliation(
        order.id,
        `Pago Wompi (tx ${wompiTransactionId}) APROBADO sobre una orden en estado ${order.status} ` +
          `(no PENDING_PAYMENT). El dinero se capturó pero la orden no se cumplirá: reembolsar.`,
      );
    }
    return {
      status: "transition_failed",
      reason: `Order en estado ${order.status}, no PENDING_PAYMENT`,
    };
  }

  await flagForeignApprovedPayment({
    orderId: order.id,
    orderNumber: order.number,
    paidTxId: order.wompiTransactionId,
    incomingTxId: wompiTransactionId,
  });

  if (wompiTransactionId && !order.wompiTransactionId) {
    await prisma.order.updateMany({
      where: { id: order.id, wompiTransactionId: null },
      data: { wompiTransactionId },
    });
    logger.warn({
      event: "order.saga.paid.late_approved_no_txid",
      orderId: order.id,
      orderNumber: order.number,
      paymentMethod: order.paymentMethod,
      incomingTxId: wompiTransactionId,
    });
    await markNeedsReconciliation(
      order.id,
      `Pago Wompi tardío APROBADO (tx ${wompiTransactionId}) sobre una orden ${order.paymentMethod} ` +
        `sin txId registrado y sin guía (pedido ${order.number}). El cobro en línea YA se capturó: NO se ` +
        `generó guía en esta pasada para no crear una guía con recaudo sobre un cliente ya cobrado. ` +
        `Verificar el cobro en el panel Wompi y decidir: reintentar la guía desde el pedido (saldrá ` +
        `prepagada) o reembolsar.`,
    );
    return {
      status: "shipment_failed",
      reason:
        "Pago Wompi tardío sobre orden sin txId registrado — flagueada para reconciliación; guía NO creada",
    };
  }

  return null;
}

async function handleInternalCarrierShipment(
  order: PaidSagaOrder,
): Promise<ProcessPaidOrderResult> {
  const trackingNumber =
    order.shippingCarrier === "b2b-manual" ? `B2B-${order.number}` : `INTERNO-${order.number}`;
  const internalClaim = await prisma.order.updateMany({
    where: { id: order.id, trackingNumber: null },
    data: { trackingNumber, shipmentClaimedAt: new Date() },
  });
  if (internalClaim.count !== 1) {
    const fresh = await prisma.order.findUnique({
      where: { id: order.id },
      select: { trackingNumber: true },
    });
    return {
      status: "already_processed",
      trackingNumber: fresh?.trackingNumber ?? undefined,
    };
  }
  try {
    await transitionOrder(order.id, "FULFILLING");
  } catch (err) {
    logger.error({
      event: "order.saga.paid.internal_delivery_transition_failed",
      orderId: order.id,
      orderNumber: order.number,
      err: errorMessageOf(err),
    });
  }
  logger.info({
    event: "order.saga.paid.internal_delivery_marked",
    orderId: order.id,
    orderNumber: order.number,
    trackingNumber,
  });
  return { status: "ok", trackingNumber };
}

type PreparedShipmentItems = {
  items: Array<{
    productSlug: string;
    qty: number;
    weightGrams: number;
    widthCm: number;
    heightCm: number;
    depthCm: number;
    declaredValueCop: number;
  }>;
  missingDims: string[];
};

function buildExternalShipmentItems(order: PaidSagaOrder): PreparedShipmentItems {
  const items: PreparedShipmentItems["items"] = [];
  const missingDims: string[] = [];
  for (const it of order.items) {
    const dims = getEffectiveShippingDims(it.variant.product.physicalSpecs, it.variant.attributes);
    if (!dims) {
      missingDims.push(`${it.variant.product.slug}(${it.variant.id})`);
      continue;
    }
    const inventoryUnits = inventoryUnitsForOrderItem(it);
    items.push({
      productSlug: it.variant.product.slug,
      qty: inventoryUnits,
      weightGrams: dims.weightGrams,
      widthCm: dims.widthCm,
      heightCm: dims.heightCm,
      depthCm: dims.depthCm,
      declaredValueCop: declaredValueCopPerInventoryUnit({
        unitPriceCop: it.unitPrice,
        qty: it.qty,
        inventoryUnits,
      }),
    });
  }
  return { items, missingDims };
}

async function handleCreateShipmentError(
  order: PaidSagaOrder,
  ship: ShippingAddressInput,
  err: unknown,
): Promise<ProcessPaidOrderResult> {
  logger.error({
    event: "order.saga.paid.shipment_failed",
    orderId: order.id,
    orderNumber: order.number,
    err: errorMessageOf(err),
  });
  const isTimeout =
    err instanceof FetchTimeoutError || (err instanceof Error && err.name === "TimeoutError");
  await prisma.order
    .updateMany({
      where: { id: order.id },
      data: {
        shipmentLastError: buildShipmentLastError({
          err,
          carrier: order.shippingCarrier ?? null,
          destination: { city: ship.city, department: ship.department },
          timeout: isTimeout,
        }),
      },
    })
    .catch(() => null);

  if (isTimeout) {
    await markNeedsReconciliation(
      order.id,
      `Timeout (>20s) generando la guía Aveonline (pedido ${order.number}). La guía PUDO crearse ` +
        `en Aveonline; verifica en su panel por la referencia del pedido ANTES de reintentar: si ` +
        `existe, copia el tracking manualmente; si no existe, reintenta la guía desde el pedido.`,
    );
    return {
      status: "shipment_failed",
      reason: "Timeout generando guía — requiere verificación manual antes de reintentar",
    };
  }

  await prisma.order
    .updateMany({
      where: { id: order.id, trackingNumber: null },
      data: { shipmentClaimedAt: null },
    })
    .catch(() => null);
  return {
    status: "shipment_failed",
    reason: err instanceof Error ? err.message : "Error creando guía",
  };
}

async function persistShipmentAndTransition(
  order: PaidSagaOrder,
  shipmentResult: {
    trackingNumber: string;
    trackingUrl: string;
    labelUrl: string;
    carrier: string;
    labelPdfBase64?: string | null;
  },
): Promise<ProcessPaidOrderResult> {
  try {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        trackingNumber: shipmentResult.trackingNumber,
        trackingUrl: shipmentResult.trackingUrl,
        labelUrl: shipmentResult.labelUrl,
        shippingCarrier: shipmentResult.carrier,
        shipmentLastError: Prisma.DbNull,
      },
    });
  } catch (err) {
    logger.error({
      event: "order.saga.paid.tracking_persist_failed",
      orderId: order.id,
      orderNumber: order.number,
      trackingNumber: shipmentResult.trackingNumber,
      err: errorMessageOf(err),
    });
    await prisma.order
      .update({
        where: { id: order.id },
        data: {
          needsReconciliation: true,
          reconciliationReason:
            `Guía Aveonline creada (tracking ${shipmentResult.trackingNumber}, ` +
            `carrier ${shipmentResult.carrier}) pero no se pudo guardar en la DB. ` +
            `Asocia el tracking manualmente desde el detalle del pedido.`,
        },
      })
      .catch(() => null);
    return {
      status: "transition_failed",
      reason: "Guía creada en Aveonline pero no se pudo guardar tracking en DB (reconciliar)",
    };
  }

  try {
    const labelPath = await archiveShipmentLabel({
      orderId: order.id,
      labelUrl: shipmentResult.labelUrl,
      trackingUrl: shipmentResult.trackingUrl,
      labelPdfBase64: shipmentResult.labelPdfBase64,
    });
    if (labelPath) {
      await prisma.order.update({ where: { id: order.id }, data: { labelPath } });
    }
  } catch (err) {
    logger.warn({
      event: "order.saga.paid.label_archive_unexpected",
      orderId: order.id,
      orderNumber: order.number,
      err: errorMessageOf(err),
    });
  }

  try {
    await transitionOrder(order.id, "FULFILLING");
    logger.info({
      event: "order.saga.paid.shipment_created",
      orderId: order.id,
      orderNumber: order.number,
      trackingNumber: shipmentResult.trackingNumber,
      carrier: shipmentResult.carrier,
    });
  } catch (err) {
    logger.error({
      event: "order.saga.paid.transition_to_fulfilling_failed",
      orderId: order.id,
      orderNumber: order.number,
      err: errorMessageOf(err),
    });
  }
  return {
    status: "ok",
    trackingNumber: shipmentResult.trackingNumber,
  };
}

async function claimExternalShipmentSlot(
  order: PaidSagaOrder,
): Promise<ProcessPaidOrderResult | null> {
  const staleCutoff = new Date(Date.now() - STALE_CLAIM_MS);
  const claim = await prisma.order.updateMany({
    where: {
      id: order.id,
      trackingNumber: null,
      OR: [
        { shipmentClaimedAt: null },
        { AND: [{ shipmentClaimedAt: { lt: staleCutoff } }, { needsReconciliation: false }] },
      ],
    },
    data: { shipmentClaimedAt: new Date() },
  });
  if (claim.count === 1) return null;

  const fresh = await prisma.order.findUnique({
    where: { id: order.id },
    select: { trackingNumber: true },
  });
  logger.info({
    event: "order.saga.paid.shipment_claim_skipped",
    orderId: order.id,
    orderNumber: order.number,
    winnerTracking: fresh?.trackingNumber ?? null,
  });
  return {
    status: "already_processed",
    trackingNumber: fresh?.trackingNumber ?? undefined,
  };
}

async function dispatchExternalCarrierShipment(
  order: PaidSagaOrder,
  items: PreparedShipmentItems["items"],
): Promise<ProcessPaidOrderResult> {
  const [pickupCity, pickupDept, pickupAddress, pickupPhone, pickupContact] = await Promise.all([
    getSettingValue("PICKUP_CITY", ""),
    getSettingValue("PICKUP_DEPARTMENT", ""),
    getSettingValue("PICKUP_ADDRESS", ""),
    getSettingValue("PICKUP_PHONE", ""),
    getSettingValue("PICKUP_CONTACT_NAME", ""),
  ]);

  const skippedResult = await claimExternalShipmentSlot(order);
  if (skippedResult) return skippedResult;

  const ship = order.shippingAddress as unknown as ShippingAddressInput;
  const recipient = resolveShipmentRecipient(order, ship);
  const isCod = order.paymentMethod === "COD" && !order.wompiTransactionId;

  try {
    const provider = await getShippingProvider();
    const shipmentResult = await provider.createShipment({
      carrier: order.shippingCarrier ?? "envia",
      quoteId: undefined,
      pickup: {
        city: pickupCity,
        department: pickupDept,
        address: pickupAddress,
        phone: pickupPhone,
        contactName: pickupContact,
      },
      delivery: {
        city: ship.city,
        department: ship.department,
        address: [ship.addressLine1, ship.addressLine2].filter(Boolean).join(" "),
        zip: ship.zip,
        phone: recipient.phone,
        contactName: recipient.contactName,
        documentNumber: ship.documentNumber,
        email: ship.email,
        neighborhood: ship.neighborhood,
        notes: ship.notes,
      },
      items,
      contraentrega: isCod,
      valorRecaudoCop: isCod ? order.total : undefined,
      orderId: order.id,
    });
    return persistShipmentAndTransition(order, shipmentResult);
  } catch (err) {
    return handleCreateShipmentError(order, ship, err);
  }
}

/**
 * Procesa una Order que acaba de ser confirmada como pagada.
 */
export async function processPaidOrder(
  input: ProcessPaidOrderInput,
): Promise<ProcessPaidOrderResult> {
  const order = await loadOrderForPaidSaga(input.orderId);
  if (!order) {
    logger.error({ event: "order.saga.paid.not_found", orderId: input.orderId });
    return { status: "transition_failed", reason: "Order no encontrada" };
  }

  if (order.trackingNumber) {
    return handleAlreadyTrackedPaidOrder(order, input.wompiTransactionId);
  }

  const earlyResult = await ensureOrderPaidBeforeShipment(order, input.wompiTransactionId);
  if (earlyResult) return earlyResult;

  await sendOrderConfirmationOnce(order.id);
  await notifyNewOrderToAdmin(order.id);

  if (!order.b2bProposalId) {
    await issueReferralRewardsIfFirstPaidOrder(order.id);
    await awardLoyaltyPointsForPaidOrder(order.id);
  }

  if (order.shippingCarrier === LUCAMS_CARRIER || order.shippingCarrier === "b2b-manual") {
    return handleInternalCarrierShipment(order);
  }

  const { items, missingDims } = buildExternalShipmentItems(order);
  if (missingDims.length > 0) {
    logger.error({
      event: "order.saga.paid.missing_dims",
      orderId: order.id,
      orderNumber: order.number,
      missingVariants: missingDims,
    });
    await markNeedsReconciliation(
      order.id,
      `Variantes sin peso/dimensiones: ${missingDims.join(", ")}. El pago se confirmó pero no se puede ` +
        `generar la guía — configurar las dims en /admin/productos y reintentar la guía desde el pedido.`,
    );
    return {
      status: "shipment_failed",
      reason: `Variantes sin peso/dimensiones: ${missingDims.join(", ")}. Configurar en /admin/productos.`,
    };
  }

  return dispatchExternalCarrierShipment(order, items);
}

function canonicalTrackingNumber(raw: string): string {
  const trimmed = raw.trim();
  const stripped = trimmed.replace(/^0+(?=\d)/, "");
  return stripped || trimmed;
}

async function findOrderByTrackingNumber(trackingNumber: string) {
  const select = {
    id: true,
    number: true,
    status: true,
    trackingNumber: true,
    shipmentClaimedAt: true,
    needsReconciliation: true,
    reconciliationReason: true,
    reconciledAt: true,
  } as const;
  const exact = await prisma.order.findFirst({
    where: { trackingNumber, deletedAt: null },
    select,
  });
  if (exact) return exact;

  const canonical = canonicalTrackingNumber(trackingNumber);
  const candidates = await prisma.order.findMany({
    where: { deletedAt: null, trackingNumber: { endsWith: canonical } },
    select,
    take: 5,
  });
  const match = candidates.find(
    (c) => c.trackingNumber && canonicalTrackingNumber(c.trackingNumber) === canonical,
  );
  return match ?? null;
}

type TrackingMatchedOrder = NonNullable<Awaited<ReturnType<typeof findOrderByTrackingNumber>>>;

export type TrackingUpdateResult = {
  status: "ok" | "no_match" | "noop";
  orderId?: string;
  orderNumber?: string;
  orderTrackingNumber?: string;
  shipmentClaimedAt?: Date | null;
  transitionedTo?: string;
};

async function notifyTrackingNoMatch(input: {
  trackingNumber: string;
  status: string;
  carrierStatusRaw: string;
}): Promise<TrackingUpdateResult> {
  logger.warn({
    event: "order.saga.tracking.no_match",
    trackingNumber: input.trackingNumber,
  });
  await notify({
    type: "ALERT",
    severity: "warning",
    title: "Tracking de Aveonline sin orden asociada",
    detail:
      `Llegó un evento de tracking para la guía ${input.trackingNumber} ` +
      `(${input.carrierStatusRaw || input.status}) pero ninguna orden la tiene registrada. ` +
      `Si la guía existe en el panel Aveonline, asóciala manualmente al pedido.`,
    actionUrl: "/admin/pedidos",
    actionLabel: "Revisar pedidos",
    dedupKey: `tracking-no-match:${input.trackingNumber}:${input.status}`,
  }).catch((err) =>
    logger.warn({
      event: "order.saga.tracking.no_match_notify_fail",
      trackingNumber: input.trackingNumber,
      err: errorMessageOf(err),
    }),
  );
  return { status: "no_match" };
}

async function promotePaidOrderWithGuide(orderId: string, currentStatus: string): Promise<string> {
  if (currentStatus !== "PAID") return currentStatus;
  try {
    await transitionOrder(orderId, "FULFILLING");
    return "FULFILLING";
  } catch {
    // Si otro proceso avanzó el estado concurrentemente, conservamos currentStatus.
    return currentStatus;
  }
}

async function clearLogisticsReconciliationOnDelivery(order: TrackingMatchedOrder): Promise<void> {
  if (!order.needsReconciliation) return;
  if (!LOGISTICS_RECONCILIATION_REASON_RE.test(order.reconciliationReason ?? "")) return;
  await prisma.order
    .updateMany({
      where: { id: order.id, needsReconciliation: true },
      data: {
        needsReconciliation: false,
        reconciliationNote:
          "Cerrada automáticamente al confirmarse la entrega por la transportadora.",
        reconciledAt: new Date(),
      },
    })
    .catch(() => null);
}

async function handleDeliveredTrackingUpdate(
  order: TrackingMatchedOrder,
  currentStatus: string,
  carrierStatusRaw: string,
): Promise<string | null> {
  if (currentStatus === "FULFILLING") {
    await transitionOrder(order.id, "SHIPPED").catch(() => null);
  }
  if (currentStatus !== "SHIPPED" && currentStatus !== "FULFILLING") {
    return null;
  }
  try {
    await transitionOrder(order.id, "DELIVERED");
    await clearLogisticsReconciliationOnDelivery(order);
    await sendOrderDelivered(order.id);
    return "DELIVERED";
  } catch (err) {
    logger.warn({
      event: "order.saga.tracking.transition_fail",
      orderNumber: order.number,
      to: "DELIVERED",
      err: errorMessageOf(err),
    });
    await markNeedsReconciliation(
      order.id,
      `Webhook Aveonline: no se pudo transicionar a DELIVERED (${carrierStatusRaw}) — ` +
        `revisar y marcar la entrega manualmente desde el pedido.`,
    );
    return null;
  }
}

async function handleInTransitTrackingUpdate(
  order: TrackingMatchedOrder,
  currentStatus: string,
  carrierStatusRaw: string,
): Promise<string | null> {
  if (currentStatus !== "FULFILLING") return null;
  try {
    await transitionOrder(order.id, "SHIPPED");
    await sendOrderShipped(order.id);
    return "SHIPPED";
  } catch (err) {
    logger.warn({
      event: "order.saga.tracking.transition_fail",
      orderNumber: order.number,
      to: "SHIPPED",
      err: errorMessageOf(err),
    });
    await markNeedsReconciliation(
      order.id,
      `Webhook Aveonline: no se pudo transicionar a SHIPPED (${carrierStatusRaw}) — ` +
        `revisar y avanzar el pedido manualmente.`,
    );
    return null;
  }
}

async function handleReturnedTrackingUpdate(
  order: TrackingMatchedOrder,
  input: {
    carrierStatusRaw: string;
    carrierDescription?: string;
    carrierClarification?: string;
  },
): Promise<void> {
  const alreadyReconciledReturn = Boolean(
    !order.needsReconciliation &&
    order.reconciledAt &&
    /DEVUELTO/i.test(order.reconciliationReason ?? ""),
  );
  if (!order.needsReconciliation && !alreadyReconciledReturn) {
    const actionSuffix = order.status === "DELIVERED" ? " y reembolso" : " / reenvío";
    await markNeedsReconciliation(
      order.id,
      `Envío DEVUELTO (${input.carrierStatusRaw}) — revisar stock${actionSuffix}`,
    );
  }
  await notifyOrderReturned({
    orderId: order.id,
    carrierStatusRaw: input.carrierStatusRaw,
    carrierDescription: input.carrierDescription,
    carrierClarification: input.carrierClarification,
  });
  logger.warn({
    event: "order.saga.tracking.returned",
    orderNumber: order.number,
    carrierRaw: input.carrierStatusRaw,
  });
}

async function handleExceptionTrackingUpdate(
  order: TrackingMatchedOrder,
  input: {
    carrierStatusRaw: string;
    carrierDescription?: string;
    carrierClarification?: string;
    occurredAt?: Date;
  },
): Promise<void> {
  const voidedGuide = isVoidedGuideStatus(input.carrierStatusRaw);
  const alreadyReconciledVoided = Boolean(
    !order.needsReconciliation &&
    order.reconciledAt &&
    /Guía anulada/i.test(order.reconciliationReason ?? ""),
  );
  if (voidedGuide && !order.needsReconciliation && !alreadyReconciledVoided) {
    await markNeedsReconciliation(
      order.id,
      `Guía anulada por la transportadora (${input.carrierStatusRaw}) — generar nueva guía o revisar despacho`,
    );
  }
  await notifyOrderShippingException({
    orderId: order.id,
    carrierStatusRaw: input.carrierStatusRaw,
    carrierDescription: input.carrierDescription,
    carrierClarification: input.carrierClarification,
    occurredAt: input.occurredAt,
    isVoidedGuide: voidedGuide,
  });
  logger.warn({
    event: "order.saga.tracking.exception",
    orderNumber: order.number,
    carrierRaw: input.carrierStatusRaw,
    voidedGuide,
  });
}

export async function processTrackingUpdate(input: {
  trackingNumber: string;
  status: "PENDING" | "DISPATCHED" | "IN_TRANSIT" | "DELIVERED" | "RETURNED" | "EXCEPTION";
  carrierStatusRaw: string;
  carrierDescription?: string;
  carrierClarification?: string;
  occurredAt?: Date;
}): Promise<TrackingUpdateResult> {
  const order = await findOrderByTrackingNumber(input.trackingNumber);
  if (!order) {
    return notifyTrackingNoMatch(input);
  }

  logger.info({
    event: "order.saga.tracking.received",
    orderNumber: order.number,
    currentStatus: order.status,
    incoming: input.status,
    carrierRaw: input.carrierStatusRaw,
  });

  const baseOrderMeta = {
    orderId: order.id,
    orderNumber: order.number,
    orderTrackingNumber: order.trackingNumber ?? input.trackingNumber,
    shipmentClaimedAt: order.shipmentClaimedAt,
  };

  const currentStatus = await promotePaidOrderWithGuide(order.id, order.status);

  if (input.status === "DELIVERED") {
    const transitionedTo = await handleDeliveredTrackingUpdate(
      order,
      currentStatus,
      input.carrierStatusRaw,
    );
    if (transitionedTo) return { status: "ok", ...baseOrderMeta, transitionedTo };
    return { status: "noop", ...baseOrderMeta };
  }

  if (input.status === "IN_TRANSIT" || input.status === "DISPATCHED") {
    const transitionedTo = await handleInTransitTrackingUpdate(
      order,
      currentStatus,
      input.carrierStatusRaw,
    );
    if (transitionedTo) return { status: "ok", ...baseOrderMeta, transitionedTo };
    return { status: "noop", ...baseOrderMeta };
  }

  if (input.status === "RETURNED") {
    await handleReturnedTrackingUpdate(order, input);
  } else if (input.status === "EXCEPTION") {
    await handleExceptionTrackingUpdate(order, input);
  }

  return { status: "noop", ...baseOrderMeta };
}

function isCapturedOrderStatus(status: string): boolean {
  return (
    status === "PAID" || status === "DELIVERED" || status === "FULFILLING" || status === "SHIPPED"
  );
}

async function notifyFailedPaymentTransition(
  orderId: string,
  fromStatus: string,
  target: "REFUNDED" | "CANCELLED",
  reason: string,
): Promise<void> {
  if (target === "REFUNDED") {
    await sendOrderRefunded(orderId);
    return;
  }
  if (fromStatus === "FULFILLING" || fromStatus === "SHIPPED") {
    await sendOrderCancelled(orderId, reason);
    return;
  }
  await sendOrderPaymentFailed(orderId, reason);
}

function resolveFailedPaymentTarget(
  orderId: string,
  current: { status: string; wompiTransactionId: string | null },
  incomingTxId: string | undefined,
): "REFUNDED" | "CANCELLED" | null {
  if (current.status === "CANCELLED" || current.status === "REFUNDED") {
    logger.info({
      event: "order.saga.payment_failed.already_terminal",
      orderId,
      status: current.status,
    });
    return null;
  }

  if (isCapturedOrderStatus(current.status)) {
    const sameTx = Boolean(incomingTxId) && incomingTxId === current.wompiTransactionId;
    if (!sameTx) {
      logger.warn({
        event: "order.saga.payment_failed.foreign_or_stale_tx_ignored",
        orderId,
        status: current.status,
        eventTx: incomingTxId ?? null,
        orderTx: current.wompiTransactionId ?? null,
      });
      return null;
    }
  }

  return current.status === "PAID" || current.status === "DELIVERED" ? "REFUNDED" : "CANCELLED";
}

async function attemptFailedPaymentTransition(
  input: { orderId: string; wompiTransactionId?: string; reason: string },
  attempt: number,
  maxAttempts: number,
): Promise<"done" | "retry"> {
  const current = await prisma.order.findFirst({
    where: { id: input.orderId, deletedAt: null },
    select: { status: true, number: true, wompiTransactionId: true },
  });
  if (!current) {
    logger.warn({ event: "order.saga.payment_failed.not_found", orderId: input.orderId });
    return "done";
  }

  const target = resolveFailedPaymentTarget(input.orderId, current, input.wompiTransactionId);
  if (!target) return "done";

  try {
    await transitionOrder(input.orderId, target, {
      extra: input.wompiTransactionId
        ? { wompiTransactionId: input.wompiTransactionId }
        : undefined,
    });
    logger.info({
      event: "order.saga.payment_failed.transitioned",
      orderId: input.orderId,
      from: current.status,
      to: target,
      reason: input.reason,
    });
    await notifyFailedPaymentTransition(input.orderId, current.status, target, input.reason);
    return "done";
  } catch (err) {
    if (err instanceof OrderTransitionError && attempt < maxAttempts) {
      logger.warn({
        event: "order.saga.payment_failed.toctou_retry",
        orderId: input.orderId,
        attemptedFrom: current.status,
        attemptedTo: target,
        actualErr: `${err.from}→${err.to}`,
        attempt,
      });
      return "retry";
    }
    logger.warn({
      event: "order.saga.payment_failed.transition_skipped",
      orderId: input.orderId,
      from: current.status,
      to: target,
      err: errorMessageOf(err),
    });
    return "done";
  }
}

/**
 * Procesa transaction DECLINED/VOIDED/ERROR del webhook Wompi.
 */
export async function processFailedPaymentOrder(input: {
  orderId: string;
  wompiTransactionId?: string;
  reason: string;
}): Promise<void> {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const outcome = await attemptFailedPaymentTransition(input, attempt, MAX_ATTEMPTS);
    if (outcome === "done") return;
  }
}

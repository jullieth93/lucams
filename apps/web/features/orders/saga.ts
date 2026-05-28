/*
 * Saga post-PAID — orquesta lo que sucede cuando una Order pasa de
 * PENDING_PAYMENT a PAID (típicamente disparado por el webhook Wompi):
 *
 *   1. transitionOrder(orderId, "PAID") + guardar wompiTransactionId.
 *   2. Intentar createShipment con el provider activo (Aveonline).
 *      - Si OK: guardar trackingNumber/labelUrl/trackingUrl + transitionOrder
 *        a FULFILLING (lista para imprimir/despachar).
 *      - Si falla: Order queda en PAID; admin puede reintentar manualmente
 *        desde /admin/pedidos/[id]. No revertimos a PENDING_PAYMENT.
 *   3. (Futuro P1.5) disparar email order-confirmation al cliente.
 *
 * Idempotente: si la Order ya tiene trackingNumber, no re-llama Aveonline.
 * Si ya está PAID y la transición a PAID se invoca de nuevo, transitionOrder
 * la trata como no-op (mismo estado).
 *
 * Lanza errores sólo para fallas técnicas inesperadas — el caller (webhook)
 * decide si retornar 200 (ack a Wompi) o 500 (forzar reintento).
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getShippingProvider } from "@/features/shipping/provider";
import { getEffectiveShippingDims } from "@/features/products/shipping-schemas";
import { getSettingValue } from "@/lib/cms";
import { transitionOrder, OrderTransitionError } from "./service";
import type { ShippingAddressInput } from "./schemas";
import {
  sendOrderConfirmation,
  sendOrderShipped,
  sendOrderDelivered,
  sendOrderPaymentFailed,
} from "./emails";

/**
 * 2026-05-22 — actualizado: descubrimos que la cuenta demo `demointegracion`
 * SÍ permite generar guías cuando el payload incluye `idagente` válido
 * (la cuenta demo tiene agente id=20362). El error "No se puede generar la guia"
 * que veíamos antes era por faltar idagente, NO por restricción de la cuenta.
 *
 * Por eso el código de la saga ahora SIEMPRE llama Aveonline (no genera tracking
 * simulado interno). El switch AVEONLINE_ENV=test|production solo determina
 * qué credenciales usa (demo vs reales). AVEONLINE_GENERATE_REAL=true|false
 * controla si la guía se factura (default false = simulación sin factura,
 * pero devuelve numguia + PDF para validar UI end-to-end).
 */

export type ProcessPaidOrderInput = {
  orderId: string;
  wompiTransactionId?: string;
};

export type ProcessPaidOrderResult = {
  status: "ok" | "already_processed" | "shipment_failed" | "transition_failed";
  trackingNumber?: string;
  reason?: string;
};

/**
 * Procesa una Order que acaba de ser confirmada como pagada.
 * Llamado desde /api/webhooks/wompi cuando recibe transaction.updated APPROVED.
 */
export async function processPaidOrder(
  input: ProcessPaidOrderInput,
): Promise<ProcessPaidOrderResult> {
  // 1) Cargar Order + items con dims para createShipment.
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, deletedAt: null },
    include: {
      items: {
        include: {
          variant: {
            select: {
              id: true,
              sku: true,
              attributes: true,
              product: {
                select: { slug: true, name: true, physicalSpecs: true },
              },
            },
          },
        },
      },
    },
  });
  if (!order) {
    logger.error({ event: "order.saga.paid.not_found", orderId: input.orderId });
    return { status: "transition_failed", reason: "Order no encontrada" };
  }

  // 2) Si ya tiene tracking, fue procesada — idempotente.
  if (order.trackingNumber) {
    logger.info({
      event: "order.saga.paid.already_processed",
      orderId: order.id,
      orderNumber: order.number,
      trackingNumber: order.trackingNumber,
    });
    return {
      status: "already_processed",
      trackingNumber: order.trackingNumber,
    };
  }

  // 3) Transicionar PENDING_PAYMENT → PAID (si no estaba ya).
  if (order.status === "PENDING_PAYMENT") {
    try {
      await transitionOrder(order.id, "PAID", {
        extra: input.wompiTransactionId
          ? { wompiTransactionId: input.wompiTransactionId }
          : undefined,
      });
      logger.info({
        event: "order.saga.paid.transitioned",
        orderId: order.id,
        orderNumber: order.number,
        wompiTransactionId: input.wompiTransactionId ?? null,
      });
      // Email order-confirmation (fire-and-forget — emails.ts atrapa errores).
      await sendOrderConfirmation(order.id);
    } catch (err) {
      if (err instanceof OrderTransitionError) {
        logger.warn({
          event: "order.saga.paid.transition_skipped",
          orderId: order.id,
          from: err.from,
          to: err.to,
        });
        // No abortamos — la Order puede ya estar en PAID/FULFILLING por
        // un webhook duplicado de Wompi. Seguimos al createShipment.
      } else {
        throw err;
      }
    }
  } else if (order.status !== "PAID" && order.status !== "FULFILLING") {
    logger.warn({
      event: "order.saga.paid.invalid_starting_status",
      orderId: order.id,
      status: order.status,
    });
    return {
      status: "transition_failed",
      reason: `Order en estado ${order.status}, no PENDING_PAYMENT`,
    };
  }

  // 4) Construir items para Aveonline desde OrderItem con dims efectivos.
  //    Si algún variant carece de dims (caso edge, legacy data), retornamos
  //    shipment_failed con detalle — admin reconcilia desde /admin/pedidos/[id].
  const items: Array<{
    productSlug: string;
    qty: number;
    weightGrams: number;
    widthCm: number;
    heightCm: number;
    depthCm: number;
    declaredValueCop: number;
  }> = [];
  const missingDims: string[] = [];
  for (const it of order.items) {
    const dims = getEffectiveShippingDims(it.variant.product.physicalSpecs, it.variant.attributes);
    if (!dims) {
      missingDims.push(`${it.variant.product.slug}(${it.variant.id})`);
      continue;
    }
    items.push({
      productSlug: it.variant.product.slug,
      qty: it.qty,
      weightGrams: dims.weightGrams,
      widthCm: dims.widthCm,
      heightCm: dims.heightCm,
      depthCm: dims.depthCm,
      declaredValueCop: it.unitPrice,
    });
  }
  if (missingDims.length > 0) {
    logger.error({
      event: "order.saga.paid.missing_dims",
      orderId: order.id,
      orderNumber: order.number,
      missingVariants: missingDims,
    });
    return {
      status: "shipment_failed",
      reason: `Variantes sin peso/dimensiones: ${missingDims.join(", ")}. Configurar en /admin/productos.`,
    };
  }

  // 5) Pickup desde SiteSettings (ya configurados por Lucy).
  const [pickupCity, pickupDept, pickupAddress, pickupPhone, pickupContact] = await Promise.all([
    getSettingValue("PICKUP_CITY", ""),
    getSettingValue("PICKUP_DEPARTMENT", ""),
    getSettingValue("PICKUP_ADDRESS", ""),
    getSettingValue("PICKUP_PHONE", ""),
    getSettingValue("PICKUP_CONTACT_NAME", ""),
  ]);

  // 6) Delivery desde Order.shippingAddress (snapshot del checkout).
  const ship = order.shippingAddress as unknown as ShippingAddressInput;

  // 7) Llamar provider.createShipment. Siempre real ahora — el provider
  //    Aveonline maneja credenciales según AVEONLINE_ENV y flag de facturación
  //    según AVEONLINE_GENERATE_REAL. Default seguro: simulación documentada
  //    de Aveonline (devuelve numguia + PDF pero no factura).
  let shipmentResult: {
    trackingNumber: string;
    trackingUrl: string;
    labelUrl: string;
    carrier: string;
  };
  try {
    const provider = await getShippingProvider();
    shipmentResult = await provider.createShipment({
      carrier: order.shippingCarrier ?? "envia",
      // quoteId no se persiste en Order — provider resuelve idtransportador
      // por carrier name via resolveCarrierId (cacheado 24h).
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
        phone: ship.phone,
        contactName: ship.fullName,
        documentNumber: ship.documentNumber,
        email: ship.email,
      },
      items,
      contraentrega: false, // F2.1: COD no implementado todavía
      orderId: order.id,
    });
  } catch (err) {
    logger.error({
      event: "order.saga.paid.shipment_failed",
      orderId: order.id,
      orderNumber: order.number,
      err: err instanceof Error ? err.message : String(err),
    });
    return {
      status: "shipment_failed",
      reason: err instanceof Error ? err.message : "Error creando guía",
    };
  }

  // 8) Guardar tracking + transicionar a FULFILLING.
  try {
    await transitionOrder(order.id, "FULFILLING", {
      extra: {
        trackingNumber: shipmentResult.trackingNumber,
        trackingUrl: shipmentResult.trackingUrl,
        labelUrl: shipmentResult.labelUrl,
        shippingCarrier: shipmentResult.carrier,
      },
    });
    logger.info({
      event: "order.saga.paid.shipment_created",
      orderId: order.id,
      orderNumber: order.number,
      trackingNumber: shipmentResult.trackingNumber,
      carrier: shipmentResult.carrier,
    });
    return {
      status: "ok",
      trackingNumber: shipmentResult.trackingNumber,
    };
  } catch (err) {
    logger.error({
      event: "order.saga.paid.transition_to_fulfilling_failed",
      orderId: order.id,
      orderNumber: order.number,
      err: err instanceof Error ? err.message : String(err),
    });
    // Tracking ya está guardado en la guía Aveonline pero no en nuestra DB.
    // Admin debe reconciliar.
    return {
      status: "transition_failed",
      reason: "Guía creada pero no se pudo guardar tracking en DB",
    };
  }
}

/**
 * Procesa actualización de tracking desde webhook Aveonline.
 * Aveonline envía estados normalizados (`ENTREGADA`, `EN TRANSITO`, etc.) +
 * el carrier original que viene en la guía. Mapeamos a transiciones de Order.
 *
 * Reglas:
 *   - `IN_TRANSIT` / `DISPATCHED` desde FULFILLING → SHIPPED
 *   - `DELIVERED` desde SHIPPED → DELIVERED
 *   - `DELIVERED` desde FULFILLING → SHIPPED + DELIVERED (skip intermedio)
 *   - `RETURNED` / `EXCEPTION` → log warn (no transición automática; admin
 *     decide CANCEL/REFUND manualmente)
 *   - Estados no mapeables → no-op + log
 */
export async function processTrackingUpdate(input: {
  trackingNumber: string;
  status: "PENDING" | "DISPATCHED" | "IN_TRANSIT" | "DELIVERED" | "RETURNED" | "EXCEPTION";
  carrierStatusRaw: string;
}): Promise<{ status: "ok" | "no_match" | "noop"; orderNumber?: string; transitionedTo?: string }> {
  const order = await prisma.order.findFirst({
    where: { trackingNumber: input.trackingNumber, deletedAt: null },
    select: { id: true, number: true, status: true },
  });
  if (!order) {
    logger.warn({
      event: "order.saga.tracking.no_match",
      trackingNumber: input.trackingNumber,
    });
    return { status: "no_match" };
  }

  logger.info({
    event: "order.saga.tracking.received",
    orderNumber: order.number,
    currentStatus: order.status,
    incoming: input.status,
    carrierRaw: input.carrierStatusRaw,
  });

  // Mapeo estados Aveonline → transiciones Order.
  if (input.status === "DELIVERED") {
    if (order.status === "FULFILLING") {
      await transitionOrder(order.id, "SHIPPED").catch(() => null);
    }
    if (order.status === "SHIPPED" || order.status === "FULFILLING") {
      try {
        await transitionOrder(order.id, "DELIVERED");
        await sendOrderDelivered(order.id);
        return { status: "ok", orderNumber: order.number, transitionedTo: "DELIVERED" };
      } catch (err) {
        logger.warn({
          event: "order.saga.tracking.transition_fail",
          orderNumber: order.number,
          to: "DELIVERED",
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } else if (
    (input.status === "IN_TRANSIT" || input.status === "DISPATCHED") &&
    order.status === "FULFILLING"
  ) {
    try {
      await transitionOrder(order.id, "SHIPPED");
      await sendOrderShipped(order.id);
      return { status: "ok", orderNumber: order.number, transitionedTo: "SHIPPED" };
    } catch (err) {
      logger.warn({
        event: "order.saga.tracking.transition_fail",
        orderNumber: order.number,
        to: "SHIPPED",
        err: err instanceof Error ? err.message : String(err),
      });
    }
  } else if (input.status === "RETURNED" || input.status === "EXCEPTION") {
    logger.warn({
      event: "order.saga.tracking.needs_attention",
      orderNumber: order.number,
      incoming: input.status,
      carrierRaw: input.carrierStatusRaw,
    });
  }

  return { status: "noop", orderNumber: order.number };
}

/**
 * Procesa transaction DECLINED/VOIDED/ERROR del webhook Wompi → cancela Order.
 */
export async function processFailedPaymentOrder(input: {
  orderId: string;
  wompiTransactionId?: string;
  reason: string;
}): Promise<void> {
  try {
    await transitionOrder(input.orderId, "CANCELLED", {
      extra: input.wompiTransactionId
        ? { wompiTransactionId: input.wompiTransactionId }
        : undefined,
    });
    logger.info({
      event: "order.saga.payment_failed.cancelled",
      orderId: input.orderId,
      reason: input.reason,
    });
    // Email "pago rechazado" — fire-and-forget.
    await sendOrderPaymentFailed(input.orderId, input.reason);
  } catch (err) {
    logger.warn({
      event: "order.saga.payment_failed.cancel_skipped",
      orderId: input.orderId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

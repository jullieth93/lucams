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
import { assertTransactionalAllowed } from "@/lib/stage-guard";
import { transitionOrder, clearCartAfterPaid, OrderTransitionError } from "./service";
import { FetchTimeoutError } from "@/lib/fetch-with-timeout";
import { decrementStockForOrder } from "./stock";
import { InsufficientStockError, StockAlreadyAppliedError } from "./errors";
import type { ShippingAddressInput } from "./schemas";
import {
  sendOrderConfirmationOnce,
  notifyNewOrderToAdmin,
  sendOrderShipped,
  sendOrderDelivered,
  sendOrderPaymentFailed,
  sendOrderCancelled,
  sendOrderRefunded,
} from "./emails";
import { issueReferralRewardsIfFirstPaidOrder } from "@/features/referrals/service";
import { isCouponPerCustomerLimitError } from "@/features/coupons/redemption";

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
 * #6 (certificación Bloque A) — Marca una Order como "necesita reconciliación".
 *
 * Caso patológico: Wompi APPROVED pero el stock se agotó entre PENDING_PAYMENT
 * y PAID (carrera real sobre la última unidad). La orden queda PENDING_PAYMENT
 * y SIN este flag moriría en un logger.error que nadie ve (mandato #7: sin
 * Sentry). Persistir el flag la hace VISIBLE en /admin/pedidos para que Lucy
 * la atienda (refund o producir stock).
 *
 * Write SEPARADO e idempotente — corre DESPUÉS de que la $transaction de PAID
 * hizo rollback, sobre la orden que sigue PENDING_PAYMENT. Best-effort: si este
 * update falla, ya quedó el logger.error; no propagamos (no queremos que Wompi
 * reintente en loop por un fallo de marcado).
 *
 * TODO Bloque B: cuando Resend esté verificado, disparar email de alerta a Lucy.
 */
async function markNeedsReconciliation(orderId: string, reason: string): Promise<void> {
  // Write SEPARADO e idempotente, best-effort: si falla, ya quedó el logger del caller; no
  // propagamos (no queremos que Wompi reintente en loop por un fallo de marcado). No pisa un
  // motivo previo si ya estaba marcada (evita perder el contexto de la primera anomalía).
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
      err: flagErr instanceof Error ? flagErr.message : String(flagErr),
    });
  }
}

async function flagOrderNeedsReconciliation(
  orderId: string,
  wompiTransactionId: string | null,
  err: InsufficientStockError,
): Promise<void> {
  const reason =
    `Pago Wompi APROBADO pero stock agotado al confirmar (variant ${err.variantId}, ` +
    `pedía ${err.requested}${err.available !== undefined ? `, había ${err.available}` : ""}). ` +
    `Tx Wompi: ${wompiTransactionId ?? "—"}. Decidir reembolso o producir stock.`;
  await markNeedsReconciliation(orderId, reason);
}

/**
 * Procesa una Order que acaba de ser confirmada como pagada.
 * Llamado desde /api/webhooks/wompi cuando recibe transaction.updated APPROVED.
 */
export async function processPaidOrder(
  input: ProcessPaidOrderInput,
): Promise<ProcessPaidOrderResult> {
  // Backstop de etapa: los 3 caminos que llegan acá (webhook Wompi, fallback /checkout/gracias,
  // retryShipmentAction de admin) NO tienen guard propio. Si la tienda está en modo catálogo la
  // saga no debe correr: generaría una guía REAL facturable en una tienda que no vende
  // (auditoría 2026-08-05 — mismo patrón que finalizeCheckout / createOrderFromCart).
  assertTransactionalAllowed("processPaidOrder");

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
    // H2 (auditoría v3): si llega un pago Wompi APROBADO sobre una orden que YA se confirmó como
    // CONTRAENTREGA (guía con recaudo, sin wompiTransactionId), es un DOBLE COBRO real (paga online
    // y el mensajero cobra en efectivo). No se puede resolver solo: lo marcamos para reconciliación.
    if (input.wompiTransactionId && order.paymentMethod === "COD" && !order.wompiTransactionId) {
      await markNeedsReconciliation(
        order.id,
        `Pago Wompi (tx ${input.wompiTransactionId}) sobre una orden YA confirmada como contraentrega ` +
          `(guía ${order.trackingNumber}). Doble cobro: reembolsar el pago en línea o convertir la guía a prepagada.`,
      );
    }
    // #7 — self-heal: una orden PAID con guía cuya transición a FULFILLING falló en la saga queda
    // atascada (los webhooks de tracking solo avanzan desde FULFILLING → serían noop para siempre,
    // sin SHIPPED/DELIVERED ni deliveredAt, el ancla del retracto). Un reintento del webhook Wompi
    // cae acá: reintentamos la transición atascada. Idempotente (no-op si otro proceso ya avanzó).
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
      trackingNumber: order.trackingNumber,
    };
  }

  // 3) Transicionar PENDING_PAYMENT → PAID (si no estaba ya).
  //    P0-002: la transición + decremento de stock + InventoryLog ocurren
  //    atómicamente en una sola $transaction. Si el stock se agotó entre
  //    PENDING_PAYMENT y este punto (carrera ganada por otro comprador),
  //    InsufficientStockError → rollback → Order queda en PENDING_PAYMENT
  //    con flag para reconciliación manual (Wompi ya cobró pero no hay stock).
  if (order.status === "PENDING_PAYMENT") {
    try {
      await prisma.$transaction(async (tx) => {
        // Decremento atómico de stock + InventoryLog (idempotente).
        await decrementStockForOrder(tx, {
          id: order.id,
          number: order.number,
          items: order.items.map((it) => ({ variantId: it.variantId, qty: it.qty })),
        });
        // Transición de estado dentro de la misma tx.
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: "PAID",
            ...(input.wompiTransactionId ? { wompiTransactionId: input.wompiTransactionId } : {}),
          },
        });
        // F1 — registrar el uso del cupón AL PAGAR (no al crear la orden: una
        // PENDING_PAYMENT puede no pagarse nunca). Atómico con la transición a
        // PAID, y este bloque solo corre en la transición PENDING_PAYMENT→PAID,
        // así que el CouponUsage (orderId @unique) se crea una sola vez y el
        // usedCount denormalizado no se doble-incrementa.
        if (order.couponId && order.discount > 0) {
          // Incremento ATÓMICO gateado: solo si aún hay cupo global. Sin esto, dos
          // órdenes con el mismo cupón pagadas en paralelo leen usedCount=0 al crearse
          // y ambas incrementan → usedCount > maxUses (contador corrupto + límite
          // evadido). El UPDATE condicional (usedCount < maxUses) lo cierra atómicamente.
          const inc = await tx.coupon.updateMany({
            where: {
              id: order.couponId,
              OR: [{ maxUses: null }, { usedCount: { lt: prisma.coupon.fields.maxUses } }],
            },
            data: { usedCount: { increment: 1 } },
          });
          if (inc.count === 1) {
            // Ganamos el cupo → registramos el uso (contador === nº de CouponUsage).
            try {
              await tx.couponUsage.create({
                data: {
                  couponId: order.couponId,
                  customerId: order.customerId,
                  // Email normalizado del pedido: ancla el tope por-cliente también para invitados (#4).
                  email: order.email ? order.email.trim().toLowerCase() : null,
                  orderId: order.id,
                  amount: order.discount,
                },
              });
            } catch (err) {
              // G-5 — el trigger DB `coupon_usage_per_customer_limit` rechazó el insert:
              // esta identidad YA consumió su tope en un checkout pagado en paralelo
              // (el conteo read-then-write dejó pasar ambos). El descuento de ESTA
              // orden ya se cobró → se respeta, no se registra el uso y se marca
              // para reconciliación (mismo criterio que el cupo global agotado).
              // Cualquier otro error sí aborta la tx.
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
                  reconciliationReason: `Tope por cliente del cupón excedido al pagar (checkout concurrente con la misma identidad): se cobró un descuento de ${order.discount} centavos por encima de maxUsesPerCustomer. Revisa y decide.`,
                },
              });
            }
          } else {
            // Cupón agotado entre crear la orden y pagar: no registramos uso (el
            // descuento ya aplicado a ESTA orden se respeta; el contador no se corrompe).
            // (maxUsesPerCustomer quedó enforceado en DB por el trigger G-5 — ver
            // el catch de couponUsage.create arriba.)
            logger.warn({
              event: "order.saga.coupon_exhausted_at_pay",
              orderId: order.id,
              couponId: order.couponId,
            });
            // #5 — el descuento SÍ se otorgó (el total ya se cobró/autorizó) por encima del cupo
            // global. NO re-cobramos (el dinero ya se capturó); marcamos la orden para que Lucy lo
            // VEA y decida. En la MISMA tx (atómico con PAID) — no vía markNeedsReconciliation, que
            // es un write separado. Guard needsReconciliation:false para no pisar un motivo previo.
            await tx.order.updateMany({
              where: { id: order.id, needsReconciliation: false },
              data: {
                needsReconciliation: true,
                reconciliationReason: `Cupón agotado al pagar: se otorgó un descuento de ${order.discount} centavos por encima del cupo global (maxUses). El total ya se cobró/autorizó con el descuento — revisa y decide.`,
              },
            });
          }
        }
        // #9/#16 (post-launch Bloque A) — Vaciar Cart DENTRO de la misma tx.
        // Atómico con el cambio a PAID: imposible que quede PAID con cart activo
        // (ventana de doble-checkout/doble-cobro) o que un blip de DB en el
        // clearCart aborte el resto del flujo (createShipment).
        if (order.cartId) {
          await clearCartAfterPaid(order.cartId, tx);
        }
      });
      logger.info({
        event: "order.saga.paid.transitioned",
        orderId: order.id,
        orderNumber: order.number,
        wompiTransactionId: input.wompiTransactionId ?? null,
      });
    } catch (err) {
      if (err instanceof StockAlreadyAppliedError) {
        // Carrera concurrente benigna: webhook + fallback /gracias procesaron
        // la misma orden a la vez. El ganador ya decrementó stock + transicionó
        // a PAID. Esta tx hizo rollback limpio (sin doble-decremento). Tratamos
        // como idempotente: NO continuamos a createShipment (el ganador lo hace)
        // para evitar doble-guía Aveonline. Re-leemos para devolver el tracking.
        const winner = await prisma.order.findUnique({
          where: { id: order.id },
          select: { trackingNumber: true },
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
      if (err instanceof InsufficientStockError) {
        // Caso patológico: Wompi APPROVED pero stock se agotó (carrera real
        // sobre la última unidad). Order queda en PENDING_PAYMENT. Marcamos
        // needsReconciliation (#6) en un write SEPARADO (fuera de la tx que
        // hizo rollback) para que sea VISIBLE en /admin/pedidos, y disparamos
        // alerta. ACCIÓN HUMANA: admin refunda o produce stock.
        logger.error({
          event: "order.saga.paid.no_stock",
          orderId: order.id,
          orderNumber: order.number,
          wompiTransactionId: input.wompiTransactionId ?? null,
          variantId: err.variantId,
          requested: err.requested,
          available: err.available ?? null,
          reason: "Stock agotado entre PENDING_PAYMENT y PAID — refund manual",
        });
        await flagOrderNeedsReconciliation(order.id, input.wompiTransactionId ?? null, err);
        return {
          status: "shipment_failed",
          reason: `Stock insuficiente al confirmar pago (variant ${err.variantId}). Requiere reconciliación admin.`,
        };
      }
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
    // H2 (auditoría v3): un pago Wompi APROBADO sobre una orden CANCELLED/REFUNDED/terminal es un
    // cobro que capturó dinero sobre una orden que ya no se va a cumplir → invisible sin este flag.
    // Lo hacemos VISIBLE para que Lucy reembolse (antes solo caía en un logger.warn).
    if (input.wompiTransactionId) {
      await markNeedsReconciliation(
        order.id,
        `Pago Wompi (tx ${input.wompiTransactionId}) APROBADO sobre una orden en estado ${order.status} ` +
          `(no PENDING_PAYMENT). El dinero se capturó pero la orden no se cumplirá: reembolsar.`,
      );
    }
    return {
      status: "transition_failed",
      reason: `Order en estado ${order.status}, no PENDING_PAYMENT`,
    };
  }

  // #2 (post-launch Bloque A) — Email de confirmación idempotente Y recuperable.
  // Corre acá (después del bloque PENDING_PAYMENT, antes de la guía) para que:
  //  - first-pass (PENDING_PAYMENT→PAID): se envíe.
  //  - retry de una orden PAID-sin-email (saga crasheó tras commit): se reenvíe
  //    (confirmationSentAt sigue null). No duplica (se marca al enviar + Resend
  //    idempotencyKey). Fire-and-forget: no aborta la creación de guía si falla.
  await sendOrderConfirmationOnce(order.id);

  // Aviso al admin (Lucy 2026-08-11: "¿cómo me entero de un nuevo pedido?"):
  // notificación in-app (dedup por orden) + email a ALERT_EMAIL. Best-effort:
  // nunca aborta la creación de guía. Va tras la confirmación al cliente por
  // el mismo motivo: corre en first-pass y en retries sin duplicar.
  await notifyNewOrderToAdmin(order.id);

  // Referidos v1 (2026-08-11): si el comprador llegó con un código y este es
  // su PRIMER pedido pagado, ambos reciben su cupón (10%, 1 uso, 90 días).
  // Idempotente por Referral.status y best-effort (nunca interrumpe la saga).
  await issueReferralRewardsIfFirstPaidOrder(order.id);

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

  // 6.5) #11-P1 (verificación post-launch) — CLAIM ATÓMICO de creación de guía.
  //   El guard `if (order.trackingNumber)` al inicio es read-then-act: dos
  //   processPaidOrder concurrentes sobre una orden ya PAID con tracking=null
  //   (createShipment lento/fallido antes) AMBAS lo pasan y AMBAS llegan acá →
  //   doble guía Aveonline. Esas invocaciones saltan la $transaction de stock
  //   (status ya no es PENDING_PAYMENT), así que el backstop StockAlreadyApplied
  //   no las cubre. Este updateMany condicional es el punto de serialización:
  //   solo UNA gana el claim (count=1) y llama a Aveonline; las demás (count=0)
  //   se saltean como idempotentes. Stale-reclaim a los 10 min cubre un proceso
  //   que crasheó tras clamar (no deja la guía bloqueada para siempre).
  const STALE_CLAIM_MS = 10 * 60 * 1000;
  const staleCutoff = new Date(Date.now() - STALE_CLAIM_MS);
  const claim = await prisma.order.updateMany({
    where: {
      id: order.id,
      trackingNumber: null,
      // #6 — el stale-reclaim (>10min) solo aplica a claims de procesos que CRASHEARON sin guía
      // conocida. Si la orden está en reconciliación (needsReconciliation=true) — p.ej. la guía SÍ se
      // creó pero falló el persist del tracking (#5/timeout, tracking_persist_failed) — el claim debe
      // quedar RETENIDO: reclamarlo re-crearía la guía que el reconciliationReason pide asociar a
      // mano. La rama fresh (shipmentClaimedAt=null) NO se gatea → el caso "cupón agotado" (que marca
      // needsReconciliation ANTES del claim) sigue generando su guía en el primer pase.
      OR: [
        { shipmentClaimedAt: null },
        { AND: [{ shipmentClaimedAt: { lt: staleCutoff } }, { needsReconciliation: false }] },
      ],
    },
    data: { shipmentClaimedAt: new Date() },
  });
  if (claim.count !== 1) {
    // Otro proceso ya está creando (o creó) la guía. Idempotente: no llamamos
    // a Aveonline. Re-leemos para devolver el tracking si el ganador ya terminó.
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

  // ¿Es realmente contraentrega? SOLO si el método es COD Y no hay pago Wompi asociado. Si la orden
  // tiene wompiTransactionId, ya se cobró en línea → la guía va PREPAGADA (sin recaudo), pase lo que
  // pase con el paymentMethod (auditoría v3 · B1: evita que el mensajero cobre un total ya pagado).
  const isCod = order.paymentMethod === "COD" && !order.wompiTransactionId;

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
      // COD (contraentrega): el courier cobra el total en efectivo al entregar y lo
      // remite. valorRecaudoCop en centavos (createShipment lo pasa a pesos).
      // Backstop anti-doble-cobro (auditoría v3 · B1): si la orden tiene wompiTransactionId
      // significa que YA se pagó en línea → JAMÁS generamos guía contraentrega (el mensajero NO
      // debe volver a cobrar), aunque el paymentMethod hubiera quedado 'COD' por un reuso.
      contraentrega: isCod,
      valorRecaudoCop: isCod ? order.total : undefined,
      orderId: order.id,
    });
  } catch (err) {
    logger.error({
      event: "order.saga.paid.shipment_failed",
      orderId: order.id,
      orderNumber: order.number,
      err: err instanceof Error ? err.message : String(err),
    });
    // #5 — Timeout (>20s) = resultado DESCONOCIDO: Aveonline PUDO crear la guía server-side aunque
    // el fetch abortara. Liberar el claim aquí dejaría que un reintento (admin/webhook) generara una
    // guía DUPLICADA (doble flete y, en COD, doble recaudo). Ante timeout NO liberamos el claim y
    // marcamos needsReconciliation para que un humano verifique en el panel Aveonline antes de
    // reintentar. Solo liberamos el claim cuando Aveonline respondió con un error EXPLÍCITO (o el
    // request nunca salió: circuit-open), donde es seguro reintentar.
    const isTimeout =
      err instanceof FetchTimeoutError || (err instanceof Error && err.name === "TimeoutError");
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
    // #11-P1 — Error explícito: liberar el claim para que un reintento legítimo (admin o webhook
    // posterior) pueda volver a intentar la guía. Solo si seguimos sin tracking.
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

  // 8) #11 (post-launch Bloque A) — Persistir el trackingNumber INMEDIATAMENTE
  //    tras crear la guía, ANTES de transicionar a FULFILLING. Crítico anti
  //    doble-guía: si solo lo guardáramos junto con la transición y esa fallara,
  //    la guía Aveonline existiría sin trackingNumber en nuestra DB → un reintento
  //    re-llamaría Aveonline (doble guía + doble costo). Con el tracking ya
  //    persistido, el guard `if (order.trackingNumber)` al inicio de
  //    processPaidOrder corta el reintento limpio (already_processed).
  try {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        trackingNumber: shipmentResult.trackingNumber,
        trackingUrl: shipmentResult.trackingUrl,
        labelUrl: shipmentResult.labelUrl,
        shippingCarrier: shipmentResult.carrier,
      },
    });
  } catch (err) {
    // La guía YA existe en Aveonline pero no pudimos persistir el tracking.
    // NO liberamos el claim (un reintento re-crearía guía = doble guía); en su
    // lugar marcamos needsReconciliation para que un humano asocie la guía
    // huérfana. El claim queda retenido evitando auto-retry; el detalle del
    // tracking va en reconciliationReason para que admin lo copie a mano.
    logger.error({
      event: "order.saga.paid.tracking_persist_failed",
      orderId: order.id,
      orderNumber: order.number,
      trackingNumber: shipmentResult.trackingNumber,
      err: err instanceof Error ? err.message : String(err),
    });
    await prisma.order
      .update({
        where: { id: order.id },
        data: {
          needsReconciliation: true,
          reconciliationReason:
            `Guía Aveonline creada (tracking ${shipmentResult.trackingNumber}, ` +
            `carrier ${shipmentResult.carrier}) pero no se pudo guardar en la DB. ` +
            `Asociá el tracking manualmente desde el detalle del pedido.`,
        },
      })
      .catch(() => null);
    return {
      status: "transition_failed",
      reason: "Guía creada en Aveonline pero no se pudo guardar tracking en DB (reconciliar)",
    };
  }

  // 9) Transicionar a FULFILLING. El tracking YA está en DB, así que si esta
  //    transición falla, el reintento es seguro (guard de trackingNumber corta
  //    antes de re-crear guía).
  try {
    await transitionOrder(order.id, "FULFILLING");
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
    // Tracking ya persistido — la orden quedó PAID con guía. Admin puede
    // re-disparar la transición desde /admin/pedidos sin riesgo de doble-guía.
    return {
      status: "ok",
      trackingNumber: shipmentResult.trackingNumber,
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

  // #7 — la orden se halló por trackingNumber (la guía existe), así que FULFILLING es el estado
  // correcto. Si quedó atascada en PAID (la transición a FULFILLING falló en la saga), promoverla
  // acá para que los eventos de tracking (SHIPPED/DELIVERED) puedan avanzar en vez de hacer noop
  // para siempre (sin deliveredAt, el ancla del retracto). PAID no puede ir directo a SHIPPED.
  let currentStatus: string = order.status;
  if (currentStatus === "PAID") {
    try {
      await transitionOrder(order.id, "FULFILLING");
      currentStatus = "FULFILLING";
    } catch {
      // otro proceso pudo avanzarla; seguimos con el estado que haya quedado
    }
  }

  // Mapeo estados Aveonline → transiciones Order.
  if (input.status === "DELIVERED") {
    if (currentStatus === "FULFILLING") {
      await transitionOrder(order.id, "SHIPPED").catch(() => null);
    }
    if (currentStatus === "SHIPPED" || currentStatus === "FULFILLING") {
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
        // #8 — que una transición fallida a DELIVERED deje de ser noop silencioso: la marcamos para
        // que aparezca en /admin/pedidos "Necesitan atención" (si no, sin deliveredAt ni email de
        // entrega, y con processedAt marcado el webhook no reintenta → pérdida irrecuperable).
        await markNeedsReconciliation(
          order.id,
          `Webhook Aveonline: no se pudo transicionar a DELIVERED (${input.carrierStatusRaw}) — ` +
            `revisar y marcar la entrega manualmente desde el pedido.`,
        );
      }
    }
  } else if (
    (input.status === "IN_TRANSIT" || input.status === "DISPATCHED") &&
    currentStatus === "FULFILLING"
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
      // #8 — superficiar la transición fallida a SHIPPED (ver DELIVERED arriba).
      await markNeedsReconciliation(
        order.id,
        `Webhook Aveonline: no se pudo transicionar a SHIPPED (${input.carrierStatusRaw}) — ` +
          `revisar y avanzar el pedido manualmente.`,
      );
    }
  } else if (input.status === "RETURNED" || input.status === "EXCEPTION") {
    // Devolución / novedad. NO auto-transicionamos (requiere decisión humana: reponer
    // stock, reembolsar si fue Wompi, o re-despachar). Pero la marcamos needsReconciliation
    // para que la dueña la VEA en /admin/pedidos "Necesitan atención" + el resumen diario.
    // Sin esto, una entrega COD rechazada queda en un estado 'pagado' para siempre →
    // ingresos y stock inflados en silencio (revisión adversarial COD, mandato #7 sin Sentry).
    await prisma.order
      .update({
        where: { id: order.id },
        data: {
          needsReconciliation: true,
          reconciliationReason: `Envío ${
            input.status === "RETURNED" ? "DEVUELTO" : "con novedad"
          } (${input.carrierStatusRaw}) — revisar stock${
            order.status === "DELIVERED" ? " y reembolso" : " / reenvío"
          }`,
        },
      })
      .catch(() => null);
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
 * Procesa transaction DECLINED/VOIDED/ERROR del webhook Wompi.
 *
 * #10 (post-launch Bloque A) — elige el estado terminal LEGAL según el estado
 * actual de la Order, en vez de forzar siempre CANCELLED (ilegal desde PAID →
 * la transición lanzaba OrderTransitionError, se tragaba, y el stock NO se
 * revertía → inventario sobre-comprometido):
 *
 *   - DRAFT / PENDING_PAYMENT  → CANCELLED  (no hubo cobro/decremento; no-op de stock)
 *   - PAID / DELIVERED         → REFUNDED   (dinero capturado y devuelto; revierte stock)
 *   - FULFILLING / SHIPPED     → CANCELLED  (legal desde esos estados; revierte stock)
 *   - CANCELLED / REFUNDED     → no-op (ya terminal)
 *
 * Tanto CANCELLED como REFUNDED disparan el revert de stock en transitionOrder
 * (idempotente, solo si hubo decremento previo).
 */
export async function processFailedPaymentOrder(input: {
  orderId: string;
  wompiTransactionId?: string;
  reason: string;
}): Promise<void> {
  // P2 (verificación post-launch) — la carrera APPROVED+VOIDED casi-simultánea
  // creaba un TOCTOU: el target se precalculaba con un status que transitionOrder
  // luego re-leía fresco; si cambió (ej. el webhook APPROVED commiteó PAID en el
  // medio), el target precalculado quedaba ilegal → OrderTransitionError tragado
  // → VOIDED perdido (orden "pagada fantasma" sin refund). Reintentamos hasta 3×
  // re-leyendo el status en cada vuelta para elegir un target legal contra el
  // estado real. Cada iteración es idempotente (transición a estado terminal).
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const current = await prisma.order.findFirst({
      where: { id: input.orderId, deletedAt: null },
      select: { status: true, number: true, wompiTransactionId: true },
    });
    if (!current) {
      logger.warn({ event: "order.saga.payment_failed.not_found", orderId: input.orderId });
      return;
    }

    // Ya terminal → no-op.
    if (current.status === "CANCELLED" || current.status === "REFUNDED") {
      logger.info({
        event: "order.saga.payment_failed.already_terminal",
        orderId: input.orderId,
        status: current.status,
      });
      return;
    }

    // B2 (auditoría v3) — un evento de FALLO (DECLINED/VOIDED/ERROR) solo puede tumbar una orden que
    // ya CAPTURÓ dinero si pertenece a LA MISMA transacción que la pagó. Una reference admite varios
    // intentos Wompi: un DECLINED de un intento viejo NO debe reembolsar/cancelar una orden que otra
    // transacción pagó después (antes esto convertía PAID→REFUNDED con la plata aún capturada).
    const captured =
      current.status === "PAID" ||
      current.status === "DELIVERED" ||
      current.status === "FULFILLING" ||
      current.status === "SHIPPED";
    if (captured) {
      const sameTx =
        !!input.wompiTransactionId && input.wompiTransactionId === current.wompiTransactionId;
      if (!sameTx) {
        logger.warn({
          event: "order.saga.payment_failed.foreign_or_stale_tx_ignored",
          orderId: input.orderId,
          status: current.status,
          eventTx: input.wompiTransactionId ?? null,
          orderTx: current.wompiTransactionId ?? null,
        });
        return; // no tocamos una orden pagada por otra transacción
      }
    }

    // Si el dinero ya estaba capturado (PAID/DELIVERED), un VOIDED/refund se
    // modela como REFUNDED. Desde FULFILLING/SHIPPED, CANCELLED es la transición
    // legal y también revierte stock. Antes del pago, CANCELLED.
    const target =
      current.status === "PAID" || current.status === "DELIVERED" ? "REFUNDED" : "CANCELLED";

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
      // #1 — notificar SIEMPRE al cliente según el tipo de transición (los 3 senders son best-effort
      // e idempotentes por idempotencyKey):
      //  - REFUNDED (era PAID/DELIVERED): el dinero capturado se devuelve → email de reembolso.
      //  - CANCELLED post-pago (venía FULFILLING/SHIPPED): cancelación de un pedido ya pagado.
      //  - CANCELLED pre-pago (DRAFT/PENDING_PAYMENT): "tu pago no se completó" (comportamiento previo).
      if (target === "REFUNDED") {
        await sendOrderRefunded(input.orderId);
      } else if (
        target === "CANCELLED" &&
        (current.status === "FULFILLING" || current.status === "SHIPPED")
      ) {
        await sendOrderCancelled(input.orderId, input.reason);
      } else if (target === "CANCELLED") {
        await sendOrderPaymentFailed(input.orderId, input.reason);
      }
      return; // éxito
    } catch (err) {
      // Si fue OrderTransitionError por carrera (status cambió bajo nuestros pies),
      // reintentamos re-leyendo. Otros errores: log y salimos.
      if (err instanceof OrderTransitionError && attempt < MAX_ATTEMPTS) {
        logger.warn({
          event: "order.saga.payment_failed.toctou_retry",
          orderId: input.orderId,
          attemptedFrom: current.status,
          attemptedTo: target,
          actualErr: `${err.from}→${err.to}`,
          attempt,
        });
        continue;
      }
      logger.warn({
        event: "order.saga.payment_failed.transition_skipped",
        orderId: input.orderId,
        from: current.status,
        to: target,
        err: err instanceof Error ? err.message : String(err),
      });
      return;
    }
  }
}

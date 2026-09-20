/*
 * N-12 — Expiración de órdenes WOMPI en PENDING_PAYMENT.
 *
 * Una orden WOMPI nace en PENDING_PAYMENT y solo avanza a PAID cuando Wompi
 * confirma el cobro (webhook / fallback /checkout/gracias). Si el cliente
 * abandona la pasarela, la orden quedaba PENDING_PAYMENT PARA SIEMPRE: basura
 * operativa en /admin/pedidos, métricas infladas y la alerta
 * `pending_payment_wompi_stale` disparando sobre órdenes que nadie pagará.
 *
 * Este servicio (corrido por GET /api/cron/expire-pending-orders cada hora)
 * transiciona a CANCELLED las órdenes paymentMethod=WOMPI en PENDING_PAYMENT
 * con createdAt < now - PENDING_PAYMENT_EXPIRY_HOURS (features/orders/constants.ts
 * — contrato compartido con la alerta, que usa el mismo umbral).
 *
 * Por qué es seguro cancelar acá (needsRevert es no-op — verificado):
 *   - El STOCK no se consume antes de PAID: decrementStockForOrder corre solo
 *     en la saga post-PAID (processPaidOrder). revertStockForOrder, que
 *     transitionOrder invoca al cancelar, es idempotente y no-op si no hubo
 *     decremento previo (mismo caso que PENDING_PAYMENT → CANCELLED por
 *     DECLINED, ver service.ts).
 *   - El CUPÓN tampoco: CouponUsage solo se crea en la saga post-PAID, así que
 *     la liberación de cupón de transitionOrder no encuentra nada que liberar.
 *   - El DINERO nunca se movió: si Wompi cobró, la orden ya no está en
 *     PENDING_PAYMENT (o está marcada needsReconciliation, que NO se toca acá:
 *     solo se cancelan PENDING_PAYMENT limpias).
 *
 * Idempotente por diseño: re-correr solo ve PENDING_PAYMENT (las ya canceladas
 * quedan fuera del WHERE) y transitionOrder es no-op si el estado no cambió.
 * La carrera con un pago en vuelo (webhook APPROVED commiteando PAID justo
 * cuando el cron cancela) la resuelve el guard atómico de transitionOrder
 * (updateMany gateado por el estado leído): perdemos la carrera con
 * OrderTransitionError → la contamos como `skipped` y NO tocamos la orden.
 *
 * Verificación Wompi antes de cancelar (5.4, 2026-09-13): una orden con
 * `wompiTransactionId` pudo haberse PAGADO sin que llegara el webhook (caída de
 * la entrega, URL mal configurada); cancelarla sería cancelar una venta real.
 * Antes de cancelarla consultamos el estado REAL de la transacción contra la
 * API de Wompi (mismo criterio que el fallback /checkout/gracias):
 *   - APPROVED → NO se cancela: se corre la saga processPaidOrder como
 *     auto-sanación (idempotente: si el webhook llegó entre tanto, devuelve
 *     already_processed) y se cuenta en `healed`. Con validación de monto
 *     simétrica al webhook y al fallback (tx.amount_in_cents === order.total):
 *     un APPROVED con monto desfasado NO se sana ni se cancela — se marca
 *     needsReconciliation y queda para un humano (cuenta como `skipped`).
 *   - PENDING / DECLINED / ERROR / VOIDED → se cancela limpio: la verificación
 *     SÍ corrió y descartó el cobro (el veredicto queda en el log).
 *   - Transacción inexistente (404) / API caída (lookup_failed) o Wompi NO
 *     configurado (not_configured) → se cancela (sin prueba de pago no se puede
 *     retener la orden para siempre) PERO se marca needsReconciliation (F-03,
 *     auditoría 2026-09-19): la cancelación fue a ciegas y pudo haber dinero
 *     capturado — la alerta crítica `reconciliation` la hace visible para
 *     contraste manual contra el panel Wompi. Ninguna orden con pago potencial
 *     se cancela en silencio.
 * Órdenes sin wompiTransactionId (abandono antes de pagar) → cancelación
 * directa sin llamar a Wompi y SIN flag: no hay cobro potencial que reconciliar.
 *
 * Auditoría: no hay columna de "motivo de cancelación" en Order (solo
 * refundReason); la razón ORDER_EXPIRED queda en updatedBy="cron:expire-pending-orders"
 * + el log estructurado `order.expired_pending_payment` por orden (con el
 * veredicto de la verificación Wompi cuando aplica).
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getTransaction, getWompiConfig } from "@/lib/wompi";
import { transitionOrder, OrderTransitionError } from "./service";
import { processPaidOrder } from "./saga";
import { PENDING_PAYMENT_EXPIRY_HOURS } from "./constants";

/** Lote acotado por corrida: el cron es horario, un backlog se drena en corridas sucesivas. */
const EXPIRE_BATCH_SIZE = 500;

export const EXPIRE_PENDING_ACTOR = "cron:expire-pending-orders";

export type ExpireStalePendingOrdersResult = {
  cutoff: string;
  scanned: number;
  expired: number;
  skipped: number;
  /** Órdenes con pago APPROVED en Wompi cuyo webhook se perdió → saga corrida (5.4). */
  healed: number;
};

/**
 * ¿Está Wompi configurado? getTransaction lanza si faltan las WOMPI_* — en modo
 * catálogo no hay cobro real que verificar, así que la verificación se apaga
 * para TODA la corrida (una sola evaluación, no por orden) y se cancela como
 * siempre (criterio 5.4 documentado en el header).
 */
function wompiVerificationAvailable(): boolean {
  try {
    getWompiConfig();
    return true;
  } catch {
    return false;
  }
}

/** Veredicto de la verificación Wompi — queda en el log de cada orden cancelada. */
type WompiVerdict =
  | "no_txid" // abandonó antes de pagar → cancela directo (sin llamar a Wompi) y SIN flag
  | "not_configured" // sin llaves WOMPI_* → no se puede verificar: cancela + needsReconciliation (F-03)
  | "not_approved" // PENDING/DECLINED/ERROR/VOIDED → cancela limpio (cobro descartado)
  | "lookup_failed"; // API caída / tx inexistente (404) → cancela + needsReconciliation (F-03)

export async function expireStalePendingOrders(
  now: Date = new Date(),
): Promise<ExpireStalePendingOrdersResult> {
  const cutoff = new Date(now.getTime() - PENDING_PAYMENT_EXPIRY_HOURS * 60 * 60 * 1000);
  const stale = await prisma.order.findMany({
    where: {
      status: "PENDING_PAYMENT",
      paymentMethod: "WOMPI",
      deletedAt: null,
      createdAt: { lt: cutoff },
      // NO se expiran órdenes marcadas para reconciliación: pueden tener dinero
      // CAPTURADO (Wompi APPROVED sin stock, monto desfasado, saga reventada) —
      // cancelarlas es decisión de un humano, no del cron.
      needsReconciliation: false,
    },
    select: { id: true, number: true, total: true, wompiTransactionId: true },
    orderBy: { createdAt: "asc" },
    take: EXPIRE_BATCH_SIZE,
  });

  // 5.4 — una sola evaluación por corrida: sin llaves no hay API que consultar.
  const canVerifyWompi = wompiVerificationAvailable();

  let expired = 0;
  let skipped = 0;
  let healed = 0;
  for (const order of stale) {
    // ── 5.4 — Verificación Wompi antes de cancelar una orden CON transacción ──
    // La orden tiene wompiTransactionId: pudo pagarse y el webhook perderse.
    // Consultamos el estado REAL antes de decidir (sin txId → cancela directo).
    let verdict: WompiVerdict = "no_txid";
    if (order.wompiTransactionId) {
      if (!canVerifyWompi) {
        verdict = "not_configured";
      } else {
        // Lookup acotado: SOLO este await tiene red de errores — un fallo de la
        // saga (más abajo) JAMÁS debe reinterpretarse como "no se pudo verificar"
        // y derivar en cancelación de una venta APPROVED.
        let tx: Awaited<ReturnType<typeof getTransaction>> | null = null;
        try {
          tx = await getTransaction(order.wompiTransactionId);
        } catch (err) {
          // API caída, timeout, circuit-open o tx inexistente (404): sin prueba
          // de pago se cancela, pero la cancelación fue a ciegas → F-03 la
          // marca needsReconciliation al cancelar (más abajo).
          verdict = "lookup_failed";
          logger.warn({
            event: "order.expire_pending.wompi_lookup_failed",
            orderId: order.id,
            orderNumber: order.number,
            txId: order.wompiTransactionId,
            err: err instanceof Error ? err.message : String(err),
          });
        }
        if (tx?.status === "APPROVED") {
          if (tx.amount_in_cents !== order.total) {
            // Simetría con webhook y /checkout/gracias (ambos validan monto
            // antes de la saga): un APPROVED desfasado no se sana solo ni se
            // cancela — queda visible para un humano.
            await prisma.order.updateMany({
              where: { id: order.id, needsReconciliation: false },
              data: {
                needsReconciliation: true,
                reconciliationReason: `Monto Wompi (${tx.amount_in_cents}) ≠ total de la orden (${order.total}) detectado por el cron expire-pending (tx ${tx.id}). Revisar antes de despachar o reembolsar.`,
              },
            });
            skipped += 1;
            logger.warn({
              event: "order.expire_pending.amount_mismatch",
              orderId: order.id,
              orderNumber: order.number,
              expected: order.total,
              received: tx.amount_in_cents,
              txId: tx.id,
            });
            continue;
          }
          // El webhook se perdió: la venta es REAL. Auto-sanación con la saga
          // (idempotente — si el webhook llegó entre tanto, already_processed).
          // Si la saga lanza (fallo técnico inesperado), NO cancelamos: el pago
          // está aprobado; la orden queda y la próxima corrida reintenta.
          try {
            const result = await processPaidOrder({
              orderId: order.id,
              wompiTransactionId: tx.id,
            });
            healed += 1;
            logger.info({
              event: "order.expire_pending.healed",
              orderId: order.id,
              orderNumber: order.number,
              txId: tx.id,
              sagaStatus: result.status,
              trackingNumber: result.trackingNumber ?? null,
            });
          } catch (err) {
            skipped += 1;
            logger.error({
              event: "order.expire_pending.heal_failed",
              orderId: order.id,
              orderNumber: order.number,
              txId: tx.id,
              err: err instanceof Error ? err.message : String(err),
            });
          }
          continue;
        }
        if (tx) {
          verdict = "not_approved";
          logger.info({
            event: "order.expire_pending.wompi_verified",
            orderId: order.id,
            orderNumber: order.number,
            txId: tx.id,
            txStatus: tx.status,
          });
        }
      }
    }

    try {
      await transitionOrder(order.id, "CANCELLED", { actorAdminId: EXPIRE_PENDING_ACTOR });
      expired += 1;
      // F-03 (auditoría 2026-09-19): si la orden TENÍA txId pero la verificación
      // contra Wompi NO se ejecutó (sin llaves o API caída/404), la cancelación
      // fue a ciegas — pudo haber dinero capturado detrás. La marcamos
      // needsReconciliation para que la alerta crítica `reconciliation` (cuenta
      // needsReconciliation sin importar el estado) la haga visible: ninguna
      // orden con pago potencial se cancela en silencio. Los veredictos no_txid
      // (abandono antes de pagar) y not_approved (Wompi confirmó que NO hay
      // cobro) se cancelan limpios, como siempre.
      if (verdict === "not_configured" || verdict === "lookup_failed") {
        await prisma.order.updateMany({
          where: { id: order.id, needsReconciliation: false },
          data: {
            needsReconciliation: true,
            reconciliationReason: `El cron expire-pending canceló la orden SIN poder verificar su tx Wompi (${order.wompiTransactionId}) — veredicto ${verdict}. Contrastar contra el panel Wompi: si el cobro está APPROVED, hubo una venta cobrada cancelada (confirmar stock o reembolsar).`,
          },
        });
      }
      logger.info({
        event: "order.expired_pending_payment",
        reason: "ORDER_EXPIRED",
        orderId: order.id,
        orderNumber: order.number,
        expiryHours: PENDING_PAYMENT_EXPIRY_HOURS,
        wompiVerification: verdict,
      });
    } catch (err) {
      // Carrera perdida: otro proceso (webhook APPROVED, retry admin, cancelación
      // manual) cambió el estado entre nuestra lectura y la transición. El guard
      // atómico de transitionOrder abortó SIN tocar la orden → no es un fallo.
      if (err instanceof OrderTransitionError) {
        skipped += 1;
        logger.info({
          event: "order.expire_pending.skip_race",
          orderId: order.id,
          orderNumber: order.number,
        });
        continue;
      }
      throw err;
    }
  }

  logger.info({
    event: "order.expire_pending.done",
    cutoff: cutoff.toISOString(),
    scanned: stale.length,
    expired,
    skipped,
    healed,
    wompiVerification: canVerifyWompi ? "enabled" : "disabled",
  });
  return { cutoff: cutoff.toISOString(), scanned: stale.length, expired, skipped, healed };
}

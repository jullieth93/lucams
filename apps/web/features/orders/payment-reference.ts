/*
 * Referencia de pago Wompi única POR INTENTO (bug STG 2026-10).
 *
 * Problema: la reference de Web Checkout era Order.number y createOrderFromCart
 * REUSA la orden PENDING_PAYMENT por cartId. Wompi consume la reference en el
 * primer intento y solo habilita reintentarla ~3 min tras un DECLINED (doc
 * oficial); fuera de esa ventana, cualquier reintento desde la tienda chocaba
 * con "La referencia ya ha sido usada".
 *
 * Diseño:
 *  - Intento 1 → reference = Order.number (`LCM-YYYY-NNNN`). Intento N ≥ 2 →
 *    `${Order.number}-N`. Wompi acepta alfanumérico con guiones (doc
 *    widget-checkout-web, paso 2), así que el formato es válido.
 *  - resolveWompiPaymentReference decide y PERSISTE la referencia con un claim
 *    atómico (updateMany gateado por paymentAttempt + wompiReference leídos):
 *    un doble submit concurrente pierde el claim, re-lee y reusa la referencia
 *    fresca del ganador — nunca genera dos referencias para el mismo intento.
 *  - Reuso: si la referencia almacenada tiene < WOMPI_REFERENCE_RETRY_WINDOW_MS,
 *    sigue siendo válida en Wompi → se reusa (idempotencia del reintento
 *    inmediato, ej. doble click en "Pagar").
 *  - Rotación: vencida la ventana, solo se rota cuando NO hay dinero en vuelo:
 *    si la orden tiene wompiTransactionId se verifica la tx contra la API de
 *    Wompi (mismo patrón que expire-pending). APPROVED → no se cobra de nuevo
 *    (el caller redirige a /checkout/gracias, que sana la orden con la saga
 *    fallback); PENDING (PSE/transferencia async) → no se crea un segundo
 *    cobro; DECLINED/ERROR/VOIDED → terminal sin dinero → se rota. Si la
 *    verificación falla (API caída) NO se rota a ciegas: podría haber un
 *    APPROVED detrás y rotar abriría doble cobro.
 *  - Al rotar se limpia wompiTransactionId (la tx vieja es terminal): el
 *    webhook puede persistir la tx del intento nuevo (gate F-03 exige null).
 *
 * Resolución inversa (webhook / redirect): findOrderIdByWompiReference matchea
 * la reference recibida contra wompiReference exacta, contra number (intento
 * base y órdenes legacy) y, como fallback, contra el número base extraído del
 * sufijo `-N` (cubre un APPROVED tardío de un intento anterior al almacenado).
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getTransaction } from "@/lib/wompi";

/**
 * Ventana en la que Wompi acepta reintentar con la MISMA reference (~3 min tras
 * el intento, doc oficial). Medida desde que generamos el checkout: cualquier
 * DECLINED posterior ocurre DESPUÉS de ese timestamp, así que su ventana de
 * reintento extiende al menos hasta acá — reusar dentro de la ventana es seguro.
 */
export const WOMPI_REFERENCE_RETRY_WINDOW_MS = 3 * 60 * 1000;

/** reference del intento N: 1 = número base; ≥2 = `${number}-N`. */
export function buildWompiReference(orderNumber: string, attempt: number): string {
  return attempt <= 1 ? orderNumber : `${orderNumber}-${attempt}`;
}

const ORDER_NUMBER_PATTERN = /^(LCM-\d{4}-\d+?)(?:-\d+)?$/;

/**
 * Número de orden base de una reference Wompi. Referencias ajenas al formato
 * (seeds de test, sistemas viejos) se devuelven intactas.
 */
export function extractOrderNumberFromWompiReference(reference: string): string {
  return ORDER_NUMBER_PATTERN.exec(reference)?.[1] ?? reference;
}

export type WompiPaymentReferenceResolution =
  | { kind: "ready"; reference: string; attempt: number }
  /** La tx previa quedó APPROVED pero el webhook se perdió: NO cobrar de nuevo. */
  | { kind: "approved"; txId: string }
  /** PSE/transferencia aún PENDING en Wompi: otro checkout sería doble cobro. */
  | { kind: "in_flight"; txId: string }
  /** Sin prueba del desenlace del intento previo (API caída, orden no payable). */
  | { kind: "lookup_failed" };

export async function resolveWompiPaymentReference(
  orderId: string,
  now: Date = new Date(),
): Promise<WompiPaymentReferenceResolution> {
  // 2 rondas: si el claim se pierde por una carrera de doble submit, la segunda
  // lectura ve la referencia fresca del ganador y la reusa.
  for (let round = 0; round < 2; round += 1) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        number: true,
        status: true,
        paymentAttempt: true,
        wompiReference: true,
        wompiReferenceAt: true,
        wompiTransactionId: true,
      },
    });
    if (!order) return { kind: "lookup_failed" };
    if (order.status !== "PENDING_PAYMENT") {
      // Carrera con el webhook/cron entre createOrderFromCart y acá.
      return order.wompiTransactionId
        ? { kind: "approved", txId: order.wompiTransactionId }
        : { kind: "lookup_failed" };
    }

    if (
      order.wompiReference &&
      order.wompiReferenceAt &&
      now.getTime() - order.wompiReferenceAt.getTime() < WOMPI_REFERENCE_RETRY_WINDOW_MS
    ) {
      return { kind: "ready", reference: order.wompiReference, attempt: order.paymentAttempt };
    }

    if (order.wompiTransactionId) {
      let tx: Awaited<ReturnType<typeof getTransaction>> | null = null;
      try {
        tx = await getTransaction(order.wompiTransactionId);
      } catch (err) {
        logger.warn({
          event: "order.payment_reference.tx_lookup_failed",
          orderId,
          txId: order.wompiTransactionId,
          err: err instanceof Error ? err.message : String(err),
        });
        return { kind: "lookup_failed" };
      }
      if (tx.status === "APPROVED") return { kind: "approved", txId: tx.id };
      if (tx.status === "PENDING") return { kind: "in_flight", txId: tx.id };
      // DECLINED / ERROR / VOIDED: terminal sin dinero movido → rotar.
    }

    // Órdenes legacy (pre-feature) con txId pero sin contador: la reference base
    // ya se ofreció a Wompi → el próximo intento arranca en 2, no en 1.
    const nextAttempt = Math.max(order.paymentAttempt + 1, order.wompiTransactionId ? 2 : 1);
    const reference = buildWompiReference(order.number, nextAttempt);
    const claimed = await prisma.order.updateMany({
      where: {
        id: orderId,
        status: "PENDING_PAYMENT",
        paymentAttempt: order.paymentAttempt,
        wompiReference: order.wompiReference,
      },
      data: {
        paymentAttempt: nextAttempt,
        wompiReference: reference,
        wompiReferenceAt: now,
        // La tx anterior (si hubo) quedó terminal verificada antes de rotar;
        // liberar el campo para que el webhook persista la tx del intento nuevo.
        wompiTransactionId: null,
      },
    });
    if (claimed.count === 1) {
      logger.info({
        event: "order.payment_reference.claimed",
        orderId,
        orderNumber: order.number,
        attempt: nextAttempt,
        rotated: nextAttempt > 1,
      });
      return { kind: "ready", reference, attempt: nextAttempt };
    }
    // Carrera: otro request reclamó primero → la próxima ronda reusará su
    // referencia fresca (cae en la ventana de retry).
  }
  logger.warn({ event: "order.payment_reference.contended", orderId });
  return { kind: "lookup_failed" };
}

/**
 * Resolución inversa: reference recibida de Wompi → Order.id.
 * Cubre reference exacta persistida, number exacto (intento base / legacy) y el
 * número base extraído de un sufijo `-N` (p.ej. APPROVED tardío del intento 1
 * cuando la orden ya almacena la reference del intento 2).
 */
export async function findOrderIdByWompiReference(reference: string): Promise<string | null> {
  const base = extractOrderNumberFromWompiReference(reference);
  const order = await prisma.order.findFirst({
    where: {
      deletedAt: null,
      OR: [{ wompiReference: reference }, { number: reference }, { number: base }],
    },
    select: { id: true },
  });
  return order?.id ?? null;
}

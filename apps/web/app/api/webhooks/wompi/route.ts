/*
 * Webhook Wompi — recibe transaction.updated cuando un pago cambia de estado.
 *
 * Flow:
 *   1. POST /api/webhooks/wompi con body JSON firmado HMAC-SHA256.
 *   2. Verificar firma con WOMPI_EVENTS_SECRET (verifyWebhookSignature).
 *      Si inválida → 401 + no procesar.
 *   3. Idempotency: upsert WebhookEvent (source=WOMPI, externalId=transaction.id).
 *      Si ya estaba processed, devolver 200 sin re-procesar.
 *   4. Por status:
 *      - APPROVED → processPaidOrder (transitionOrder PAID + createShipment)
 *      - DECLINED/VOIDED/ERROR → processFailedPaymentOrder (transitionOrder CANCELLED)
 *      - PENDING → log y esperar próximo evento
 *   5. Marcar WebhookEvent.processedAt + devolver 200.
 *
 * Wompi reintenta hasta 3 veces si no recibe 200 (ver doc). Por eso devolvemos
 * 200 incluso si la saga interna falla (loggeamos error, admin reintenta).
 * Sólo devolvemos 401 para firma inválida (potencial ataque).
 *
 * Doc: https://docs.wompi.co/docs/colombia/eventos/
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { verifyWebhookSignature, getWompiExpectedWebhookEnv } from "@/lib/wompi";
import { processPaidOrder, processFailedPaymentOrder } from "@/features/orders/saga";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// La función DEBE poder contener el presupuesto interno de processPaidOrder:
// getAuthToken (cold, retry ~16s) + createShipment (timeout 20s, NO idempotente) +
// escrituras de saga. Si el límite de plataforma matara la función a mitad de
// createShipment, la guía quedaría huérfana → doble guía en el retry (ver ADR-049).
// 60s cabe holgado en el default de Vercel (300s con fluid compute) y en Pro.
export const maxDuration = 60;

export async function POST(req: Request) {
  // 1) Leer raw body (string) — necesario para HMAC verify byte-exacto.
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (err) {
    logger.warn({
      event: "webhook.wompi.body_read_fail",
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // 2) Verificar firma HMAC. Si inválida, rechazamos (potencial atacante).
  const verification = verifyWebhookSignature(rawBody);
  if (!verification.valid) {
    logger.warn({
      event: "webhook.wompi.invalid_signature",
      reason: verification.reason,
      bodyHead: rawBody.slice(0, 200),
    });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const event = verification.event;
  if (!event) {
    return NextResponse.json({ error: "no event" }, { status: 400 });
  }

  // 2.5) P1-011 (Lucy 2026-06-26) — Defensas anti-replay.
  // (a) Timestamp dentro de ventana ±5 min: rechaza payload viejo capturado
  //     por atacante y replay-eado después. Wompi sandbox envía timestamp Unix.
  //     Toleramos drift de reloj y latencias razonables.
  // (b) Environment match: rechaza un webhook prod en dev (o viceversa)
  //     incluso si por accidente las keys quedaron crossed entre entornos.
  //
  // Escape hatch para tests/smoke locales que firman timestamp viejo:
  // WOMPI_DISABLE_TIMESTAMP_CHECK=true bypasea la ventana.
  const TIMESTAMP_WINDOW_SEC = 5 * 60; // 5 minutos
  const nowSec = Math.floor(Date.now() / 1000);
  const eventSec = Number(event.timestamp);
  const ageSec = Math.abs(nowSec - eventSec);
  const skipTsCheck = process.env.WOMPI_DISABLE_TIMESTAMP_CHECK === "true";
  if (!skipTsCheck && (Number.isNaN(eventSec) || ageSec > TIMESTAMP_WINDOW_SEC)) {
    logger.warn({
      event: "webhook.wompi.replay_rejected",
      reason: "timestamp out of window",
      eventTimestamp: event.timestamp,
      nowSec,
      ageSec,
      windowSec: TIMESTAMP_WINDOW_SEC,
    });
    return NextResponse.json({ error: "timestamp out of window" }, { status: 401 });
  }

  // Environment match: prod no debe procesar webhooks "test" y viceversa.
  // #3 (certificación Bloque A): derivamos de WOMPI_ENV (misma fuente que el
  // cliente API), NO de NODE_ENV — en Vercel preview NODE_ENV=production aunque
  // WOMPI_ENV=sandbox, lo que rechazaba webhooks sandbox legítimos con 401.
  const expectedEnv = getWompiExpectedWebhookEnv();
  if (event.environment !== expectedEnv && !skipTsCheck) {
    logger.warn({
      event: "webhook.wompi.environment_mismatch",
      expectedEnv,
      receivedEnv: event.environment,
      wompiEnv: process.env.WOMPI_ENV,
    });
    return NextResponse.json({ error: "environment mismatch" }, { status: 401 });
  }

  const transaction = event.data?.transaction;
  if (!transaction) {
    logger.warn({ event: "webhook.wompi.no_transaction", eventType: event.event });
    return NextResponse.json({ ok: true, note: "no transaction in event" });
  }

  // 3) Idempotency: upsert WebhookEvent. Si ya estaba processed, salir.
  const eventKey = `${transaction.id}-${transaction.status}-${event.timestamp}`;
  const existing = await prisma.webhookEvent.findUnique({
    where: {
      source_externalId: { source: "WOMPI", externalId: eventKey },
    },
  });
  if (existing?.processedAt) {
    logger.info({
      event: "webhook.wompi.duplicate_skipped",
      eventKey,
      txStatus: transaction.status,
    });
    return NextResponse.json({ ok: true, note: "already processed" });
  }
  const webhookRow = existing
    ? existing
    : await prisma.webhookEvent.create({
        data: {
          source: "WOMPI",
          externalId: eventKey,
          payload: event as unknown as object,
        },
      });

  logger.info({
    event: "webhook.wompi.received",
    eventKey,
    eventType: event.event,
    txId: transaction.id,
    txStatus: transaction.status,
    reference: transaction.reference,
    amountInCents: transaction.amount_in_cents,
  });

  // 4) Buscar Order por reference (= Order.number como "LCM-2026-0001").
  const order = await prisma.order.findFirst({
    where: { number: transaction.reference, deletedAt: null },
    select: { id: true, number: true, status: true, total: true, trackingNumber: true },
  });

  if (!order) {
    logger.warn({
      event: "webhook.wompi.order_not_found",
      reference: transaction.reference,
    });
    await prisma.webhookEvent.update({
      where: { id: webhookRow.id },
      data: { processedAt: new Date() },
    });
    return NextResponse.json({ ok: true, note: "order not found, ignored" });
  }

  // 5) Validar monto (defensa anti-tampering — el integrity signature de Wompi
  //    ya lo garantiza, pero doble-check no daña).
  if (transaction.amount_in_cents !== order.total) {
    logger.error({
      event: "webhook.wompi.amount_mismatch",
      orderNumber: order.number,
      expected: order.total,
      received: transaction.amount_in_cents,
    });
    // Auditoría 2026-07-13: marcar la orden para reconciliación manual (antes solo se
    // logueaba → quedaba invisible en el panel). Un humano debe revisar el desfase de monto.
    await prisma.order.update({
      where: { id: order.id },
      data: {
        needsReconciliation: true,
        reconciliationReason: `Monto Wompi (${transaction.amount_in_cents}) ≠ total de la orden (${order.total}). Revisar antes de despachar.`,
      },
    });
    await prisma.webhookEvent.update({
      where: { id: webhookRow.id },
      data: { processedAt: new Date() },
    });
    return NextResponse.json({ ok: true, note: "amount mismatch, manual review" });
  }

  // 6) Procesar según status.
  try {
    if (transaction.status === "APPROVED") {
      const result = await processPaidOrder({
        orderId: order.id,
        wompiTransactionId: transaction.id,
      });
      logger.info({
        event: "webhook.wompi.processed_approved",
        orderNumber: order.number,
        sagaStatus: result.status,
        trackingNumber: result.trackingNumber ?? null,
        reason: result.reason ?? null,
      });
    } else if (
      transaction.status === "DECLINED" ||
      transaction.status === "VOIDED" ||
      transaction.status === "ERROR"
    ) {
      await processFailedPaymentOrder({
        orderId: order.id,
        wompiTransactionId: transaction.id,
        reason: transaction.status_message ?? transaction.status,
      });
    } else {
      // PENDING — Wompi enviará otro evento cuando finalice. Sólo log.
      logger.info({
        event: "webhook.wompi.pending_noop",
        orderNumber: order.number,
        txStatus: transaction.status,
      });
    }
  } catch (err) {
    // Capturamos para que devolvamos 200 a Wompi (no reintentar — el saga
    // ya loggeó el error con detalle). Admin reintenta manual desde admin/pedidos.
    logger.error({
      event: "webhook.wompi.saga_unexpected_error",
      orderNumber: order.number,
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    // #14 — la saga reventó procesando un webhook APPROVED: el pago PUDO capturarse y la orden queda
    // sin confirmar. Marcamos needsReconciliation (dispara la alerta crítica YA, sin esperar 1h) y
    // devolvemos ANTES de sellar processedAt → el evento queda sin procesar para que la alerta
    // webhooks_stuck y el SLO reflejen la realidad y el retry admin sea visible. Guard para no pisar
    // un motivo previo. Se sigue devolviendo 200 (no gatillar los 3 reintentos ciegos de Wompi).
    await prisma.order.updateMany({
      where: { id: order.id, needsReconciliation: false },
      data: {
        needsReconciliation: true,
        reconciliationReason: `El webhook de Wompi (tx ${transaction.id}, estado ${transaction.status}) falló al procesarse: ${err instanceof Error ? err.message : String(err)}. El pago pudo capturarse; revisar y reintentar desde el pedido.`,
      },
    });
    return NextResponse.json({ ok: true, note: "saga error, flagged for reconciliation" });
  }

  // 7) Marcar webhook procesado.
  await prisma.webhookEvent.update({
    where: { id: webhookRow.id },
    data: { processedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

/** GET no soportado — Wompi sólo manda POST. */
export async function GET() {
  return NextResponse.json(
    { ok: false, note: "POST only — see docs.wompi.co/docs/colombia/eventos/" },
    { status: 405 },
  );
}

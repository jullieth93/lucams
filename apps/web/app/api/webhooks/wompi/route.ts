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
import { verifyWebhookSignature } from "@/lib/wompi";
import { processPaidOrder, processFailedPaymentOrder } from "@/features/orders/saga";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

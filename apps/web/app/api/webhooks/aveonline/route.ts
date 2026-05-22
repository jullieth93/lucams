/*
 * Webhook Aveonline — recibe actualizaciones de estado de guías.
 *
 * Aveonline NO documenta HMAC. Mitigación (ADR-039 docs/INTEGRATIONS_AVEONLINE §6.2):
 *   1. Secret en `paramN` (registrado al crear webhook con `createWebhook.php`).
 *      Validamos `?secret=<AVEONLINE_WEBHOOK_SECRET>` o header `x-aveonline-secret`.
 *   2. trackingNumber debe existir en DB (la saga lo persistió al crear guía).
 *   3. Estados monotónicos: NO retroceder de DELIVERED → SHIPPED, etc.
 *
 * Aveonline envía 2 shapes posibles:
 *   - Plugin legacy (wordpress.php): { status, message, guia, pedido_id,
 *     estado:[{estado_id, nombre_estado, fecha}] }
 *   - AveCRM nuevo: { guia, estado: {nombre, timestamp} | [...] }
 *
 * El provider.handleWebhook ya parsea ambos.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getShippingProvider } from "@/features/shipping/provider";
import { processTrackingUpdate } from "@/features/orders/saga";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  // 1) Validar secret compartido. Aveonline lo envía en paramN custom que
  //    nosotros definimos al registrar el webhook. Aceptamos ?secret=… o header.
  const expected = process.env.AVEONLINE_WEBHOOK_SECRET?.trim();
  if (!expected) {
    logger.warn({ event: "webhook.aveonline.no_secret_configured" });
    // En modo dev sin secret seteado, permitimos pasar para testing.
    // Producción debe siempre tener AVEONLINE_WEBHOOK_SECRET seteado.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
    }
  } else {
    const url = new URL(req.url);
    const providedQ = url.searchParams.get("secret");
    const providedH = req.headers.get("x-aveonline-secret");
    if (providedQ !== expected && providedH !== expected) {
      logger.warn({
        event: "webhook.aveonline.invalid_secret",
        gotQ: !!providedQ,
        gotH: !!providedH,
      });
      return NextResponse.json({ error: "invalid secret" }, { status: 401 });
    }
  }

  // 2) Leer body + parsear via provider.handleWebhook.
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (err) {
    logger.warn({
      event: "webhook.aveonline.body_read_fail",
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  let event;
  try {
    const provider = await getShippingProvider();
    event = await provider.handleWebhook(rawBody, Object.fromEntries(req.headers));
  } catch (err) {
    logger.error({
      event: "webhook.aveonline.parse_fail",
      err: err instanceof Error ? err.message : String(err),
      bodyHead: rawBody.slice(0, 200),
    });
    return NextResponse.json({ error: "parse failed" }, { status: 400 });
  }

  if (!event.trackingNumber) {
    logger.warn({ event: "webhook.aveonline.no_tracking_number" });
    return NextResponse.json({ ok: true, note: "no tracking number in payload" });
  }

  // 3) Idempotency: dedup por trackingNumber + status + timestamp.
  const externalId = `${event.trackingNumber}-${event.status}-${event.timestamp.getTime()}`;
  const existing = await prisma.webhookEvent.findUnique({
    where: { source_externalId: { source: "AVEONLINE", externalId } },
  });
  if (existing?.processedAt) {
    logger.info({
      event: "webhook.aveonline.duplicate_skipped",
      externalId,
    });
    return NextResponse.json({ ok: true, note: "already processed" });
  }
  const webhookRow = existing
    ? existing
    : await prisma.webhookEvent.create({
        data: {
          source: "AVEONLINE",
          externalId,
          payload: {
            trackingNumber: event.trackingNumber,
            status: event.status,
            carrierStatusRaw: event.carrierStatusRaw,
            timestamp: event.timestamp.toISOString(),
            rawBodyHead: rawBody.slice(0, 1000),
          },
        },
      });

  logger.info({
    event: "webhook.aveonline.received",
    trackingNumber: event.trackingNumber,
    status: event.status,
    carrierRaw: event.carrierStatusRaw,
  });

  // 4) Procesar tracking update via saga.
  try {
    const result = await processTrackingUpdate({
      trackingNumber: event.trackingNumber,
      status: event.status,
      carrierStatusRaw: event.carrierStatusRaw,
    });
    logger.info({
      event: "webhook.aveonline.processed",
      sagaResult: result.status,
      orderNumber: result.orderNumber ?? null,
      transitionedTo: result.transitionedTo ?? null,
    });
  } catch (err) {
    logger.error({
      event: "webhook.aveonline.saga_unexpected_error",
      err: err instanceof Error ? err.message : String(err),
    });
  }

  await prisma.webhookEvent.update({
    where: { id: webhookRow.id },
    data: { processedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json(
    { ok: false, note: "POST only — see docs/INTEGRATIONS_AVEONLINE.md §6" },
    { status: 405 },
  );
}

/*
 * Webhook Aveonline — recibe actualizaciones de estado de guías.
 *
 * Aveonline NO documenta HMAC. Mitigación (ADR-039, docs/integrations/aveonline.md):
 *   1. Credencial compartida — header `x-aveonline-secret` o `payload.token` (el Token
 *      del registro en el panel Mis integraciones, re-enviado en cada notificación).
 *      La vía legacy `?secret=` en query-string fue retirada definitivamente (SEC-06)
 *      para impedir exposición del secreto en access logs de CDN/proxy y Referer.
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
import { createHash } from "node:crypto";
import { prisma, Prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/client-ip";
import { recordSecurityEvent, SECURITY_EVENT } from "@/lib/security-events";
import { secureEquals } from "@/lib/timing-safe";
import {
  getShippingProvider,
  type WebhookEvent as ShippingWebhookEvent,
} from "@/features/shipping/provider";
import { processTrackingUpdate, type TrackingUpdateResult } from "@/features/orders/saga";
import {
  buildPollShipmentEventInputs,
  recordShipmentEvents,
} from "@/features/shipping/shipment-events";

import { readBodyWithLimit, BodyTooLargeError } from "@/lib/read-body-with-limit";

// LUC-SEC-007 — techo de aplicación para el body del webhook (32 KB; el payload
// documentado son unos pocos KB). El límite de plataforma queda como 2ª capa.
const AVEONLINE_MAX_BODY_BYTES = 32 * 1024;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hashWebhookBody(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex").slice(0, 16);
}

async function readWebhookBody(
  req: Request,
): Promise<{ ok: true; rawBody: string } | { ok: false; response: NextResponse }> {
  try {
    const rawBody = await readBodyWithLimit(req, AVEONLINE_MAX_BODY_BYTES);
    return { ok: true, rawBody };
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      logger.warn({ event: "webhook.aveonline.body_too_large", limit: err.limit });
      return {
        ok: false,
        response: NextResponse.json({ error: "payload too large" }, { status: 413 }),
      };
    }
    logger.warn({
      event: "webhook.aveonline.body_read_fail",
      err: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      response: NextResponse.json({ error: "bad request" }, { status: 400 }),
    };
  }
}

function extractPayloadToken(rawBody: string): string | null {
  try {
    const token = (JSON.parse(rawBody) as { token?: unknown }).token;
    return typeof token === "string" ? token : null;
  } catch {
    // Si el JSON es inválido, el paso de parse posterior responderá 400 tras validar header.
    return null;
  }
}

async function verifyWebhookSecret(req: Request, rawBody: string): Promise<NextResponse | null> {
  // 1) Validar credencial compartida (2 vías seguras — SEC-06):
  //    - header x-aveonline-secret
  //    - payload.token (registro desde el panel Mis integraciones: el Token que
  //      Lucy pega ahí se re-envía en cada notificación — doc webhookEstadosGuias)
  const expected = process.env.AVEONLINE_WEBHOOK_SECRET?.trim();
  if (!expected) {
    logger.warn({ event: "webhook.aveonline.no_secret_configured" });
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
    }
    return null;
  }

  const hasLegacyQueryParam = new URL(req.url).searchParams.has("secret");
  const providedH = req.headers.get("x-aveonline-secret");
  const providedT = extractPayloadToken(rawBody);
  // Comparación en tiempo constante (ADR-062 P1): `!==` filtraba bytes correctos por timing.
  const okH = providedH !== null && secureEquals(providedH, expected);
  const okT = providedT !== null && secureEquals(providedT, expected);
  if (okH || okT) return null;

  const gotH = Boolean(providedH);
  const gotT = Boolean(providedT);
  logger.warn({
    event: "webhook.aveonline.invalid_secret",
    gotQ: hasLegacyQueryParam,
    gotH,
    gotT,
  });
  // F-07 (2026-09-19): persistencia durable del rechazo (fail-open) — alimenta
  // la alerta security_webhook_invalid (≥3 en 5 min, anti replay/sondeo).
  await recordSecurityEvent({
    event: SECURITY_EVENT.WEBHOOK_INVALID_SIGNATURE,
    outcome: "rejected",
    ip: getClientIp(req.headers),
    metadata: {
      source: "aveonline",
      gotQ: hasLegacyQueryParam,
      gotH,
      gotT,
    },
  });
  return NextResponse.json({ error: "invalid secret" }, { status: 401 });
}

async function createAveonlineWebhookRow(
  event: ShippingWebhookEvent,
  rawBody: string,
  externalId: string,
) {
  try {
    return await prisma.webhookEvent.create({
      data: {
        source: "AVEONLINE",
        externalId,
        // Allowlist (LUC-SEC-003): NUNCA persistir fragmentos del body crudo.
        // `payload.token` ES el secreto compartido (autentica la notificación) —
        // guardarlo en rawBodyHead lo replicaba en texto claro en DB y backups.
        // Solo campos operativos + hash truncado para correlación (como en logs).
        payload: {
          trackingNumber: event.trackingNumber,
          status: event.status,
          carrierStatusRaw: event.carrierStatusRaw,
          timestamp: event.timestamp.toISOString(),
          bodyHash: hashWebhookBody(rawBody),
        },
      },
    });
  } catch (err) {
    // Carrera de dedup (certificación 2026-07-29): dos entregas concurrentes del
    // mismo evento pueden pasar el findUnique; el create perdedor revienta P2002
    // por el unique (source, externalId). El ganador está procesando → 200 como
    // duplicado en vez de 500 (que gatillaría reintentos + doble saga).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return null;
    }
    throw err;
  }
}

async function claimAveonlineWebhookEvent(
  event: ShippingWebhookEvent,
  rawBody: string,
): Promise<{ kind: "claimed"; id: string } | { kind: "duplicate"; response: NextResponse }> {
  // 3) Idempotency: dedup por trackingNumber + status + timestamp. Si el payload no trae
  // fecha del carrier, el parse cae a `new Date()` (no determinista — cada entrega generaría
  // un externalId distinto y el dedup no dedup nada, D-4): se usa la clave estable "no-ts".
  const tsKey = event.hasCarrierTimestamp ? String(event.timestamp.getTime()) : "no-ts";
  const externalId = `${event.trackingNumber}-${event.status}-${tsKey}`;
  const existing = await prisma.webhookEvent.findUnique({
    where: { source_externalId: { source: "AVEONLINE", externalId } },
  });
  if (existing?.processedAt) {
    logger.info({ event: "webhook.aveonline.duplicate_skipped", externalId });
    return {
      kind: "duplicate",
      response: NextResponse.json({ ok: true, note: "already processed" }),
    };
  }

  const webhookRow = existing ?? (await createAveonlineWebhookRow(event, rawBody, externalId));
  if (!webhookRow) {
    logger.info({ event: "webhook.aveonline.duplicate_skipped", externalId, race: true });
    return {
      kind: "duplicate",
      response: NextResponse.json({ ok: true, note: "concurrent duplicate, already processing" }),
    };
  }
  return { kind: "claimed", id: webhookRow.id };
}

async function backfillShipmentEventsFromProviderBestEffort(
  orderId: string,
  orderTrackingNumber: string,
  result: TrackingUpdateResult,
): Promise<void> {
  if (!process.env.AVEONLINE_USUARIO || !process.env.AVEONLINE_CLAVE) return;
  try {
    const provider = await getShippingProvider();
    const tracking = await provider.getTracking(orderTrackingNumber);
    const events = buildPollShipmentEventInputs({
      status: tracking.status,
      carrierStatusRaw: tracking.carrierStatusRaw,
      history: tracking.history,
      deliveredAtFallback: result.deliveredAt,
    });
    if (events.length === 0) return;
    await recordShipmentEvents({
      orderId,
      trackingNumber: orderTrackingNumber,
      source: "POLL",
      events,
      guideCreatedAt: result.shipmentClaimedAt,
    });
  } catch (err) {
    logger.warn({
      event: "webhook.aveonline.history_backfill_failed",
      trackingNumber: orderTrackingNumber,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

async function maybeRecordWebhookShipmentEvents(
  event: ShippingWebhookEvent,
  result: TrackingUpdateResult,
): Promise<void> {
  if (!result.orderId || !result.orderTrackingNumber) return;
  const hasStableTimestamp =
    Boolean(event.hasCarrierTimestamp) ||
    event.carrierStatusRaw.trim().toUpperCase() === "GENERADA";
  if (!hasStableTimestamp) {
    // AveCRM envía webhooks sin fecha (`no-ts`, caso real LCM-2026-0006 `ENTREGADA
    // DIGITALIZADA`): en lugar de inventar `new Date()`, consultamos `getTracking`
    // ahí mismo para registrar `historicos[]` con la fecha real de Colombia al
    // instante. Si Aveonline falla transitoriamente, `tracking-sync` converge luego.
    await backfillShipmentEventsFromProviderBestEffort(
      result.orderId,
      result.orderTrackingNumber,
      result,
    );
    return;
  }

  const history =
    event.history.length > 0
      ? event.history
      : [
          {
            status: event.status,
            carrierStatusRaw: event.carrierStatusRaw,
            description: "",
            occurredAt: event.timestamp,
          },
        ];
  await recordShipmentEvents({
    orderId: result.orderId,
    trackingNumber: result.orderTrackingNumber,
    source: "WEBHOOK",
    events: history,
    guideCreatedAt: result.shipmentClaimedAt,
  });
}

async function parseAveonlineWebhookEvent(
  req: Request,
  rawBody: string,
): Promise<{ ok: true; event: ShippingWebhookEvent } | { ok: false; response: NextResponse }> {
  try {
    const provider = await getShippingProvider();
    const event = await provider.handleWebhook(rawBody, Object.fromEntries(req.headers));
    return { ok: true, event };
  } catch (err) {
    logger.error({
      event: "webhook.aveonline.parse_fail",
      err: err instanceof Error ? err.message : String(err),
      // D-5: no raw body excerpt in logs (possible PII) — truncated hash only.
      bodyHash: hashWebhookBody(rawBody),
    });
    return {
      ok: false,
      response: NextResponse.json({ error: "parse failed" }, { status: 400 }),
    };
  }
}

async function runWebhookTrackingSaga(event: ShippingWebhookEvent): Promise<NextResponse | null> {
  try {
    const result = await processTrackingUpdate({
      trackingNumber: event.trackingNumber,
      status: event.status,
      carrierStatusRaw: event.carrierStatusRaw,
      ...(event.hasCarrierTimestamp ? { occurredAt: event.timestamp } : {}),
    });
    logger.info({
      event: "webhook.aveonline.processed",
      sagaResult: result.status,
      orderNumber: result.orderNumber ?? null,
      transitionedTo: result.transitionedTo ?? null,
    });
    await maybeRecordWebhookShipmentEvents(event, result);
    return null;
  } catch (err) {
    logger.error({
      event: "webhook.aveonline.saga_unexpected_error",
      err: err instanceof Error ? err.message : String(err),
    });
    // #8 — ante excepción inesperada de la saga (p.ej. blip de DB), NO sellar processedAt y devolver
    // acá: el evento queda sin procesar → Aveonline reintenta el mismo externalId (ya no se descarta
    // como duplicado) y la alerta webhooks_stuck lo levanta a la hora. Un DELIVERED perdido dejaría
    // de ser irrecuperable. processTrackingUpdate resuelve la orden por trackingNumber internamente.
    return NextResponse.json({ ok: true, note: "saga error, left unprocessed for retry" });
  }
}

export async function POST(req: Request) {
  const bodyRead = await readWebhookBody(req);
  if (!bodyRead.ok) return bodyRead.response;
  const { rawBody } = bodyRead;

  const authFailure = await verifyWebhookSecret(req, rawBody);
  if (authFailure) return authFailure;

  const parsed = await parseAveonlineWebhookEvent(req, rawBody);
  if (!parsed.ok) return parsed.response;
  const { event } = parsed;

  if (!event.trackingNumber) {
    logger.warn({ event: "webhook.aveonline.no_tracking_number" });
    return NextResponse.json({ ok: true, note: "no tracking number in payload" });
  }

  const claim = await claimAveonlineWebhookEvent(event, rawBody);
  if (claim.kind === "duplicate") return claim.response;

  logger.info({
    event: "webhook.aveonline.received",
    trackingNumber: event.trackingNumber,
    status: event.status,
    carrierRaw: event.carrierStatusRaw,
  });

  const retryResponse = await runWebhookTrackingSaga(event);
  if (retryResponse) return retryResponse;

  await prisma.webhookEvent.update({
    where: { id: claim.id },
    data: { processedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json(
    { ok: false, note: "POST only — see docs/integrations/aveonline.md" },
    { status: 405 },
  );
}

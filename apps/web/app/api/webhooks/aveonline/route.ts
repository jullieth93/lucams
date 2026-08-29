/*
 * Webhook Aveonline — recibe actualizaciones de estado de guías.
 *
 * Aveonline NO documenta HMAC. Mitigación (ADR-039 docs/INTEGRATIONS_AVEONLINE §6.2):
 *   1. Credencial compartida — header `x-aveonline-secret` o `payload.token` (el Token
 *      del registro en el panel Mis integraciones, re-enviado en cada notificación).
 *      La vía `?secret=<AVEONLINE_WEBHOOK_SECRET>` solo se acepta durante la transición
 *      con AVEONLINE_ALLOW_QUERY_SECRET=true (default OFF — el secreto por query-string
 *      queda en access logs de CDN/proxy y en el Referer; auditoría D-1).
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
import { secureEquals } from "@/lib/timing-safe";
import { getShippingProvider } from "@/features/shipping/provider";
import { processTrackingUpdate } from "@/features/orders/saga";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  // Leer body primero: del payload puede salir el tercer factor de validación
  // (`token` de la integración — lo re-envía Aveonline en cada notificación).
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

  // 1) Validar credencial compartida (3 vías):
  //    - header x-aveonline-secret
  //    - payload.token (registro desde el panel Mis integraciones: el Token que
  //      Lucy pega ahí se re-envía en cada notificación — doc webhookEstadosGuias)
  //    - ?secret=<AVEONLINE_WEBHOOK_SECRET> — SOLO si AVEONLINE_ALLOW_QUERY_SECRET=true
  //      (transición; el secreto por query viaja en logs de infraestructura, D-1)
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
    const providedT = (() => {
      try {
        const t = (JSON.parse(rawBody) as { token?: unknown }).token;
        return typeof t === "string" ? t : null;
      } catch {
        return null;
      }
    })();
    // Comparación en tiempo constante (ADR-062 P1): `!==` filtraba bytes correctos por timing.
    const okH = providedH != null && secureEquals(providedH, expected);
    // D-1: query-string secret only during the panel migration, explicit opt-in (default
    // OFF). Once Aveonline sends the header/payload token, drop this path entirely.
    const allowQuerySecret = process.env.AVEONLINE_ALLOW_QUERY_SECRET === "true";
    const okQ = allowQuerySecret && providedQ != null && secureEquals(providedQ, expected);
    const okT = providedT != null && secureEquals(providedT, expected);
    if (!okH && !okQ && !okT) {
      logger.warn({
        event: "webhook.aveonline.invalid_secret",
        gotQ: !!providedQ,
        gotH: !!providedH,
        gotT: !!providedT,
      });
      return NextResponse.json({ error: "invalid secret" }, { status: 401 });
    }
    // El secreto por query-string viaja en logs de CDN/proxy y en el Referer → preferir el
    // header o el payload token. ACCIÓN HUMANA: reconfigurar el webhook en Aveonline para que
    // mande el header en vez de ?secret=. Se registra para dar visibilidad al pendiente.
    if (okQ && !okH && !okT) {
      logger.warn({ event: "webhook.aveonline.secret_via_query_string" });
    }
  }

  // 2) Parsear via provider.handleWebhook.
  let event;
  try {
    const provider = await getShippingProvider();
    event = await provider.handleWebhook(rawBody, Object.fromEntries(req.headers));
  } catch (err) {
    logger.error({
      event: "webhook.aveonline.parse_fail",
      err: err instanceof Error ? err.message : String(err),
      // D-5: no raw body excerpt in logs (possible PII) — truncated hash only.
      bodyHash: createHash("sha256").update(rawBody).digest("hex").slice(0, 16),
    });
    return NextResponse.json({ error: "parse failed" }, { status: 400 });
  }

  if (!event.trackingNumber) {
    logger.warn({ event: "webhook.aveonline.no_tracking_number" });
    return NextResponse.json({ ok: true, note: "no tracking number in payload" });
  }

  // 3) Idempotency: dedup por trackingNumber + status + timestamp. Si el payload no trae
  // fecha del carrier, el parse cae a `new Date()` (no determinista — cada entrega generaría
  // un externalId distinto y el dedup no dedup nada, D-4): se usa la clave estable "no-ts".
  const tsKey = event.hasCarrierTimestamp ? String(event.timestamp.getTime()) : "no-ts";
  const externalId = `${event.trackingNumber}-${event.status}-${tsKey}`;
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
    : await (async () => {
        try {
          return await prisma.webhookEvent.create({
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
      })();
  if (!webhookRow) {
    logger.info({ event: "webhook.aveonline.duplicate_skipped", externalId, race: true });
    return NextResponse.json({ ok: true, note: "concurrent duplicate, already processing" });
  }

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
    // #8 — ante excepción inesperada de la saga (p.ej. blip de DB), NO sellar processedAt y devolver
    // acá: el evento queda sin procesar → Aveonline reintenta el mismo externalId (ya no se descarta
    // como duplicado) y la alerta webhooks_stuck lo levanta a la hora. Un DELIVERED perdido dejaría
    // de ser irrecuperable. processTrackingUpdate resuelve la orden por trackingNumber internamente.
    return NextResponse.json({ ok: true, note: "saga error, left unprocessed for retry" });
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

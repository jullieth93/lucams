/*
 * GET /api/health/aveonline — chequea la integración de envíos SIN generar guías.
 *
 * Las credenciales viven cifradas en Vercel y no se pueden auditar leyéndolas. Este endpoint
 * autentica contra Aveonline y reporta qué cuenta responde, para poder distinguir desde fuera:
 *   - modo `test`     → cuenta demo pública, no genera guías reales (correcto en dev/preview);
 *   - modo `production` con cuenta real → listo para despachar;
 *   - modo `production` con cuenta DEMO → la tienda cree que despacha y NO lo hace (status "warn").
 *
 * No se agrega a /api/health/all: cada llamada gasta una autenticación contra un tercero.
 */

import { logger } from "@/lib/logger";
import { InternalError, problemResponse } from "@/lib/errors";
import { probeAveonlineHealth } from "@/features/shipping/aveonline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const start = Date.now();
  try {
    const shipping = await probeAveonlineHealth();
    const latencyMs = Date.now() - start;
    if (!shipping.ok) {
      logger.warn({
        event: "health.aveonline.not_ready",
        mode: shipping.mode,
        detail: shipping.detail,
      });
    }
    return Response.json({
      status: shipping.ok ? "ok" : "warn",
      service: "aveonline",
      check: "auth",
      shipping,
      latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    logger.error({
      event: "health.aveonline.fail",
      latencyMs,
      err: err instanceof Error ? err.message : String(err),
    });
    return problemResponse(new InternalError("Aveonline healthcheck falló."));
  }
}

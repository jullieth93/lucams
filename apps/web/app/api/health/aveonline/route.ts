/*
 * GET /api/health/aveonline — chequea la integración de envíos SIN generar guías.
 *
 * Las credenciales viven cifradas en Vercel y no se pueden auditar leyéndolas. Este endpoint
 * autentica contra Aveonline y reporta qué cuenta responde, para poder distinguir desde fuera:
 *   - modo `test`     → cuenta demo pública, no genera guías reales (correcto en dev/preview);
 *   - modo `production` con cuenta real → listo para despachar;
 *   - modo `production` con cuenta DEMO → la tienda cree que despacha y NO lo hace (status "warn").
 *
 * Se agrega a /api/health/all como check NO bloqueante (2026-08-05): cada llamada gasta una
 * autenticación contra un tercero, amortizada por el rate-limit compartido (30/min por IP).
 */

import { logger } from "@/lib/logger";
import { InternalError, problemResponse } from "@/lib/errors";
import { probeAveonlineHealth } from "@/features/shipping/aveonline";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  // Rate-limit por IP (auditoría experto 2026-07-26): healthcheck público que consulta
  // un tercero o la DB por hit → sin límite era amplificable. 30/min por IP.
  const { allowed } = await rateLimit(`health_aveonline:${getClientIp(req.headers)}`, 30, 60);
  if (!allowed) {
    return new Response(JSON.stringify({ status: "rate_limited" }), {
      status: 429,
      headers: { "content-type": "application/json", "Retry-After": "60" },
    });
  }

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

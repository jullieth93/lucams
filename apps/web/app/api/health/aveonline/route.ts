/*
 * GET /api/health/aveonline — chequea la integración de envíos SIN generar guías.
 *
 * Autentica contra Aveonline sin generar guías. La respuesta pública se limita a
 * `{ status, ok }`; el modo, la cuenta y los detalles de error solo se devuelven
 * con `x-cron-secret` válido. En producción, una cuenta DEMO produce `status: "warn"`.
 *
 * Se agrega a /api/health/all como check NO bloqueante (2026-08-05): cada llamada gasta una
 * autenticación contra un tercero, amortizada por el rate-limit compartido (30/min por IP).
 */

import { logger } from "@/lib/logger";
import { InternalError, problemResponse } from "@/lib/errors";
import { probeAveonlineHealth } from "@/features/shipping/aveonline";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getClientIp } from "@/lib/client-ip";
import { cronSecretOk } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  // Rate-limit por IP (auditoría experto 2026-07-26): healthcheck público que consulta
  // un tercero o la DB por hit → sin límite era amplificable. 30/min por IP.
  const { allowed } = await rateLimit(ipKey("health_aveonline", getClientIp(req.headers)), 30, 60);
  if (!allowed) {
    return new Response(JSON.stringify({ status: "rate_limited", ok: false }), {
      status: 429,
      headers: { "content-type": "application/json", "Retry-After": "60" },
    });
  }

  const includeInternalDetails = cronSecretOk(req.headers.get("x-cron-secret"));
  const start = Date.now();
  try {
    const shipping = await probeAveonlineHealth();
    const latencyMs = Date.now() - start;
    const status = shipping.ok ? "ok" : "warn";
    if (!shipping.ok) {
      logger.warn({
        event: "health.aveonline.not_ready",
        mode: shipping.mode,
        detail: shipping.detail,
      });
    }
    if (!includeInternalDetails) {
      return Response.json({ status, ok: shipping.ok });
    }
    return Response.json({
      status,
      ok: shipping.ok,
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
    if (!includeInternalDetails) {
      return Response.json({ status: "fail", ok: false }, { status: 500 });
    }
    return problemResponse(new InternalError("Aveonline healthcheck falló."));
  }
}

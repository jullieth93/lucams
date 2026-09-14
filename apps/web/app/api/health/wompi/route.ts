/*
 * GET /api/health/wompi — chequea la integración de pagos SIN crear transacciones.
 *
 * La sonda vive en lib/wompi.ts (probeWompiHealth) y se comparte con el panel
 * admin (CF-03): acá solo se agrega rate-limit y el shape HTTP público.
 * Hit liviano a GET /merchants/{publicKey} (doc Wompi: es el endpoint de descubrimiento
 * del comercio — responde 200 si las llaves y el ambiente WOMPI_ENV son coherentes).
 * La respuesta NUNCA incluye llaves: solo el ambiente declarado y la latencia.
 *
 * Si las WOMPI_* no están configuradas (modo catálogo / dev sin pagos en línea), devuelve
 * 200 con status="skipped" — no es un fallo: la tienda vende por cotización (Etapa 1).
 */

import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getClientIp } from "@/lib/client-ip";
import { probeWompiHealth } from "@/lib/wompi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  // Rate-limit por IP (mismo criterio que los demás healthchecks que consultan un tercero):
  // 30/min por IP — holgado para un uptime monitor (típico cada 30-60s).
  const { allowed } = await rateLimit(ipKey("health_wompi", getClientIp(req.headers)), 30, 60);
  if (!allowed) {
    return new Response(JSON.stringify({ status: "rate_limited" }), {
      status: 429,
      headers: { "content-type": "application/json", "Retry-After": "60" },
    });
  }

  const health = await probeWompiHealth();
  const timestamp = new Date().toISOString();

  // Sin WOMPI_* la tienda corre en modo catálogo (venta por cotización): no es un fallo.
  if (health.status === "skipped") {
    return Response.json({
      status: "skipped",
      service: "wompi",
      check: "merchants",
      detail: health.detail,
      latencyMs: health.latencyMs,
      timestamp,
    });
  }
  if (health.status === "fail") {
    return Response.json(
      {
        status: "fail",
        service: "wompi",
        check: "merchants",
        environment: health.env,
        detail: health.detail,
        latencyMs: health.latencyMs,
        timestamp,
      },
      { status: 503 },
    );
  }
  return Response.json({
    status: "ok",
    service: "wompi",
    check: "merchants",
    environment: health.env,
    latencyMs: health.latencyMs,
    timestamp,
  });
}

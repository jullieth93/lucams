/*
 * GET /api/health/wompi — chequea la integración de pagos SIN crear transacciones.
 *
 * Hit liviano a GET /merchants/{publicKey} (doc Wompi: es el endpoint de descubrimiento
 * del comercio — responde 200 si las llaves y el ambiente WOMPI_ENV son coherentes).
 * La respuesta NUNCA incluye llaves: solo el ambiente declarado y la latencia.
 *
 * Si las WOMPI_* no están configuradas (modo catálogo / dev sin pagos en línea), devuelve
 * 200 con status="skipped" — no es un fallo: la tienda vende por cotización (Etapa 1).
 */

import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getClientIp } from "@/lib/client-ip";
import { getWompiConfig } from "@/lib/wompi";

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

  let cfg: ReturnType<typeof getWompiConfig>;
  try {
    cfg = getWompiConfig();
  } catch {
    // Sin WOMPI_* la tienda corre en modo catálogo (venta por cotización): no es un fallo.
    return Response.json({
      status: "skipped",
      service: "wompi",
      check: "merchants",
      detail: "WOMPI_* no configuradas (modo catálogo).",
      latencyMs: 0,
      timestamp: new Date().toISOString(),
    });
  }

  const start = Date.now();
  try {
    const r = await fetch(`${cfg.apiUrl}/merchants/${cfg.publicKey}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    const latencyMs = Date.now() - start;
    if (!r.ok) {
      logger.warn({ event: "health.wompi.http_fail", status: r.status, latencyMs });
      return Response.json(
        {
          status: "fail",
          service: "wompi",
          check: "merchants",
          environment: cfg.env,
          detail: `Wompi devolvió HTTP ${r.status}.`,
          latencyMs,
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      );
    }
    return Response.json({
      status: "ok",
      service: "wompi",
      check: "merchants",
      environment: cfg.env,
      latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    logger.error({
      event: "health.wompi.fail",
      latencyMs,
      err: err instanceof Error ? err.message : String(err),
    });
    // Detalle estático a propósito: el mensaje crudo de red podría arrastrar la URL
    // (que lleva la llave pública embebida).
    return Response.json(
      {
        status: "fail",
        service: "wompi",
        check: "merchants",
        environment: cfg.env,
        detail: "Wompi healthcheck falló (timeout o error de red).",
        latencyMs,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}

/*
 * GET /api/health/resend — chequea Resend API.
 *
 * Hit liviano a GET /domains que retorna 401 si la key es inválida,
 * 200 si todo bien. No envía emails (sería caro y produciría spam).
 *
 * Si RESEND_API_KEY no está seteada (entorno dev sin keys), devolvemos
 * 200 con detail="not configured" — no es un fallo crítico en dev.
 */

import { logger } from "@/lib/logger";
import { InternalError, problemResponse } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const start = Date.now();
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return Response.json({
      status: "skipped",
      service: "resend",
      check: "list-domains",
      detail: "RESEND_API_KEY no configurada (dev local).",
      latencyMs: 0,
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const r = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - start;
    if (!r.ok) {
      logger.warn({ event: "health.resend.http_fail", status: r.status, latencyMs });
      return problemResponse(new InternalError(`Resend devolvió HTTP ${r.status}.`));
    }
    return Response.json({
      status: "ok",
      service: "resend",
      check: "list-domains",
      latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    logger.error({
      event: "health.resend.fail",
      latencyMs,
      err: err instanceof Error ? err.message : String(err),
    });
    return problemResponse(new InternalError("Resend healthcheck falló."));
  }
}

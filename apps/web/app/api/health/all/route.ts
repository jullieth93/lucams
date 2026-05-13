/*
 * GET /api/health/all — agrega los healthchecks individuales y
 * devuelve un solo JSON con el estado completo.
 *
 * 200 si TODOS los servicios críticos están OK (db + storage).
 * 503 si alguno crítico falla. Resend es "warn" pero no bloqueante.
 *
 * Útil para uptime monitors externos (BetterStack, UptimeRobot) que
 * solo aceptan un endpoint para verificar.
 */

import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckResult = {
  service: string;
  status: "ok" | "fail" | "skipped";
  latencyMs?: number;
  detail?: string;
};

async function probe(name: string, path: string, baseUrl: string): Promise<CheckResult> {
  const start = Date.now();
  try {
    const r = await fetch(`${baseUrl}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    const latencyMs = Date.now() - start;
    if (!r.ok) {
      return { service: name, status: "fail", latencyMs, detail: `HTTP ${r.status}` };
    }
    const data = (await r.json()) as { status?: string; latencyMs?: number };
    if (data.status === "skipped") {
      return { service: name, status: "skipped", latencyMs, detail: "no configurado" };
    }
    return { service: name, status: "ok", latencyMs: data.latencyMs ?? latencyMs };
  } catch (err) {
    return {
      service: name,
      status: "fail",
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message.slice(0, 80) : "exception",
    };
  }
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const start = Date.now();

  const [db, storage, resend] = await Promise.all([
    probe("postgres", "/api/health/db", baseUrl),
    probe("storage", "/api/health/storage", baseUrl),
    probe("resend", "/api/health/resend", baseUrl),
  ]);

  const critical = [db, storage];
  const anyCriticalDown = critical.some((c) => c.status === "fail");

  const body = {
    status: anyCriticalDown ? "degraded" : "ok",
    totalLatencyMs: Date.now() - start,
    timestamp: new Date().toISOString(),
    checks: [db, storage, resend],
  };

  if (anyCriticalDown) {
    logger.warn({ event: "health.all.degraded", checks: body.checks });
    return Response.json(body, { status: 503 });
  }
  return Response.json(body);
}

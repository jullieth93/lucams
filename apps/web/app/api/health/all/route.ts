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
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { getTrustedSelfBaseUrl } from "@/lib/origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckResult = {
  service: string;
  status: "ok" | "warn" | "fail" | "skipped";
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
    const data = (await r.json()) as {
      status?: string;
      latencyMs?: number;
      sender?: { detail?: string };
    };
    if (data.status === "skipped") {
      return { service: name, status: "skipped", latencyMs, detail: "no configurado" };
    }
    // "warn" = el servicio responde pero está mal configurado (p.ej. EMAIL_FROM apuntando a un
    // dominio sin verificar). No tumba el health global, pero NO puede reportarse como "ok".
    if (data.status === "warn") {
      return {
        service: name,
        status: "warn",
        latencyMs: data.latencyMs ?? latencyMs,
        detail: data.sender?.detail ?? "configuración incompleta",
      };
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
  // Rate-limit por IP (auditoría 2026-07-13): endpoint público que dispara 3 sub-probes →
  // sin límite era amplificable. 30/min es holgado para un uptime monitor (típico cada 30-60s).
  const { allowed } = await rateLimit(`health_all:${getClientIp(req.headers)}`, 30, 60);
  if (!allowed) {
    return new Response(JSON.stringify({ status: "rate_limited" }), {
      status: 429,
      headers: { "content-type": "application/json", "Retry-After": "60" },
    });
  }

  // ADR-062 — baseUrl de fuente CONFIABLE (env del propio deployment), NO del header Host del
  // request (spoofable → self-fetch a un host arbitrario = SSRF / reporte falso).
  const baseUrl = getTrustedSelfBaseUrl();
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

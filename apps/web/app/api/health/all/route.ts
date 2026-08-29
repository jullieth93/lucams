/*
 * GET /api/health/all — agrega los healthchecks individuales y
 * devuelve un solo JSON con el estado completo.
 *
 * 200 si TODOS los servicios críticos están OK (db + storage).
 * 503 si alguno crítico falla. Resend, Aveonline y Wompi son "warn"/"fail"
 * NO bloqueantes: se reportan en `checks` pero no tumban el status global.
 * `version` y `environment` solo se incluyen si el request trae el header
 * `x-cron-secret` válido (auditoría 2026-08-24, C-3): el SHA exacto del deploy
 * identifica el commit en el repo público — fingerprinting de versión. El
 * monitor externo que quiera saber QUÉ deploy está mirando debe enviar el secreto
 * (UptimeRobot/BetterStack aceptan headers custom).
 *
 * Útil para uptime monitors externos (BetterStack, UptimeRobot) que
 * solo aceptan un endpoint para verificar.
 */

import { timingSafeEqual } from "node:crypto";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
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
      // `manual`: un 3xx aquí NO es el sub-probe, es una interposición (Deployment Protection,
      // portal cautivo). Siguiéndolo se parseaba el HTML del login y salía un críptico
      // "Unexpected token '<'" en vez de decir qué pasó realmente.
      redirect: "manual",
      signal: AbortSignal.timeout(6000),
    });
    const latencyMs = Date.now() - start;
    if (r.status >= 300 && r.status < 400) {
      return {
        service: name,
        status: "fail",
        latencyMs,
        detail: `HTTP ${r.status} — el sub-probe está detrás de una redirección (¿Deployment Protection?)`,
      };
    }
    if (!r.ok) {
      return { service: name, status: "fail", latencyMs, detail: `HTTP ${r.status}` };
    }
    const contentType = r.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      return {
        service: name,
        status: "fail",
        latencyMs,
        detail: `respuesta no-JSON (content-type: ${contentType.split(";")[0] || "desconocido"})`,
      };
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

// Mismo chequeo que las rutas /api/cron/* (comparación en tiempo constante contra CRON_SECRET).
function secretOk(provided: string | null): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request): Promise<Response> {
  // Rate-limit por IP (auditoría 2026-07-13): endpoint público que dispara 5 sub-probes →
  // sin límite era amplificable. 30/min es holgado para un uptime monitor (típico cada 30-60s).
  const { allowed } = await rateLimit(ipKey("health_all", getClientIp(req.headers)), 30, 60);
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

  // Críticos: postgres + storage (tumban el status a 503). El resto se reporta pero no bloquea.
  const [db, storage, resend, aveonline, wompi] = await Promise.all([
    probe("postgres", "/api/health/db", baseUrl),
    probe("storage", "/api/health/storage", baseUrl),
    probe("resend", "/api/health/resend", baseUrl),
    probe("aveonline", "/api/health/aveonline", baseUrl),
    probe("wompi", "/api/health/wompi", baseUrl),
  ]);

  const critical = [db, storage];
  const anyCriticalDown = critical.some((c) => c.status === "fail");

  const body: Record<string, unknown> = {
    status: anyCriticalDown ? "degraded" : "ok",
    totalLatencyMs: Date.now() - start,
    timestamp: new Date().toISOString(),
    checks: [db, storage, resend, aveonline, wompi],
  };

  // Detalle de deploy solo con secreto (C-3): el SHA completo identifica el commit exacto
  // en el repo público. Con el header `x-cron-secret` el monitor sí puede conocerlo.
  if (secretOk(req.headers.get("x-cron-secret"))) {
    body.version = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_GIT_SHA ?? "dev";
    body.environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";
  }

  if (anyCriticalDown) {
    logger.warn({ event: "health.all.degraded", checks: body.checks });
    return Response.json(body, { status: 503 });
  }
  return Response.json(body);
}

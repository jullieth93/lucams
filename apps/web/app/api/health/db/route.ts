/*
 * GET /api/health/db — Postgres connectivity probe via Prisma.
 *
 * Devuelve 200 si Prisma puede ejecutar `SELECT 1` contra la DB. NO consulta
 * tablas del dominio — solo verifica que el pooler responde y que las creds
 * son válidas. Detecta:
 *   - DATABASE_URL / DIRECT_URL malformados o vacíos.
 *   - Supabase proyecto pausado (Free tier tras 1 semana sin actividad).
 *   - Postgres pgBouncer caído.
 *   - Network egress bloqueado (firewall, VPC, etc.).
 *
 * Devuelve 503 con problema RFC 7807 si la conexión falla. La razón concreta
 * va al logger (sin exponer PII / connection strings al cliente).
 *
 * Diseño:
 *   - `force-dynamic` para nunca cachearlo.
 *   - Sin auth (público intencionalmente; no expone info sensible).
 *   - Latencia medida y devuelta para health dashboards.
 *
 * Referencias:
 *   - docs/OBSERVABILITY.md § Healthchecks
 *   - docs/ROADMAP.md Fase 1
 */

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { InternalError, problemResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getClientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  // Rate-limit por IP (auditoría experto 2026-07-26): healthcheck público que consulta
  // un tercero o la DB por hit → sin límite era amplificable. 30/min por IP.
  const { allowed } = await rateLimit(ipKey("health_db", getClientIp(req.headers)), 30, 60);
  if (!allowed) {
    return new Response(JSON.stringify({ status: "rate_limited" }), {
      status: 429,
      headers: { "content-type": "application/json", "Retry-After": "60" },
    });
  }

  const start = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;

    return Response.json({
      status: "ok",
      service: "lucams-shop-web",
      check: "postgres",
      latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    logger.error(
      { event: "health.db.fail", latencyMs, err: err instanceof Error ? err.message : String(err) },
      "Postgres healthcheck failed",
    );
    return problemResponse(new InternalError("Postgres no responde. Revisar logs por requestId."));
  }
}

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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
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

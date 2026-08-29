/*
 * GET /api/health/crons — dead-man switch EXTERNO del pipeline pg_cron (auditoría v3 · #15).
 *
 * Devuelve 503 si algún cron no se ha ejecutado en 2× su intervalo (o nunca), 200 si todos están
 * al día. Pensado para un monitor de uptime EXTERNO gratuito (UptimeRobot/BetterStack) que polee
 * esta ruta cada ~15 min: así se cubre incluso la caída del PROPIO cron de alertas (que la capa
 * interna de evaluateAlerts no puede detectar por sí misma).
 *
 * Respuesta PÚBLICA mínima (auditoría 2026-08-24, C-4): solo { status, timestamp } — los nombres
 * de jobs, lastRunAt y cuáles están desagendados por ambiente son topología operativa interna.
 * El detalle completo (jobs/overdue/disabled) exige el header `x-cron-secret` con el CRON_SECRET
 * (mismo chequeo que las rutas /api/cron/*; los monitores de uptime aceptan headers custom).
 *
 * Jobs desagendados A PROPÓSITO en el ambiente (env CRON_JOBS_DISABLED, comma-separado — ej. los
 * 5 crons de email en STG): se listan en `disabled` (solo con secreto) y NUNCA cuentan como
 * overdue, así el monitor externo no queda en falso degraded eterno.
 *
 * Sin auth (público, como /api/health) para el status agregado. force-dynamic para no cachear.
 */

import { timingSafeEqual } from "node:crypto";
import { getCronHealth } from "@/features/observability/cron-heartbeat";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getClientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";

// Mismo chequeo que las rutas /api/cron/* (comparación en tiempo constante contra CRON_SECRET).
function secretOk(provided: string | null): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request): Promise<Response> {
  // Rate-limit por IP (auditoría experto 2026-07-26): healthcheck público que consulta
  // un tercero o la DB por hit → sin límite era amplificable. 30/min por IP.
  const { allowed } = await rateLimit(ipKey("health_crons", getClientIp(req.headers)), 30, 60);
  if (!allowed) {
    return new Response(JSON.stringify({ status: "rate_limited" }), {
      status: 429,
      headers: { "content-type": "application/json", "Retry-After": "60" },
    });
  }

  const health = await getCronHealth();
  // Los jobs disabled (CRON_JOBS_DISABLED) llegan con overdue=false → el status solo
  // degrada por jobs NO disabled vencidos; los desagendados a propósito se reportan aparte.
  const overdue = health.filter((c) => c.overdue);
  const degraded = overdue.length > 0;

  // Sin secreto: respuesta mínima — alcanza para que el monitor externo alerte (503/200).
  if (!secretOk(req.headers.get("x-cron-secret"))) {
    return Response.json(
      { status: degraded ? "degraded" : "ok", timestamp: new Date().toISOString() },
      { status: degraded ? 503 : 200 },
    );
  }

  const body = {
    status: degraded ? "degraded" : "ok",
    overdue: overdue.map((c) => ({ job: c.job, lastRunAt: c.lastRunAt })),
    disabled: health.filter((c) => c.disabled).map((c) => c.job),
    jobs: health.map((c) => ({
      job: c.job,
      overdue: c.overdue,
      disabled: c.disabled,
      lastRunAt: c.lastRunAt,
    })),
    timestamp: new Date().toISOString(),
  };
  return Response.json(body, { status: degraded ? 503 : 200 });
}

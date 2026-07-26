/*
 * GET /api/health/crons — dead-man switch EXTERNO del pipeline pg_cron (auditoría v3 · #15).
 *
 * Devuelve 503 si algún cron no se ha ejecutado en 2× su intervalo (o nunca), 200 si todos están
 * al día. Pensado para un monitor de uptime EXTERNO gratuito (UptimeRobot/BetterStack) que polee
 * esta ruta cada ~15 min: así se cubre incluso la caída del PROPIO cron de alertas (que la capa
 * interna de evaluateAlerts no puede detectar por sí misma).
 *
 * Sin auth (público, como /api/health): no expone datos sensibles, solo el estado de vida de los
 * jobs. force-dynamic para no cachear.
 */

import { getCronHealth } from "@/features/observability/cron-heartbeat";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  // Rate-limit por IP (auditoría experto 2026-07-26): healthcheck público que consulta
  // un tercero o la DB por hit → sin límite era amplificable. 30/min por IP.
  const { allowed } = await rateLimit(`health_crons:${getClientIp(req.headers)}`, 30, 60);
  if (!allowed) {
    return new Response(JSON.stringify({ status: "rate_limited" }), {
      status: 429,
      headers: { "content-type": "application/json", "Retry-After": "60" },
    });
  }


  const health = await getCronHealth();
  const overdue = health.filter((c) => c.overdue);
  const body = {
    status: overdue.length === 0 ? "ok" : "degraded",
    overdue: overdue.map((c) => ({ job: c.job, lastRunAt: c.lastRunAt })),
    jobs: health.map((c) => ({ job: c.job, overdue: c.overdue, lastRunAt: c.lastRunAt })),
    timestamp: new Date().toISOString(),
  };
  return Response.json(body, { status: overdue.length === 0 ? 200 : 503 });
}

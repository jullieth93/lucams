/*
 * GET /api/health — application liveness probe.
 *
 * Devuelve 200 si el servidor Next.js está corriendo y puede ejecutar código
 * server-side. NO chequea dependencias externas (Postgres, Resend, etc.) —
 * para eso existen `/api/health/db`, los probes por integración
 * (`/api/health/{wompi,aveonline,resend,storage}`) y el agregador `/api/health/all`.
 *
 * Diseño:
 *  - Sin auth (es público intencionalmente).
 *  - `force-dynamic` para evitar caching y devolver siempre el timestamp actual.
 *  - Response sin información sensible — solo prueba de vida. Sin `version`
 *    (SHA del commit) ni `environment` (auditoría 2026-08-24, C-3): el SHA
 *    exacto identifica el commit en el repo público (fingerprinting del
 *    deploy). El detalle de deploy queda en /api/health/all tras `x-cron-secret`.
 *  - Rate-limit 30/min por IP (misma auditoría): era el único healthcheck sin
 *    límite; el coste es trivial pero la política del repo es uniforme.
 *
 * Referencias:
 *  - docs/OBSERVABILITY.md § Healthchecks
 *  - docs/ROADMAP.md Fase 1 (criterio de aceptación)
 */

import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getClientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const { allowed } = await rateLimit(ipKey("health", getClientIp(req.headers)), 30, 60);
  if (!allowed) {
    return new Response(JSON.stringify({ status: "rate_limited" }), {
      status: 429,
      headers: { "content-type": "application/json", "Retry-After": "60" },
    });
  }

  return Response.json({
    status: "ok",
    service: "lucams-shop-web",
    timestamp: new Date().toISOString(),
  });
}

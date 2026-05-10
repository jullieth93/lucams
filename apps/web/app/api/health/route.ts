/*
 * GET /api/health — application liveness probe.
 *
 * Devuelve 200 si el servidor Next.js está corriendo y puede ejecutar código
 * server-side. NO chequea dependencias externas (Postgres, Resend, etc.) —
 * para eso existe `/api/health/db` y `/api/health/integrations` (futuro).
 *
 * Diseño:
 *  - Sin auth (es público intencionalmente).
 *  - `force-dynamic` para evitar caching y devolver siempre el timestamp actual.
 *  - Response sin información sensible — solo prueba de vida.
 *
 * Referencias:
 *  - docs/OBSERVABILITY.md § Healthchecks
 *  - docs/ROADMAP.md Fase 1 (criterio de aceptación)
 */

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({
    status: "ok",
    service: "lucams-shop-web",
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_GIT_SHA ?? "dev",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
  });
}

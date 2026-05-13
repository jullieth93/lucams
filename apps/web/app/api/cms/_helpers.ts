/*
 * Helpers compartidos por endpoints /api/cms/*.
 *
 * - extractIp: lee x-forwarded-for o cae a "unknown".
 * - applyRateLimit: 30 reqs/min por IP — wrapper sobre rateLimit con
 *   key "api-cms:ip:<ip>". Devuelve null si pasa, o Response 429 con
 *   problem details si excede.
 * - withCmsCacheHeaders: agrega Cache-Control público con TTL agresivo
 *   (CMS no cambia segundo a segundo y el cache se invalida via tag
 *   "cms" al publicar desde admin).
 */

import "server-only";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";

export async function extractIp(): Promise<string> {
  const hdrs = await headers();
  return hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 60;

export async function applyRateLimit(ip: string): Promise<Response | null> {
  const result = await rateLimit(`api-cms:ip:${ip}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
  if (result.allowed) return null;
  return Response.json(
    {
      type: "https://lucamsshop.co/errors/rate-limit-exceeded",
      title: "Demasiadas solicitudes",
      status: 429,
      detail: `Excediste el límite de ${RATE_LIMIT} solicitudes por minuto.`,
      retryAfterSeconds: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
    },
    {
      status: 429,
      headers: {
        "Content-Type": "application/problem+json",
        "Retry-After": String(Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)),
      },
    },
  );
}

export function withCmsCacheHeaders(body: object, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      // 5 min browser, 1 h CDN, 1 día stale-while-revalidate. Cache se
      // purga vía updateTag("cms") cuando el admin publica un cambio.
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

/*
 * Helpers compartidos por endpoints /api/cms/*.
 *
 * - extractIp: IP del cliente vía getClientIp(headers) (@/lib/client-ip).
 * - applyRateLimit: 30 reqs/min por IP — wrapper sobre rateLimit con
 *   key "api-cms:ip:<hash-ip>" (IP hasheada, C-8). Devuelve null si pasa,
 *   o Response 429 con problem details si excede.
 * - withCmsCacheHeaders: agrega Cache-Control público con TTL agresivo
 *   (CMS no cambia segundo a segundo y el cache se invalida via tag
 *   "cms" al publicar desde admin).
 */

import "server-only";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getClientIp } from "@/lib/client-ip";

export async function extractIp(): Promise<string> {
  const hdrs = await headers();
  return getClientIp(hdrs);
}

const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 60;

export async function applyRateLimit(ip: string): Promise<Response | null> {
  // IP hasheada en la key (auditoría 2026-08-24, C-8): la IP es dato personal (Ley 1581)
  // y no debe quedar en claro en rate_limit_buckets.
  const result = await rateLimit(ipKey("api-cms", ip), RATE_LIMIT, RATE_WINDOW_SECONDS);
  if (result.allowed) return null;
  return Response.json(
    {
      type: "https://lucamsshop.com/errors/rate-limit-exceeded",
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

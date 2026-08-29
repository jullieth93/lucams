/*
 * /api/vitals — endpoint para Web Vitals RUM reporting.
 *
 * Recibe payload de `useReportWebVitals` (Next.js hook) y persiste
 * en `WebVital` table. /admin/performance lo agrega (Sub-bloque F)
 * para mostrar p50/p75/p95 por route.
 *
 * No requiere auth — el RUM se envía desde cualquier visitante. Pero:
 *   - Validación Zod estricta (sanitiza route + name + rating).
 *   - Rate-limit por sessionId/IP en sub-bloque F.
 *   - userAgent y sessionId quedan opcionales (no PII).
 *   - Sin email ni customerId en este payload (no necesitamos).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getClientIp } from "@/lib/client-ip";

// Endpoint dinámico (no pre-renderizable). En Next 16 con turbopack, los
// route handlers que importan transitivamente pino fallaban al "collect
// page data" durante `next build` con el error críptico:
//   Error: default level:info must be included in custom levels
// Forzar dynamic skipea ese análisis estático.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VitalSchema = z.object({
  name: z.enum(["LCP", "FID", "CLS", "INP", "TTFB", "FCP"]),
  value: z.number().finite(),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  delta: z.number().finite(),
  navType: z
    .enum(["navigate", "reload", "back-forward", "back-forward-cache", "prerender"])
    .optional(),
  // Route normalizada (ej. "/producto/[slug]") — el cliente la pasa.
  route: z
    .string()
    .max(200)
    .regex(/^\/[a-zA-Z0-9/_\-[\]]*$/),
  sessionId: z.string().max(100).optional(),
});

export async function POST(request: Request) {
  try {
    // Rate-limit por IP (auditoría 2026-07-13): endpoint público que escribe WebVital →
    // sin límite era un vector de inflado de la tabla. 120/min es holgado para RUM real.
    // La key lleva la IP hasheada (auditoría 2026-08-24, C-8): la IP es dato personal
    // y no debe quedar en claro en rate_limit_buckets.
    const { allowed } = await rateLimit(ipKey("vitals", getClientIp(request.headers)), 120, 60);
    if (!allowed) return NextResponse.json({ ok: false }, { status: 429 });

    // Backstop global (auditoría 2026-08-24, C-1): tope de filas nuevas sin importar la IP
    // de origen (un botnet rota IPs y multiplica el límite por-IP). Mismo patrón que
    // NEW_ROW_LIMIT de lib/error-capture.ts. 200 (no 429) para que el beacon no reintente.
    const rlGlobal = await rateLimit("vitals:new-row:global", 3000, 5 * 60);
    if (!rlGlobal.allowed) return NextResponse.json({ ok: false });

    const body = await request.json();
    const parsed = VitalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    const ua = request.headers.get("user-agent")?.slice(0, 500) ?? null;
    await prisma.webVital.create({
      data: {
        name: parsed.data.name,
        value: parsed.data.value,
        rating: parsed.data.rating,
        delta: parsed.data.delta,
        navType: parsed.data.navType ?? null,
        route: parsed.data.route,
        sessionId: parsed.data.sessionId ?? null,
        userAgent: ua,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.warn(
      { event: "vitals.persist_fail", err: err instanceof Error ? err.message : String(err) },
      "Failed to persist web vital",
    );
    // Respuesta 200 incluso si fallamos — no queremos que el cliente
    // intente retry y termine spammeando el endpoint.
    return NextResponse.json({ ok: false });
  }
}

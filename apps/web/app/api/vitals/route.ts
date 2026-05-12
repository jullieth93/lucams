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

/*
 * /api/log-error — sink de errores del CLIENTE (Bloque D, sin Sentry — mandato #7).
 *
 * Los error boundaries (app/error.tsx, app/global-error.tsx) hacen POST acá cuando
 * un error client-side los dispara. Persiste en ErrorReport deduplicado por
 * fingerprint (ver lib/error-capture.captureClientError). Complementa
 * instrumentation.onRequestError, que cubre los errores del SERVER (→ ErrorLog).
 *
 * Endpoint público (cualquier visitante puede errar) pero endurecido:
 *   - Validación Zod estricta + límites de tamaño (evita bloat de la tabla).
 *   - Rate-limit por IP (mitiga spam de fingerprints basura).
 *   - Nunca 5xx: si algo falla, 200 { ok:false } para no gatillar retry del cliente.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { captureClientError } from "@/lib/error-capture";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ReportSchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  url: z.string().max(500).optional(),
  digest: z.string().max(200).optional(),
  // De qué boundary vino (solo para diagnóstico; no confiado).
  source: z.enum(["route-error", "global-error"]).optional(),
});

export async function POST(request: Request) {
  try {
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    // Rate-limit por IP: 30/5min — cómodo para un usuario real (varios boundaries
    // en una sesión mala) pero corta el spam automatizado desde una IP. El backstop
    // anti-bloat GLOBAL vive en captureClientError y aplica SOLO a la creación de
    // filas nuevas (no a los incrementos de dedup), para no suprimir la visibilidad
    // de errores legítimos durante un incidente.
    const rlIp = await rateLimit(ipKey("log-error", ip), 30, 5 * 60);
    if (!rlIp.allowed) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    const parsed = ReportSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
    }

    const ua = hdrs.get("user-agent")?.slice(0, 500) ?? undefined;
    await captureClientError({
      message: parsed.data.message,
      stack: parsed.data.stack,
      url: parsed.data.url,
      digest: parsed.data.digest,
      userAgent: ua,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.warn({
      event: "observability.log_error.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    // 200 a propósito: no queremos que el cliente reintente y spamee.
    return NextResponse.json({ ok: false });
  }
}

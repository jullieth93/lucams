/*
 * Cron de solicitud de reseña (palanca de ingreso, auditoría 2026-07-13). Envía el follow-up a
 * pedidos entregados hace 7-30 días sin reseña pedida aún. Protegido por CRON_SECRET (query
 * `?secret=` o header `x-cron-secret`), como los demás crons.
 *
 * Se agenda con pg_cron en Supabase (mandato #11, no Vercel Cron) — SQL en docs/OPERATIONS.md.
 */

import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sendReviewRequests } from "@/features/reviews/review-request-service";
import { logger } from "@/lib/logger";
import { captureServerError } from "@/lib/error-capture";
import { recordCronHeartbeat } from "@/features/observability/cron-heartbeat";

export const dynamic = "force-dynamic";

function secretOk(provided: string | null): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const provided = req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  if (!secretOk(provided)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await sendReviewRequests();
    await recordCronHeartbeat("review-request"); // #15 dead-man switch (solo en éxito)
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error({
      event: "cron.review_request.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    // #16 — que el error del cron caiga en ErrorLog (alimenta errors_spike, resumen y panel);
    // sin esto un cron que revienta a diario respondía 500 en silencio. Best-effort (no lanza).
    await captureServerError({
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      routePath: "/api/cron/review-request",
      routeType: "cron",
    });
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

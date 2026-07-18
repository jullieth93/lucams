/*
 * Cron del resumen diario de operación (Bloque D). Envía a la dueña un email con lo
 * de las últimas 24h. Protegido por CRON_SECRET (header `x-cron-secret` — nunca en la URL, para no filtrarlo en logs).
 *
 * Se agenda con pg_cron en Supabase (no Vercel Cron, mandato #11) — el SQL de
 * agendamiento (8am America/Bogota = 13:00 UTC, vía net.http_get) está en docs/OPERATIONS.md.
 */

import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sendDailySummary } from "@/features/observability/daily-summary";
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
  const provided = req.headers.get("x-cron-secret"); // #14 solo header (?secret= queda en logs)
  if (!secretOk(provided)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await sendDailySummary();
    await recordCronHeartbeat("daily-summary"); // #15 dead-man switch (solo en éxito)
    return Response.json({ ok: true, sent: result.sent, skipped: result.skipped ?? null });
  } catch (err) {
    logger.error({
      event: "cron.daily_summary.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    // #16 — que el error del cron caiga en ErrorLog (alimenta errors_spike, resumen y panel);
    // sin esto un cron que revienta a diario respondía 500 en silencio. Best-effort (no lanza).
    await captureServerError({
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      routePath: "/api/cron/daily-summary",
      routeType: "cron",
    });
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

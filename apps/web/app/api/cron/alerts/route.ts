/*
 * Cron de alertas (Bloque D). Evalúa las reglas y envía email si algo se rompió.
 * Protegido por CRON_SECRET (query `?secret=` o header `x-cron-secret`).
 *
 * Se agenda con pg_cron en Supabase (no Vercel Cron, mandato #11) — el SQL exacto
 * de agendamiento (cada 5 min, vía net.http_get) está en docs/OPERATIONS.md.
 */

import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { dispatchAlerts } from "@/features/observability/alerts";
import { logger } from "@/lib/logger";

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
    const result = await dispatchAlerts();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error({
      event: "cron.alerts.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

/*
 * Cron "avísame cuando vuelva" (palanca de ingreso, auditoría 2026-07-13). Notifica a las
 * suscripciones cuyos productos volvieron a tener stock. Protegido por CRON_SECRET (query
 * `?secret=` o header `x-cron-secret`). Se agenda con pg_cron — SQL en docs/OPERATIONS.md.
 */

import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sendBackInStockNotifications } from "@/features/back-in-stock/service";
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
    const result = await sendBackInStockNotifications();
    await recordCronHeartbeat("back-in-stock"); // #15 dead-man switch (solo en éxito)
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error({
      event: "cron.back_in_stock.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    // #16 — que el error del cron caiga en ErrorLog (alimenta errors_spike, resumen y panel);
    // sin esto un cron que revienta a diario respondía 500 en silencio. Best-effort (no lanza).
    await captureServerError({
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      routePath: "/api/cron/back-in-stock",
      routeType: "cron",
    });
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

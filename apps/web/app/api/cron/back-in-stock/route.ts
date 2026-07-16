/*
 * Cron "avísame cuando vuelva" (palanca de ingreso, auditoría 2026-07-13). Notifica a las
 * suscripciones cuyos productos volvieron a tener stock. Protegido por CRON_SECRET (query
 * `?secret=` o header `x-cron-secret`). Se agenda con pg_cron — SQL en docs/OPERATIONS.md.
 */

import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sendBackInStockNotifications } from "@/features/back-in-stock/service";
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
    const result = await sendBackInStockNotifications();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error({
      event: "cron.back_in_stock.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

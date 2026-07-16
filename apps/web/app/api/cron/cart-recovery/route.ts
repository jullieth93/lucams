/*
 * Cron de recuperación de carrito abandonado (palanca de ingreso, auditoría 2026-07-13). Envía UN
 * recordatorio a carritos con email inactivos ≥4h y detecta conversión. Protegido por CRON_SECRET
 * (query `?secret=` o header `x-cron-secret`), como los demás crons.
 *
 * Se agenda con pg_cron en Supabase (mandato #11) — SQL en docs/OPERATIONS.md.
 */

import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sendCartRecoveryReminders } from "@/features/cart/recovery-service";
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
    const result = await sendCartRecoveryReminders();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error({
      event: "cron.cart_recovery.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

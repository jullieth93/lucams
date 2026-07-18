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
    const result = await sendCartRecoveryReminders();
    await recordCronHeartbeat("cart-recovery"); // #15 dead-man switch (solo en éxito)
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error({
      event: "cron.cart_recovery.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    // #16 — que el error del cron caiga en ErrorLog (alimenta errors_spike, resumen y panel);
    // sin esto un cron que revienta a diario respondía 500 en silencio. Best-effort (no lanza).
    await captureServerError({
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      routePath: "/api/cron/cart-recovery",
      routeType: "cron",
    });
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

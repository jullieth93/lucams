/*
 * Cron de expiración de pedidos WOMPI sin pagar (N-12). Cancela las órdenes
 * paymentMethod=WOMPI en PENDING_PAYMENT más viejas que
 * PENDING_PAYMENT_EXPIRY_HOURS (features/orders/constants.ts) para que no
 * queden basura operativa ni disparen la alerta pending_payment_wompi_stale
 * (que usa el mismo umbral). Protegido por CRON_SECRET, SOLO vía header
 * `x-cron-secret` (`?secret=` NO se acepta: quedaría en logs de acceso — #14),
 * como los demás crons.
 *
 * Se agenda con pg_cron en Supabase — migración 00000000000032 (mismo patrón
 * que el resto de jobs; secretos en el Vault).
 */

import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { expireStalePendingOrders } from "@/features/orders/expire-pending";
import { logger } from "@/lib/logger";
import { captureServerError } from "@/lib/error-capture";
import { recordCronHeartbeat } from "@/features/observability/cron-heartbeat";
import { notifyCronFailure } from "@/features/notifications/service";

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
    const result = await expireStalePendingOrders();
    await recordCronHeartbeat("expire-pending-orders"); // #15 dead-man switch (solo en éxito)
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error({
      event: "cron.expire_pending_orders.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    // #16 — que el error del cron caiga en ErrorLog (alimenta errors_spike, resumen y panel);
    // sin esto un cron que revienta a diario respondía 500 en silencio. Best-effort (no lanza).
    await captureServerError({
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      routePath: "/api/cron/expire-pending-orders",
      routeType: "cron",
    });
    // Centro de notificaciones: el FALLO del cron queda en el feed (los éxitos NO
    // se registran — anti-ruido). Best-effort, nunca lanza.
    await notifyCronFailure("expire-pending-orders", err);
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

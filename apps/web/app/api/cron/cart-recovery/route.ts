/*
 * Cron de recuperación de carrito abandonado (palanca de ingreso, auditoría 2026-07-13).
 * Protegido por CRON_SECRET, SOLO vía header `x-cron-secret` (`?secret=` NO se acepta:
 * quedaría en logs de acceso — #14), como los demás crons.
 *
 * Se agenda con pg_cron en Supabase (mandato #11) — SQL en docs/OPERATIONS.md.
 *
 * Fase 4 (2026-10-13): el schedule pg_cron NO cambia; la CONFIG del módulo
 * (features/cart/recovery-settings.ts, editable en /admin/carritos/configuracion)
 * decide por corrida: módulo apagado o modo "manual" → no envía nada y responde
 * ok con `skippedReason` ("disabled" | "manual"); modo "automatic" → aplica
 * idleHours/maxReminders/intervalHours.
 */

import type { NextRequest } from "next/server";
import { sendCartRecoveryReminders } from "@/features/cart/recovery-service";
import { logger } from "@/lib/logger";
import { captureServerError } from "@/lib/error-capture";
import { recordCronHeartbeat } from "@/features/observability/cron-heartbeat";
import { notifyCronFailure } from "@/features/notifications/service";
import { cronSecretOk } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const provided = req.headers.get("x-cron-secret"); // #14 solo header (?secret= queda en logs)
  if (!cronSecretOk(provided)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await sendCartRecoveryReminders();
    // #15 dead-man switch: el cron CORRIÓ bien (incluye corridas skipped por
    // config — el heartbeat mide que el job está vivo, no que haya enviado).
    await recordCronHeartbeat("cart-recovery");
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
    // Centro de notificaciones (2026-08-05): el FALLO del cron queda en el feed
    // (los éxitos NO se registran — anti-ruido). Best-effort, nunca lanza.
    await notifyCronFailure("cart-recovery", err);
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

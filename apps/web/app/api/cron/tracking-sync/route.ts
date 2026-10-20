/*
 * Cron de respaldo del tracking Aveonline (revalidación 2026-10-20): consulta
 * obtenerEstadoAuth para órdenes con guía activa (FULFILLING/SHIPPED) y alimenta
 * el mismo pipeline del webhook. Cierra la dependencia absoluta del webhook
 * AveCRM: si Aveonline no emite o pierde el evento, la orden igual converge a
 * SHIPPED/DELIVERED (con email de entrega y deliveredAt — ancla del retracto).
 *
 * Protegido por CRON_SECRET, SOLO vía header `x-cron-secret` (`?secret=` NO se
 * acepta: quedaría en logs de acceso — #14), como los demás crons.
 *
 * Se agenda con pg_cron en Supabase — migración 00000000000044 (mismo patrón
 * que el resto de jobs; secretos en el Vault).
 */

import type { NextRequest } from "next/server";
import { syncActiveShipmentTracking } from "@/features/shipping/tracking-sync";
import { logger } from "@/lib/logger";
import { captureServerError } from "@/lib/error-capture";
import { recordCronHeartbeat } from "@/features/observability/cron-heartbeat";
import { notifyCronFailure } from "@/features/notifications/service";
import { cronSecretOk } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
// Hasta 25 guías × (auth + consulta 5 s con retry) secuenciales: presupuesto
// amplio pero acotado; el lote está capado en tracking-sync.ts.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const provided = req.headers.get("x-cron-secret"); // #14 solo header (?secret= queda en logs)
  if (!cronSecretOk(provided)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncActiveShipmentTracking();
    await recordCronHeartbeat("tracking-sync"); // #15 dead-man switch (solo en éxito)
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error({
      event: "cron.tracking_sync.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    await captureServerError({
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      routePath: "/api/cron/tracking-sync",
      routeType: "cron",
    });
    await notifyCronFailure("tracking-sync", err);
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

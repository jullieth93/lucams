/*
 * Cron de retención POST-ENTREGA: purga los bytes pesados (fotos crudas de customer-uploads +
 * renders 300 DPI de production-assets) de los diseños USED_IN_ORDER cuya orden lleva
 * ≥90 días DELIVERED sin retracto ni garantía abierta (feedback Lucy 2026-09-18; Ley 1581,
 * temporalidad/minimización — ver retention-delivered.ts y COMPLIANCE.md). Conserva preview,
 * canvasData, la fila Design y el snapshot del pedido.
 * Protegido por CRON_SECRET (header `x-cron-secret` — nunca en la URL, para no filtrarlo en logs),
 * como los demás crons.
 *
 * Se agenda con pg_cron en Supabase (mandato #11) — SQL versionado en la migración
 * supabase 00000000000035_pgcron_purge_delivered_designs y documentado en docs/OPERATIONS.md.
 */

import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { purgeDeliveredDesignAssets } from "@/features/personalization/retention-delivered";
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
    const result = await purgeDeliveredDesignAssets();
    await recordCronHeartbeat("purge-delivered-designs"); // #15 dead-man switch (solo en éxito)
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error({
      event: "cron.purge_delivered_designs.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    // #16 — que el error del cron caiga en ErrorLog (alimenta errors_spike, resumen y panel);
    // sin esto un cron que revienta a diario respondía 500 en silencio. Best-effort (no lanza).
    await captureServerError({
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      routePath: "/api/cron/purge-delivered-designs",
      routeType: "cron",
    });
    // Centro de notificaciones (2026-08-05): el FALLO del cron queda en el feed
    // (los éxitos NO se registran — anti-ruido). Best-effort, nunca lanza.
    await notifyCronFailure("purge-delivered-designs", err);
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

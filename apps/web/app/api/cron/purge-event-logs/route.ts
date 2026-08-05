/*
 * Cron de retención: purga EmailEvent y WebhookEvent con más de 180 días (auditoría v3 · #10 ·
 * Ley 1581 minimización/retención — ver event-log-retention.ts y COMPLIANCE.md).
 * Protegido por CRON_SECRET (header `x-cron-secret` — nunca en la URL, para no filtrarlo en logs).
 *
 * Se agenda con pg_cron en Supabase (mandato #11) — SQL versionado en la migración de crons HTTP.
 */

import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { purgeExpiredEventLogs } from "@/features/observability/event-log-retention";
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
  const provided = req.headers.get("x-cron-secret");
  if (!secretOk(provided)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await purgeExpiredEventLogs();
    await recordCronHeartbeat("purge-event-logs");
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error({
      event: "cron.purge_event_logs.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    await captureServerError({
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      routePath: "/api/cron/purge-event-logs",
      routeType: "cron",
    });
    // Centro de notificaciones (2026-08-05): el FALLO del cron queda en el feed
    // (los éxitos NO se registran — anti-ruido). Best-effort, nunca lanza.
    await notifyCronFailure("purge-event-logs", err);
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

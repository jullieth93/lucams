/*
 * Cron de retención: purga los diseños DRAFT ANÓNIMOS abandonados y sus fotos del bucket privado
 * customer-uploads (Ley 1581, temporalidad/minimización — ver retention-service.ts y COMPLIANCE.md).
 * Desde 2026-09-18 también purga los DRAFT idle (≥90 días) de clientes LOGUEADOS en la misma
 * corrida (`purgeIdleCustomerDesigns`), y desde 2026-10-08 los READY abandonados que nunca
 * llegaron a pedido (`purgeIdleReadyDesigns`, ADR-130 — cierra la fuga de renders 300-DPI en
 * production-assets que no cubría ninguna retención).
 * Protegido por CRON_SECRET (header `x-cron-secret` — nunca en la URL, para no filtrarlo en logs). como los demás crons.
 *
 * Se agenda con pg_cron en Supabase (mandato #11) — SQL versionado en la migración de crons HTTP y
 * documentado en docs/OPERATIONS.md.
 */

import type { NextRequest } from "next/server";
import {
  purgeAbandonedAnonymousDesigns,
  purgeIdleCustomerDesigns,
  purgeIdleReadyDesigns,
} from "@/features/personalization/retention-service";
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
    const result = await purgeAbandonedAnonymousDesigns();
    // Mismo cron (feedback Lucy 2026-09-18): DRAFTs de logueados sin actividad ≥90 días.
    const idle = await purgeIdleCustomerDesigns();
    // ADR-130 (2026-10-08): READYs abandonados que nunca llegaron a pedido (renders 300-DPI).
    const idleReady = await purgeIdleReadyDesigns();
    await recordCronHeartbeat("purge-anon-designs"); // #15 dead-man switch (solo en éxito)
    return Response.json({
      ok: true,
      ...result,
      idleDesignsPurged: idle.designsPurged,
      idleReadyDesignsPurged: idleReady.designsPurged,
    });
  } catch (err) {
    logger.error({
      event: "cron.purge_anon_designs.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    // #16 — que el error del cron caiga en ErrorLog (alimenta errors_spike, resumen y panel);
    // sin esto un cron que revienta a diario respondía 500 en silencio. Best-effort (no lanza).
    await captureServerError({
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      routePath: "/api/cron/purge-anon-designs",
      routeType: "cron",
    });
    // Centro de notificaciones (2026-08-05): el FALLO del cron queda en el feed
    // (los éxitos NO se registran — anti-ruido). Best-effort, nunca lanza.
    await notifyCronFailure("purge-anon-designs", err);
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

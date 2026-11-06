/*
 * Cron de vigilancia fiscal (ADR-196). Evalúa los umbrales DIAN del año en curso
 * (tope de facturación electrónica y condición de IVA por tarjeta), publica la
 * alerta in-app y dispara el email en los cruces de 90 %/100 %.
 *
 * Protegido por CRON_SECRET (header `x-cron-secret` — nunca en la URL). Se agenda
 * con pg_cron en Supabase (no Vercel Cron, mandato #11): migración
 * supabase/migrations/00000000000055_pgcron_fiscal_watch.sql — diario 12:05 UTC
 * (07:05 COT), antes del resumen matutino de las 08:00.
 */

import type { NextRequest } from "next/server";
import { runFiscalWatch } from "@/features/fiscal-watch/service";
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
    const { snapshot, evaluations } = await runFiscalWatch();
    await recordCronHeartbeat("fiscal-watch"); // #15 dead-man switch (solo en éxito)
    return Response.json({
      ok: true,
      year: snapshot.year,
      levels: evaluations.map((e) => ({ rule: e.ruleId, level: e.level })),
    });
  } catch (err) {
    logger.error({
      event: "cron.fiscal_watch.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    await captureServerError({
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      routePath: "/api/cron/fiscal-watch",
      routeType: "cron",
    });
    // El FALLO del cron queda en el feed (los éxitos NO se registran — anti-ruido).
    await notifyCronFailure("fiscal-watch", err);
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

/*
 * Cron de retención: purga los diseños DRAFT ANÓNIMOS abandonados y sus fotos del bucket privado
 * customer-uploads (Ley 1581, temporalidad/minimización — ver retention-service.ts y COMPLIANCE.md).
 * Protegido por CRON_SECRET (header `x-cron-secret` — nunca en la URL, para no filtrarlo en logs). como los demás crons.
 *
 * Se agenda con pg_cron en Supabase (mandato #11) — SQL versionado en la migración de crons HTTP y
 * documentado en docs/OPERATIONS.md.
 */

import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { purgeAbandonedAnonymousDesigns } from "@/features/personalization/retention-service";
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
    const result = await purgeAbandonedAnonymousDesigns();
    await recordCronHeartbeat("purge-anon-designs"); // #15 dead-man switch (solo en éxito)
    return Response.json({ ok: true, ...result });
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
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

/*
 * Cron de retención: purga los diseños DRAFT ANÓNIMOS abandonados y sus fotos del bucket privado
 * customer-uploads (Ley 1581, temporalidad/minimización — ver retention-service.ts y COMPLIANCE.md).
 * Protegido por CRON_SECRET (query `?secret=` o header `x-cron-secret`), como los demás crons.
 *
 * Se agenda con pg_cron en Supabase (mandato #11) — SQL versionado en la migración de crons HTTP y
 * documentado en docs/OPERATIONS.md.
 */

import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { purgeAbandonedAnonymousDesigns } from "@/features/personalization/retention-service";
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
    const result = await purgeAbandonedAnonymousDesigns();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error({
      event: "cron.purge_anon_designs.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

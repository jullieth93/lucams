/*
 * Cron de publicación programada del CMS (roadmap C3): publica las
 * CmsFieldVersion cuyo publishAt ya venció (Lucy programa desde el editor del
 * campo con «Publicar el…» — útil para campañas: dejar listo el banner de
 * Navidad y que salga solo). Protegido por CRON_SECRET (header
 * `x-cron-secret` — nunca en la URL, para no filtrarlo en logs), como los
 * demás crons.
 *
 * Se agenda con pg_cron en Supabase cada 5 min (mandato #11) — SQL versionado
 * en supabase/migrations/00000000000021_pgcron_cms_publish.sql y documentado
 * en docs/OPERATIONS.md.
 *
 * Cuando publica algo, invalida el tag "cms" (misma invalidación que hace el
 * admin al publicar a mano) para que el storefront sirva el contenido nuevo.
 */

import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { publishScheduledCmsFields } from "@/features/cms/service";
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
    const publishedKeys = await publishScheduledCmsFields();
    if (publishedKeys.length > 0) {
      // Contenido nuevo en el sitio → misma invalidación que el admin
      // ("max" = perfil por defecto, stale-while-revalidate — Next 16 exige
      // el perfil explícito en revalidateTag).
      revalidateTag("cms", "max");
      logger.info({
        event: "cron.cms_publish_scheduled.published",
        count: publishedKeys.length,
        keys: publishedKeys,
      });
    }
    await recordCronHeartbeat("cms-publish-scheduled"); // #15 dead-man switch (solo en éxito)
    return Response.json({ ok: true, published: publishedKeys.length, keys: publishedKeys });
  } catch (err) {
    logger.error({
      event: "cron.cms_publish_scheduled.fail",
      err: err instanceof Error ? err.message : String(err),
    });
    // #16 — que el error del cron caiga en ErrorLog (alimenta errors_spike, resumen y panel).
    await captureServerError({
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      routePath: "/api/cron/cms-publish-scheduled",
      routeType: "cron",
    });
    // Centro de notificaciones (2026-08-05): el FALLO del cron queda en el feed
    // (los éxitos NO se registran — anti-ruido). Best-effort, nunca lanza.
    await notifyCronFailure("cms-publish-scheduled", err);
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

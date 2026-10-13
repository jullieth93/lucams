/*
 * Cron de retención: purga los diseños DRAFT ANÓNIMOS abandonados y sus fotos del bucket privado
 * customer-uploads (Ley 1581, temporalidad/minimización — ver retention-service.ts y COMPLIANCE.md).
 * Desde 2026-09-18 también purga los DRAFT idle (≥90 días) de clientes LOGUEADOS en la misma
 * corrida (`purgeIdleCustomerDesigns`), y desde 2026-10-08 los READY abandonados que nunca
 * llegaron a pedido (`purgeIdleReadyDesigns`, ADR-130 — cierra la fuga de renders 300-DPI en
 * production-assets que no cubría ninguna retención).
 * Desde 2026-10-12 la misma corrida abre con la retención de CARRITOS (features/cart/
 * cart-retention.ts: AbandonedCart ≥90d y carts vivos idle ≥60d / vacíos ≥7d — corre PRIMERO
 * porque liberar el cart viejo destraba la purga normal de sus diseños) y cierra con el
 * BARRIDO DE HUÉRFANOS de Storage (`sweepOrphanStorageObjects`: objetos cuyo Design ya no
 * existe — la fuga de ~316 MB medida en PRD que ninguna purga por-diseño alcanzaba; fase NO
 * fatal: si falla se loguea a ErrorLog pero las purgas legales y el heartbeat ya quedaron).
 * Protegido por CRON_SECRET (header `x-cron-secret` — nunca en la URL, para no filtrarlo en logs). como los demás crons.
 *
 * Se agenda con pg_cron en Supabase (mandato #11) — SQL versionado en la migración de crons HTTP y
 * documentado en docs/OPERATIONS.md. Las fases nuevas (2026-10-12) NO requieren migración pg_cron
 * nueva: corren dentro del job `lucams-purge-anon-designs` ya agendado en ambos ambientes.
 */

import type { NextRequest } from "next/server";
import {
  purgeAbandonedAnonymousDesigns,
  purgeIdleCustomerDesigns,
  purgeIdleReadyDesigns,
  sweepOrphanStorageObjects,
} from "@/features/personalization/retention-service";
import { purgeAbandonedCarts, purgeStaleCarts } from "@/features/cart/cart-retention";
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
    // Carritos PRIMERO (2026-10-12): purgar el cart viejo libera sus diseños del guard de
    // carrito vivo, así las pasadas de diseños de abajo ya los ven purgables en esta corrida.
    const abandoned = await purgeAbandonedCarts();
    const carts = await purgeStaleCarts();
    const result = await purgeAbandonedAnonymousDesigns();
    // Mismo cron (feedback Lucy 2026-09-18): DRAFTs de logueados sin actividad ≥90 días.
    const idle = await purgeIdleCustomerDesigns();
    // ADR-130 (2026-10-08): READYs abandonados que nunca llegaron a pedido (renders 300-DPI).
    const idleReady = await purgeIdleReadyDesigns();
    // Red de fondo (2026-10-12): objetos de Storage cuyo Design ya no existe. NO es fatal:
    // cruza al schema `storage` (fuera de las tablas de la app), así que un fallo de
    // permisos/pooler NO debe tumbar las purgas legales de arriba ni el heartbeat — se loguea
    // y queda en ErrorLog (lo recoge la alerta errors_spike) y el próximo ciclo reintenta
    // (el objeto sigue en storage.objects).
    let orphans = { scanned: 0, orphansDeleted: 0, orphansFailed: 0 };
    let orphanSweepError: string | null = null;
    try {
      orphans = await sweepOrphanStorageObjects();
    } catch (sweepErr) {
      orphanSweepError = sweepErr instanceof Error ? sweepErr.message : String(sweepErr);
      logger.error({ event: "cron.purge_anon_designs.orphan_sweep_fail", err: orphanSweepError });
      await captureServerError({
        message: `orphan-sweep: ${orphanSweepError}`,
        stack: sweepErr instanceof Error ? sweepErr.stack : undefined,
        routePath: "/api/cron/purge-anon-designs",
        routeType: "cron",
      });
    }
    await recordCronHeartbeat("purge-anon-designs"); // #15 dead-man switch (solo en éxito)
    return Response.json({
      ok: true,
      ...result,
      idleDesignsPurged: idle.designsPurged,
      idleReadyDesignsPurged: idleReady.designsPurged,
      abandonedCartsPurged: abandoned.abandonedPurged,
      cartsPurged: carts.cartsPurged,
      orphanObjectsScanned: orphans.scanned,
      orphanObjectsDeleted: orphans.orphansDeleted,
      orphanObjectsFailed: orphans.orphansFailed,
      orphanSweepError,
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

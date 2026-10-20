/*
 * Polling de respaldo del tracking Aveonline (cron /api/cron/tracking-sync).
 *
 * Por qué existe (brecha #1 de la revalidación 2026-10-20): el tracking depende
 * 100% del webhook AveCRM. Si Aveonline no lo emite, lo pierde tras sus
 * reintentos, o el evento llega con una guía que no matchea (caso real
 * LCM-2026-0001: el webhook trae la guía SIN ceros a la izquierda y el match
 * exacto fallaba), la orden queda FULFILLING/SHIPPED para siempre — sin
 * DELIVERED, sin email de entrega, sin `deliveredAt` (ancla legal del retracto,
 * Ley 1480) y sin arranque de la conciliación COD.
 *
 * Este job consulta `obtenerEstadoAuth` (ShippingProvider.getTracking) para las
 * órdenes con guía activa y alimenta el MISMO pipeline del webhook
 * (processTrackingUpdate — monotónico, idempotente, con sus mismos side
 * effects: emails de despacho/entrega, flags de reconciliación). Es la red de
 * convergencia: aunque el webhook falle, la orden termina en el estado real.
 *
 * Acotado: máx TRACKING_SYNC_BATCH órdenes por corrida (las más viejas primero),
 * ignora guías internas de «Envío Lucams» (INTERNO-*, no existen en Aveonline),
 * guías muy viejas (ya resueltas o devueltas por fuera) y el modo catálogo.
 * Errores por guía se toleran y cuentan; el cron solo revienta si falla lo
 * estructural (DB, auth global) — igual que los demás /api/cron/*.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isCatalogMode } from "@/lib/store-mode";
import { getShippingProvider } from "@/features/shipping/provider";
import { processTrackingUpdate } from "@/features/orders/saga";

const TRACKING_SYNC_BATCH = 25;
// Una guía viva típica dura días; >90 días activa es un caso ya resuelto a mano.
const TRACKING_SYNC_MAX_AGE_DAYS = 90;

export type TrackingSyncResult = {
  checked: number;
  transitioned: number;
  failed: number;
  skippedReason?: string;
};

export async function syncActiveShipmentTracking(): Promise<TrackingSyncResult> {
  if (isCatalogMode()) {
    return { checked: 0, transitioned: 0, failed: 0, skippedReason: "catalog_mode" };
  }
  if (!process.env.AVEONLINE_USUARIO || !process.env.AVEONLINE_CLAVE) {
    return { checked: 0, transitioned: 0, failed: 0, skippedReason: "not_configured" };
  }

  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      status: { in: ["FULFILLING", "SHIPPED"] },
      trackingNumber: { not: null },
      NOT: { trackingNumber: { startsWith: "INTERNO-" } },
      createdAt: { gte: new Date(Date.now() - TRACKING_SYNC_MAX_AGE_DAYS * 86_400_000) },
    },
    select: { id: true, number: true, trackingNumber: true },
    orderBy: { updatedAt: "asc" }, // las que llevan más tiempo sin actualización, primero
    take: TRACKING_SYNC_BATCH,
  });

  let transitioned = 0;
  let failed = 0;
  for (const order of orders) {
    const trackingNumber = order.trackingNumber!;
    try {
      const provider = await getShippingProvider();
      const tracking = await provider.getTracking(trackingNumber);
      if (tracking.status === "PENDING") continue; // sin novedad real del carrier
      const result = await processTrackingUpdate({
        trackingNumber,
        status: tracking.status,
        carrierStatusRaw: tracking.carrierStatusRaw,
      });
      if (result.status === "ok") transitioned += 1;
    } catch (err) {
      failed += 1;
      logger.warn({
        event: "shipping.tracking_sync.guide_failed",
        orderNumber: order.number,
        trackingNumber,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info({
    event: "shipping.tracking_sync.done",
    checked: orders.length,
    transitioned,
    failed,
  });
  return { checked: orders.length, transitioned, failed };
}

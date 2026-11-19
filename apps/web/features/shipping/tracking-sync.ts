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
 * ignora guías internas de «Envío Lucams» (INTERNO-*, no existen en Aveonline) y
 * guías muy viejas (ya resueltas o devueltas por fuera).
 * Errores por guía se toleran y cuentan; el cron solo revienta si falla lo
 * estructural (DB, auth global) — igual que los demás /api/cron/*.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getShippingProvider } from "@/features/shipping/provider";
import { processTrackingUpdate } from "@/features/orders/saga";
import { recordShipmentEvents } from "@/features/shipping/shipment-events";

const TRACKING_SYNC_BATCH = 25;
// Una guía viva típica dura días; >90 días activa es un caso ya resuelto a mano.
const TRACKING_SYNC_MAX_AGE_DAYS = 90;

export type TrackingSyncResult = {
  checked: number;
  transitioned: number;
  failed: number;
  skippedReason?: string;
};

function buildLatestCarrierIncidentContext(
  latest: { description?: string; clarification?: string; timestamp?: Date } | undefined,
): {
  carrierDescription?: string;
  carrierClarification?: string;
  occurredAt?: Date;
} {
  if (!latest) return {};
  return {
    ...(latest.description ? { carrierDescription: latest.description } : {}),
    ...(latest.clarification ? { carrierClarification: latest.clarification } : {}),
    ...(latest.timestamp ? { occurredAt: latest.timestamp } : {}),
  };
}

async function syncSingleOrderGuide(order: {
  id: string;
  number: string;
  trackingNumber: string;
  shipmentClaimedAt: Date | null;
}): Promise<boolean> {
  const provider = await getShippingProvider();
  const tracking = await provider.getTracking(order.trackingNumber);
  // Historial granular del carrier → ShipmentEvent (2026-11-04). El polling es la
  // fuente que trae DESCRIPCIONES (`historicos[].descripcion`) y hace backfill de
  // hitos que el webhook no entregó; dedup cross-source por minuto (best-effort).
  // `?? []`: proveedores/mocks sin historial son válidos (sin historial, sin hitos).
  const history = tracking.history ?? [];
  if (history.length > 0) {
    await recordShipmentEvents({
      orderId: order.id,
      trackingNumber: order.trackingNumber,
      source: "POLL",
      events: history.map((h) => ({
        carrierStatusRaw: h.status,
        description: h.description,
        clarification: h.clarification,
        occurredAt: h.timestamp,
      })),
      guideCreatedAt: order.shipmentClaimedAt,
    });
  }
  if (tracking.status === "PENDING") return false; // sin novedad real del carrier

  const result = await processTrackingUpdate({
    trackingNumber: order.trackingNumber,
    status: tracking.status,
    carrierStatusRaw: tracking.carrierStatusRaw,
    ...buildLatestCarrierIncidentContext(history[0]),
  });
  return result.status === "ok";
}

export async function syncActiveShipmentTracking(): Promise<TrackingSyncResult> {
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
    select: { id: true, number: true, trackingNumber: true, shipmentClaimedAt: true },
    orderBy: { updatedAt: "asc" }, // las que llevan más tiempo sin actualización, primero
    take: TRACKING_SYNC_BATCH,
  });

  let transitioned = 0;
  let failed = 0;
  for (const order of orders) {
    if (!order.trackingNumber) continue;
    try {
      const didTransition = await syncSingleOrderGuide({
        id: order.id,
        number: order.number,
        trackingNumber: order.trackingNumber,
        shipmentClaimedAt: order.shipmentClaimedAt,
      });
      if (didTransition) transitioned += 1;
    } catch (err) {
      failed += 1;
      logger.warn({
        event: "shipping.tracking_sync.guide_failed",
        orderNumber: order.number,
        trackingNumber: order.trackingNumber,
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

import "server-only";

/*
 * Persistencia del historial granular del carrier (`ShipmentEvent`, 2026-11-04).
 *
 * Fuentes: webhook Aveonline (`source: "WEBHOOK"`, payload `estado:[...]` con fecha)
 * y polling de respaldo `cron/tracking-sync` (`source: "POLL"`, `historicos[]` con
 * `fechamostrar` + `descripcion`). Ambas llaman acá DESPUÉS de procesar el estado.
 *
 * Invariantes:
 *  - IDEMPOTENTE cross-source: el dedupKey (guía + estado mapeado + minuto del evento
 *    + estado crudo normalizado) es el mismo venga del webhook o del polling, así que
 *    reintentos, re-entregas y el solape webhook↔cron NO duplican filas
 *    (`createMany skipDuplicates` — Postgres lo resuelve con ON CONFLICT DO NOTHING).
 *  - BEST-EFFORT PURO: jamás lanza — una falla de persistencia del historial no puede
 *    romper la saga de tracking (los estados de Order ya quedaron procesados).
 *  - CERO PII: solo hitos logísticos del carrier (sin nombres, direcciones ni cédulas).
 */

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { mapAveonlineStatus } from "@/features/shipping/aveonline";

export type ShipmentEventInput = {
  /** Estado crudo del carrier ("ENTREGADA", "EN REPARTO"...). */
  carrierStatusRaw: string;
  /** Descripción operativa del carrier (vacía en eventos de webhook). */
  description?: string;
  occurredAt: Date;
};

const TRACKING_STATUS = [
  "PENDING",
  "DISPATCHED",
  "IN_TRANSIT",
  "DELIVERED",
  "RETURNED",
  "EXCEPTION",
] as const;
type TrackingStatusValue = (typeof TRACKING_STATUS)[number];

function normalizeCarrierStatus(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, " ");
}

/**
 * Clave de deduplicación cross-source. El minuto (no el segundo) absorbe las
 * diferencias de parseo entre `fecha` (webhook) y `fechamostrar` (polling) del
 * MISMO evento físico reportado por ambas vías.
 */
export function buildShipmentEventDedupKey(input: {
  trackingNumber: string;
  carrierStatusRaw: string;
  occurredAt: Date;
}): string {
  const minuteBucket = Math.floor(input.occurredAt.getTime() / 60_000);
  return [
    input.trackingNumber,
    mapAveonlineStatus(input.carrierStatusRaw),
    minuteBucket,
    normalizeCarrierStatus(input.carrierStatusRaw),
  ].join("|");
}

/**
 * Inserta los hitos del carrier para una orden, ignorando duplicados.
 * Devuelve cuántas filas nuevas quedaron persistidas. Nunca lanza.
 */
export async function recordShipmentEvents(input: {
  orderId: string;
  trackingNumber: string;
  source: "WEBHOOK" | "POLL";
  events: ShipmentEventInput[];
}): Promise<number> {
  if (!input.events.length) return 0;
  try {
    const rows = input.events
      .filter((ev) => ev.carrierStatusRaw.trim().length > 0)
      .map((ev) => {
        const mapped: TrackingStatusValue = mapAveonlineStatus(ev.carrierStatusRaw);
        return {
          orderId: input.orderId,
          trackingNumber: input.trackingNumber,
          status: TRACKING_STATUS.includes(mapped) ? mapped : "PENDING",
          carrierStatusRaw: ev.carrierStatusRaw.trim().slice(0, 120),
          description: (ev.description ?? "").trim().slice(0, 500),
          occurredAt: ev.occurredAt,
          source: input.source,
          dedupKey: buildShipmentEventDedupKey({
            trackingNumber: input.trackingNumber,
            carrierStatusRaw: ev.carrierStatusRaw,
            occurredAt: ev.occurredAt,
          }),
        };
      });
    if (!rows.length) return 0;
    const result = await prisma.shipmentEvent.createMany({ data: rows, skipDuplicates: true });
    return result.count;
  } catch (err) {
    logger.warn({
      event: "shipping.shipment_events.persist_fail",
      orderId: input.orderId,
      trackingNumber: input.trackingNumber,
      source: input.source,
      err: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

/** Hitos de la guía de una orden, cronológicos ascendente, para el timeline cliente/admin. */
export async function listShipmentEvents(orderId: string) {
  return prisma.shipmentEvent.findMany({
    where: { orderId },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      status: true,
      carrierStatusRaw: true,
      description: true,
      occurredAt: true,
      source: true,
    },
  });
}

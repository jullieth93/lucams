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
import { logger, scrubPii } from "@/lib/logger";
import { mapAveonlineStatus } from "@/features/shipping/aveonline";

export type ShipmentEventInput = {
  /** Estado crudo del carrier ("ENTREGADA", "EN REPARTO"...). */
  carrierStatusRaw: string;
  /** Descripción operativa del carrier (vacía en eventos de webhook). */
  description?: string;
  /** Aclaración operativa adicional del carrier (`historicos[].aclaracion` en polling). */
  clarification?: string;
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
  return raw.trim().toUpperCase().split(/\s+/).join(" ");
}

/**
 * Extrae y sanea la descripción + aclaración operativa de Aveonline sin códigos
 * internos de mensajero (`"18:30 : NOMBRE: 2986 ACLARACION:por tiempo"` → `"por tiempo"`),
 * produciendo un texto limpio y veraz tanto para `/admin/pedidos/[number]` como para
 * `/pedido/[token]`.
 */
export function formatCarrierEventDescription(
  description?: string,
  clarification?: string,
): string {
  const cleanDesc = description ? scrubPii(description.trim().split(/\s+/).join(" ")) : "";
  let cleanClar = "";
  if (clarification) {
    const rawClar = clarification.trim().split(/\s+/).join(" ");
    const match = /ACLARACI[OÓ]N\s*:\s*(.+)$/i.exec(rawClar);
    const extracted = match ? match[1].trim() : rawClar;
    cleanClar = scrubPii(extracted);
  }
  if (cleanDesc && cleanClar) {
    if (cleanDesc.toLowerCase().includes(cleanClar.toLowerCase())) {
      return cleanDesc.slice(0, 500);
    }
    return `${cleanDesc} (${cleanClar})`.slice(0, 500);
  }
  return (cleanDesc || cleanClar).slice(0, 500);
}

/**
 * Clave de deduplicación cross-source. El minuto (no el segundo) absorbe las
 * diferencias de parseo entre `fecha` (webhook) y `fechamostrar` (polling) del
 * MISMO evento físico reportado por ambas vías.
 *
 * Excepción `GENERADA` (2026-11-05, caso LCM-2026-0004): la guía la creamos NOSOTROS
 * vía API en el minuto de la compra (`Order.shipmentClaimedAt`), pero el carrier la
 * registra en su sistema horas después y reporta el hito con ESA hora. Si la clave
 * llevara el minuto, el mismo hito lógico duplicaría filas (una por cada hora
 * reportada). GENERADA ocurre exactamente una vez por guía → clave estable sin tiempo.
 */
export function buildShipmentEventDedupKey(input: {
  trackingNumber: string;
  carrierStatusRaw: string;
  occurredAt: Date;
}): string {
  const normalizedRaw = normalizeCarrierStatus(input.carrierStatusRaw);
  if (normalizedRaw === "GENERADA") {
    return `${input.trackingNumber}|GENERADA`;
  }
  const minuteBucket = Math.floor(input.occurredAt.getTime() / 60_000);
  return [
    input.trackingNumber,
    mapAveonlineStatus(input.carrierStatusRaw),
    minuteBucket,
    normalizedRaw,
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
  /**
   * Instante real en que NOSOTROS creamos la guía vía API (`Order.shipmentClaimedAt`).
   * Si el carrier reporta GENERADA con una hora posterior (lo registra en su sistema
   * horas después), el hito se ancla a la hora de creación real — más verdadera y
   * consistente con el momento de la compra (caso LCM-2026-0004).
   */
  guideCreatedAt?: Date | null;
}): Promise<number> {
  if (!input.events.length) return 0;
  try {
    // Registra TODOS los hitos reales del carrier con su fecha verdadera en hora
    // Colombia (`parseAveonlineDate`), incluyendo tanto novedades operativas de ruta
    // (`EXCEPTION` / `NOVEDAD`) como devoluciones confirmadas (`RETURNED`). Gracias al
    // parseo determinista de `DD/MM/YYYY HH:mm`, cada hito genera exactamente 1 fila.
    const rows = input.events
      .filter((ev) => ev.carrierStatusRaw.trim().length > 0)
      .map((ev) => {
        const mapped: TrackingStatusValue = mapAveonlineStatus(ev.carrierStatusRaw);
        const isGenerated = normalizeCarrierStatus(ev.carrierStatusRaw) === "GENERADA";
        const occurredAt =
          isGenerated &&
          input.guideCreatedAt &&
          input.guideCreatedAt.getTime() < ev.occurredAt.getTime()
            ? input.guideCreatedAt
            : ev.occurredAt;
        return {
          orderId: input.orderId,
          trackingNumber: input.trackingNumber,
          status: TRACKING_STATUS.includes(mapped) ? mapped : "PENDING",
          carrierStatusRaw: ev.carrierStatusRaw.trim().slice(0, 120),
          description: formatCarrierEventDescription(ev.description, ev.clarification),
          occurredAt,
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
    if (input.source === "POLL" && result.count < rows.length) {
      await enrichExistingEmptyDescriptions(rows);
    }
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

async function enrichExistingEmptyDescriptions(
  rows: Array<{ dedupKey: string; description: string }>,
): Promise<void> {
  const withDescription = rows.filter((r) => r.description.length > 0);
  for (const row of withDescription) {
    await prisma.shipmentEvent.updateMany({
      where: { dedupKey: row.dedupKey, description: "" },
      data: { description: row.description },
    });
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

/**
 * "EN BODEGA DESTINO" → "En bodega destino". Humaniza el estado crudo del carrier
 * para el timeline del cliente cuando el evento no trae descripción (2026-11-05:
 * antes se mostraba la etiqueta genérica «Guía registrada» en TODOS los hitos sin
 * descripción, escondiendo el avance real del paquete).
 */
export function humanizeCarrierStatus(raw: string): string {
  const clean = raw.trim().replaceAll(/\s+/g, " ").toLowerCase();
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Etiqueta amigable para el cliente de los estados crudos conocidos del carrier
 * (2026-11-05, feedback owner: «En bodega destino» leía como "no ha salido" cuando
 * en realidad significa "llegó a tu ciudad, falta el reparto final"). Estados no
 * conocidos caen a `humanizeCarrierStatus`. La verdad logística no se altera.
 */
export function friendlyCarrierEventLabel(raw: string): string {
  const normalized = normalizeCarrierStatus(raw);
  const FRIENDLY: Record<string, string> = {
    GENERADA: "Guía generada con la transportadora",
    PRODUCIDA: "Guía generada con la transportadora",
    "MERCANCIA RECOGIDA": "Paquete recogido por la transportadora",
    "EN BODEGA ORIGEN": "En bodega de la ciudad de origen",
    "EN BODEGA DESTINO": "Llegó a la bodega de tu ciudad — pronto sale a reparto",
    "EN DESPACHO": "Despachado de nuestra tienda",
    DESPACHADA: "Despachado de nuestra tienda",
    "EN REPARTO": "En reparto hacia tu dirección",
    "EN TRANSITO": "En tránsito hacia tu ciudad",
    "EN TRÁNSITO": "En tránsito hacia tu ciudad",
    ENTREGADA: "Entregado",
    ENTREGADO: "Entregado",
    "ENTREGADA DIGITALIZADA": "Entregado",
    NOVEDAD: "Novedad operativa en reparto",
    "EN NOVEDAD": "Novedad operativa en reparto",
    EXCEPCION: "Novedad operativa en reparto",
    EXCEPCIÓN: "Novedad operativa en reparto",
    DEVUELTA: "Devuelto a origen",
    DEVUELTO: "Devuelto a origen",
    DEVOLUCION: "Devuelto a origen",
    DEVOLUCIÓN: "Devuelto a origen",
  };
  return FRIENDLY[normalized] ?? humanizeCarrierStatus(raw);
}

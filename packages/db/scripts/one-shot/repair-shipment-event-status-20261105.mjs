/*
 * one-shot 2026-11-05 — Repara `ShipmentEvent.status` y `dedupKey` tras la ampliación
 * de `mapAveonlineStatus` (fix PRD pedido LCM-2026-0004: "MERCANCIA RECOGIDA",
 * "EN BODEGA ORIGEN/DESTINO" quedaron persistidos como PENDING porque el mapper no
 * los conocía; el pedido quedó en "Preparando" y el cliente sin email «En camino»).
 *
 * Qué hace: para cada fila cuyo `status` difiere del mapeo actual de su
 * `carrierStatusRaw`, recalcula `status` y `dedupKey` (la clave embebe el estado
 * mapeado). Si la clave nueva ya existe (el cron ya insertó el evento bien mapeado),
 * BORRA la fila obsoleta en vez de duplicar.
 *
 * Fuente de verdad del mapeo: apps/web/features/shipping/aveonline.ts
 * (`mapAveonlineStatus`) — esta copia local debe mantenerse idéntica.
 *
 * Uso (dry-run por defecto; --apply escribe):
 *   cd packages/db && npx dotenv -e ../../.env.local -- node scripts/one-shot/repair-shipment-event-status-20261105.mjs
 *   cd packages/db && npx dotenv -e ../../.env.local -- node scripts/one-shot/repair-shipment-event-status-20261105.mjs --apply
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

const apply = process.argv.includes("--apply");
if (apply) {
  assertDestructiveAllowed("repair-shipment-event-status-20261105.mjs --apply");
}

// Copia ESPEJO de mapAveonlineStatus (apps/web/features/shipping/aveonline.ts, 2026-11-05).
function mapAveonlineStatus(raw) {
  const s = String(raw ?? "").toUpperCase();
  if (s.includes("ENTREGAD")) return "DELIVERED";
  if (s.includes("DEVUELT") || s.includes("DEVOLUC") || s.includes("RETORN")) return "RETURNED";
  if (s.includes("NOVEDAD") || s.includes("EXCEPCI")) return "EXCEPTION";
  if (s.includes("ANULAD") || s.includes("CANCEL")) return "EXCEPTION";
  if (
    s.includes("REPARTO") ||
    s.includes("TRANSITO") ||
    s.includes("TRÁNSITO") ||
    s.includes("CAMINO") ||
    s.includes("BODEGA") ||
    s.includes("CENTRO LOG") ||
    s.includes("RUTA") ||
    s.includes("SALIO") ||
    s.includes("SALIÓ")
  )
    return "IN_TRANSIT";
  if (
    s.includes("DESPACHO") ||
    s.includes("DESPACHAD") ||
    s.includes("ADMITID") ||
    s.includes("PRODUCIDA") ||
    s.includes("RECOGID")
  )
    return "DISPATCHED";
  return "PENDING";
}

function normalizeCarrierStatus(raw) {
  return String(raw ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function dedupKey(trackingNumber, carrierStatusRaw, occurredAt) {
  const minuteBucket = Math.floor(new Date(occurredAt).getTime() / 60_000);
  return [
    trackingNumber,
    mapAveonlineStatus(carrierStatusRaw),
    minuteBucket,
    normalizeCarrierStatus(carrierStatusRaw),
  ].join("|");
}

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

try {
  const rows = await prisma.shipmentEvent.findMany({
    select: {
      id: true,
      trackingNumber: true,
      status: true,
      carrierStatusRaw: true,
      occurredAt: true,
      dedupKey: true,
    },
  });

  let toFix = 0;
  let fixed = 0;
  let removedDupes = 0;
  for (const row of rows) {
    const mapped = mapAveonlineStatus(row.carrierStatusRaw);
    const newKey = dedupKey(row.trackingNumber, row.carrierStatusRaw, row.occurredAt);
    if (mapped === row.status && newKey === row.dedupKey) continue;
    toFix += 1;
    console.log(
      `  · ${row.trackingNumber} "${row.carrierStatusRaw}": ${row.status} → ${mapped}` +
        (newKey === row.dedupKey ? "" : " (dedupKey cambia)"),
    );
    if (!apply) continue;
    try {
      await prisma.shipmentEvent.update({
        where: { id: row.id },
        data: { status: mapped, dedupKey: newKey },
      });
      fixed += 1;
    } catch (err) {
      // P2002: ya existe una fila con la clave nueva → la obsoleta sobra.
      if (err?.code === "P2002") {
        await prisma.shipmentEvent.delete({ where: { id: row.id } });
        removedDupes += 1;
      } else {
        throw err;
      }
    }
  }

  console.log(
    `\n${apply ? "APLICADO" : "DRY-RUN"}: ${toFix} filas por reparar · ${fixed} actualizadas · ${removedDupes} duplicadas eliminadas\n`,
  );
  if (apply && toFix > 0 && fixed + removedDupes !== toFix) {
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}

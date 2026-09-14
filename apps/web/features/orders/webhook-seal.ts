/*
 * N-13 — Sellado de webhooks resueltos manualmente.
 *
 * La alerta `webhooks_stuck` (features/observability/alerts.ts) dispara cuando
 * hay WebhookEvent con processedAt NULL por más de 1 hora. Eso pasa, p.ej.,
 * cuando la saga revienta procesando un APPROVED (el route devuelve 200 SIN
 * sellar a propósito — ver app/api/webhooks/wompi/route.ts, caso #14) y Lucy
 * resuelve a mano con "Generar guía Aveonline" (retryShipmentAction). El
 * problema: tras la resolución manual el evento seguía sin processedAt → la
 * alerta quedaba prendiendo para siempre sobre algo ya resuelto.
 *
 * Este módulo sella (processedAt = now) los eventos SIN PROCESAR relacionados
 * con una orden ya resuelta. Relación (payloads reales que escriben los routes):
 *   - WOMPI: payload.data.transaction.id === order.wompiTransactionId
 *     (el route guarda el evento Wompi completo como payload).
 *   - AVEONLINE: payload.trackingNumber === order.trackingNumber
 *     (el route guarda { trackingNumber, status, carrierStatusRaw, ... }).
 *
 * El payload se lee con guards estrictos (es Json libre: puede venir de
 * versiones viejas o de tests con otra forma) — un payload sin la forma
 * esperada simplemente no matchea. Si la orden no tiene wompiTransactionId ni
 * trackingNumber (nunca se relacionó con un provider) no se sella nada.
 *
 * Idempotente y race-safe: el updateMany va gateado con processedAt: null —
 * si el consumer real selló el evento entre nuestra lectura y el update, no
 * pisamos su timestamp.
 */

import "server-only";
import { prisma, Prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/** Extrae payload.data.transaction.id de un evento WOMPI, con guards estrictos. */
function extractWompiTransactionId(payload: Prisma.JsonValue): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const data = (payload as Record<string, unknown>).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const tx = (data as Record<string, unknown>).transaction;
  if (!tx || typeof tx !== "object" || Array.isArray(tx)) return null;
  const id = (tx as Record<string, unknown>).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** Extrae payload.trackingNumber de un evento AVEONLINE, con guards estrictos. */
function extractAveonlineTrackingNumber(payload: Prisma.JsonValue): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const tn = (payload as Record<string, unknown>).trackingNumber;
  return typeof tn === "string" && tn.length > 0 ? tn : null;
}

/**
 * Sella los WebhookEvent sin procesar relacionados con la orden. Devuelve
 * cuántos selló. No lanza si la orden no existe (devuelve 0): el caller
 * (retryShipmentAction) ya tiene la orden validada; un 0 silencioso + log es
 * mejor que reventar la action tras una resolución exitosa.
 */
export async function sealManuallyResolvedWebhookEvents(
  orderId: string,
): Promise<{ sealed: number }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: { id: true, number: true, wompiTransactionId: true, trackingNumber: true },
  });
  if (!order) return { sealed: 0 };

  const ids = new Set<string>();

  if (order.wompiTransactionId) {
    const pending = await prisma.webhookEvent.findMany({
      where: { source: "WOMPI", processedAt: null },
      select: { id: true, payload: true },
    });
    for (const ev of pending) {
      if (extractWompiTransactionId(ev.payload) === order.wompiTransactionId) ids.add(ev.id);
    }
  }

  if (order.trackingNumber) {
    const pending = await prisma.webhookEvent.findMany({
      where: { source: "AVEONLINE", processedAt: null },
      select: { id: true, payload: true },
    });
    for (const ev of pending) {
      if (extractAveonlineTrackingNumber(ev.payload) === order.trackingNumber) ids.add(ev.id);
    }
  }

  if (ids.size === 0) return { sealed: 0 };

  // Gateado por processedAt: null — no pisar el sello del consumer real si ganó la carrera.
  const res = await prisma.webhookEvent.updateMany({
    where: { id: { in: [...ids] }, processedAt: null },
    data: { processedAt: new Date() },
  });
  logger.info({
    event: "order.webhooks.sealed_manual_resolution",
    orderId: order.id,
    orderNumber: order.number,
    sealed: res.count,
  });
  return { sealed: res.count };
}

/*
 * Integración PostgreSQL — ShipmentEvent (historial granular del carrier, 2026-11-04).
 *
 * Certifica las invariantes del timeline enriquecido de /pedido/[token]:
 *  1. Persistencia real de hitos con fecha del carrier y descripción.
 *  2. Idempotencia: re-ejecutar la MISMA fuente no duplica filas (skipDuplicates).
 *  3. Dedup CROSS-SOURCE: el mismo evento reportado por webhook Y por polling en el
 *     mismo minuto produce UNA sola fila (la fuente difiere, la clave no).
 *  4. Best-effort: eventos vacíos o sin estado crudo son no-op seguros.
 */

import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  buildShipmentEventDedupKey,
  listShipmentEvents,
  recordShipmentEvents,
} from "./shipment-events";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `shev${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

describe.skipIf(!hasDb)("ShipmentEvent — persistencia e idempotencia cross-source", () => {
  let orderId = "";
  const trackingNumber = `${RUN}-GUIA`;

  afterAll(async () => {
    if (!orderId) return;
    await prisma.shipmentEvent.deleteMany({ where: { orderId } }).catch(() => {});
    await prisma.order.deleteMany({ where: { id: orderId } }).catch(() => {});
  });

  it("persiste hitos y los lista cronológicos", async () => {
    const order = await prisma.order.create({
      data: {
        number: `${RUN}-1`,
        email: `${RUN}@lucams.test`,
        phone: "3001112233",
        shippingAddress: { fullName: "Test", city: "Bogotá", department: "Bogotá D.C." },
        subtotal: 10_000,
        shipping: 0,
        total: 10_000,
        paymentMethod: "WOMPI",
        status: "SHIPPED",
        trackingNumber,
      },
      select: { id: true },
    });
    orderId = order.id;

    const inserted = await recordShipmentEvents({
      orderId,
      trackingNumber,
      source: "WEBHOOK",
      events: [
        { carrierStatusRaw: "PRODUCIDA", occurredAt: new Date("2026-11-03T13:00:00.000Z") },
        { carrierStatusRaw: "EN REPARTO", occurredAt: new Date("2026-11-04T14:30:00.000Z") },
      ],
    });
    expect(inserted).toBe(2);

    const events = await listShipmentEvents(orderId);
    expect(events).toHaveLength(2);
    expect(events[0].carrierStatusRaw).toBe("PRODUCIDA");
    expect(events[1].carrierStatusRaw).toBe("EN REPARTO");
    expect(events[0].occurredAt < events[1].occurredAt).toBe(true);
  });

  it("re-ejecutar la misma fuente es no-op (0 filas nuevas)", async () => {
    const again = await recordShipmentEvents({
      orderId,
      trackingNumber,
      source: "WEBHOOK",
      events: [
        { carrierStatusRaw: "PRODUCIDA", occurredAt: new Date("2026-11-03T13:00:00.000Z") },
        { carrierStatusRaw: "EN REPARTO", occurredAt: new Date("2026-11-04T14:30:00.000Z") },
      ],
    });
    expect(again).toBe(0);
    expect(await prisma.shipmentEvent.count({ where: { orderId } })).toBe(2);
  });

  it("el MISMO evento vía polling en el mismo minuto NO duplica (dedup cross-source)", async () => {
    // El polling reporta "EN REPARTO" con 20 segundos de diferencia y con descripción.
    const fromPoll = await recordShipmentEvents({
      orderId,
      trackingNumber,
      source: "POLL",
      events: [
        {
          carrierStatusRaw: "EN REPARTO",
          description: "Tu paquete está en reparto en Bogotá",
          occurredAt: new Date("2026-11-04T14:30:20.000Z"),
        },
      ],
    });
    expect(fromPoll).toBe(0); // mismo minuto + mismo estado → misma dedupKey
    expect(await prisma.shipmentEvent.count({ where: { orderId } })).toBe(2);

    // Un evento NUEVO del polling (con descripción) sí se persiste.
    const newEvent = await recordShipmentEvents({
      orderId,
      trackingNumber,
      source: "POLL",
      events: [
        {
          carrierStatusRaw: "ENTREGADA",
          description: "Entregado a portería",
          occurredAt: new Date("2026-11-04T16:04:43.000Z"),
        },
      ],
    });
    expect(newEvent).toBe(1);
    const events = await listShipmentEvents(orderId);
    expect(events).toHaveLength(3);
    expect(events[2].description).toBe("Entregado a portería");
    expect(events[2].source).toBe("POLL");
  });

  it("best-effort: lista vacía o sin estado crudo es no-op sin lanzar", async () => {
    await expect(
      recordShipmentEvents({ orderId, trackingNumber, source: "POLL", events: [] }),
    ).resolves.toBe(0);
    await expect(
      recordShipmentEvents({
        orderId,
        trackingNumber,
        source: "POLL",
        events: [{ carrierStatusRaw: "   ", occurredAt: new Date() }],
      }),
    ).resolves.toBe(0);
    expect(await prisma.shipmentEvent.count({ where: { orderId } })).toBe(3);
  });

  it("la dedupKey es estable y cross-source por minuto", () => {
    const a = buildShipmentEventDedupKey({
      trackingNumber: "G1",
      carrierStatusRaw: "Entregada",
      occurredAt: new Date("2026-11-04T16:04:43.000Z"),
    });
    const b = buildShipmentEventDedupKey({
      trackingNumber: "G1",
      carrierStatusRaw: "  ENTREGADA ",
      occurredAt: new Date("2026-11-04T16:04:05.000Z"), // mismo minuto
    });
    expect(a).toBe(b);
    const otroMinuto = buildShipmentEventDedupKey({
      trackingNumber: "G1",
      carrierStatusRaw: "ENTREGADA",
      occurredAt: new Date("2026-11-04T16:05:00.000Z"),
    });
    expect(otroMinuto).not.toBe(a);
  });
});

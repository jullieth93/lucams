/*
 * Tests unitarios del polling de respaldo de tracking Aveonline
 * (features/shipping/tracking-sync.ts — cron /api/cron/tracking-sync).
 *
 * Cobertura: gates (sin credenciales), selección de órdenes
 * (solo FULFILLING/SHIPPED con guía, nunca INTERNO-* ni muy viejas), alimentación
 * del pipeline del webhook (processTrackingUpdate) y tolerancia a errores por
 * guía (una guía mala no tira el lote). Todo mockeado: NO pega a Aveonline ni a DB.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  getTracking: vi.fn(),
  processTrackingUpdate: vi.fn(),
  recordShipmentEvents: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: { order: { findMany: mocks.findMany } } }));

vi.mock("@/features/shipping/provider", () => ({
  getShippingProvider: async () => ({ name: "aveonline" as const, getTracking: mocks.getTracking }),
}));

vi.mock("@/features/orders/saga", () => ({
  processTrackingUpdate: mocks.processTrackingUpdate,
}));

vi.mock("@/features/shipping/shipment-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/shipping/shipment-events")>();
  return {
    ...actual,
    recordShipmentEvents: mocks.recordShipmentEvents,
  };
});

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { syncActiveShipmentTracking } from "./tracking-sync";

const { findMany, getTracking, processTrackingUpdate, recordShipmentEvents } = mocks;

describe("syncActiveShipmentTracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AVEONLINE_USUARIO = "demo";
    process.env.AVEONLINE_CLAVE = "demo";
  });

  it("sin credenciales Aveonline → skippedReason not_configured", async () => {
    delete process.env.AVEONLINE_USUARIO;
    const res = await syncActiveShipmentTracking();
    expect(res.skippedReason).toBe("not_configured");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("sondea guías activas (FULFILLING/SHIPPED) y DELIVERED recientes sin hito DELIVERED, excluyendo INTERNO-* y >90d", async () => {
    findMany.mockResolvedValue([]);
    await syncActiveShipmentTracking();
    const where = findMany.mock.calls[0][0].where;
    expect(where.trackingNumber).toEqual({ not: null });
    expect(where.NOT).toEqual({ trackingNumber: { startsWith: "INTERNO-" } });
    expect(where.createdAt.gte).toBeInstanceOf(Date);
    expect(where.OR).toEqual([
      { status: { in: ["FULFILLING", "SHIPPED"] } },
      {
        status: "DELIVERED",
        deliveredAt: { gte: expect.any(Date) },
        shipmentEvents: { none: { status: "DELIVERED" } },
      },
    ]);
  });

  it("orden ya DELIVERED por webhook no-ts → hace backfill de ShipmentEvent sin re-disparar processTrackingUpdate", async () => {
    const deliveredAt = new Date("2026-11-19T19:09:59.000Z");
    findMany.mockResolvedValue([
      {
        id: "o-del",
        number: "LCM-2026-0006",
        status: "DELIVERED",
        deliveredAt,
        trackingNumber: "014165715442",
        shipmentClaimedAt: new Date("2026-11-15T03:23:54.000Z"),
      },
    ]);
    getTracking.mockResolvedValue({
      trackingNumber: "014165715442",
      status: "DELIVERED",
      carrierStatusRaw: "ENTREGADA DIGITALIZADA",
      history: [],
    });

    const res = await syncActiveShipmentTracking();

    expect(recordShipmentEvents).toHaveBeenCalledWith({
      orderId: "o-del",
      trackingNumber: "014165715442",
      source: "POLL",
      events: [
        {
          carrierStatusRaw: "ENTREGADA DIGITALIZADA",
          description: "",
          occurredAt: deliveredAt,
        },
      ],
      guideCreatedAt: new Date("2026-11-15T03:23:54.000Z"),
    });
    expect(processTrackingUpdate).not.toHaveBeenCalled();
    expect(res).toMatchObject({ checked: 1, transitioned: 0, failed: 0 });
  });

  it("guía con estado real alimenta processTrackingUpdate con el trackingNumber PERSISTIDO", async () => {
    findMany.mockResolvedValue([
      { id: "o1", number: "LCM-2026-0001", trackingNumber: "014164727329" },
    ]);
    getTracking.mockResolvedValue({
      trackingNumber: "014164727329",
      status: "IN_TRANSIT",
      carrierStatusRaw: "EN REPARTO",
      history: [],
    });
    processTrackingUpdate.mockResolvedValue({ status: "ok", transitionedTo: "SHIPPED" });

    const res = await syncActiveShipmentTracking();

    expect(processTrackingUpdate).toHaveBeenCalledWith({
      trackingNumber: "014164727329", // la forma almacenada, no la del carrier
      status: "IN_TRANSIT",
      carrierStatusRaw: "EN REPARTO",
    });
    expect(res).toMatchObject({ checked: 1, transitioned: 1, failed: 0 });
  });

  it("estado PENDING del carrier → no alimenta la saga (sin novedad)", async () => {
    findMany.mockResolvedValue([{ id: "o1", number: "LCM-X", trackingNumber: "123" }]);
    getTracking.mockResolvedValue({
      trackingNumber: "123",
      status: "PENDING",
      carrierStatusRaw: "GENERADA",
      history: [],
    });
    const res = await syncActiveShipmentTracking();
    expect(processTrackingUpdate).not.toHaveBeenCalled();
    expect(res).toMatchObject({ checked: 1, transitioned: 0, failed: 0 });
  });

  it("una guía que revienta no tira el lote: cuenta failed y sigue con la siguiente", async () => {
    findMany.mockResolvedValue([
      { id: "o1", number: "LCM-A", trackingNumber: "111" },
      { id: "o2", number: "LCM-B", trackingNumber: "222" },
    ]);
    getTracking.mockRejectedValueOnce(new Error("Aveonline tracking: La guia no existe"));
    getTracking.mockResolvedValueOnce({
      trackingNumber: "222",
      status: "DELIVERED",
      carrierStatusRaw: "ENTREGADA",
      history: [],
    });
    processTrackingUpdate.mockResolvedValue({ status: "ok", transitionedTo: "DELIVERED" });

    const res = await syncActiveShipmentTracking();

    expect(res).toMatchObject({ checked: 2, transitioned: 1, failed: 1 });
    expect(processTrackingUpdate).toHaveBeenCalledTimes(1);
    expect(processTrackingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ trackingNumber: "222", status: "DELIVERED" }),
    );
  });
});

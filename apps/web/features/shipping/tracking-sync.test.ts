/*
 * Tests unitarios del polling de respaldo de tracking Aveonline
 * (features/shipping/tracking-sync.ts — cron /api/cron/tracking-sync).
 *
 * Cobertura: gates (modo catálogo / sin credenciales), selección de órdenes
 * (solo FULFILLING/SHIPPED con guía, nunca INTERNO-* ni muy viejas), alimentación
 * del pipeline del webhook (processTrackingUpdate) y tolerancia a errores por
 * guía (una guía mala no tira el lote). Todo mockeado: NO pega a Aveonline ni a DB.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  getTracking: vi.fn(),
  processTrackingUpdate: vi.fn(),
  isCatalogMode: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: { order: { findMany: mocks.findMany } } }));

vi.mock("@/features/shipping/provider", () => ({
  getShippingProvider: async () => ({ name: "aveonline" as const, getTracking: mocks.getTracking }),
}));

vi.mock("@/features/orders/saga", () => ({
  processTrackingUpdate: mocks.processTrackingUpdate,
}));

vi.mock("@/lib/store-mode", () => ({ isCatalogMode: mocks.isCatalogMode }));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { syncActiveShipmentTracking } from "./tracking-sync";

const { findMany, getTracking, processTrackingUpdate, isCatalogMode } = mocks;

describe("syncActiveShipmentTracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isCatalogMode.mockReturnValue(false);
    process.env.AVEONLINE_USUARIO = "demo";
    process.env.AVEONLINE_CLAVE = "demo";
  });

  it("modo catálogo → skippedReason catalog_mode, sin llamar a DB ni provider", async () => {
    isCatalogMode.mockReturnValue(true);
    const res = await syncActiveShipmentTracking();
    expect(res.skippedReason).toBe("catalog_mode");
    expect(findMany).not.toHaveBeenCalled();
    expect(getTracking).not.toHaveBeenCalled();
  });

  it("sin credenciales Aveonline → skippedReason not_configured", async () => {
    delete process.env.AVEONLINE_USUARIO;
    const res = await syncActiveShipmentTracking();
    expect(res.skippedReason).toBe("not_configured");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("solo sondea órdenes con guía activa: FULFILLING/SHIPPED, excluye INTERNO-* y guías >90d", async () => {
    findMany.mockResolvedValue([]);
    await syncActiveShipmentTracking();
    const where = findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ["FULFILLING", "SHIPPED"] });
    expect(where.trackingNumber).toEqual({ not: null });
    expect(where.NOT).toEqual({ trackingNumber: { startsWith: "INTERNO-" } });
    expect(where.createdAt.gte).toBeInstanceOf(Date);
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

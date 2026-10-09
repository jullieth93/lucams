/*
 * Unit tests de claimGuestOrdersForCustomer (E2, 2026-10-07): al verificar el
 * email (OTP del signup) o en el login, las órdenes GUEST hechas con ese correo
 * (customerId null + email equals insensitive + deletedAt null) se vinculan al
 * Customer — antes nunca aparecían en /mi-cuenta/pedidos.
 *
 * Reglas bajo test:
 *  - updateMany con el filtro exacto (guest + email insensitive + no borradas).
 *  - Bonus: adopta los Designs de las órdenes claimadas (customerId null →
 *    customerId) para que "repetir pedido" pueda clonarlos; nunca toca un
 *    Design que YA tiene dueño.
 *  - Sin órdenes que claimar → 0 y NO consulta designs.
 *  - logger.info con el conteo claimado.
 *
 * Sin DB: prisma mockeado (mismo patrón que emails.test.ts).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  orderUpdateMany: vi.fn(async () => ({ count: 0 })),
  orderItemFindMany: vi.fn(async () => [] as Array<{ designId: string | null }>),
  designUpdateMany: vi.fn(async () => ({ count: 0 })),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    order: { updateMany: state.orderUpdateMany },
    orderItem: { findMany: state.orderItemFindMany },
    design: { updateMany: state.designUpdateMany },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { claimGuestOrdersForCustomer } from "./claim-guest-orders";
import { logger } from "@/lib/logger";

beforeEach(() => {
  vi.clearAllMocks();
  state.orderUpdateMany.mockResolvedValue({ count: 0 });
  state.orderItemFindMany.mockResolvedValue([]);
  state.designUpdateMany.mockResolvedValue({ count: 0 });
});

describe("claimGuestOrdersForCustomer", () => {
  it("clama las órdenes guest del email: customerId null + equals insensitive + deletedAt null", async () => {
    state.orderUpdateMany.mockResolvedValue({ count: 2 });

    const count = await claimGuestOrdersForCustomer("cust_1", "  Ana@X.co ");

    expect(count).toBe(2);
    expect(state.orderUpdateMany).toHaveBeenCalledWith({
      where: {
        customerId: null,
        email: { equals: "Ana@X.co", mode: "insensitive" },
        deletedAt: null,
      },
      data: { customerId: "cust_1" },
    });
  });

  it("loguea el conteo claimado (order.guest_claim)", async () => {
    state.orderUpdateMany.mockResolvedValue({ count: 3 });

    await claimGuestOrdersForCustomer("cust_1", "ana@x.co");

    expect(logger.info).toHaveBeenCalledWith({
      event: "order.guest_claim",
      customerId: "cust_1",
      count: 3,
    });
  });

  it("sin órdenes guest (count 0) → devuelve 0 y NO consulta designs ni loguea", async () => {
    const count = await claimGuestOrdersForCustomer("cust_1", "ana@x.co");

    expect(count).toBe(0);
    expect(state.orderItemFindMany).not.toHaveBeenCalled();
    expect(state.designUpdateMany).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("bonus: adopta los Designs de las órdenes claimadas (solo los que siguen sin dueño)", async () => {
    state.orderUpdateMany.mockResolvedValue({ count: 1 });
    state.orderItemFindMany.mockResolvedValue([
      { designId: "des_a" },
      { designId: null }, // línea sin personalización: se ignora
      { designId: "des_a" }, // duplicado: se dedup
      { designId: "des_b" },
    ]);
    state.designUpdateMany.mockResolvedValue({ count: 2 });

    await claimGuestOrdersForCustomer("cust_1", "ana@x.co");

    // Solo los items de órdenes YA claimadas (mismo filtro de email) y con diseño.
    expect(state.orderItemFindMany).toHaveBeenCalledWith({
      where: {
        order: {
          customerId: "cust_1",
          email: { equals: "ana@x.co", mode: "insensitive" },
          deletedAt: null,
        },
        designId: { not: null },
      },
      select: { designId: true },
    });
    // Dedup + sin nulls; el filtro customerId:null garantiza no robar diseños ajenos.
    expect(state.designUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["des_a", "des_b"] }, customerId: null },
      data: { customerId: "cust_1" },
    });
    expect(logger.info).toHaveBeenCalledWith({
      event: "order.guest_claim.designs_adopted",
      customerId: "cust_1",
      count: 2,
    });
  });

  it("órdenes claimadas pero sin diseños → no hace el updateMany de designs", async () => {
    state.orderUpdateMany.mockResolvedValue({ count: 1 });
    state.orderItemFindMany.mockResolvedValue([{ designId: null }]);

    await claimGuestOrdersForCustomer("cust_1", "ana@x.co");

    expect(state.designUpdateMany).not.toHaveBeenCalled();
  });
});

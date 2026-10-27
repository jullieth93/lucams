/*
 * Unit tests de awardRetroactivePointsForNewCustomer (2026-10-26 — decisión
 * owner): al crear/verificar la cuenta con el MISMO email de compras guest de
 * los últimos 30 días, se acreditan los puntos de las órdenes PAID sin EARN.
 *
 * Sin DB: prisma mockeado. computeEarnedPoints es el REAL (el cálculo es el
 * contrato). La idempotencia real contra el índice único (orderId,"EARN") se
 * cubre en service.integration.test.ts; acá se prueba la lógica: filtros del
 * query, skip de órdenes ya acreditadas, P2002 como no-op por orden y que un
 * fallo de DB NUNCA rompe el registro (best-effort, devuelve 0).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, loyaltySettings, MockPrismaClientKnownRequestError } = vi.hoisted(() => {
  class MockPrismaClientKnownRequestError extends Error {
    constructor(
      message: string,
      public code: string,
    ) {
      super(message);
      this.name = "PrismaClientKnownRequestError";
    }
  }
  const prisma = {
    order: {
      findMany: vi.fn(async (_args?: unknown) => [] as Array<Record<string, unknown>>),
    },
    loyaltyTxn: {
      findMany: vi.fn(async () => [] as Array<{ orderId: string }>),
      create: vi.fn(async () => ({})),
    },
    customer: { update: vi.fn(async () => ({})) },
    $transaction: vi.fn(),
  };
  return {
    prisma,
    MockPrismaClientKnownRequestError,
    loyaltySettings: {
      current: {
        enabled: true,
        earnCopPerPoint: 1_000,
        redeemPointsPer1000: 100,
        redeemMinPoints: 100,
        redeemMaxPercent: 50,
        expirationEnabled: false,
        expirationDays: 365,
      },
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/db", () => ({
  prisma,
  Prisma: { PrismaClientKnownRequestError: MockPrismaClientKnownRequestError },
}));
vi.mock("@/features/loyalty/settings", () => ({
  getLoyaltySettings: vi.fn(async () => loyaltySettings.current),
}));

import { awardRetroactivePointsForNewCustomer, RETROACTIVE_EARN_WINDOW_DAYS } from "./service";

const INPUT = { customerId: "cust_new", email: "Comprador@Test.co" };

beforeEach(() => {
  vi.clearAllMocks();
  loyaltySettings.current.enabled = true;
  prisma.order.findMany.mockResolvedValue([]);
  prisma.loyaltyTxn.findMany.mockResolvedValue([]);
  prisma.loyaltyTxn.create.mockResolvedValue({});
  prisma.customer.update.mockResolvedValue({});
  // La tx interactiva ejecuta el callback con el mismo prisma mockeado.
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
    fn(prisma),
  );
});

describe("awardRetroactivePointsForNewCustomer", () => {
  it("acredita EARN por orden PAID elegible y suma el balance en la misma tx", async () => {
    prisma.order.findMany.mockResolvedValue([
      { id: "ord_1", number: "LCM-2026-0001", total: 5_990_000 }, // 59 pts
      { id: "ord_2", number: "LCM-2026-0002", total: 2_000_000 }, // 20 pts
    ]);

    const awarded = await awardRetroactivePointsForNewCustomer(INPUT);

    expect(awarded).toBe(79);
    expect(prisma.loyaltyTxn.create).toHaveBeenCalledTimes(2);
    expect(prisma.loyaltyTxn.create).toHaveBeenCalledWith({
      data: { customerId: "cust_new", delta: 59, reason: "EARN", orderId: "ord_1" },
    });
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: "cust_new" },
      data: { loyaltyPoints: { increment: 79 - 59 } },
    });
  });

  it("el query exige email exacto case-insensitive, estados PAID+, ventana de 30 días y nunca órdenes de OTRO customer", async () => {
    await awardRetroactivePointsForNewCustomer(INPUT);

    const args = prisma.order.findMany.mock.calls[0]?.[0] as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: any;
    };
    const where = args.where;
    expect(where.email).toEqual({ equals: "Comprador@Test.co", mode: "insensitive" });
    expect(where.status).toEqual({ in: ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"] });
    expect(where.deletedAt).toBeNull();
    expect(where.OR).toEqual([{ customerId: null }, { customerId: "cust_new" }]);
    // Ventana de 30 días (createdAt >= now - 30d, tolerancia de segundos).
    const gte = where.createdAt.gte as Date;
    const expected = Date.now() - RETROACTIVE_EARN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    expect(Math.abs(gte.getTime() - expected)).toBeLessThan(10_000);
  });

  it("salta órdenes que YA tienen su EARN (idempotencia lógica además del índice único)", async () => {
    prisma.order.findMany.mockResolvedValue([
      { id: "ord_1", number: "LCM-2026-0001", total: 5_990_000 },
      { id: "ord_2", number: "LCM-2026-0002", total: 2_000_000 },
    ]);
    prisma.loyaltyTxn.findMany.mockResolvedValue([{ orderId: "ord_1" }]);

    const awarded = await awardRetroactivePointsForNewCustomer(INPUT);

    expect(awarded).toBe(20); // solo ord_2
    expect(prisma.loyaltyTxn.create).toHaveBeenCalledTimes(1);
    expect(prisma.loyaltyTxn.create).toHaveBeenCalledWith({
      data: { customerId: "cust_new", delta: 20, reason: "EARN", orderId: "ord_2" },
    });
  });

  it("un P2002 (carrera con la saga / retry) salta ESA orden y sigue con las demás", async () => {
    prisma.order.findMany.mockResolvedValue([
      { id: "ord_1", number: "LCM-2026-0001", total: 5_990_000 },
      { id: "ord_2", number: "LCM-2026-0002", total: 2_000_000 },
    ]);
    prisma.loyaltyTxn.create
      .mockRejectedValueOnce(new MockPrismaClientKnownRequestError("unique", "P2002"))
      .mockResolvedValueOnce({});

    const awarded = await awardRetroactivePointsForNewCustomer(INPUT);

    expect(awarded).toBe(20);
    expect(prisma.customer.update).toHaveBeenCalledTimes(1);
  });

  it("ordena con total < $1.000 no genera puntos (no crea txn)", async () => {
    prisma.order.findMany.mockResolvedValue([
      { id: "ord_1", number: "LCM-2026-0001", total: 99_900 },
    ]);
    const awarded = await awardRetroactivePointsForNewCustomer(INPUT);
    expect(awarded).toBe(0);
    expect(prisma.loyaltyTxn.create).not.toHaveBeenCalled();
  });

  it("programa apagado → 0 y ni siquiera consulta órdenes", async () => {
    loyaltySettings.current.enabled = false;
    const awarded = await awardRetroactivePointsForNewCustomer(INPUT);
    expect(awarded).toBe(0);
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it("sin órdenes elegibles → 0", async () => {
    expect(await awardRetroactivePointsForNewCustomer(INPUT)).toBe(0);
    expect(prisma.loyaltyTxn.create).not.toHaveBeenCalled();
  });

  it("best-effort: un fallo de DB devuelve 0 y NUNCA lanza (no rompe el registro)", async () => {
    prisma.order.findMany.mockRejectedValue(new Error("DB caída"));
    await expect(awardRetroactivePointsForNewCustomer(INPUT)).resolves.toBe(0);
  });

  it("best-effort también si falla la tx de escritura a mitad (error NO-P2002)", async () => {
    prisma.order.findMany.mockResolvedValue([
      { id: "ord_1", number: "LCM-2026-0001", total: 5_990_000 },
    ]);
    prisma.loyaltyTxn.create.mockRejectedValue(new Error("constraint raro"));
    await expect(awardRetroactivePointsForNewCustomer(INPUT)).resolves.toBe(0);
  });
});

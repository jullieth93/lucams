import type { Prisma } from "@lucams/db";
import { describe, expect, it, vi } from "vitest";
import { generateOrderNumber, orderNumberPrefix } from "./order-number";

function transactionWithLastNumber(number?: string) {
  return {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue(number ? [{ number }] : []),
  } as unknown as Prisma.TransactionClient;
}

describe("orderNumberPrefix", () => {
  it("mantiene el año Bogotá durante la compra del 31 de diciembre a las 21:00 COT", () => {
    expect(orderNumberPrefix(new Date("2027-01-01T02:00:00.000Z"))).toBe("LCM-2026-");
    expect(orderNumberPrefix(new Date("2027-01-01T04:59:59.999Z"))).toBe("LCM-2026-");
  });

  it("cambia de año exactamente a medianoche Bogotá", () => {
    expect(orderNumberPrefix(new Date("2027-01-01T05:00:00.000Z"))).toBe("LCM-2027-");
  });

  it("rechaza instantes inválidos en lugar de emitir un prefijo corrupto", () => {
    expect(() => orderNumberPrefix(new Date("invalid"))).toThrow(RangeError);
  });
});

describe("generateOrderNumber", () => {
  it("usa el año Bogotá y continúa la secuencia máxima existente", async () => {
    const tx = transactionWithLastNumber("LCM-2026-0041");
    await expect(generateOrderNumber(tx, new Date("2027-01-01T02:00:00.000Z"))).resolves.toBe(
      "LCM-2026-0042",
    );
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
  });

  it("inicia la secuencia anual cuando no hay pedidos previos", async () => {
    const tx = transactionWithLastNumber();
    await expect(generateOrderNumber(tx, new Date("2027-01-01T05:00:00.000Z"))).resolves.toBe(
      "LCM-2027-0001",
    );
  });
});

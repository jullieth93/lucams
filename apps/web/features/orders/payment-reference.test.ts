import { describe, expect, it } from "vitest";
import {
  buildUniqueWompiReference,
  buildWompiReference,
  extractOrderNumberFromWompiReference,
  isWompiTransactionOlderThanOrder,
} from "./payment-reference";

describe("referencias Wompi", () => {
  it("conserva el formato legacy solo para compatibilidad", () => {
    expect(buildWompiReference("LCM-2026-0001", 1)).toBe("LCM-2026-0001");
    expect(buildWompiReference("LCM-2026-0001", 2)).toBe("LCM-2026-0001-2");
  });

  it("genera referencias únicas aunque el número de orden se repita", () => {
    const first = buildUniqueWompiReference("LCM-2026-0001");
    const second = buildUniqueWompiReference("LCM-2026-0001");
    expect(first).not.toBe(second);
    expect(first).toMatch(/^LCM-2026-0001-[0-9a-f-]{36}$/);
    expect(first.length).toBeLessThanOrEqual(255);
  });

  it("extrae el número base tanto del sufijo legacy como del UUID", () => {
    expect(extractOrderNumberFromWompiReference("LCM-2026-0001-2")).toBe("LCM-2026-0001");
    expect(extractOrderNumberFromWompiReference("LCM-2026-1042-13")).toBe("LCM-2026-1042");
    expect(
      extractOrderNumberFromWompiReference("LCM-2026-0001-550e8400-e29b-41d4-a716-446655440000"),
    ).toBe("LCM-2026-0001");
    expect(extractOrderNumberFromWompiReference("custom-reference")).toBe("custom-reference");
  });
});

describe("guarda temporal de transacciones", () => {
  const order = { createdAt: new Date("2026-10-17T12:00:00Z") };

  it("descarta una transacción anterior a la orden", () => {
    expect(
      isWompiTransactionOlderThanOrder(order, { created_at: "2026-08-12T00:43:29.420Z" }),
    ).toBe(true);
  });

  it("acepta una transacción posterior y tolera el desfase de reloj acotado", () => {
    expect(
      isWompiTransactionOlderThanOrder(order, { created_at: "2026-10-17T12:01:00.000Z" }),
    ).toBe(false);
    expect(
      isWompiTransactionOlderThanOrder(order, { created_at: "2026-10-17T11:59:30.000Z" }),
    ).toBe(false);
  });
});

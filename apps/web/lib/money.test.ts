import { describe, expect, it } from "vitest";
import { MAX_MONEY_CENTS, fitsMoneyInt4 } from "./money";

describe("fitsMoneyInt4", () => {
  it("acepta 0 y el máximo INT4 exacto", () => {
    expect(fitsMoneyInt4(0)).toBe(true);
    expect(fitsMoneyInt4(MAX_MONEY_CENTS)).toBe(true);
    expect(MAX_MONEY_CENTS).toBe(2_147_483_647);
  });

  it("rechaza un centavo por encima del máximo (overflow INT4)", () => {
    expect(fitsMoneyInt4(MAX_MONEY_CENTS + 1)).toBe(false);
    // Escenario real: producto premium 100_000_000 × 22 = 2.200.000.000 > máximo.
    expect(fitsMoneyInt4(100_000_000 * 22)).toBe(false);
  });

  it("rechaza negativos, no-enteros y no-finitos", () => {
    expect(fitsMoneyInt4(-1)).toBe(false);
    expect(fitsMoneyInt4(1.5)).toBe(false);
    expect(fitsMoneyInt4(Number.NaN)).toBe(false);
    expect(fitsMoneyInt4(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

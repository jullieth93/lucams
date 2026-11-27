import { describe, expect, it } from "vitest";
import {
  MAX_PRICE_CENTS,
  buildActiveVariantPriceSqlClause,
  buildActiveVariantPriceWhere,
  normalizePriceBound,
} from "./price-filter";

describe("buildActiveVariantPriceWhere — filtro de precio SQL sobre variantes activas", () => {
  it("devuelve null cuando no hay minPrice ni maxPrice", () => {
    expect(buildActiveVariantPriceWhere()).toBeNull();
    expect(buildActiveVariantPriceWhere(undefined, undefined)).toBeNull();
    expect(buildActiveVariantPriceWhere(null, null)).toBeNull();
  });

  it("construye OR entre variantes activas con price explícito y herencia de basePrice", () => {
    const clause = buildActiveVariantPriceWhere(10_000, 30_000);
    expect(clause).toEqual({
      OR: [
        {
          variants: {
            some: {
              isActive: true,
              deletedAt: null,
              price: { not: null, gte: 10_000, lte: 30_000 },
            },
          },
        },
        {
          AND: [
            { basePrice: { gte: 10_000, lte: 30_000 } },
            {
              OR: [
                {
                  variants: {
                    some: {
                      isActive: true,
                      deletedAt: null,
                      price: null,
                    },
                  },
                },
                {
                  variants: {
                    none: {},
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("acepta límite solo inferior o solo superior (incluyendo 0)", () => {
    expect(buildActiveVariantPriceWhere(0, undefined)).toMatchObject({
      OR: [
        { variants: { some: { price: { not: null, gte: 0 } } } },
        { AND: [{ basePrice: { gte: 0 } }, expect.anything()] },
      ],
    });
    expect(buildActiveVariantPriceWhere(undefined, 25_000)).toMatchObject({
      OR: [
        { variants: { some: { price: { not: null, lte: 25_000 } } } },
        { AND: [{ basePrice: { lte: 25_000 } }, expect.anything()] },
      ],
    });
  });

  it("buildActiveVariantPriceSqlClause emite SQL vacío sin límites y parametrizado con límites", () => {
    expect(buildActiveVariantPriceSqlClause().values).toEqual([]);
    const sql = buildActiveVariantPriceSqlClause(12_000, 40_000);
    expect(sql.values).toEqual([12_000, 40_000, 12_000, 40_000]);
  });

  it("normalizePriceBound clampa negativos a 0 y enteros > INT4 a MAX_PRICE_CENTS", () => {
    expect(normalizePriceBound(-500)).toBe(0);
    expect(normalizePriceBound(99_999_999_999)).toBe(MAX_PRICE_CENTS);
    expect(normalizePriceBound(Number.NaN)).toBeUndefined();
    expect(normalizePriceBound(15_500.9)).toBe(15_500);
  });
});

/*
 * Unit tests del helper puro de precio por volumen (WholesaleTier → carrito, ADR-209).
 *
 * Precedencia estricta:
 *   opción específica (`variantId`) > producto (`productId`, `variantId: null`) > global (`productId: null`).
 * Solo aplican niveles con `minQty >= 2` y `unitPrice < base`.
 */

import { describe, expect, it } from "vitest";
import {
  applyVolumePricing,
  formatVolumeTierQtyLabel,
  resolveVisibleVolumeTiers,
  resolveVolumeTierPrice,
  unitPriceWithVolumeTier,
  validateWholesaleTierCandidate,
  type VolumeTierInput,
} from "./volume-pricing";

const PRODUCT = "prod_1";
const OTRO = "prod_2";
const VAR_SMALL = "var_4x4";
const VAR_LARGE = "var_7x7";

function tier(partial: Partial<VolumeTierInput> & Pick<VolumeTierInput, "minQty" | "unitPrice">) {
  return {
    productId: null,
    variantId: null,
    isActive: true,
    deletedAt: null,
    ...partial,
  } satisfies VolumeTierInput;
}

describe("resolveVolumeTierPrice", () => {
  it("sin tiers → null (se cobra el base)", () => {
    expect(resolveVolumeTierPrice([], PRODUCT, 10)).toBeNull();
  });

  it("tier global (productId null) aplica a cualquier producto", () => {
    const tiers = [tier({ minQty: 5, unitPrice: 9_000 })];
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 5)).toBe(9_000);
  });

  it("tier de OTRO producto no aplica", () => {
    const tiers = [tier({ productId: OTRO, minQty: 5, unitPrice: 9_000 })];
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 10)).toBeNull();
  });

  it("precedencia 3 niveles: opción específica (variantId) > producto > global", () => {
    const tiers = [
      tier({ minQty: 2, unitPrice: 18_000 }), // global
      tier({ productId: PRODUCT, minQty: 2, unitPrice: 21_000 }), // producto general
      tier({ productId: PRODUCT, variantId: VAR_LARGE, minQty: 2, unitPrice: 33_800 }), // opción 7×7
    ];
    // VAR_LARGE usa su escala propia ($33.800) y jamás cae al $21.000 de otra opción más chica.
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 2, VAR_LARGE)).toBe(33_800);
    // VAR_SMALL no tiene escala propia → hereda la escala del producto ($21.000).
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 2, VAR_SMALL)).toBe(21_000);
  });

  it("opción con tiers propios hace sombra sobre los del producto aunque no alcance el umbral", () => {
    const tiers = [
      tier({ productId: PRODUCT, minQty: 2, unitPrice: 21_000 }),
      tier({ productId: PRODUCT, variantId: VAR_LARGE, minQty: 4, unitPrice: 30_600 }),
    ];
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 2, VAR_LARGE)).toBeNull();
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 4, VAR_LARGE)).toBe(30_600);
  });

  it("producto con tiers propios hace sombra sobre globales aunque no alcance el umbral", () => {
    const tiers = [
      tier({ minQty: 2, unitPrice: 8_000 }),
      tier({ productId: PRODUCT, minQty: 50, unitPrice: 9_000 }),
    ];
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 10)).toBeNull();
  });

  it("entre umbrales: gana el MAYOR minQty <= qty", () => {
    const tiers = [
      tier({ minQty: 3, unitPrice: 9_000 }),
      tier({ minQty: 12, unitPrice: 7_500 }),
      tier({ minQty: 50, unitPrice: 6_000 }),
    ];
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 2)).toBeNull();
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 12)).toBe(7_500);
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 60)).toBe(6_000);
  });

  it("minQty < 2 o qty < 2 nunca aplican (paridad de precio unitario en tienda y feeds)", () => {
    const tiers = [tier({ minQty: 1, unitPrice: 5_000 }), tier({ minQty: 2, unitPrice: 8_000 })];
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 1)).toBeNull();
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 2)).toBe(8_000);
  });
});

describe("applyVolumePricing — copias × unidades de la tanda", () => {
  it("evalúa qty × designUnits y multiplica el precio del tier por las unidades de la tanda", () => {
    const tiers = [
      tier({ productId: PRODUCT, minQty: 3, unitPrice: 270_000 }),
      tier({ productId: PRODUCT, minQty: 50, unitPrice: 200_000 }),
    ];
    // 1 separador ($3.000) × 60 copias → umbral 60 >= 50 → $2.000 c/u
    expect(applyVolumePricing(300_000, tiers, PRODUCT, 60, 1)).toBe(200_000);
    // 15 separadores ($45.000 la tanda) × 4 copias = 60 → $2.000 × 15 = $30.000 por tanda
    expect(applyVolumePricing(4_500_000, tiers, PRODUCT, 4, 15)).toBe(3_000_000);
    // 2 separadores ($6.000 la tanda) × 2 copias = 4 >= 3 → $2.700 × 2 = $5.400 por tanda
    expect(applyVolumePricing(600_000, tiers, PRODUCT, 2, 2)).toBe(540_000);
  });

  it("nunca encarece el precio base aunque el tier esté mal configurado", () => {
    const tiers = [tier({ productId: PRODUCT, minQty: 2, unitPrice: 500_000 })];
    expect(applyVolumePricing(300_000, tiers, PRODUCT, 5, 1)).toBe(300_000);
    expect(applyVolumePricing(600_000, tiers, PRODUCT, 5, 2)).toBe(600_000);
  });

  it("unitPriceWithVolumeTier refleja la misma regla en vivo en cliente", () => {
    const visible = resolveVisibleVolumeTiers(
      [
        tier({ productId: PRODUCT, variantId: VAR_LARGE, minQty: 2, unitPrice: 3_380_000 }),
        tier({ productId: PRODUCT, variantId: VAR_LARGE, minQty: 4, unitPrice: 3_060_000 }),
      ],
      PRODUCT,
      3_600_000,
      VAR_LARGE,
    );
    expect(visible).toHaveLength(2);
    expect(unitPriceWithVolumeTier(3_600_000, 1, visible)).toBe(3_600_000);
    expect(unitPriceWithVolumeTier(3_600_000, 3, visible)).toBe(3_380_000);
    expect(unitPriceWithVolumeTier(3_600_000, 4, visible)).toBe(3_060_000);
  });
});

describe("validateWholesaleTierCandidate", () => {
  it("rechaza precio >= referencia de la variante o producto", () => {
    expect(
      validateWholesaleTierCandidate({
        minQty: 3,
        unitPrice: 300_000,
        willBeActive: true,
        referencePrice: 300_000,
        activeSiblings: [],
      }),
    ).toEqual({ kind: "ABOVE_OR_EQUAL_BASE", referencePrice: 300_000 });
  });

  it("exige monotonía estrictamente decreciente entre hermanos activos del mismo alcance", () => {
    expect(
      validateWholesaleTierCandidate({
        minQty: 10,
        unitPrice: 280_000,
        willBeActive: true,
        referencePrice: 300_000,
        activeSiblings: [{ minQty: 5, unitPrice: 270_000 }],
      }),
    ).toEqual({
      kind: "INVERTED_HIGHER_QTY",
      conflictMinQty: 5,
      conflictUnitPrice: 270_000,
    });
  });

  it("rechaza umbrales que superen el tope del selector del producto y formatea el tope sin '+'", () => {
    expect(
      validateWholesaleTierCandidate({
        minQty: 25,
        unitPrice: 220_000,
        willBeActive: true,
        referencePrice: 300_000,
        activeSiblings: [],
        maxAllowedQty: 15,
      }),
    ).toEqual({ kind: "EXCEEDS_MAX_UNITS", maxAllowedQty: 15 });

    const visible = resolveVisibleVolumeTiers(
      [
        tier({ productId: PRODUCT, minQty: 3, unitPrice: 270_000 }),
        tier({ productId: PRODUCT, minQty: 15, unitPrice: 230_000 }),
        tier({ productId: PRODUCT, minQty: 25, unitPrice: 220_000 }),
      ],
      PRODUCT,
      300_000,
      null,
      15,
    );
    expect(visible.map((t) => t.minQty)).toEqual([3, 15]);
    expect(formatVolumeTierQtyLabel(3, { maxQty: 15 })).toBe("3+ unid.");
    expect(formatVolumeTierQtyLabel(15, { maxQty: 15 })).toBe("15 unid.");
    expect(formatVolumeTierQtyLabel(6, { maxQty: 6, isPack: true })).toBe("6 packs");
  });
});

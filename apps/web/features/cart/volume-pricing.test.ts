/*
 * Unit tests del helper puro de precio por volumen (WholesaleTier → carrito).
 *
 * Regla de negocio (2026-10-02): descuento por volumen PÚBLICO, para todos los
 * clientes (invitados incluidos). `unitPrice` del tier es ABSOLUTO (centavos
 * COP) y REEMPLAZA el unitPrice de la línea. Precedencia: niveles propios del
 * producto > globales (productId null). Gana el mayor minQty <= qty. Nunca
 * subir el precio (tier >= base → no aplica).
 */

import { describe, expect, it } from "vitest";
import { applyVolumePricing, resolveVolumeTierPrice, type VolumeTierInput } from "./volume-pricing";

const PRODUCT = "prod_1";
const OTRO = "prod_2";

function tier(partial: Partial<VolumeTierInput> & Pick<VolumeTierInput, "minQty" | "unitPrice">) {
  return {
    productId: null,
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

  it("el tier propio del producto GANA al global aunque el global sea más barato", () => {
    const tiers = [
      tier({ minQty: 3, unitPrice: 8_000 }), // global más generoso
      tier({ productId: PRODUCT, minQty: 3, unitPrice: 9_500 }), // propio
    ];
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 3)).toBe(9_500);
  });

  it("producto con tiers propios: NO mira los globales aunque ningún tier propio alcance el umbral", () => {
    const tiers = [
      tier({ minQty: 2, unitPrice: 8_000 }), // global alcanzable
      tier({ productId: PRODUCT, minQty: 50, unitPrice: 9_000 }), // propio fuera de alcance
    ];
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 10)).toBeNull();
  });

  it("umbral exacto: qty == minQty aplica el nivel", () => {
    const tiers = [tier({ minQty: 12, unitPrice: 7_500 })];
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 12)).toBe(7_500);
  });

  it("una unidad por debajo del umbral NO aplica", () => {
    const tiers = [tier({ minQty: 12, unitPrice: 7_500 })];
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 11)).toBeNull();
  });

  it("entre umbrales: gana el MAYOR minQty <= qty", () => {
    const tiers = [
      tier({ minQty: 5, unitPrice: 9_000 }),
      tier({ minQty: 20, unitPrice: 7_000 }),
      tier({ minQty: 50, unitPrice: 6_000 }),
    ];
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 25)).toBe(7_000);
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 50)).toBe(6_000);
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 99)).toBe(6_000);
  });

  it("tiers desordenados: el ganador es por minQty, no por orden de llegada", () => {
    const tiers = [
      tier({ minQty: 50, unitPrice: 6_000 }),
      tier({ minQty: 5, unitPrice: 9_000 }),
      tier({ minQty: 20, unitPrice: 7_000 }),
    ];
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 30)).toBe(7_000);
  });

  it("tiers inactivos o soft-eliminados quedan fuera (filtro defensivo del helper)", () => {
    const tiers = [
      tier({ minQty: 5, unitPrice: 9_000, isActive: false }),
      tier({ minQty: 5, unitPrice: 8_500, deletedAt: new Date("2026-09-01") }),
    ];
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 10)).toBeNull();
  });

  it("minQty inválido (<= 0) se ignora: la DB lo impide con CHECK, el helper no confía", () => {
    const tiers = [tier({ minQty: 0, unitPrice: 1 })];
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 1)).toBeNull();
  });

  it("qty < 1 → null", () => {
    const tiers = [tier({ minQty: 1, unitPrice: 9_000 })];
    expect(resolveVolumeTierPrice(tiers, PRODUCT, 0)).toBeNull();
  });
});

describe("applyVolumePricing", () => {
  it("sin tiers → devuelve el base intacto", () => {
    expect(applyVolumePricing(12_000, [], PRODUCT, 50)).toBe(12_000);
  });

  it("qty=1 sin tier de minQty 1 → base", () => {
    const tiers = [tier({ minQty: 5, unitPrice: 9_000 })];
    expect(applyVolumePricing(12_000, tiers, PRODUCT, 1)).toBe(12_000);
  });

  it("qty=1 con tier de minQty 1 → aplica (descuento desde la primera unidad)", () => {
    const tiers = [tier({ minQty: 1, unitPrice: 11_000 })];
    expect(applyVolumePricing(12_000, tiers, PRODUCT, 1)).toBe(11_000);
  });

  it("el tier REEMPLAZA el unitPrice de la línea (precio absoluto, no descuento)", () => {
    const tiers = [tier({ minQty: 10, unitPrice: 9_990 })];
    expect(applyVolumePricing(12_000, tiers, PRODUCT, 10)).toBe(9_990);
  });

  it("tier MÁS CARO que el base NO aplica (defensa anti-config errónea)", () => {
    const tiers = [tier({ minQty: 10, unitPrice: 15_000 })];
    expect(applyVolumePricing(12_000, tiers, PRODUCT, 10)).toBe(12_000);
  });

  it("tier igual al base → base (equivalente, pero nunca se 'sube')", () => {
    const tiers = [tier({ minQty: 10, unitPrice: 12_000 })];
    expect(applyVolumePricing(12_000, tiers, PRODUCT, 10)).toBe(12_000);
  });

  it("el base ya multiplicado (personalizado multi-unidad) es la referencia del anti-subida", () => {
    // Base de línea personalizada: variante 20_000 × 2 unidades = 40_000.
    const tiers = [tier({ minQty: 2, unitPrice: 35_000 })];
    expect(applyVolumePricing(40_000, tiers, PRODUCT, 2)).toBe(35_000);
    // Un tier por encima del base multiplicado no aplica.
    const caros = [tier({ minQty: 2, unitPrice: 45_000 })];
    expect(applyVolumePricing(40_000, caros, PRODUCT, 2)).toBe(40_000);
  });
});

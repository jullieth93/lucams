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
import {
  applyVolumePricing,
  derivePackVolumeTiers,
  resolveVisibleVolumeTiers,
  resolveVolumeTierPrice,
  validateWholesaleTierCandidate,
  type VolumeTierInput,
} from "./volume-pricing";

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

  it("modo por unidad física: evalúa el umbral total y conserva el multiplicador del diseño", () => {
    const tiers = [tier({ minQty: 6, unitPrice: 8_000 }), tier({ minQty: 12, unitPrice: 7_000 })];
    expect(applyVolumePricing(60_000, tiers, PRODUCT, 1, 6)).toBe(48_000);
    expect(applyVolumePricing(120_000, tiers, PRODUCT, 1, 12)).toBe(84_000);
    expect(applyVolumePricing(120_000, tiers, PRODUCT, 2, 6)).toBe(42_000);
    expect(applyVolumePricing(30_000, tiers, PRODUCT, 1, 3)).toBe(30_000);
  });

  it("modo por unidad física: nunca aplica un tier más caro que la unidad base", () => {
    const tiers = [tier({ minQty: 3, unitPrice: 11_000 })];
    expect(applyVolumePricing(30_000, tiers, PRODUCT, 1, 3)).toBe(30_000);
  });
});

describe("resolveVisibleVolumeTiers ([CX-01] PDP)", () => {
  it("ordena escalas válidas por minQty asc y calcula savingsPct con precedencia de producto", () => {
    const tiers = [
      tier({ minQty: 2, unitPrice: 6_000 }), // global ignorado porque hay propios
      tier({ productId: PRODUCT, minQty: 10, unitPrice: 8_000 }),
      tier({ productId: PRODUCT, minQty: 3, unitPrice: 9_000 }),
      tier({ productId: PRODUCT, minQty: 20, unitPrice: 8_500 }), // incoherente (más caro que 10+) → omitido
      tier({ productId: PRODUCT, minQty: 2, unitPrice: 12_000 }), // >= base → omitido
    ];
    expect(resolveVisibleVolumeTiers(tiers, PRODUCT, 10_000)).toEqual([
      { minQty: 3, unitPrice: 9_000, savingsPct: 10 },
      { minQty: 10, unitPrice: 8_000, savingsPct: 20 },
    ]);
  });
});

describe("derivePackVolumeTiers (escala derivada de variantes — SOLO ahorro por volumen)", () => {
  const packVariant = (
    photoSlots: number,
    price: number,
    extra?: { sizeCm?: string; magnet?: boolean; compareAtPrice?: number | null },
  ) => ({
    price,
    compareAtPrice: extra?.compareAtPrice ?? null,
    attributes: {
      photoSlots,
      ...(extra?.sizeCm ? { sizeCm: extra.sizeCm } : {}),
      ...(typeof extra?.magnet === "boolean" ? { magnet: extra.magnet } : {}),
    },
  });
  const qtyVariant = (quantity: number, price: number, sizeCm?: string) => ({
    price,
    compareAtPrice: null,
    attributes: { quantity, ...(sizeCm ? { sizeCm } : {}) },
  });

  it("precio lineal → sin escala (nunca anuncia ahorro que no existe)", () => {
    // Polaroid pre-2026-11-11: $22.500 por pack, lineal.
    const groups = derivePackVolumeTiers(
      [packVariant(6, 2_250_000), packVariant(12, 4_500_000), packVariant(18, 6_750_000)],
      2_250_000,
    );
    expect(groups).toEqual([]);
  });

  it("precio por pack que baja al subir de presentación → escala derivada", () => {
    const groups = derivePackVolumeTiers(
      [packVariant(6, 2_250_000), packVariant(12, 4_000_000), packVariant(18, 5_400_000)],
      2_250_000,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.noun).toBe("pack");
    expect(groups[0]!.tiers).toEqual([
      { units: 2, totalPrice: 4_000_000, unitPrice: 2_000_000, savingsPct: 11 },
      { units: 3, totalPrice: 5_400_000, unitPrice: 1_800_000, savingsPct: 20 },
    ]);
  });

  it("la promo (compareAt) NO alimenta el bloque — eso lo muestra el tachado por presentación", () => {
    const groups = derivePackVolumeTiers(
      [packVariant(6, 2_250_000, { compareAtPrice: 2_750_000 }), packVariant(12, 4_500_000)],
      2_250_000,
    );
    expect(groups).toEqual([]);
  });

  it("agrupa por tamaño × imán (cuadrados: 3 tamaños; tiras: con/sin imán)", () => {
    const groups = derivePackVolumeTiers(
      [
        packVariant(6, 2_400_000, { sizeCm: "4×4" }),
        packVariant(12, 4_200_000, { sizeCm: "4×4" }),
        packVariant(6, 2_700_000, { sizeCm: "5×5" }),
        packVariant(12, 5_400_000, { sizeCm: "5×5" }), // lineal → grupo vacío
        packVariant(3, 1_900_000, { sizeCm: "5×15", magnet: true }),
        packVariant(3, 1_900_000, { sizeCm: "5×15", magnet: false }),
      ],
      2_400_000,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.sizeCm).toBe("4×4");
    expect(groups[0]!.tiers).toEqual([
      { units: 2, totalPrice: 4_200_000, unitPrice: 2_100_000, savingsPct: 13 },
    ]);
  });

  it("modo cantidad (separadores 1-6): precio por unidad no lineal → escala derivada", () => {
    const groups = derivePackVolumeTiers(
      [
        qtyVariant(1, 300_000, "2×6"),
        qtyVariant(2, 600_000, "2×6"),
        qtyVariant(3, 800_000, "2×6"), // $2.667 c/u → −11%
        qtyVariant(6, 1_600_000, "2×6"), // $2.667 c/u → −11%
      ],
      300_000,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.noun).toBe("unidad");
    expect(groups[0]!.tiers).toEqual([
      { units: 3, totalPrice: 800_000, unitPrice: 266_667, savingsPct: 11 },
      { units: 6, totalPrice: 1_600_000, unitPrice: 266_667, savingsPct: 11 },
    ]);
  });

  it("ignora variantes sin photoSlots/quantity comparable y packs no enteros", () => {
    const groups = derivePackVolumeTiers(
      [
        { price: 1_000_000, compareAtPrice: null, attributes: { quantity: 30 } }, // solo 1 variante
        packVariant(6, 2_250_000),
        packVariant(9, 2_700_000), // 9/6 no es entero → fuera
      ],
      2_250_000,
    );
    expect(groups).toEqual([]);
  });
});

describe("validateWholesaleTierCandidate", () => {
  it("rechaza precio igual o mayor al precio base de referencia del producto", () => {
    expect(
      validateWholesaleTierCandidate({
        minQty: 5,
        unitPrice: 1_000_000,
        willBeActive: true,
        referencePrice: 1_000_000,
        activeSiblings: [],
      }),
    ).toEqual({ kind: "ABOVE_OR_EQUAL_BASE", referencePrice: 1_000_000 });

    expect(
      validateWholesaleTierCandidate({
        minQty: 5,
        unitPrice: 1_200_000,
        willBeActive: false,
        referencePrice: 1_000_000,
        activeSiblings: [],
      }),
    ).toEqual({ kind: "ABOVE_OR_EQUAL_BASE", referencePrice: 1_000_000 });
  });

  it("rechaza escalas invertidas hacia arriba o hacia abajo cuando el nivel estará activo", () => {
    // Ya existe 3+ -> $9.000; intentar crear 5+ -> $9.000 o $9.500 es inversión
    expect(
      validateWholesaleTierCandidate({
        minQty: 5,
        unitPrice: 900_000,
        willBeActive: true,
        referencePrice: 1_000_000,
        activeSiblings: [{ minQty: 3, unitPrice: 900_000 }],
      }),
    ).toEqual({
      kind: "INVERTED_HIGHER_QTY",
      conflictMinQty: 3,
      conflictUnitPrice: 900_000,
    });

    // Ya existe 10+ -> $8.000; intentar crear 4+ -> $7.500 es inversión hacia abajo
    expect(
      validateWholesaleTierCandidate({
        minQty: 4,
        unitPrice: 750_000,
        willBeActive: true,
        referencePrice: 1_000_000,
        activeSiblings: [{ minQty: 10, unitPrice: 800_000 }],
      }),
    ).toEqual({
      kind: "INVERTED_LOWER_QTY",
      conflictMinQty: 10,
      conflictUnitPrice: 800_000,
    });
  });

  it("permite escalas estrictamente decrecientes y borradores desactivados menores al base", () => {
    expect(
      validateWholesaleTierCandidate({
        minQty: 5,
        unitPrice: 800_000,
        willBeActive: true,
        referencePrice: 1_000_000,
        activeSiblings: [
          { minQty: 3, unitPrice: 900_000 },
          { minQty: 10, unitPrice: 700_000 },
        ],
      }),
    ).toBeNull();

    // Si está desactivado, permite guardar temporalmente sin chocar con otros niveles activos
    expect(
      validateWholesaleTierCandidate({
        minQty: 5,
        unitPrice: 920_000,
        willBeActive: false,
        referencePrice: 1_000_000,
        activeSiblings: [{ minQty: 3, unitPrice: 900_000 }],
      }),
    ).toBeNull();
  });
});

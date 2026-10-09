/*
 * Unit tests de physicalUnitPriceCents (bug STG 2026-10 — "c/u" engañoso en
 * /carrito para líneas personalizadas multi-unidad).
 *
 * Invariante bajo test: el rótulo "c/u" que se muestra NUNCA puede
 * contradecir el total de línea (lineTotal = qty × unitPrice, intocable).
 */

import { describe, expect, it } from "vitest";

import { physicalUnitPriceCents } from "./physical-unit-price";

describe("physicalUnitPriceCents — presentación multi-unidad", () => {
  it("línea simple (designUnits null o 1): el c/u es el unitPrice tal cual", () => {
    expect(physicalUnitPriceCents(500_000, null)).toBe(500_000);
    expect(physicalUnitPriceCents(500_000, 1)).toBe(500_000);
  });

  it("caso STG: pack de $5.000 con 2 unidades → $2.500 c/u (2 × 2.500 = total)", () => {
    const perUnit = physicalUnitPriceCents(500_000, 2);
    expect(perUnit).toBe(250_000);
    // El rótulo jamás contradice el total de la línea.
    expect(perUnit! * 2).toBe(500_000);
  });

  it("división exacta con multiplicador grande (3 tiras × $4.000 = $12.000)", () => {
    expect(physicalUnitPriceCents(1_200_000, 3)).toBe(400_000);
  });

  it("división NO exacta → null (el caller omite el rótulo c/u)", () => {
    // $5.000,01 entre 2 unidades no tiene c/u exacto en centavos: mostrar
    // $2.500 (redondeado) haría 2 × 2.500 ≠ 5.000,01 → contradicción.
    expect(physicalUnitPriceCents(500_001, 2)).toBeNull();
  });

  it("designUnits <= 0 (dato corrupto) se trata como línea simple, nunca divide por cero", () => {
    expect(physicalUnitPriceCents(500_000, 0)).toBe(500_000);
  });
});

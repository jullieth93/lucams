/*
 * Fase 7b — tests del roll-up de costo por materiales (función pura).
 *
 * Casos clave: receta vacía → null (sin número engañoso); insumo sin costo
 * cargado → null (sumar parcial sería mentira optimista); cantidades Float
 * (metros/ml) redondeadas al centavo entero.
 */

import { describe, expect, it } from "vitest";
import { computeRecipeCost, computeRecipeLineCost } from "./recipe-cost";

describe("computeRecipeCost (Fase 7b — costeo por materiales)", () => {
  it("receta vacía → null (no hay sugerido que mostrar)", () => {
    expect(computeRecipeCost([])).toBeNull();
  });

  it("suma cantidad × costo unitario de cada insumo", () => {
    // 2 pliegos de papel a $1.500 + 1 imán a $800 = $3.800 = 380_000 centavos.
    const items = [
      { quantity: 2, costPerUnit: 150_000 },
      { quantity: 1, costPerUnit: 80_000 },
    ];
    expect(computeRecipeCost(items)).toBe(380_000);
  });

  it("admite cantidades fraccionadas (metros, ml…) y redondea al centavo", () => {
    // 0.75 metros a $10.000/m → 750_000.33…? no: 0.75 × 1_000_000 = 750_000 exacto.
    expect(computeRecipeCost([{ quantity: 0.75, costPerUnit: 1_000_000 }])).toBe(750_000);
    // 1/3 de unidad a 100 centavos → 33.333… → 33 centavos enteros.
    expect(computeRecipeCost([{ quantity: 1 / 3, costPerUnit: 100 }])).toBe(33);
  });

  it("un insumo sin costo cargado → null (mejor sin número que un número mentiroso)", () => {
    const items = [
      { quantity: 2, costPerUnit: 150_000 },
      { quantity: 1, costPerUnit: null },
    ];
    expect(computeRecipeCost(items)).toBeNull();
  });

  it("receta de un solo insumo sin costo → null", () => {
    expect(computeRecipeCost([{ quantity: 3, costPerUnit: null }])).toBeNull();
  });
});

describe("computeRecipeLineCost", () => {
  it("subtotal de fila = cantidad × costo unitario", () => {
    expect(computeRecipeLineCost(2.5, 40_000)).toBe(100_000);
  });

  it("insumo sin costo → null", () => {
    expect(computeRecipeLineCost(2.5, null)).toBeNull();
  });
});

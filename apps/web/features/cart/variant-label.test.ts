/*
 * Unit tests de variantNameDisplayLabel (2026-10-05) — el rótulo "(adhesivo)"
 * del carrito se infiere del nombre libre SOLO cuando el desglose estructurado
 * no declara el sin imán (variantes sin attrs.magnet).
 */

import { describe, expect, it } from "vitest";

import { variantNameDisplayLabel } from "./variant-label";

describe("variantNameDisplayLabel — rótulo '(adhesivo)'", () => {
  it("nombre 'sin imán' sin desglose de imán → agrega '(adhesivo)'", () => {
    expect(variantNameDisplayLabel("Sin Imán", [])).toBe("Sin Imán (adhesivo)");
    expect(variantNameDisplayLabel("Sin Imán", ["20×20 cm", "Mate"])).toBe("Sin Imán (adhesivo)");
  });

  it("match case-insensitive y tolerante a tilde/espacios", () => {
    expect(variantNameDisplayLabel("sin iman", [])).toBe("sin iman (adhesivo)");
    expect(variantNameDisplayLabel("SIN IMÁN", [])).toBe("SIN IMÁN (adhesivo)");
    expect(variantNameDisplayLabel("Sin  imán", [])).toBe("Sin  imán (adhesivo)");
  });

  it("el desglose ya declara el sin imán (attrs.magnet === false) → no duplica", () => {
    expect(variantNameDisplayLabel("Sin Imán", ["20×20 cm", "Sin imán (adhesivo)"])).toBe(
      "Sin Imán",
    );
  });

  it("nombres sin 'sin imán' quedan intactos", () => {
    expect(variantNameDisplayLabel("Con Imán", [])).toBe("Con Imán");
    expect(variantNameDisplayLabel("20×20 cm", ["Con imán"])).toBe("20×20 cm");
    expect(variantNameDisplayLabel("Estándar", [])).toBe("Estándar");
  });
});

/*
 * Unit — buildCotizarProductos: cómo se arma el array `productos` para cotizar.
 *
 * REGRESIÓN CRÍTICA (2026-07-11): Aveonline IGNORA `unidades` al cotizar (verificado
 * contra la API real: peso 0.3kg u1 == peso 0.3kg u5). Por eso la cantidad se pliega en
 * el PESO (modelo "peso total"). Estos tests fijan ese comportamiento para que un pedido
 * de varias unidades NUNCA vuelva a cotizarse como si fuera 1 (subcobro del flete).
 */

import { describe, expect, it } from "vitest";
import { buildCotizarProductos } from "./aveonline";
import type { ShipmentItem } from "./provider";

const item = (over: Partial<ShipmentItem> = {}): ShipmentItem => ({
  productSlug: "iman-test",
  qty: 1,
  weightGrams: 300,
  widthCm: 10,
  heightCm: 10,
  depthCm: 10,
  declaredValueCop: 30000,
  ...over,
});

describe("buildCotizarProductos", () => {
  it("qty=1: peso por unidad, unidades:1, valorDeclarado de la línea", () => {
    const [p] = buildCotizarProductos([item()]);
    expect(p.peso).toBe(0.3); // 300g → 0.3 kg
    expect(p.unidades).toBe(1);
    expect(p.valorDeclarado).toBe(30000);
    expect(p).toMatchObject({ alto: 10, ancho: 10, largo: 10, nombre: "iman-test" });
  });

  it("qty=5: pliega la cantidad en el PESO y el valor (unidades sigue 1)", () => {
    const [p] = buildCotizarProductos([item({ qty: 5 })]);
    expect(p.peso).toBe(1.5); // 300g × 5 = 1500g → 1.5 kg (NO 0.3)
    expect(p.unidades).toBe(1); // Aveonline lo ignora; la cantidad va en el peso
    expect(p.valorDeclarado).toBe(150000); // 30.000 × 5
  });

  it("piso de peso 0.1 kg para ítems muy livianos", () => {
    const [p] = buildCotizarProductos([item({ weightGrams: 30, qty: 1 })]);
    expect(p.peso).toBe(0.1); // 30g → 0.03 kg → piso 0.1
  });

  it("valorDeclarado mínimo 10.000 COP (Aveonline rechaza menos con numbererror -5)", () => {
    const [p] = buildCotizarProductos([item({ declaredValueCop: 2000, qty: 1 })]);
    expect(p.valorDeclarado).toBe(10000);
  });

  it("varias líneas → una entrada por línea, cada una con su peso total", () => {
    const productos = buildCotizarProductos([
      item({ productSlug: "a", weightGrams: 300, qty: 2 }),
      item({ productSlug: "b", weightGrams: 500, qty: 1 }),
    ]);
    expect(productos).toHaveLength(2);
    expect(productos[0]).toMatchObject({ nombre: "a", peso: 0.6, unidades: 1 });
    expect(productos[1]).toMatchObject({ nombre: "b", peso: 0.5, unidades: 1 });
  });
});

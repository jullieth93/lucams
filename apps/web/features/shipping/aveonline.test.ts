/*
 * Unit — computePackedPackage + buildCotizarProductos + handleWebhook.
 *
 * Modelo de empaque "caja apilada" (auditoría doc Aveonline 2026-07-28):
 * UN bulto físico con peso Σ(peso_unit × qty), espesor Σ(dim_menor × qty) y
 * huella = máx de las dos dims mayores por item. Cotización y guía usan el
 * MISMO modelo → flete cotizado == facturado; qty=2 NUNCA duplica el flete
 * (una guía tarifada por peso/volumen real, no 2 bultos). El modelo anterior
 * (bounding-box máximo por eje) sub-dimensionaba el volumen con qty>1 y la
 * transportadora re-liquida contra; y per-línea con qty solo en peso
 * subestimaba el peso volumen.
 *
 * Aveonline tipa alto/ancho/largo/peso/valorDeclarado como String (doc oficial) → los
 * mandamos stringificados. Y el webhook manda `guia` como NÚMERO → debe coercerse a String.
 */

import { describe, expect, it } from "vitest";
import { AveonlineProvider, buildCotizarProductos, computePackedPackage } from "./aveonline";
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

describe("computePackedPackage", () => {
  it("qty=1: dims exactas del producto, peso y valor de la unidad", () => {
    const pkg = computePackedPackage([item({ declaredValueCop: 4500000 })]);
    expect(pkg).toMatchObject({ altoCm: 10, anchoCm: 10, largoCm: 10, pesoKg: 0.3 });
    expect(pkg.valorDeclaradoPesos).toBe(45000);
  });

  it("qty=2 mismo producto: doble peso y doble espesor, MISMA huella (nunca 2× flete)", () => {
    const pkg = computePackedPackage([
      item({ weightGrams: 300, widthCm: 30, heightCm: 30, depthCm: 1, qty: 2 }),
    ]);
    expect(pkg).toMatchObject({ altoCm: 30, anchoCm: 30, largoCm: 2, pesoKg: 0.6 });
  });

  it("apila por la dim MENOR de cada item sin importar el eje (orientación libre)", () => {
    // Calendario plano 30×30×1 (qty 3) + mug cúbico 15×15×15 (qty 1):
    // huella = 30×30, espesor = 3×1 + 15 = 18.
    const pkg = computePackedPackage([
      item({ productSlug: "calendario", widthCm: 30, heightCm: 1, depthCm: 30, qty: 3 }),
      item({ productSlug: "mug", widthCm: 15, heightCm: 15, depthCm: 15, qty: 1 }),
    ]);
    expect(pkg).toMatchObject({ altoCm: 30, anchoCm: 30, largoCm: 18 });
  });

  it("varias líneas distintas: huella = máx de cada cara ordenada, espesor = Σ", () => {
    const pkg = computePackedPackage([
      item({ widthCm: 20, heightCm: 10, depthCm: 2, qty: 2 }), // menor 2 ×2 = 4
      item({ widthCm: 15, heightCm: 25, depthCm: 3, qty: 1 }), // menor 3 ×1 = 3
    ]);
    // caras ordenadas: [2,10,20] y [3,15,25] → mayor 25, media 15, espesor 7.
    expect(pkg).toMatchObject({ altoCm: 25, anchoCm: 15, largoCm: 7 });
  });

  it("valor declarado: Σ total en PESOS con piso $10.000 (error -5 de Aveonline)", () => {
    expect(
      computePackedPackage([item({ declaredValueCop: 200000, qty: 1 })]).valorDeclaradoPesos,
    ).toBe(10000); // $2.000 → piso
    expect(
      computePackedPackage([
        item({ productSlug: "a", declaredValueCop: 4500000, qty: 2 }),
        item({ productSlug: "b", declaredValueCop: 1000000, qty: 1 }),
      ]).valorDeclaradoPesos,
    ).toBe(100000); // 45.000×2 + 10.000 = 100.000
  });

  it("piso de peso 0.1 kg para ítems muy livianos", () => {
    expect(computePackedPackage([item({ weightGrams: 30, qty: 1 })]).pesoKg).toBe(0.1);
  });
});

describe("buildCotizarProductos", () => {
  it("UN solo bulto con tipos String (como pide la doc) y valor en PESOS (no centavos)", () => {
    const productos = buildCotizarProductos([item({ declaredValueCop: 4500000 })]);
    expect(productos).toHaveLength(1);
    expect(productos[0]).toMatchObject({
      alto: "10",
      ancho: "10",
      largo: "10",
      peso: "0.3",
      unidades: 1,
      nombre: "iman-test",
      valorDeclarado: "45000",
    });
  });

  it("qty=5: un bulto con espesor ×5 y peso ×5 — NO 5 entradas ni valor en centavos", () => {
    const [p] = buildCotizarProductos([item({ declaredValueCop: 4500000, qty: 5 })]);
    expect(p.peso).toBe("1.5"); // 300g × 5 = 1.5 kg
    expect(p.largo).toBe("50"); // 10cm × 5 apilados
    expect(p.unidades).toBe(1); // UN bulto (el rótulo imprime productos[].unidades como bultos)
    // 4.500.000 centavos × 5 = 22.500.000 centavos → 225.000 pesos (NO 22.500.000,
    // que Aveonline rechaza con numbererror=999). Este es el bug que rompía el step 2.
    expect(p.valorDeclarado).toBe("225000");
  });
});

describe("handleWebhook — parseo de la notificación de estado", () => {
  const provider = new AveonlineProvider();

  it("coacciona `guia` NUMÉRICO a String (sino la búsqueda de la orden por trackingNumber revienta)", async () => {
    // La doc oficial manda guia como número: {"guia": 892349021, "estado":[...]}.
    const ev = await provider.handleWebhook(
      JSON.stringify({
        guia: 892349021,
        estado: [{ estado_id: 12, nombre_estado: "ENTREGADA", fecha: "2020-12-11 11:04:43" }],
      }),
      {},
    );
    expect(ev.trackingNumber).toBe("892349021");
    expect(typeof ev.trackingNumber).toBe("string");
    expect(ev.status).toBe("DELIVERED");
  });

  it("interpreta la fecha en hora de Colombia (UTC-5), no en la TZ del servidor", async () => {
    const ev = await provider.handleWebhook(
      JSON.stringify({
        guia: 1,
        estado: [{ nombre_estado: "EN TRANSITO", fecha: "2020-12-11 11:04:43" }],
      }),
      {},
    );
    // 11:04:43 en Bogotá (-05:00) == 16:04:43 UTC.
    expect(ev.timestamp.toISOString()).toBe("2020-12-11T16:04:43.000Z");
  });

  it("acepta el shape AveCRM (estado como objeto único con `nombre`)", async () => {
    const ev = await provider.handleWebhook(
      JSON.stringify({ guia: "77", estado: { nombre: "DEVUELTO" } }),
      {},
    );
    expect(ev.trackingNumber).toBe("77");
    expect(ev.status).toBe("RETURNED");
  });
});

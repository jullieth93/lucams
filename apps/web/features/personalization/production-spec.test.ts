/*
 * Lo que hay que fabricar, y por qué contar archivos no sirve.
 *
 * Cada caso de aquí sale de un producto REAL del catálogo, verificado contra la base. No son
 * hipótesis: son las tres formas en que contar `productionUrls.length` produce el pedido equivocado.
 */

import { describe, expect, it } from "vitest";
import { resolveProductionSpec } from "./production-spec";

const vacio = {
  personalizationKind: null,
  productSchema: null,
  variantAttrs: null,
  physicalSpecs: null,
  canvasData: null,
  designMetadata: null,
  productionUrls: [] as string[],
  lineQty: 1,
};

describe("formato físico — qué es realmente lo que sale de la impresora", () => {
  /*
   * `abecedario-completo`: el editor dibuja las 27 fichas en un solo canvas y sube UN PNG. Contar
   * archivos diría "1 pieza" y Lucy entregaría una lámina sin recortar.
   */
  it("una lámina de abecedario son N fichas para recortar, no una pieza", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      productionUrls: ["d/slot-01.png"],
      designMetadata: { letters: Array.from({ length: 27 }, (_, i) => String(i)) },
    });
    expect(spec.formatoFisico).toEqual({ tipo: "lamina-fichas", fichas: 27 });
    expect(spec.queEsCadaArchivo).toContain("27 fichas");
    expect(spec.pasosArmado.join(" ")).toMatch(/recorta/i);
  });

  /*
   * `tiras-magneticas-fotos`: 3 PNG que son segmentos de UNA tira de 6.5×20 cm. Contar archivos
   * diría "3 imanes" — tres piezas donde va una.
   */
  it("una tira continua son segmentos de UNA pieza, no varias piezas", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      productionUrls: ["a.png", "b.png", "c.png"],
      canvasData: { unitTemplate: { gridCols: 1, gridGap: 0 }, gridLayout: { cols: 1, gap: 0 } },
    });
    expect(spec.formatoFisico).toEqual({ tipo: "tira-continua", segmentos: 3 });
    expect(spec.queEsCadaArchivo).toMatch(/no son 3 piezas/i);
    expect(spec.pasosArmado.join(" ")).toMatch(/a tope/i);
  });

  /*
   * Los separadores llegan de dos formas FÍSICAMENTE distintas y visualmente idénticas: si
   * `composeFaceStrips` alcanzó a componer, el PNG es la tira desplegada (se dobla); si falló, son
   * las caras sueltas (se pegan espalda con espalda). Armarlas al revés arruina la pieza.
   */
  it("distingue la tira desplegada (doblar) de las caras sueltas (pegar)", () => {
    const base = {
      ...vacio,
      productSchema: { facesPerUnit: 2 },
      productionUrls: ["a.png", "b.png"],
    };

    const desplegada = resolveProductionSpec({
      ...base,
      designMetadata: { faceStrips: { facesPerUnit: 2, strips: 2 } },
    });
    expect(desplegada.formatoFisico.tipo).toBe("tira-desplegada");
    expect(desplegada.pasosArmado.join(" ")).toMatch(/dobla/i);

    const sueltas = resolveProductionSpec({ ...base, designMetadata: {} });
    expect(sueltas.formatoFisico).toEqual({ tipo: "caras-sueltas", unidades: 1 });
    expect(sueltas.pasosArmado.join(" ")).toMatch(/espalda con espalda/i);
  });

  it("el caso corriente sigue siendo una pieza por archivo", () => {
    const spec = resolveProductionSpec({ ...vacio, productionUrls: ["a.png", "b.png", "c.png"] });
    expect(spec.formatoFisico).toEqual({ tipo: "piezas-sueltas", piezas: 3 });
  });
});

describe("cuántas unidades hay que entregar", () => {
  // 101 variantes del catálogo traen `quantity` y hasta hoy no lo leía nadie: "Set Notas ×2" son 8.
  it("multiplica la cantidad de la línea por las piezas del pack", () => {
    const spec = resolveProductionSpec({ ...vacio, lineQty: 2, variantAttrs: { quantity: 4 } });
    expect(spec.unidadesFisicas).toBe(8);
    expect(spec.copias).toBe(2);
  });

  it("sin pack, una unidad por cantidad", () => {
    expect(resolveProductionSpec({ ...vacio, lineQty: 3 }).unidadesFisicas).toBe(3);
  });
});

describe("lo que NO está horneado en el PNG y hay que escribir", () => {
  // 33 variantes llevan `magnet: false`. El paso de armado es completamente distinto.
  it("avisa cuando la variante va SIN imán", () => {
    const spec = resolveProductionSpec({ ...vacio, variantAttrs: { magnet: false } });
    expect(spec.especificaciones.find((x) => x.etiqueta === "Imán")?.valor).toMatch(/SIN imán/);
    expect(spec.pasosArmado.join(" ")).toMatch(/no le pegues imán/i);
  });

  /*
   * La medida sale de la VARIANTE: en `abecedario-completo`, `physicalSpecs` dice 7×10 cm (que es el
   * empaque) mientras cada ficha mide 5×7. Cortar por el dato equivocado arruina el pedido.
   */
  it("la medida de corte la manda la variante, no el producto", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      variantAttrs: { sizeCm: "5×7" },
      productSchema: { sizeCm: "7×10" },
    });
    expect(spec.especificaciones.find((x) => x.etiqueta === "Medida de corte")?.valor).toBe(
      "5×7 cm",
    );
  });

  it("el color del marco es el que eligió el cliente, con su nombre y su hex", () => {
    const spec = resolveProductionSpec({ ...vacio, canvasData: { borderColor: "rosa" } });
    const marco = spec.personalizacion.find((x) => x.etiqueta === "Color del marco");
    expect(marco?.valor).toBe("Rosa");
    expect(marco?.color).toBe("#E85B9F");
  });

  it("sin marco es una instrucción de corte, no una ausencia", () => {
    const spec = resolveProductionSpec({ ...vacio, canvasData: { borderColor: null } });
    expect(spec.personalizacion.find((x) => x.etiqueta === "Marco")?.valor).toMatch(/a sangre/i);
  });

  // Hay diseños de 2026 sobre un producto cuyo schema dice 2027: leer el del producto imprime mal.
  it("el año del calendario sale del diseño, no del producto", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      designMetadata: { calendarYear: 2026 },
      productSchema: { year: 2027 },
    });
    expect(spec.personalizacion.find((x) => x.etiqueta === "Año del calendario")?.valor).toBe(
      "2026",
    );
  });

  it("lista el color de CADA ficha: 27 colores no se verifican de memoria", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      designMetadata: { letters: ["A", "B", "C"], colors: ["rosa", "azul", "amarillo"] },
    });
    const porFicha = spec.personalizacion.find((x) => x.etiqueta === "Color por ficha")?.valor;
    expect(porFicha).toContain("A=rosa");
    expect(porFicha).toContain("C=amarillo");
  });

  it("recoge los textos que escribió el cliente, para cotejar tildes", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      canvasData: { slots: [{ textOverride: "Mamá" }, {}, { textOverride: "Ñoño" }] },
    });
    const t = spec.personalizacion.find((x) => x.etiqueta === "Textos del cliente")?.valor;
    expect(t).toContain('1: "Mamá"');
    expect(t).toContain('3: "Ñoño"');
    expect(t).not.toContain("2:");
  });
});

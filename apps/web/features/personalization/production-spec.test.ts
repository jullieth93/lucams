/*
 * Lo que hay que fabricar, y por qué contar archivos no sirve.
 *
 * Cada caso de aquí sale de un producto REAL del catálogo, verificado contra la base. No son
 * hipótesis: son las tres formas en que contar `productionUrls.length` produce el pedido equivocado.
 */

import { describe, expect, it } from "vitest";
import { resolveProductionSpec, productionPieceGroups } from "./production-spec";

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

  /*
   * Multi-unidad (owner 2026-09-09): 2 tiras de 3 fotos = 6 segmentos que forman DOS
   * piezas continuas independientes. Contar archivos diría "6 piezas" o "1 tira de 6".
   */
  it("2 tiras de 3 fotos: 6 segmentos que forman DOS tiras independientes", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      productionUrls: ["a.png", "b.png", "c.png", "d.png", "e.png", "f.png"],
      canvasData: {
        unitTemplate: { gridCols: 1, gridGap: 0 },
        gridLayout: { cols: 1, gap: 0 },
        unitCount: 2,
        unitSlots: 3,
        photoSlots: 3,
        slotCount: 6,
      },
    });
    expect(spec.formatoFisico).toEqual({ tipo: "tira-continua", segmentos: 6, tiras: 2 });
    expect(spec.queEsCadaArchivo).toMatch(/2 tiras/i);
    expect(spec.queEsCadaArchivo).toMatch(/3 por tira/i);
    expect(spec.pasosArmado.join(" ")).toMatch(/3 por tira/i);
  });

  /*
   * Multi-unidad: 2 calendarios de 12 páginas = 24 archivos que forman DOS sets.
   * Agruparlos como 24 sueltas mezcla los meses de los dos calendarios.
   */
  it("2 calendarios: 24 archivos que se agrupan en 2 sets de 12 páginas", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      personalizationKind: "CALENDAR_PHOTO_MONTH",
      productionUrls: Array.from({ length: 24 }, (_, i) => `p${i}.png`),
      canvasData: { unitCount: 2, unitSlots: 12, slotCount: 24 },
    });
    expect(spec.formatoFisico).toEqual({
      tipo: "piezas-sueltas",
      piezas: 24,
      unidades: { count: 2, singular: "calendario", plural: "calendarios", piezasPorUnidad: 12 },
    });
    expect(spec.queEsCadaArchivo).toMatch(/2 calendarios de 12/i);
    expect(spec.pasosArmado.join(" ")).toMatch(/agrúpalos en 2 calendarios/i);
  });

  /*
   * Multi-unidad en sets de letras: 2 abecedarios = 2 láminas, cada una con sus
   * 27 fichas para recortar (no una lámina de 54 ni una sola lámina).
   */
  it("2 sets de letras: 2 láminas independientes de 27 fichas", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      productionUrls: ["l1.png", "l2.png"],
      designMetadata: {
        letters: Array.from({ length: 27 }, (_, i) => String(i)),
        unitCount: 2,
        surface: "letterset",
      },
    });
    expect(spec.formatoFisico).toEqual({ tipo: "lamina-fichas", fichas: 27, laminas: 2 });
    expect(spec.queEsCadaArchivo).toMatch(/2 láminas/i);
    expect(spec.pasosArmado.join(" ")).toMatch(/2 × 27/i);
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

  // Multi-unidad (2026-09-09): la línea es UNA (qty=1) pero el diseño contiene N
  // unidades → imprenta fabrica TODAS. Mismo multiplicador que el precio del carrito.
  it("tiras ×2 del mismo diseño: 2 unidades físicas con qty=1", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      lineQty: 1,
      variantAttrs: { quantity: 1 },
      canvasData: { version: 2, slotCount: 6, unitCount: 2, unitSlots: 3, photoSlots: 3 },
    });
    expect(spec.unidadesFisicas).toBe(2);
  });

  it("calendarios ×2 del mismo diseño: 2 sets con qty=1", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      lineQty: 1,
      canvasData: { version: 2, slotCount: 24, unitCount: 2, unitSlots: 12 },
    });
    expect(spec.unidadesFisicas).toBe(2);
  });

  it("packs (separadores ×3): la variante ya es el pack → 3, no 6", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      lineQty: 1,
      productSchema: { facesPerUnit: 2 },
      variantAttrs: { quantity: 3 },
      canvasData: { version: 2, slotCount: 6, unitCount: 3, unitSlots: 2, photoSlots: 3 },
    });
    expect(spec.unidadesFisicas).toBe(3);
  });

  it("sets de letras ×2 (metadata): 2 sets con qty=1", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      lineQty: 1,
      designMetadata: { unitCount: 2, surface: "letterset" },
    });
    expect(spec.unidadesFisicas).toBe(2);
  });

  it("la personalización anuncia las unidades del diseño cuando son varias", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      canvasData: { version: 2, slotCount: 6, unitCount: 2, unitSlots: 3, photoSlots: 3 },
    });
    const dato = spec.personalizacion.find((x) => x.etiqueta === "Unidades del diseño");
    expect(dato?.valor).toMatch(/2 unidades distintas/i);
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

  it("identifica reversos B opcionales en blanco y prohíbe espejar la cara A", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      productSchema: { facesPerUnit: 2, backOptional: true, noFold: true },
      productionUrls: ["pieza-1.png", "pieza-2.png"],
      designMetadata: { faceStrips: { facesPerUnit: 2, strips: 2 } },
      canvasData: {
        slots: [
          { slotIndex: 0, assetId: "a" },
          { slotIndex: 1, assetId: null, assetUrl: null },
          { slotIndex: 2, assetId: "b" },
          { slotIndex: 3, assetId: "c" },
        ],
      },
    });

    expect(spec.reversosConMarcaAgua).toEqual([1]);
    expect(
      spec.personalizacion.find((x) => x.etiqueta === "Reversos con marca de agua")?.valor,
    ).toMatch(/unidad 1/i);
    // El patrón ya viene horneado en el archivo: NO hay paso extra de armado para el reverso.
    expect(spec.pasosArmado.join(" ")).not.toMatch(/en BLANCO/i);
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

  // Lucy 2026-09-05 — opción "Sin borde" del Estudio: el PNG la refleja, pero la ficha de taller
  // debe decirla explícita. Solo se anota el caso distinto: default (sin clave) = con borde.
  it("anota «Sin borde» en la ficha de taller cuando el diseño de set de letras lo eligió", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      designMetadata: {
        surface: "letterset",
        letters: ["A", "B", "C"],
        withBorder: false,
      },
    });
    expect(spec.personalizacion.find((x) => x.etiqueta === "Borde")?.valor).toMatch(/Sin borde/);
  });

  it("diseño de set de letras sin la clave (previo a la opción) NO genera línea de borde", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      designMetadata: { surface: "letterset", letters: ["A", "B", "C"] },
    });
    expect(spec.personalizacion.find((x) => x.etiqueta === "Borde")).toBeUndefined();
  });

  // Lucy 2026-09-09 — la MISMA opción en las tiras de nombre: la ficha de taller anota
  // «Sin borde» igual que en el set de letras (sin borde se recorta a ras del contorno).
  it("anota «Sin borde» cuando el diseño de NOMBRE lo eligió (misma nota que el set)", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      designMetadata: {
        surface: "name",
        letters: ["L", "U", "C", "I", "A"],
        withBorder: false,
      },
    });
    expect(spec.personalizacion.find((x) => x.etiqueta === "Borde")?.valor).toBe(
      "Sin borde — recortar a ras del contorno",
    );
  });

  it("diseño de nombre sin la clave (previo a la opción) NO genera línea de borde", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      designMetadata: { surface: "name", letters: ["L", "U", "C", "I", "A"] },
    });
    expect(spec.personalizacion.find((x) => x.etiqueta === "Borde")).toBeUndefined();
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

describe("sets de letras POR FICHA (owner 2026-11-03) + agrupación de piezas (W2)", () => {
  const metaVocales = {
    surface: "letterset",
    letters: ["A", "E", "I", "O", "U"],
    colors: ["#111"],
    withBorder: true,
  };

  it("5 fichas sueltas (1 set) → fichas-sueltas: un archivo por ficha, no lámina para recortar", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      designMetadata: metaVocales,
      productionUrls: ["f1", "f2", "f3", "f4", "f5"],
      variantAttrs: { sizeCm: "5×7" },
    });
    expect(spec.formatoFisico).toEqual({ tipo: "fichas-sueltas", fichas: 5, sets: 1 });
    expect(spec.queEsCadaArchivo).toMatch(/UNA ficha por archivo/);
    expect(spec.pasosArmado.join(" ")).toMatch(/troquel/);
  });

  it("2 sets × 27 letras (54 archivos) → fichas-sueltas con sets=2", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      designMetadata: {
        ...metaVocales,
        letters: Array.from("ABCDEFGHIJKLMNÑOPQRSTUVWXYZ"),
        unitCount: 2,
        units: [
          { colors: ["#111"], styleSetId: "set_1", withBorder: true },
          { colors: ["#222"], styleSetId: null, withBorder: false },
        ],
      },
      productionUrls: Array.from({ length: 54 }, (_, i) => `f${i}`),
    });
    expect(spec.formatoFisico).toEqual({ tipo: "fichas-sueltas", fichas: 27, sets: 2 });
    expect(spec.queEsCadaArchivo).toMatch(/2 sets de 27 fichas/);
  });

  it("diseño LEGACY (1 lámina por set) sigue siendo lamina-fichas", () => {
    const spec = resolveProductionSpec({
      ...vacio,
      designMetadata: metaVocales,
      productionUrls: ["lamina-1"],
    });
    expect(spec.formatoFisico).toEqual({ tipo: "lamina-fichas", fichas: 5 });
  });

  it("productionPieceGroups — fichas sueltas: grupos por set con rótulo de letra", () => {
    const groups = productionPieceGroups({
      personalizationKind: "LETTER_SET",
      canvasData: null,
      designMetadata: {
        ...metaVocales,
        unitCount: 2,
        units: [
          { colors: [], styleSetId: "set_1", withBorder: true },
          { colors: [], styleSetId: null, withBorder: false },
        ],
      },
      productionCount: 10,
    });
    expect(groups).toHaveLength(2);
    expect(groups![0]!.title).toBe("Set 1 de 2");
    expect(groups![0]!.note).toMatch(/Fichas ilustradas/);
    expect(groups![0]!.pieces.map((p) => p.label)).toEqual([
      "Ficha A",
      "Ficha E",
      "Ficha I",
      "Ficha O",
      "Ficha U",
    ]);
    expect(groups![1]!.pieces[0]!.index).toBe(5); // índice global continúa
    expect(groups![1]!.note).toMatch(/Solo letra/);
    expect(groups![1]!.note).toMatch(/sin borde/i);
  });

  it("productionPieceGroups — calendario ×2: grupos por calendario con páginas por mes", () => {
    const groups = productionPieceGroups({
      personalizationKind: "CALENDAR_PHOTO_MONTH",
      canvasData: { version: 2, slotCount: 24, unitCount: 2, unitSlots: 12 },
      designMetadata: { calendarYear: 2027 },
      productionCount: 24,
      startMonth: 0,
    });
    expect(groups).toHaveLength(2);
    expect(groups![0]!.title).toBe("Calendario 1 de 2");
    expect(groups![0]!.pieces.map((p) => p.label)).toEqual([
      "Enero 2027",
      "Febrero 2027",
      "Marzo 2027",
      "Abril 2027",
      "Mayo 2027",
      "Junio 2027",
      "Julio 2027",
      "Agosto 2027",
      "Septiembre 2027",
      "Octubre 2027",
      "Noviembre 2027",
      "Diciembre 2027",
    ]);
    expect(groups![1]!.pieces[0]!.index).toBe(12);
  });

  it("productionPieceGroups — calendario de UN set: un solo grupo «Calendario»", () => {
    const groups = productionPieceGroups({
      personalizationKind: "CALENDAR_PHOTO_MONTH",
      canvasData: { version: 2, slotCount: 12 },
      designMetadata: {},
      productionCount: 12,
    });
    expect(groups).toHaveLength(1);
    expect(groups![0]!.title).toBe("Calendario");
    expect(groups![0]!.pieces).toHaveLength(12);
  });

  it("productionPieceGroups — tiras ×2: grupos por tira con segmentos", () => {
    const groups = productionPieceGroups({
      personalizationKind: "PHOTO_STRIP",
      canvasData: {
        version: 2,
        slotCount: 6,
        unitCount: 2,
        unitSlots: 3,
        unitTemplate: { gridCols: 1, gridGap: 0 },
      },
      designMetadata: null,
      productionCount: 6,
    });
    expect(groups).toHaveLength(2);
    expect(groups![0]!.title).toBe("Tira 1 de 2");
    expect(groups![0]!.pieces.map((p) => p.label)).toEqual([
      "Segmento 1",
      "Segmento 2",
      "Segmento 3",
    ]);
  });

  it("productionPieceGroups — producto plano (fotoimán suelto) → null (grilla histórica)", () => {
    const groups = productionPieceGroups({
      personalizationKind: "PHOTO_PACK",
      canvasData: { version: 2, slotCount: 3 },
      designMetadata: null,
      productionCount: 3,
    });
    expect(groups).toBeNull();
  });
});

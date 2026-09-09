/*
 * Unit tests — features/products/variant-schemas.
 * Foco: mergePreservingUnmanagedAttributes (catálogo WhatsApp 2026-07-22): el
 * form del admin solo edita un subconjunto de claves de attributes (sizeCm,
 * photoSlots, quantity, color, aspectRatio, shape, finish y —desde
 * 2026-09-08b— magnet); el resto (frameStyle, variantStyle, theme, language,
 * size, variantShape…) debe SOBREVIVIR a un guardado — antes se perdían
 * silenciosamente al editar precio/nombre.
 */

import { describe, it, expect } from "vitest";
import {
  groupVariantsByCoverSignature,
  mergePreservingUnmanagedAttributes,
  parseVariantAttributes,
  sameImageArrays,
  variantCoverSignature,
  PDP_HIDDEN_DIMENSION_KEYS,
  PDP_DIMENSION_LABEL_OVERRIDES,
  isPhotoPackCatalog,
  photoPackDistinctSizes,
  photoPackMinPrice,
  conImanDefaultVariant,
  parseAttributesFromForm,
} from "./variant-schemas";

describe("mergePreservingUnmanagedAttributes", () => {
  it("preserva las dimensiones sin campo en el form y aplica las del form", () => {
    const existing = {
      shape: "rectangle",
      sizeCm: "6.5×6.5",
      quantity: 3,
      photoSlots: 3,
      aspectRatio: "1:1",
      frameStyle: "negro",
      variantShape: "cuadrado",
    };
    // El form real reenvía TODAS sus claves editadas (controladas + ocultas):
    // shape llega por input oculto, sizeCm/aspectRatio/quantity/photoSlots por campos.
    const fromForm = {
      shape: "rectangle" as const,
      sizeCm: "7.5×10",
      aspectRatio: "3:4",
      quantity: 3,
      photoSlots: 3,
    };
    const merged = mergePreservingUnmanagedAttributes(existing, fromForm);
    expect(merged).toEqual({
      frameStyle: "negro",
      variantShape: "cuadrado",
      shape: "rectangle",
      sizeCm: "7.5×10",
      aspectRatio: "3:4",
      quantity: 3,
      photoSlots: 3,
    });
  });

  it("permite BORRAR una clave gestionada por el form (vacía en el form → no vuelve)", () => {
    const existing = { sizeCm: "5×5", color: "rosa", finish: "matte" };
    // color y finish gestionados por el form: al no venir en formAttrs, se eliminan.
    const merged = mergePreservingUnmanagedAttributes(existing, { sizeCm: "6.5×6.5" });
    expect(merged).toEqual({ sizeCm: "6.5×6.5" });
    expect(merged).not.toHaveProperty("color");
    expect(merged).not.toHaveProperty("finish");
  });

  it("con variante sin attributes previos devuelve solo lo del form", () => {
    expect(mergePreservingUnmanagedAttributes(null, { quantity: 2 })).toEqual({ quantity: 2 });
    expect(mergePreservingUnmanagedAttributes(undefined, {})).toEqual({});
    expect(mergePreservingUnmanagedAttributes("basura", { sizeCm: "6×2" })).toEqual({
      sizeCm: "6×2",
    });
  });

  it("preserva theme/language del Pack Vocales y variantStyle de la Polaroid", () => {
    // magnet ES clave gestionada del form desde 2026-09-08b (select ¿Con imán?):
    // el form real la reenvía siempre (controlada, default del valor actual).
    const vocales = { size: "mini", sizeCm: "5×7", magnet: true, theme: "frutas", language: "en" };
    const mergedVoc = mergePreservingUnmanagedAttributes(vocales, { sizeCm: "5×7", magnet: true });
    expect(mergedVoc).toMatchObject({
      magnet: true,
      theme: "frutas",
      language: "en",
      size: "mini",
    });

    const polaroid = {
      sizeCm: "6×8",
      photoSlots: 12,
      aspectRatio: "400:580",
      variantStyle: "pasteles",
    };
    // El form real reenvía sizeCm/aspectRatio (prefill); variantStyle no tiene campo → se preserva.
    const mergedPol = mergePreservingUnmanagedAttributes(polaroid, {
      sizeCm: "6×8",
      photoSlots: 12,
      aspectRatio: "400:580",
    });
    expect(mergedPol).toEqual(polaroid);
  });
});

describe("parseVariantAttributes", () => {
  it("conserva las claves nuevas del catálogo (frameStyle/variantStyle/theme/variantShape)", () => {
    const parsed = parseVariantAttributes({
      frameStyle: "blanco",
      variantStyle: "instagram",
      theme: "animales",
      variantShape: "rectangular",
    });
    expect(parsed).toEqual({
      frameStyle: "blanco",
      variantStyle: "instagram",
      theme: "animales",
      variantShape: "rectangular",
    });
  });
});

/*
 * Portadas compartidas por DISEÑO (reporte Lucy 2026-08-25, separadores-magneticos):
 * la firma ignora quantity/photoSlots/pricePerTile — las 6 cantidades de un mismo
 * tamaño son UN diseño y comparten fotos; sizeCm/variantShape SÍ lo distinguen.
 */
describe("variantCoverSignature", () => {
  it("la cantidad (quantity/photoSlots) NO distingue la firma", () => {
    const base = variantCoverSignature({ sizeCm: "4×4.2", quantity: 1, photoSlots: 1 });
    for (const n of [2, 3, 4, 5, 6]) {
      expect(variantCoverSignature({ sizeCm: "4×4.2", quantity: n, photoSlots: n })).toBe(base);
    }
  });

  it("sizeCm y variantShape SÍ distinguen la firma", () => {
    const cuadrado = variantCoverSignature({ sizeCm: "4×4.2", variantShape: "cuadrado" });
    const rectangular = variantCoverSignature({ sizeCm: "6x2", variantShape: "rectangular" });
    expect(cuadrado).not.toBe(rectangular);
    // Solo cambia sizeCm (misma forma) → firma distinta.
    expect(variantCoverSignature({ sizeCm: "6x2", variantShape: "cuadrado" })).not.toBe(cuadrado);
  });

  it("pricePerTile (pricing, ADR-057) NO distingue la firma", () => {
    expect(variantCoverSignature({ variant: "name", size: "mini" })).toBe(
      variantCoverSignature({ variant: "name", size: "mini", pricePerTile: true }),
    );
  });

  it("el orden de las claves es irrelevante (JSON estable)", () => {
    const a = variantCoverSignature({ color: "rosa", sizeCm: "5×5", shape: "circle" });
    const b = variantCoverSignature({ shape: "circle", sizeCm: "5×5", color: "rosa" });
    expect(a).toBe(b);
  });

  it("attributes malformed (vía parseVariantAttributes) → firma vacía", () => {
    expect(variantCoverSignature(parseVariantAttributes("basura"))).toBe("[]");
    expect(variantCoverSignature(parseVariantAttributes(null))).toBe("[]");
    // Solo claves ignoradas → también firma vacía (mismo grupo que las sin attributes).
    expect(variantCoverSignature({ quantity: 3, photoSlots: 3 })).toBe("[]");
  });

  it("magnet NO distingue la firma (Con/Sin imán comparten portada — el imán va atrás)", () => {
    // Regla 2026-09-08b: las gemelas del par ¿Con imán? comparten las fotos de
    // portada del diseño (no se suben dos veces — mismo reporte Lucy 2026-08-25).
    expect(variantCoverSignature({ sizeCm: "7.5×10", magnet: true })).toBe(
      variantCoverSignature({ sizeCm: "7.5×10", magnet: false }),
    );
    expect(variantCoverSignature({ sizeCm: "7.5×10" })).toBe(
      variantCoverSignature({ sizeCm: "7.5×10", magnet: false }),
    );
  });
});

describe("groupVariantsByCoverSignature", () => {
  it("agrupa las 12 opciones de separadores-magneticos en 2 diseños (2 tamaños × 6 cantidades)", () => {
    const variants = ["4×4.2", "6x2"].flatMap((sizeCm) =>
      [1, 2, 3, 4, 5, 6].map((n) => ({
        id: `${sizeCm}-x${n}`,
        attributes: { sizeCm, quantity: n, photoSlots: n },
      })),
    );
    const groups = groupVariantsByCoverSignature(variants);
    expect(groups.size).toBe(2);
    for (const group of groups.values()) {
      expect(group).toHaveLength(6);
      expect(group.every((v) => v.id.startsWith(group[0].id.split("-x")[0]))).toBe(true);
    }
  });

  it("attributes malformed caen juntos en el grupo de firma vacía", () => {
    const variants = [
      { id: "ok", attributes: { sizeCm: "5×5" } },
      { id: "mala", attributes: "basura" },
      { id: "nula", attributes: null },
    ];
    const groups = groupVariantsByCoverSignature(variants);
    expect(groups.size).toBe(2);
    expect(groups.get("[]")?.map((v) => v.id)).toEqual(["mala", "nula"]);
  });
});

describe("sameImageArrays", () => {
  it("mismo contenido y orden → true; distinto orden o largo → false", () => {
    expect(sameImageArrays(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameImageArrays([], [])).toBe(true);
    expect(sameImageArrays(["b", "a"], ["a", "b"])).toBe(false);
    expect(sameImageArrays(["a"], ["a", "b"])).toBe(false);
    expect(sameImageArrays(["a", "b"], ["a", "c"])).toBe(false);
  });
});

/*
 * Regla 2026-09-08b (Lucy, unificación "Unidades") — la PDP de TODA familia de
 * tamaño variable muestra la dimensión de pack size como "Unidades" (polaroid y
 * cuadrados incluidos: antes la elegían DENTRO del Estudio). En la PDP solo
 * quedan ocultas las dimensiones que se eligen como plantilla/estilo en el
 * Estudio (variantStyle/frameStyle/theme). El N elegido viaja en ?variant= → el
 * Estudio abre con ese N (merge de la variante sobre el schema).
 */
describe("packs — dimensión 'Unidades' en la PDP (regla 2026-09-08b)", () => {
  it("fotoimanes (polaroid/cuadrados): solo se ocultan las dimensiones de estilo del Estudio", () => {
    expect(PDP_HIDDEN_DIMENSION_KEYS["set-fotoimanes-polaroid"]).toEqual(["variantStyle"]);
    expect(PDP_HIDDEN_DIMENSION_KEYS["set-fotoimanes-cuadrados"]).toEqual(["frameStyle"]);
    // El pack size (photoSlots/quantity) YA NO se oculta: es la "Unidades" de la PDP.
    expect(PDP_HIDDEN_DIMENSION_KEYS["set-fotoimanes-polaroid"]).not.toContain("photoSlots");
    expect(PDP_HIDDEN_DIMENSION_KEYS["set-fotoimanes-cuadrados"]).not.toContain("quantity");
    // pack-vocales (LETTER_SET) sigue igual: theme oculto, fotos NO aplica.
    expect(PDP_HIDDEN_DIMENSION_KEYS["pack-vocales"]).toEqual(["theme"]);
  });

  it("separadores: solo photoSlots oculto → quantity queda visible con label 'Unidades'", () => {
    expect(PDP_HIDDEN_DIMENSION_KEYS["separadores-magneticos"]).toEqual(["photoSlots"]);
    expect(PDP_HIDDEN_DIMENSION_KEYS["separadores-alargados"]).toEqual(["photoSlots"]);
    expect(PDP_DIMENSION_LABEL_OVERRIDES["separadores-magneticos"]).toEqual({
      quantity: "Unidades",
    });
    expect(PDP_DIMENSION_LABEL_OVERRIDES["separadores-alargados"]).toEqual({
      quantity: "Unidades",
    });
  });

  it("tiras/polaroid/cuadrados: el pack size viaja en photoSlots con label 'Unidades'", () => {
    expect(PDP_HIDDEN_DIMENSION_KEYS["tiras-magneticas-fotos"]).toEqual(["quantity"]);
    expect(PDP_DIMENSION_LABEL_OVERRIDES["tiras-magneticas-fotos"]).toEqual({
      photoSlots: "Unidades",
    });
    expect(PDP_DIMENSION_LABEL_OVERRIDES["set-fotoimanes-polaroid"]).toEqual({
      photoSlots: "Unidades",
    });
    expect(PDP_DIMENSION_LABEL_OVERRIDES["set-fotoimanes-cuadrados"]).toEqual({
      photoSlots: "Unidades",
    });
  });

  // (2026-09-07) Productos INACTIVOS: si Lucy los reactiva, su pack size (sus
  // variantes del seed declaran SOLO photoSlots) también sale como "Unidades" —
  // no se les oculta nada.
  it("los 2 packs inactivos (circulares/corazón) no ocultan nada y etiquetan 'Unidades'", () => {
    expect(PDP_HIDDEN_DIMENSION_KEYS["set-fotoimanes-circulares"]).toBeUndefined();
    expect(PDP_HIDDEN_DIMENSION_KEYS["set-fotoimanes-corazon"]).toBeUndefined();
    expect(PDP_DIMENSION_LABEL_OVERRIDES["set-fotoimanes-circulares"]).toEqual({
      photoSlots: "Unidades",
    });
    expect(PDP_DIMENSION_LABEL_OVERRIDES["set-fotoimanes-corazon"]).toEqual({
      photoSlots: "Unidades",
    });
  });

  it("isPhotoPackCatalog: solo PHOTO_PACK con variantes que declaran photoSlots", () => {
    const packVariant = { attributes: { photoSlots: 4, sizeCm: "7.5×10" } };
    expect(isPhotoPackCatalog("PHOTO_PACK", [packVariant])).toBe(true);
    // Kind foto pero sin variantes con photoSlots (ej. catálogo legacy) → no.
    expect(isPhotoPackCatalog("PHOTO_PACK", [{ attributes: { sizeCm: "5×5" } }])).toBe(false);
    // Calendario/grid no son packs aunque traigan photoSlots en el schema.
    expect(isPhotoPackCatalog("CALENDAR_PHOTO_MONTH", [packVariant])).toBe(false);
    expect(isPhotoPackCatalog("CUSTOM_DECOR", [packVariant])).toBe(false);
  });

  it("photoPackDistinctSizes: tamaños únicos sin vacíos", () => {
    const variants = [
      { attributes: { photoSlots: 1, sizeCm: "6.5×6.5" } },
      { attributes: { photoSlots: 2, sizeCm: "6.5×6.5" } },
      { attributes: { photoSlots: 1, sizeCm: "10×10" } },
      { attributes: { photoSlots: 3 } }, // sin tamaño → no entra
    ];
    expect(photoPackDistinctSizes(variants)).toEqual(["6.5×6.5", "10×10"]);
  });

  it('photoPackMinPrice: "Desde" = mínimo entre variantes, nunca basePrice desactualizado', () => {
    // Réplica de set-fotoimanes-cuadrados: basePrice 45.000, variante mínima 16.000.
    const variants = [
      { price: 16_000 },
      { price: 24_000 },
      { price: null }, // hereda base
    ];
    expect(photoPackMinPrice(variants, 45_000_000)).toBe(16_000);
    // price=null hereda basePrice.
    expect(photoPackMinPrice([{ price: null }], 45_000)).toBe(45_000);
    // Sin variantes → basePrice.
    expect(photoPackMinPrice([], 45_000)).toBe(45_000);
  });
});

/*
 * Default "Con imán" (regla 2026-09-08b): cuando las variantes del producto son
 * el MISMO diseño en las dos opciones (solo difiere `magnet`), la PDP
 * preselecciona la de Con imán — el cliente no hace un click para quedarse con
 * el default. Con más dimensiones de elección (tamaño/idioma…) NO aplica: sigue
 * la selección guiada (el re-anchor del selector prefiere Con imán).
 */
describe("conImanDefaultVariant", () => {
  const v = (id: string, attributes: Record<string, unknown>) => ({ id, attributes });

  it("devuelve la variante Con imán cuando las variantes solo difieren en magnet", () => {
    // Espejo del calendario tras seed-magnet-variants.mjs.
    const variants = [
      v("cal-mag", { sizeCm: "7.5×10", photoSlots: 12, aspectRatio: "3:4", magnet: true }),
      v("cal-nomag", { sizeCm: "7.5×10", photoSlots: 12, aspectRatio: "3:4", magnet: false }),
    ];
    expect(conImanDefaultVariant(variants)?.id).toBe("cal-mag");
  });

  it("null cuando hay más dimensiones de elección (selección guiada sigue)", () => {
    const variants = [
      v("a", { sizeCm: "5×7", magnet: true }),
      v("b", { sizeCm: "5×7", magnet: false }),
      v("c", { sizeCm: "7×10", magnet: true }),
      v("d", { sizeCm: "7×10", magnet: false }),
    ];
    expect(conImanDefaultVariant(variants)).toBeNull();
  });

  it("null sin par completo (solo Con imán, o alguna variante sin la clave)", () => {
    expect(conImanDefaultVariant([v("a", { magnet: true }), v("b", { magnet: true })])).toBeNull();
    expect(conImanDefaultVariant([v("a", { magnet: true }), v("b", { sizeCm: "5×5" })])).toBeNull();
    expect(conImanDefaultVariant([v("a", { magnet: true })])).toBeNull();
    expect(conImanDefaultVariant([])).toBeNull();
  });
});

/*
 * parseAttributesFromForm — form del admin /admin/productos/[id]/variants
 * (2026-09-08b: `magnet` es clave first-class del form — select ¿Lleva imán?).
 */
describe("parseAttributesFromForm", () => {
  const fd = (entries: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.set(k, v);
    return f;
  };

  it("parsea las claves del form a tipo fuerte; vacíos quedan fuera", () => {
    const attrs = parseAttributesFromForm(
      fd({
        attr_sizeCm: "7.5×10",
        attr_photoSlots: "12",
        attr_quantity: "",
        attr_shape: "rectangle",
        attr_finish: "matte",
      }),
    );
    expect(attrs).toEqual({
      sizeCm: "7.5×10",
      photoSlots: 12,
      shape: "rectangle",
      finish: "matte",
    });
  });

  it("magnet: 'true'/'false' se escriben; vacío u otro valor no escribe la clave", () => {
    expect(parseAttributesFromForm(fd({ attr_magnet: "true" }))).toEqual({ magnet: true });
    expect(parseAttributesFromForm(fd({ attr_magnet: "false" }))).toEqual({ magnet: false });
    expect(parseAttributesFromForm(fd({ attr_magnet: "" }))).not.toHaveProperty("magnet");
    expect(parseAttributesFromForm(fd({}))).not.toHaveProperty("magnet");
    // Valor arbitrario de la URL del form no cuela como boolean.
    expect(parseAttributesFromForm(fd({ attr_magnet: "si" }))).not.toHaveProperty("magnet");
  });

  it("números no enteros o <=0 no cuelan (photoSlots/quantity)", () => {
    expect(parseAttributesFromForm(fd({ attr_photoSlots: "2.5" }))).not.toHaveProperty(
      "photoSlots",
    );
    expect(parseAttributesFromForm(fd({ attr_quantity: "0" }))).not.toHaveProperty("quantity");
  });
});

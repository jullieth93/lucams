/*
 * Unit tests — features/products/variant-schemas.
 * Foco: mergePreservingUnmanagedAttributes (catálogo WhatsApp 2026-07-22): el
 * form del admin solo edita 7 claves de attributes; el resto (frameStyle,
 * variantStyle, theme, language, magnet, size, variantShape…) debe SOBREVIVIR
 * a un guardado — antes se perdían silenciosamente al editar precio/nombre.
 */

import { describe, it, expect } from "vitest";
import {
  groupVariantsByCoverSignature,
  mergePreservingUnmanagedAttributes,
  parseVariantAttributes,
  sameImageArrays,
  variantCoverSignature,
  PDP_HIDDEN_DIMENSION_KEYS,
  isPhotoPackCatalog,
  photoPackDistinctSizes,
  photoPackMinPrice,
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
    const vocales = { size: "mini", sizeCm: "5×7", magnet: true, theme: "frutas", language: "en" };
    const mergedVoc = mergePreservingUnmanagedAttributes(vocales, { sizeCm: "5×7" });
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
 * Lucy 2026-09-05 — "las fotos se eligen en el Estudio, no en la PDP": los 5
 * packs de fotoimanes ocultan photoSlots/quantity del selector (queda solo
 * Tamaño cuando hay >1) y el CTA al Estudio exige a lo sumo el tamaño. El N de
 * fotos y el precio final se resuelven en el Estudio/carrito server-side.
 */
describe("packs de fotoimanes — catálogo y PDP (Lucy 2026-09-05)", () => {
  const PACK_SLUGS = [
    "set-fotoimanes-polaroid",
    "set-fotoimanes-cuadrados",
    "separadores-magneticos",
    "separadores-alargados",
    "tiras-magneticas-fotos",
  ];

  it("los 5 packs ocultan photoSlots y quantity en la PDP (sumado a lo que ya ocultaba cada slug)", () => {
    for (const slug of PACK_SLUGS) {
      const hidden = PDP_HIDDEN_DIMENSION_KEYS[slug];
      expect(hidden, slug).toBeDefined();
      expect(hidden, slug).toContain("photoSlots");
      expect(hidden, slug).toContain("quantity");
    }
    // Ocultar fotoSlots NO tira las ocultas previas de cada familia.
    expect(PDP_HIDDEN_DIMENSION_KEYS["set-fotoimanes-polaroid"]).toContain("variantStyle");
    expect(PDP_HIDDEN_DIMENSION_KEYS["set-fotoimanes-cuadrados"]).toContain("frameStyle");
    // pack-vocales (LETTER_SET) sigue igual: theme oculto, fotos NO aplica.
    expect(PDP_HIDDEN_DIMENSION_KEYS["pack-vocales"]).toEqual(["theme"]);
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

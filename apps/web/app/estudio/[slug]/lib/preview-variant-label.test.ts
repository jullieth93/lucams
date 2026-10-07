/*
 * Fase 2 · item 2.3 — desglose completo de la variante EFECTIVA en la Vista
 * Previa de TODAS las superficies foto (antes solo `{ magnet }`).
 */

import { describe, it, expect } from "vitest";
import { effectivePreviewAttributes, studioPreviewVariantLabel } from "./preview-variant-label";

describe("effectivePreviewAttributes", () => {
  it("extrae solo las claves del desglose e ignora las ajenas al schema del producto", () => {
    const attrs = effectivePreviewAttributes({
      mergedSchema: {
        photoSlots: 12,
        sizeCm: "7.5×10",
        magnet: true,
        gridCols: 3,
        backOptional: true,
        frameOptions: [{ id: "rosa" }],
      },
    });
    expect(attrs).toEqual({ photoSlots: 12, sizeCm: "7.5×10", magnet: true });
  });

  it("descarta valores con tipo disonante sin tirar el resto del desglose", () => {
    const attrs = effectivePreviewAttributes({
      mergedSchema: {
        sizeCm: 42, // tipo errado → se omite solo esta clave
        shape: "octágono", // fuera del enum → se omite
        language: "es",
        magnet: false,
      },
    });
    expect(attrs).toEqual({ language: "es", magnet: false });
  });

  it("los overrides vivos del canvas ganan sobre el schema mergeado (packs)", () => {
    const attrs = effectivePreviewAttributes({
      mergedSchema: { photoSlots: 6, sizeCm: "5×7", magnet: true },
      live: { photoSlots: 9, magnet: false },
    });
    expect(attrs.photoSlots).toBe(9);
    expect(attrs.sizeCm).toBe("5×7"); // sin override → conserva el mergeado
    expect(attrs.magnet).toBe(false);
  });

  it("schema nulo → objeto vacío (no revienta)", () => {
    expect(effectivePreviewAttributes({ mergedSchema: null })).toEqual({});
  });
});

describe("studioPreviewVariantLabel", () => {
  it("calendario: desglose completo menos lo que el resumen de la modal ya enuncia", () => {
    const label = studioPreviewVariantLabel({
      mergedSchema: { photoSlots: 12, sizeCm: "7.5×10", magnet: false },
      omit: ["quantity", "photoSlots", "sizeCm"],
    });
    expect(label).toBe("Sin imán (adhesivo)");
  });

  it("producto con idioma y estilo: muestra el desglose que antes se perdía", () => {
    const label = studioPreviewVariantLabel({
      mergedSchema: { sizeCm: "5×7", magnet: true, language: "es", variantStyle: "instagram" },
      omit: ["quantity", "photoSlots", "sizeCm"],
    });
    expect(label).toBe("Con imán · Español · Estilo Instagram");
  });

  it("forma y acabado también entran al desglose (corazón brillante)", () => {
    const label = studioPreviewVariantLabel({
      mergedSchema: { shape: "heart", finish: "glossy", magnet: true },
      omit: ["quantity", "photoSlots", "sizeCm"],
    });
    expect(label).toBe("Corazón · Brillante · Con imán");
  });

  it("pack de foto: el imantado VIVO del canvas es el que se describe", () => {
    const label = studioPreviewVariantLabel({
      mergedSchema: { photoSlots: 6, sizeCm: "5×5", magnet: true },
      live: { photoSlots: 12, magnet: false },
      omit: ["quantity", "photoSlots", "sizeCm"],
    });
    expect(label).toBe("Sin imán (adhesivo)");
  });

  it("sin omitir nada replica el desglose de name/letterset (conteo + tamaño + imán)", () => {
    const label = studioPreviewVariantLabel({
      mergedSchema: { photoSlots: 5, sizeCm: "5×7", magnet: true, language: "es" },
    });
    expect(label).toBe("5 fotos · 5×7 cm · Con imán · Español");
  });

  it("sin nada que describir → undefined (la modal oculta la línea)", () => {
    expect(
      studioPreviewVariantLabel({ mergedSchema: {}, omit: ["quantity", "photoSlots", "sizeCm"] }),
    ).toBeUndefined();
    expect(
      studioPreviewVariantLabel({
        mergedSchema: { photoSlots: 6, sizeCm: "5×5" },
        omit: ["quantity", "photoSlots", "sizeCm"],
      }),
    ).toBeUndefined();
  });
});

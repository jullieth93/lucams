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

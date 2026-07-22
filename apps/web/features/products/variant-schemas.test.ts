/*
 * Unit tests — features/products/variant-schemas.
 * Foco: mergePreservingUnmanagedAttributes (catálogo WhatsApp 2026-07-22): el
 * form del admin solo edita 7 claves de attributes; el resto (frameStyle,
 * variantStyle, theme, language, magnet, size, variantShape…) debe SOBREVIVIR
 * a un guardado — antes se perdían silenciosamente al editar precio/nombre.
 */

import { describe, it, expect } from "vitest";
import {
  mergePreservingUnmanagedAttributes,
  parseVariantAttributes,
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
    expect(mergedVoc).toMatchObject({ magnet: true, theme: "frutas", language: "en", size: "mini" });

    const polaroid = { sizeCm: "6×8", photoSlots: 12, aspectRatio: "400:580", variantStyle: "pasteles" };
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

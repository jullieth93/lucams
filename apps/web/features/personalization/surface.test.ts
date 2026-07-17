/*
 * Enrutador de superficie de personalización (ADR-057, Fase 0). Lógica pura, sin DB.
 * Cubre las 5 superficies + carrito directo, con las formas de schema REALES del
 * catálogo (abecedario, frase, evento, logo, foto) y el arreglo del discriminador de
 * variante que antes se descartaba.
 */

import { describe, expect, it } from "vitest";
import {
  parseVariantAttributes,
  mergeVariantOverProduct,
} from "@/features/products/variant-schemas";
import { resolvePersonalizationSurface, opensStudio } from "./surface";

describe("parseVariantAttributes — el discriminador de variante ahora sobrevive", () => {
  it("conserva variant + letterCountMin/Max (antes se descartaban)", () => {
    const attrs = parseVariantAttributes({
      variant: "name",
      letterCountMin: 3,
      letterCountMax: 10,
    });
    expect(attrs.variant).toBe("name");
    expect(attrs.letterCountMin).toBe(3);
    expect(attrs.letterCountMax).toBe(10);
  });

  it("conserva letterCount para sets fijos", () => {
    expect(parseVariantAttributes({ variant: "full", letterCount: 27 })).toMatchObject({
      variant: "full",
      letterCount: 27,
    });
  });

  it("no rompe variantes de foto existentes", () => {
    expect(parseVariantAttributes({ photoSlots: 12, sizeCm: "6×8" })).toMatchObject({
      photoSlots: 12,
      sizeCm: "6×8",
    });
  });
});

describe("resolvePersonalizationSurface — Abecedario (TEXT_ONLY, 3 variantes)", () => {
  const base = { nameMaxLength: 10 }; // personalizationSchema del producto

  it("variante 'nombre' → superficie name con min/max de la variante", () => {
    const merged = mergeVariantOverProduct(
      base,
      parseVariantAttributes({ variant: "name", letterCountMin: 3, letterCountMax: 10 }),
    );
    const r = resolvePersonalizationSurface("TEXT_ONLY", merged);
    expect(r.surface).toBe("name");
    if (r.surface === "name") {
      expect(r.config.min).toBe(3);
      expect(r.config.max).toBe(10);
      expect(r.config.language).toBe("es");
    }
  });

  it("variante 'completo' (27 letras) → carrito directo (set fijo)", () => {
    const merged = mergeVariantOverProduct(
      base,
      parseVariantAttributes({ variant: "full", letterCount: 27 }),
    );
    const r = resolvePersonalizationSurface("TEXT_ONLY", merged);
    expect(r).toEqual({ surface: "direct-cart", reason: "fixed-variant" });
    expect(opensStudio("TEXT_ONLY", merged)).toBe(false);
  });

  it("variante 'vocales' → carrito directo", () => {
    const merged = mergeVariantOverProduct(
      base,
      parseVariantAttributes({ variant: "vowels", letterCount: 5 }),
    );
    expect(resolvePersonalizationSurface("TEXT_ONLY", merged).surface).toBe("direct-cart");
  });

  it("abecedario inglés → language 'en' (rechaza Ñ)", () => {
    const merged = mergeVariantOverProduct(
      { nameMaxLength: 10, language: "en" },
      parseVariantAttributes({ variant: "name", letterCountMin: 3, letterCountMax: 10 }),
    );
    const r = resolvePersonalizationSurface("TEXT_ONLY", merged);
    expect(r.surface === "name" && r.config.language).toBe("en");
  });

  it("min nunca supera max aunque el schema venga inconsistente", () => {
    const r = resolvePersonalizationSurface("TEXT_ONLY", {
      variant: "name",
      letterCountMin: 20,
      letterCountMax: 8,
    });
    expect(r.surface === "name" && r.config.min).toBe(8);
  });
});

describe("resolvePersonalizationSurface — otras superficies", () => {
  it("TEXT_ONLY con maxChars/fontOptions → phrase", () => {
    const r = resolvePersonalizationSurface("TEXT_ONLY", {
      maxChars: 80,
      fontOptions: ["fredoka", "baloo"],
      sizeCm: "20×20",
    });
    expect(r.surface).toBe("phrase");
    if (r.surface === "phrase") {
      expect(r.config.maxChars).toBe(80);
      expect(r.config.fontOptions).toEqual(["fredoka", "baloo"]);
    }
  });

  it("EVENT_FAVOR → event con campos + allowPhoto", () => {
    const r = resolvePersonalizationSurface("EVENT_FAVOR", {
      eventFields: ["coupleNames", "date", "venue"],
      allowPhoto: true,
    });
    expect(r.surface).toBe("event");
    if (r.surface === "event") {
      expect(r.config.fields).toEqual(["coupleNames", "date", "venue"]);
      expect(r.config.allowPhoto).toBe(true);
    }
  });

  it("EVENT_FAVOR sin allowPhoto → allowPhoto false", () => {
    const r = resolvePersonalizationSurface("EVENT_FAVOR", { eventFields: ["name", "age"] });
    expect(r.surface === "event" && r.config.allowPhoto).toBe(false);
  });

  it("BUSINESS_LOGO → logo con fields", () => {
    const r = resolvePersonalizationSurface("BUSINESS_LOGO", {
      fields: ["logo", "phone", "email", "website"],
    });
    expect(r.surface).toBe("logo");
    if (r.surface === "logo") {
      expect(r.config.fields).toContain("logo");
      expect(r.config.requiresVectorFile).toBe(false);
    }
  });

  it("BUSINESS_LOGO troquelado → requiresVectorFile true (cotización WhatsApp)", () => {
    const r = resolvePersonalizationSurface("BUSINESS_LOGO", {
      fields: ["logo"],
      requiresVectorFile: true,
    });
    expect(r.surface === "logo" && r.config.requiresVectorFile).toBe(true);
  });

  it("PHOTO_PACK → photo con photoSlots de la variante", () => {
    const merged = mergeVariantOverProduct(
      { photoSlots: 6 },
      parseVariantAttributes({ photoSlots: 12, sizeCm: "6×8" }),
    );
    const r = resolvePersonalizationSurface("PHOTO_PACK", merged);
    expect(r.surface).toBe("photo");
    if (r.surface === "photo") expect(r.config.photoSlots).toBe(12);
  });

  it("PHOTO_GRID / CALENDAR_* / CUSTOM_DECOR → photo", () => {
    for (const k of [
      "PHOTO_GRID",
      "CALENDAR_PHOTO_MONTH",
      "CALENDAR_PHOTO_HERO",
      "CUSTOM_DECOR",
    ] as const) {
      expect(resolvePersonalizationSurface(k, { photoSlots: 12 }).surface).toBe("photo");
    }
  });

  it("marcador letterSet 'full' → superficie letterset (aunque kind sea NONE)", () => {
    const r = resolvePersonalizationSurface("NONE", { letterSet: "full", language: "es" });
    expect(r.surface).toBe("letterset");
    if (r.surface === "letterset") {
      expect(r.config.letterSet).toBe("full");
      expect(r.config.language).toBe("es");
    }
    expect(opensStudio("NONE", { letterSet: "full", language: "en" })).toBe(true);
  });

  it("marcador letterSet 'vowels' → letterset, idioma default es", () => {
    const r = resolvePersonalizationSurface("NONE", { letterSet: "vowels" });
    expect(r.surface === "letterset" && r.config.language).toBe("es");
  });

  it("NONE sin marcador → carrito directo (no personalizable)", () => {
    expect(resolvePersonalizationSurface("NONE", null)).toEqual({
      surface: "direct-cart",
      reason: "not-personalizable",
    });
    expect(opensStudio("NONE", null)).toBe(false);
  });

  it("opensStudio true para todas las superficies editables", () => {
    expect(opensStudio("PHOTO_PACK", { photoSlots: 6 })).toBe(true);
    expect(opensStudio("TEXT_ONLY", { variant: "name", letterCountMax: 10 })).toBe(true);
    expect(opensStudio("EVENT_FAVOR", { eventFields: ["name"] })).toBe(true);
    expect(opensStudio("BUSINESS_LOGO", { fields: ["logo"] })).toBe(true);
  });
});

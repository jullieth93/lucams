/*
 * Unit tests — features/products/schemas (Zod puro, sin DB).
 * Foco: campos de personalización agregados 2026-10-02 (tab "Personalización"
 * del form admin) — enum personalizationKind, campos condicionales por
 * superficie, refinamientos cruzados y la trampa de Zod 4 documentada en el
 * schema: .partial() CONSERVA defaults, así que personalizationKind NO lleva
 * .default() (si no, todo update sin kind lo resetearía a NONE).
 */

import { describe, expect, it } from "vitest";
import { ProductCreateSchema, ProductUpdateSchema } from "./schemas";

const VALID_BASE = {
  name: "Imán de foto personalizado",
  slug: "iman-foto-personalizado",
  description: "Imán personalizado con tu foto favorita, impresión alta resolución.",
  basePrice: 25_000,
  sku: "IMAN-FOTO-A4",
  categoryId: "clxxxxxxxxxxxxxxxxxxxxxx01",
};

describe("ProductCreateSchema — campos de personalización", () => {
  it("acepta un producto foto completo (kind + slots + galleryTag + overrides)", () => {
    const parsed = ProductCreateSchema.safeParse({
      ...VALID_BASE,
      personalizationKind: "PHOTO_GRID",
      photoSlots: 6,
      facesPerUnit: 2,
      aspectRatio: "4:5",
      galleryTag: "separadores-magneticos",
      canvasBaseScale: 0.8,
      gridColsOverride: 3,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.personalizationKind).toBe("PHOTO_GRID");
      expect(parsed.data.galleryTag).toBe("separadores-magneticos");
    }
  });

  it("sin personalizationKind → queda undefined (NO default NONE; el service lo trata como NONE)", () => {
    const parsed = ProductCreateSchema.parse(VALID_BASE);
    expect(parsed.personalizationKind).toBeUndefined();
  });

  it("rechaza un kind fuera del enum", () => {
    expect(
      ProductCreateSchema.safeParse({ ...VALID_BASE, personalizationKind: "VIDEO_360" }).success,
    ).toBe(false);
  });

  it("galleryTag: trim + regex slug; vacío/inválido rechazado si se declara", () => {
    const ok = ProductCreateSchema.safeParse({ ...VALID_BASE, galleryTag: "  separadores  " });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.galleryTag).toBe("separadores");
    expect(
      ProductCreateSchema.safeParse({ ...VALID_BASE, galleryTag: "Separadores Bonitos" }).success,
    ).toBe(false);
  });

  it("aspectRatio exige formato ancho:alto", () => {
    expect(ProductCreateSchema.safeParse({ ...VALID_BASE, aspectRatio: "4:5" }).success).toBe(true);
    expect(ProductCreateSchema.safeParse({ ...VALID_BASE, aspectRatio: "4x5" }).success).toBe(
      false,
    );
  });

  it("rangos de foto alineados con PhotoProductConfigSchema (photoSlots 1-50, caras 1-2)", () => {
    expect(ProductCreateSchema.safeParse({ ...VALID_BASE, photoSlots: 0 }).success).toBe(false);
    expect(ProductCreateSchema.safeParse({ ...VALID_BASE, photoSlots: 51 }).success).toBe(false);
    expect(ProductCreateSchema.safeParse({ ...VALID_BASE, facesPerUnit: 3 }).success).toBe(false);
  });

  it("refinamiento: letterCountMin > letterCountMax rechaza con error en letterCountMax", () => {
    const parsed = ProductCreateSchema.safeParse({
      ...VALID_BASE,
      personalizationKind: "TEXT_ONLY",
      textOnlyVariant: "name",
      letterCountMin: 10,
      letterCountMax: 3,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((i) => i.path[0]);
      expect(paths).toContain("letterCountMax");
    }
  });

  it("letterCountMin <= letterCountMax pasa", () => {
    expect(
      ProductCreateSchema.safeParse({
        ...VALID_BASE,
        personalizationKind: "TEXT_ONLY",
        letterCountMin: 3,
        letterCountMax: 10,
      }).success,
    ).toBe(true);
  });

  it("refinamiento: letterSet solo con kind NONE (el marcador manda sobre el kind)", () => {
    expect(
      ProductCreateSchema.safeParse({
        ...VALID_BASE,
        personalizationKind: "NONE",
        letterSet: "full",
      }).success,
    ).toBe(true);
    const conflict = ProductCreateSchema.safeParse({
      ...VALID_BASE,
      personalizationKind: "PHOTO_PACK",
      letterSet: "full",
    });
    expect(conflict.success).toBe(false);
    if (!conflict.success) {
      expect(conflict.error.issues.map((i) => i.path[0])).toContain("letterSet");
    }
  });

  it("campos de evento/logo/frase: arrays y flags opcionales-nullables", () => {
    const parsed = ProductCreateSchema.safeParse({
      ...VALID_BASE,
      personalizationKind: "EVENT_FAVOR",
      eventFields: ["coupleNames", "date"],
      allowPhoto: true,
      logoFields: null,
      requiresVectorFile: null,
      fontOptions: null,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("ProductUpdateSchema — partial sin sorpresas", () => {
  it("update sin personalizationKind → queda undefined (no resetea a NONE)", () => {
    const parsed = ProductUpdateSchema.parse({
      id: "clxxxxxxxxxxxxxxxxxxxxxx99",
      name: "Otro nombre",
    });
    expect(parsed.personalizationKind).toBeUndefined();
  });

  it("update con kind + nulls (limpieza de panel) pasa", () => {
    const parsed = ProductUpdateSchema.safeParse({
      id: "clxxxxxxxxxxxxxxxxxxxxxx99",
      personalizationKind: "TEXT_ONLY",
      textOnlyVariant: "phrase",
      maxChars: 80,
      photoSlots: null,
      galleryTag: null,
      canvasBaseScale: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.personalizationKind).toBe("TEXT_ONLY");
      expect(parsed.data.photoSlots).toBeNull();
    }
  });

  it("el refinamiento cruzado también aplica en update", () => {
    expect(
      ProductUpdateSchema.safeParse({
        id: "clxxxxxxxxxxxxxxxxxxxxxx99",
        letterCountMin: 15,
        letterCountMax: 4,
      }).success,
    ).toBe(false);
  });
});

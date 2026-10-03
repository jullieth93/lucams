/*
 * Unit tests — features/categories/schemas (Zod puro, sin DB).
 * Foco: campos de contenido agregados 2026-10-02 (B-6, auditoría cableado
 * cliente↔admin) — richDescription, useCase y defaultSort, editables desde
 * /admin/categorias porque el storefront ya los renderiza en
 * /productos/[categoria]/[subcategoria] pero antes exigían SQL directo.
 *
 * defaultSort se limita a CATEGORY_SORT_OPTIONS: los 4 valores que
 * listCatalogProducts (lib/catalog.ts) implementa de verdad en el orderBy
 * ("most_purchased" figura en el comentario del schema Prisma pero NO tiene
 * orderBy — caería silenciosamente al default).
 *
 * El update pasa por CategoryCreateSchema.partial() en las actions — los
 * tests de .partial() fijan que los campos nuevos siguen siendo opcionales
 * y que null (limpiar desde el form) sigue pasando.
 */

import { describe, expect, it } from "vitest";
import { CATEGORY_SORT_OPTIONS, CategoryCreateSchema } from "./schemas";

const VALID_BASE = {
  name: "Magnéticos foto",
  slug: "magneticos-foto",
};

describe("CategoryCreateSchema — richDescription / useCase / defaultSort (B-6)", () => {
  it("acepta los tres campos con valores válidos", () => {
    const parsed = CategoryCreateSchema.safeParse({
      ...VALID_BASE,
      richDescription: "Texto largo SEO de la categoría.",
      useCase: "Ideal para lectores y regalos.",
      defaultSort: "price_asc",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.richDescription).toBe("Texto largo SEO de la categoría.");
      expect(parsed.data.useCase).toBe("Ideal para lectores y regalos.");
      expect(parsed.data.defaultSort).toBe("price_asc");
    }
  });

  it("sin los campos nuevos → quedan undefined (defaultSort cae a 'recent' en el PLP)", () => {
    const parsed = CategoryCreateSchema.parse(VALID_BASE);
    expect(parsed.richDescription).toBeUndefined();
    expect(parsed.useCase).toBeUndefined();
    expect(parsed.defaultSort).toBeUndefined();
  });

  it("null explícito es válido en los tres (el form manda null para limpiar)", () => {
    const parsed = CategoryCreateSchema.safeParse({
      ...VALID_BASE,
      richDescription: null,
      useCase: null,
      defaultSort: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("CATEGORY_SORT_OPTIONS cubre exactamente los sorts que el PLP implementa", () => {
    expect([...CATEGORY_SORT_OPTIONS]).toEqual(["recent", "price_asc", "price_desc", "featured"]);
    for (const sort of CATEGORY_SORT_OPTIONS) {
      expect(CategoryCreateSchema.safeParse({ ...VALID_BASE, defaultSort: sort }).success).toBe(
        true,
      );
    }
  });

  it("rechaza un defaultSort fuera del enum (ej. 'most_purchased', sin orderBy en el PLP)", () => {
    expect(
      CategoryCreateSchema.safeParse({ ...VALID_BASE, defaultSort: "most_purchased" }).success,
    ).toBe(false);
    expect(CategoryCreateSchema.safeParse({ ...VALID_BASE, defaultSort: "random" }).success).toBe(
      false,
    );
  });

  it("richDescription permite texto largo pero topea en 5000 chars", () => {
    expect(
      CategoryCreateSchema.safeParse({ ...VALID_BASE, richDescription: "a".repeat(5000) }).success,
    ).toBe(true);
    expect(
      CategoryCreateSchema.safeParse({ ...VALID_BASE, richDescription: "a".repeat(5001) }).success,
    ).toBe(false);
  });

  it("useCase topea en 1000 chars", () => {
    expect(
      CategoryCreateSchema.safeParse({ ...VALID_BASE, useCase: "a".repeat(1000) }).success,
    ).toBe(true);
    expect(
      CategoryCreateSchema.safeParse({ ...VALID_BASE, useCase: "a".repeat(1001) }).success,
    ).toBe(false);
  });

  it(".partial() (update) admite mandar solo uno de los campos nuevos", () => {
    const update = CategoryCreateSchema.partial();
    const parsed = update.safeParse({ defaultSort: "featured" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.defaultSort).toBe("featured");
      expect(parsed.data.richDescription).toBeUndefined();
    }
  });
});

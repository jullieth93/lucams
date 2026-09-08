/*
 * Unit tests — features/products/photo-pack-resolve.
 *
 * Lucy 2026-09-05 — resolución server-side de la variante de un pack desde el
 * canvasData guardado del diseño (photoSlots + sizeCm). La ruta del dinero:
 * si no hay variante EXACTA en el catálogo → null (el carrito responde con
 * error claro; nunca se cobra otra variante).
 */

import { describe, it, expect } from "vitest";
import { readPhotoPackDesignInfo, resolvePhotoPackVariant } from "./photo-pack-resolve";

// Réplica reducida del catálogo real (2 tamaños × N fotos, separadores 2 caras).
const catalog = [
  { id: "s1", price: 10_000, stock: 5, attributes: { photoSlots: 1, sizeCm: "6×6" } },
  { id: "s2", price: 20_000, stock: 5, attributes: { photoSlots: 2, sizeCm: "6×6" } },
  { id: "s3", price: 30_000, stock: 5, attributes: { photoSlots: 3, sizeCm: "6×6" } },
  { id: "b1", price: 15_000, stock: 5, attributes: { photoSlots: 1, sizeCm: "10×10" } },
  { id: "b2", price: 25_000, stock: 5, attributes: { photoSlots: 2, sizeCm: "10×10" } },
];

describe("readPhotoPackDesignInfo", () => {
  it("lee photoSlots + sizeCm de un canvasData V2", () => {
    expect(
      readPhotoPackDesignInfo({ version: 2, photoSlots: 4, sizeCm: "7.5×10", slotCount: 4 }),
    ).toEqual({ photoSlots: 4, sizeCm: "7.5×10" });
  });

  it("photoSlots sin sizeCm es válido (packs de un solo tamaño)", () => {
    expect(readPhotoPackDesignInfo({ version: 2, photoSlots: 6 })).toEqual({ photoSlots: 6 });
  });

  it("diseño sin photoSlots (legacy u otro kind) → null → fallback histórico del carrito", () => {
    expect(readPhotoPackDesignInfo({ version: 2, slotCount: 6, slots: [] })).toBeNull();
    expect(readPhotoPackDesignInfo({ version: 1, stage: {}, layers: [] })).toBeNull();
    expect(readPhotoPackDesignInfo(null)).toBeNull();
    expect(readPhotoPackDesignInfo("basura")).toBeNull();
    expect(readPhotoPackDesignInfo(42)).toBeNull();
  });

  it("aclampa photoSlots fuera de rango en vez de explotar", () => {
    expect(readPhotoPackDesignInfo({ version: 2, photoSlots: 0 })).toEqual({ photoSlots: 1 });
    expect(readPhotoPackDesignInfo({ version: 2, photoSlots: 999 })).toEqual({ photoSlots: 50 });
  });

  it("sizeCm vacío/no string se trata como ausente", () => {
    expect(readPhotoPackDesignInfo({ version: 2, photoSlots: 3, sizeCm: "" })).toEqual({
      photoSlots: 3,
    });
    expect(readPhotoPackDesignInfo({ version: 2, photoSlots: 3, sizeCm: 7 })).toEqual({
      photoSlots: 3,
    });
  });
});

describe("resolvePhotoPackVariant", () => {
  it("resuelve la variante exacta por photoSlots + sizeCm", () => {
    expect(resolvePhotoPackVariant(catalog, { photoSlots: 2, sizeCm: "6×6" })?.id).toBe("s2");
    expect(resolvePhotoPackVariant(catalog, { photoSlots: 2, sizeCm: "10×10" })?.id).toBe("b2");
  });

  it("sin sizeCm y UNA sola candidata → la resuelve (catálogo mono-tamaño)", () => {
    const mono = catalog.filter((v) => v.attributes.sizeCm === "6×6");
    expect(resolvePhotoPackVariant(mono, { photoSlots: 3 })?.id).toBe("s3");
  });

  it("sin sizeCm y varias candidatas (mismo N en varios tamaños) → null (ambiguo, nunca adivina)", () => {
    expect(resolvePhotoPackVariant(catalog, { photoSlots: 2 })).toBeNull();
  });

  it("no hay variante exacta → null (Lucy pausó esa combinación): nunca devuelve otra parecida", () => {
    // photoSlots 4 no existe en el catálogo reducido.
    expect(resolvePhotoPackVariant(catalog, { photoSlots: 4, sizeCm: "6×6" })).toBeNull();
    // El N existe pero no para ese tamaño.
    expect(resolvePhotoPackVariant(catalog, { photoSlots: 3, sizeCm: "10×10" })).toBeNull();
  });

  it("no filtra por stock: el stock se evalúa después sobre la variante resuelta", () => {
    const agotada = catalog.map((v) => (v.id === "s2" ? { ...v, stock: 0 } : v));
    expect(resolvePhotoPackVariant(agotada, { photoSlots: 2, sizeCm: "6×6" })?.id).toBe("s2");
  });

  it("attributes malformed no matchean (no tienen photoSlots)", () => {
    const raras = [{ id: "x", price: 1, stock: 1, attributes: "basura" }];
    expect(resolvePhotoPackVariant(raras, { photoSlots: 1 })).toBeNull();
  });
});

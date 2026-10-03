/*
 * Tests de la resolución ÚNICA del tipo de producto (Paquete D, 2026-10-02):
 * el tag efectivo (explícito o fallback al slug) y el flag "es separador"
 * los comparten la página (server) y el editor (cliente) — antes el editor
 * leía solo el tag explícito y un separador sin galleryTag en BD perdía su
 * vista 3D de libro.
 */

import { describe, expect, it } from "vitest";
import { isBookmarkGalleryTag, resolveGalleryTag } from "./product-kind";

describe("resolveGalleryTag", () => {
  it("tag explícito en el schema gana sobre el slug", () => {
    expect(resolveGalleryTag({ galleryTag: "separadores-magneticos" }, "otro-slug")).toBe(
      "separadores-magneticos",
    );
  });

  it("sin tag explícito cae al slug (convención ADR-057 B2 — default-on)", () => {
    expect(resolveGalleryTag({}, "separadores-largos")).toBe("separadores-largos");
    expect(resolveGalleryTag(null, "tiras-magneticas-x4")).toBe("tiras-magneticas-x4");
  });

  it("galleryTag no-string (dato corrupto) se ignora y cae al slug", () => {
    expect(resolveGalleryTag({ galleryTag: 42 }, "fotoimanes")).toBe("fotoimanes");
  });
});

describe("isBookmarkGalleryTag", () => {
  it("la familia separadores (tags explícitos y slugs) es bookmark → vista de LIBRO", () => {
    expect(isBookmarkGalleryTag("separadores")).toBe(true);
    expect(isBookmarkGalleryTag("separadores-magneticos")).toBe(true);
    expect(isBookmarkGalleryTag("separadores-alargados")).toBe(true);
    expect(isBookmarkGalleryTag("separadores-largos")).toBe(true);
  });

  it("tiras, imanes, calendarios y polaroid NO son bookmark", () => {
    expect(isBookmarkGalleryTag("tiras-magneticas-x4")).toBe(false);
    expect(isBookmarkGalleryTag("fotoimanes-cuadrados")).toBe(false);
    expect(isBookmarkGalleryTag("calendario-meses")).toBe(false);
    expect(isBookmarkGalleryTag("polaroid-instagram")).toBe(false);
  });
});

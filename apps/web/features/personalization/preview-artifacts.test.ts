/*
 * preview-artifacts (2026-10-13) — convención de paths de los artefactos
 * watermark del preview y selección de exhibición (fallbacks):
 *   - preview-wm.webp / thumb.webp solo se exhiben con el sello
 *     previewWatermarkedAt; las páginas (wm/pages/NN.webp) con previewPagesCount.
 *   - Sin artefactos, las superficies caen al preview LIMPIO.
 * Módulo puro: estos tests no tocan DB ni Storage.
 */

import { describe, expect, it } from "vitest";
import {
  PREVIEW_PAGES_MAX,
  designPreviewBaseFromUrl,
  designPreviewDerivedPaths,
  designPreviewDisplay,
  designPreviewPagePath,
  designPreviewThumbPath,
  designPreviewThumbUrl,
  designPreviewWmPagePath,
  designPreviewWmPageUrls,
  designPreviewWmPath,
  designPreviewWmUrl,
  previewPageFileStem,
} from "./preview-artifacts";

const PREVIEW_URL = "https://ref.supabase.co/storage/v1/object/public/design-previews/abc123/preview.webp";

describe("convención de paths (bucket design-previews)", () => {
  it("paths derivados del designId", () => {
    expect(designPreviewWmPath("abc123")).toBe("abc123/preview-wm.webp");
    expect(designPreviewThumbPath("abc123")).toBe("abc123/thumb.webp");
    expect(designPreviewPagePath("abc123", 1)).toBe("abc123/pages/01.webp");
    expect(designPreviewPagePath("abc123", 12)).toBe("abc123/pages/12.webp");
    expect(designPreviewWmPagePath("abc123", 2)).toBe("abc123/wm/pages/02.webp");
  });

  it("previewPageFileStem: 01-based con pad 2", () => {
    expect(previewPageFileStem(1)).toBe("01");
    expect(previewPageFileStem(24)).toBe("24");
  });

  it("designPreviewDerivedPaths: wm + thumb + páginas limpias y watermark", () => {
    expect(designPreviewDerivedPaths("abc123", 2)).toEqual([
      "abc123/preview-wm.webp",
      "abc123/thumb.webp",
      "abc123/pages/01.webp",
      "abc123/wm/pages/01.webp",
      "abc123/pages/02.webp",
      "abc123/wm/pages/02.webp",
    ]);
    // Sin páginas: solo los artefactos globales.
    expect(designPreviewDerivedPaths("abc123", null)).toEqual([
      "abc123/preview-wm.webp",
      "abc123/thumb.webp",
    ]);
    // Cap defensivo: nunca más de PREVIEW_PAGES_MAX páginas.
    expect(designPreviewDerivedPaths("abc123", 999).length).toBe(2 + PREVIEW_PAGES_MAX * 2);
  });
});

describe("derivación de URLs desde Design.previewUrl", () => {
  it("base y variantes", () => {
    expect(designPreviewBaseFromUrl(PREVIEW_URL)).toBe(
      "https://ref.supabase.co/storage/v1/object/public/design-previews/abc123/",
    );
    expect(designPreviewWmUrl(PREVIEW_URL)).toBe(
      "https://ref.supabase.co/storage/v1/object/public/design-previews/abc123/preview-wm.webp",
    );
    expect(designPreviewThumbUrl(PREVIEW_URL)).toBe(
      "https://ref.supabase.co/storage/v1/object/public/design-previews/abc123/thumb.webp",
    );
    expect(designPreviewWmPageUrls(PREVIEW_URL, 2)).toEqual([
      "https://ref.supabase.co/storage/v1/object/public/design-previews/abc123/wm/pages/01.webp",
      "https://ref.supabase.co/storage/v1/object/public/design-previews/abc123/wm/pages/02.webp",
    ]);
  });

  it("URL fuera de convención (sin /preview.) → null / []", () => {
    const rara = "https://cdn.ajena.test/img/foo.png";
    expect(designPreviewBaseFromUrl(rara)).toBeNull();
    expect(designPreviewWmUrl(rara)).toBeNull();
    expect(designPreviewWmPageUrls(rara, 3)).toEqual([]);
  });
});

describe("designPreviewDisplay — selección con fallback", () => {
  it("sin previewUrl → null", () => {
    expect(
      designPreviewDisplay({ previewUrl: null, previewWatermarkedAt: null, previewPagesCount: null }),
    ).toBeNull();
  });

  it("sin artefactos (diseño histórico): cae al preview limpio, sin pager", () => {
    const d = designPreviewDisplay({
      previewUrl: PREVIEW_URL,
      previewWatermarkedAt: null,
      previewPagesCount: null,
    });
    expect(d).toEqual({
      displayUrl: PREVIEW_URL,
      thumbUrl: PREVIEW_URL,
      pageUrls: null,
      watermarked: false,
    });
  });

  it("con sello watermark: exhibe preview-wm y thumb watermark", () => {
    const d = designPreviewDisplay({
      previewUrl: PREVIEW_URL,
      previewWatermarkedAt: new Date(),
      previewPagesCount: null,
    });
    expect(d?.displayUrl).toBe(designPreviewWmUrl(PREVIEW_URL));
    expect(d?.thumbUrl).toBe(designPreviewThumbUrl(PREVIEW_URL));
    expect(d?.pageUrls).toBeNull();
    expect(d?.watermarked).toBe(true);
  });

  it("con páginas: el pager usa las wm/pages; 1 sola página no pagina", () => {
    const d = designPreviewDisplay({
      previewUrl: PREVIEW_URL,
      previewWatermarkedAt: new Date(),
      previewPagesCount: 3,
    });
    expect(d?.pageUrls).toHaveLength(3);
    expect(d?.pageUrls?.[0]).toContain("/wm/pages/01.webp");

    const una = designPreviewDisplay({
      previewUrl: PREVIEW_URL,
      previewWatermarkedAt: new Date(),
      previewPagesCount: 1,
    });
    expect(una?.pageUrls).toBeNull();
  });

  it("páginas sin sello global (edge: finalize wm falló, páginas llegaron): paginan watermark pero el display cae al limpio", () => {
    const d = designPreviewDisplay({
      previewUrl: PREVIEW_URL,
      previewWatermarkedAt: null,
      previewPagesCount: 2,
    });
    expect(d?.displayUrl).toBe(PREVIEW_URL);
    expect(d?.thumbUrl).toBe(PREVIEW_URL);
    expect(d?.pageUrls).toHaveLength(2);
    expect(d?.watermarked).toBe(true); // las páginas sí llevan marca
  });
});

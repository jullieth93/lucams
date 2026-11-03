/*
 * preview-artifacts (2026-10-13; LUC-SEC-001 2026-10-30; ADR-191 2026-11-03) —
 * convención de paths de los artefactos del preview y selección de exhibición:
 *   - TODAS las superficies exhiben las versiones LIMPIAS (preview.<ext> y
 *     pages/NN.webp por unidad) — el watermark anti-copia se retiró (ADR-191);
 *     los paths wm/preview-wm/thumb persisten en la convención SOLO para que la
 *     purga de retención borre los artefactos históricos (designPreviewDerivedPaths).
 *   - TODAS las URLs de exhibición salen por el handler autorizado
 *     /api/design-preview/* (el bucket ya no es público); las refs públicas
 *     legacy se convierten, y una ref fuera de convención → null (fail-closed).
 * Módulo puro: estos tests no tocan DB ni Storage.
 */

import { describe, expect, it } from "vitest";
import {
  PREVIEW_PAGES_MAX,
  designPreviewAuthorizedUrl,
  designPreviewDerivedPaths,
  designPreviewDisplay,
  designPreviewPagePath,
  designPreviewThumbPath,
  designPreviewWmPagePath,
  designPreviewWmPath,
  isPreviewHandlerUrl,
  previewPageFileStem,
  previewRefToAuthorizedUrl,
} from "./preview-artifacts";

// Ref NUEVA (la que persiste el código post LUC-SEC-001) y su equivalente
// LEGACY (URL pública del bucket, filas anteriores a la migración 046).
const REF_NEW = "/api/design-preview/abc123/preview.webp";
const REF_LEGACY =
  "https://ref.supabase.co/storage/v1/object/public/design-previews/abc123/preview.webp";

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

describe("URLs autorizadas (handler /api/design-preview/*)", () => {
  it("path válido → URL del handler; con capability → query string", () => {
    expect(designPreviewAuthorizedUrl("abc123/preview-wm.webp")).toBe(
      "/api/design-preview/abc123/preview-wm.webp",
    );
    expect(
      designPreviewAuthorizedUrl("abc123/preview-wm.webp", { name: "st", value: "tok 32" }),
    ).toBe("/api/design-preview/abc123/preview-wm.webp?st=tok%2032");
  });

  it("path fuera de allowlist → null", () => {
    expect(designPreviewAuthorizedUrl("abc123/preview.gif")).toBeNull();
    expect(designPreviewAuthorizedUrl("../etc/passwd")).toBeNull();
  });

  it("previewRefToAuthorizedUrl convierte ref nueva y legacy; rechaza ajenas", () => {
    expect(previewRefToAuthorizedUrl(REF_NEW)).toBe("/api/design-preview/abc123/preview.webp");
    expect(previewRefToAuthorizedUrl(REF_LEGACY)).toBe("/api/design-preview/abc123/preview.webp");
    expect(previewRefToAuthorizedUrl(REF_LEGACY, { name: "ot", value: "tok" })).toBe(
      "/api/design-preview/abc123/preview.webp?ot=tok",
    );
    expect(previewRefToAuthorizedUrl("https://evil.test/abc123/preview.webp")).toBeNull();
  });
});

describe("designPreviewDisplay — exhibición LIMPIA siempre (ADR-191, 2026-11-03)", () => {
  it("sin previewUrl → null", () => {
    expect(
      designPreviewDisplay({
        previewUrl: null,
        previewWatermarkedAt: null,
        previewPagesCount: null,
      }),
    ).toBeNull();
  });

  it("ref fuera de convención → null (fail-closed: la URL vieja ya no resuelve)", () => {
    expect(
      designPreviewDisplay({
        previewUrl: "https://cdn.ajena.test/img/foo.png",
        previewWatermarkedAt: new Date(),
        previewPagesCount: null,
      }),
    ).toBeNull();
  });

  it.each([
    ["nueva", REF_NEW],
    ["legacy", REF_LEGACY],
  ] as const)("sin páginas (ref %s): preview limpio autorizado, sin pager", (_label, ref) => {
    const d = designPreviewDisplay({
      previewUrl: ref,
      previewWatermarkedAt: null,
      previewPagesCount: null,
    });
    expect(d).toEqual({
      displayUrl: "/api/design-preview/abc123/preview.webp",
      thumbUrl: "/api/design-preview/abc123/preview.webp",
      pageUrls: null,
      watermarked: false,
    });
  });

  it("con páginas: el pager usa las páginas LIMPIAS (pages/) y la primera hace de miniatura", () => {
    const d = designPreviewDisplay({
      previewUrl: REF_NEW,
      previewWatermarkedAt: new Date(), // sello legacy: ya no cambia nada
      previewPagesCount: 3,
    });
    expect(d?.displayUrl).toBe("/api/design-preview/abc123/preview.webp");
    expect(d?.thumbUrl).toBe("/api/design-preview/abc123/pages/01.webp");
    expect(d?.pageUrls).toHaveLength(3);
    expect(d?.pageUrls?.[0]).toBe("/api/design-preview/abc123/pages/01.webp");
    expect(d?.watermarked).toBe(false);
  });

  it("1 sola página no pagina", () => {
    const d = designPreviewDisplay({
      previewUrl: REF_NEW,
      previewWatermarkedAt: null,
      previewPagesCount: 1,
    });
    expect(d?.pageUrls).toBeNull();
    expect(d?.thumbUrl).toBe("/api/design-preview/abc123/preview.webp");
  });

  it("con capability (superficie pública por token): TODAS las URLs la llevan", () => {
    const d = designPreviewDisplay(
      { previewUrl: REF_LEGACY, previewWatermarkedAt: null, previewPagesCount: 2 },
      { name: "st", value: "token32hex" },
    );
    expect(d?.displayUrl).toBe("/api/design-preview/abc123/preview.webp?st=token32hex");
    expect(d?.pageUrls?.[0]).toBe("/api/design-preview/abc123/pages/01.webp?st=token32hex");
  });
});

describe("isPreviewHandlerUrl — gate del `unoptimized` en next/image", () => {
  // Regresión 2026-10-31: la miniatura del carrito se veía vacía porque el
  // optimizer de next/image no reenvía cookies al fetchear el src (handler
  // 404) y Next 16 bloquea locales con query sin images.localPatterns.
  it("detecta las URLs del handler (con y sin capacidad)", () => {
    expect(isPreviewHandlerUrl("/api/design-preview/abc123/thumb.webp")).toBe(true);
    expect(isPreviewHandlerUrl("/api/design-preview/abc123/thumb.webp?st=tok")).toBe(true);
  });

  it("no toca imágenes públicas de catálogo (siguen optimizadas)", () => {
    expect(
      isPreviewHandlerUrl("https://ref.supabase.co/storage/v1/object/public/product-images/x.webp"),
    ).toBe(false);
    expect(isPreviewHandlerUrl("/_next/static/media/logo.png")).toBe(false);
  });
});

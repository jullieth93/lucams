/*
 * Test del wrapper cacheado de miniaturas de galería (PERF 2026-10-07):
 * el `storage.list` de thumbs por tag va detrás de `unstable_cache` (tag
 * `gallery-thumbs`, revalidate 1h) para no pagar 100–500 ms de TTFB en cada
 * page load del Estudio, y el comportamiento fail-open (sin set → sin
 * thumbUrl, fallback al original) queda intacto. `unstable_cache` se mockea
 * como identidad: acá se verifica el CONTRATO (keyParts/tags/revalidate con
 * los que se registra y el uso del set cacheado), no el cache de Next.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManySpy, listThumbsSpy, unstableCacheSpy } = vi.hoisted(() => ({
  findManySpy: vi.fn(),
  listThumbsSpy: vi.fn(),
  unstableCacheSpy: vi.fn((fn: unknown, _keyParts?: unknown, _options?: unknown) => fn),
}));

vi.mock("@/lib/db", () => ({
  Prisma: { DbNull: null, JsonNull: null },
  prisma: { designGalleryImage: { findMany: findManySpy } },
}));
vi.mock("next/cache", () => ({ unstable_cache: unstableCacheSpy }));

// Mock completo de storage: el módulo real carga sharp/supabase (nativo/env)
// y acá solo importa el CONTRATO de derivación path↔url de miniaturas.
const MARKER = "/storage/v1/object/public/product-images/";
vi.mock("@/lib/storage", () => ({
  listGalleryThumbPaths: listThumbsSpy,
  galleryThumbPathFromUrl: (url: string) => {
    const idx = url.indexOf(MARKER);
    if (idx === -1) return null;
    const p = url.slice(idx + MARKER.length);
    const s = p.lastIndexOf("/");
    return s === -1 ? null : `${p.slice(0, s)}/thumbs/${p.slice(s + 1)}`;
  },
  galleryThumbUrlFromImageUrl: (url: string) => {
    const idx = url.indexOf(MARKER);
    if (idx === -1) return null;
    const p = url.slice(idx + MARKER.length);
    const s = p.lastIndexOf("/");
    if (s === -1) return null;
    return `${url.slice(0, idx)}${MARKER}${p.slice(0, s)}/thumbs/${p.slice(s + 1)}`;
  },
}));

import { listGalleryImages } from "./design-gallery";

const URL_A = "https://supabase.example/storage/v1/object/public/product-images/gallery-sep/a.webp";
const URL_B = "https://supabase.example/storage/v1/object/public/product-images/gallery-sep/b.webp";

function mockRows() {
  findManySpy.mockResolvedValue([
    { id: "1", name: "Diseño A", imageUrl: URL_A, imageUrlB: null, variantFilter: null },
    { id: "2", name: "Diseño B", imageUrl: URL_B, imageUrlB: null, variantFilter: null },
  ]);
}

describe("listGalleryImages — miniaturas cacheadas (tag gallery-thumbs)", () => {
  beforeEach(() => {
    // NO se limpia unstableCacheSpy: el registro ocurre al importar el módulo
    // (antes de cualquier test) y el primer test inspecciona esa llamada.
    findManySpy.mockReset();
    listThumbsSpy.mockReset();
  });

  it("registra el reader de thumbs en unstable_cache con tag gallery-thumbs y revalidate 1h", () => {
    const registration = unstableCacheSpy.mock.calls.find(
      (call) => Array.isArray(call[1]) && call[1][0] === "gallery-thumbs",
    );
    expect(registration).toBeDefined();
    expect(registration![2]).toEqual({ tags: ["gallery-thumbs"], revalidate: 3600 });
  });

  it("thumbUrl solo cuando la miniatura EXISTE en el set cacheado del tag", async () => {
    mockRows();
    listThumbsSpy.mockResolvedValue(new Set(["gallery-sep/thumbs/a.webp"]));
    const rows = await listGalleryImages("sep");
    expect(listThumbsSpy).toHaveBeenCalledWith("gallery-sep");
    expect(rows[0]!.thumbUrl).toBe(
      "https://supabase.example/storage/v1/object/public/product-images/gallery-sep/thumbs/a.webp",
    );
    expect(rows[1]!.thumbUrl).toBeNull();
  });

  it("fail-open intacto: set vacío (storage caído) → todas caen al original sin romper", async () => {
    mockRows();
    listThumbsSpy.mockResolvedValue(new Set());
    const rows = await listGalleryImages("sep");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.thumbUrl === null)).toBe(true);
  });
});

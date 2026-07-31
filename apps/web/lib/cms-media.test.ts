/*
 * Test de lib/cms-media.ts (roadmap B5) — pipeline de la mediateca CMS:
 * subida (validación + magic bytes + dimensiones + registro), edición de alt
 * y borrado con guarda de uso.
 *
 * FOCO:
 *  - alt obligatorio (a11y): vacío o >300 → CmsValidationError, sin tocar Storage.
 *  - Mismo magic gate que product-images: polyglot (declarado png, bytes HTML)
 *    → INVALID_TYPE; archivo vacío → EMPTY_FILE; >5 MB → FILE_TOO_LARGE.
 *  - Happy path: PNG real (generado con sharp) → upload con contentType=MIME
 *    REAL, path media/<uuid>.png, fila CmsMedia con width/height/alt, URL pública.
 *  - Borrado: en uso por un campo (borrador) o por una versión del historial →
 *    CmsValidationError y NO se borra nada; libre → fila + archivo fuera.
 *
 * ESTRATEGIA: Supabase Storage y Prisma mockeados (vi.hoisted) — el test es
 * PURO de lógica de validación/orquestación, no toca bucket ni DB reales.
 * sharp corre de verdad (el PNG feliz se genera con él). `server-only` lo
 * stubea vitest.config.ts.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks hoisted: Supabase Storage + Prisma ────────────────────────────────
const {
  uploadMock,
  removeMock,
  fromMock,
  cmsMediaCreate,
  cmsMediaFindUnique,
  cmsMediaDelete,
  cmsMediaUpdate,
  cmsFieldFindMany,
  cmsFieldVersionFindFirst,
} = vi.hoisted(() => {
  const uploadMock = vi.fn(
    async (_path: string, _body: Buffer, _opts?: { contentType?: string; upsert?: boolean }) => ({
      error: null as { message: string } | null,
    }),
  );
  const getPublicUrlMock = vi.fn((path: string) => ({
    data: { publicUrl: `https://ref.supabase.co/storage/v1/object/public/cms-media/${path}` },
  }));
  const removeMock = vi.fn(async (_paths: string[]) => ({
    error: null as { message: string } | null,
  }));
  const fromMock = vi.fn(() => ({
    upload: uploadMock,
    getPublicUrl: getPublicUrlMock,
    remove: removeMock,
  }));
  const cmsMediaCreate = vi.fn();
  const cmsMediaFindUnique = vi.fn();
  const cmsMediaDelete = vi.fn();
  const cmsMediaUpdate = vi.fn();
  const cmsFieldFindMany = vi.fn(async (): Promise<{ key: string }[]> => []);
  const cmsFieldVersionFindFirst = vi.fn(
    async (): Promise<{ field: { key: string } } | null> => null,
  );
  return {
    uploadMock,
    getPublicUrlMock,
    removeMock,
    fromMock,
    cmsMediaCreate,
    cmsMediaFindUnique,
    cmsMediaDelete,
    cmsMediaUpdate,
    cmsFieldFindMany,
    cmsFieldVersionFindFirst,
  };
});

vi.mock("@/lib/supabase/service", () => ({
  supabaseService: { storage: { from: fromMock } },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    cmsMedia: {
      create: cmsMediaCreate,
      findUnique: cmsMediaFindUnique,
      delete: cmsMediaDelete,
      update: cmsMediaUpdate,
      findMany: vi.fn(async () => []),
    },
    cmsField: { findMany: cmsFieldFindMany },
    cmsFieldVersion: { findFirst: cmsFieldVersionFindFirst },
  },
}));

import sharp from "sharp";
import { CmsValidationError } from "@/features/cms/service";

import { deleteCmsMedia, updateCmsMediaAlt, uploadCmsMedia } from "./cms-media";

/** PNG mínimo inválido (magic bytes correctos pero NO decodifica). */
const FAKE_PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(24),
]);
const HTML_BYTES = Buffer.concat([
  Buffer.from("<!DOCTYPE html><script>alert(1)</script>"),
  Buffer.alloc(8),
]);

let REAL_PNG: Buffer;
beforeAll(async () => {
  // Imagen real 40×30 (el pipeline la re-lee con sharp para las dimensiones).
  REAL_PNG = await sharp({
    create: { width: 40, height: 30, channels: 3, background: { r: 124, g: 106, b: 173 } },
  })
    .png()
    .toBuffer();
});

function asFile(bytes: Buffer, type: string, name = "banner"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

beforeEach(() => {
  vi.clearAllMocks();
  cmsFieldFindMany.mockResolvedValue([]);
  cmsFieldVersionFindFirst.mockResolvedValue(null);
  cmsMediaCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "media-1",
    createdAt: new Date(),
    createdBy: data.createdBy ?? null,
    ...data,
  }));
});

describe("uploadCmsMedia — validaciones", () => {
  it("rechaza alt vacío sin tocar Storage ni DB", async () => {
    await expect(
      uploadCmsMedia({ file: asFile(REAL_PNG, "image/png"), alt: "   ", createdBy: "a1" }),
    ).rejects.toBeInstanceOf(CmsValidationError);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(cmsMediaCreate).not.toHaveBeenCalled();
  });

  it("rechaza alt de más de 300 caracteres", async () => {
    await expect(
      uploadCmsMedia({
        file: asFile(REAL_PNG, "image/png"),
        alt: "x".repeat(301),
        createdBy: null,
      }),
    ).rejects.toBeInstanceOf(CmsValidationError);
  });

  it("archivo vacío → EMPTY_FILE", async () => {
    await expect(
      uploadCmsMedia({ file: asFile(Buffer.alloc(0), "image/png"), alt: "alt", createdBy: null }),
    ).rejects.toMatchObject({ name: "StorageError", code: "EMPTY_FILE" });
  });

  it("archivo > 5 MB → FILE_TOO_LARGE", async () => {
    const big = Buffer.concat([REAL_PNG, Buffer.alloc(5 * 1024 * 1024)]);
    await expect(
      uploadCmsMedia({ file: asFile(big, "image/png"), alt: "alt", createdBy: null }),
    ).rejects.toMatchObject({ name: "StorageError", code: "FILE_TOO_LARGE" });
  });

  it("tipo declarado no permitido → INVALID_TYPE", async () => {
    await expect(
      uploadCmsMedia({ file: asFile(REAL_PNG, "image/gif"), alt: "alt", createdBy: null }),
    ).rejects.toMatchObject({ name: "StorageError", code: "INVALID_TYPE" });
  });

  it("polyglot: declarado png pero bytes HTML → INVALID_TYPE (magic gate)", async () => {
    await expect(
      uploadCmsMedia({ file: asFile(HTML_BYTES, "image/png"), alt: "alt", createdBy: null }),
    ).rejects.toMatchObject({ name: "StorageError", code: "INVALID_TYPE" });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("magic bytes png pero archivo corrupto (no decodifica) → INVALID_TYPE", async () => {
    await expect(
      uploadCmsMedia({ file: asFile(FAKE_PNG, "image/png"), alt: "alt", createdBy: null }),
    ).rejects.toMatchObject({ name: "StorageError", code: "INVALID_TYPE" });
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

describe("uploadCmsMedia — happy path", () => {
  it("sube con contentType=MIME real, path media/<uuid>.png y registra la fila", async () => {
    const media = await uploadCmsMedia({
      file: asFile(REAL_PNG, "image/png", "banner.png"),
      alt: "Banner de prueba",
      createdBy: "admin-1",
    });

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [path, , opts] = uploadMock.mock.calls[0]!;
    expect(path).toMatch(/^media\/[0-9a-f-]{36}\.png$/);
    expect(opts).toMatchObject({ contentType: "image/png", upsert: false });

    expect(cmsMediaCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bucket: "cms-media",
        path,
        alt: "Banner de prueba",
        width: 40,
        height: 30,
        mime: "image/png",
        createdBy: "admin-1",
      }),
    });
    expect(media.id).toBe("media-1");
    expect(media.url).toBe(`https://ref.supabase.co/storage/v1/object/public/cms-media/${path}`);
  });
});

describe("updateCmsMediaAlt", () => {
  it("rechaza alt vacío", async () => {
    await expect(updateCmsMediaAlt("media-1", "  ")).rejects.toBeInstanceOf(CmsValidationError);
    expect(cmsMediaUpdate).not.toHaveBeenCalled();
  });

  it("guarda el alt recortado", async () => {
    cmsMediaUpdate.mockResolvedValue({ id: "media-1", alt: "Nuevo alt" });
    await updateCmsMediaAlt("media-1", "  Nuevo alt  ");
    expect(cmsMediaUpdate).toHaveBeenCalledWith({
      where: { id: "media-1" },
      data: { alt: "Nuevo alt" },
    });
  });
});

describe("deleteCmsMedia — guarda de uso", () => {
  const MEDIA = {
    id: "media-1",
    bucket: "cms-media",
    path: "media/uuid.png",
    alt: "alt",
    width: 40,
    height: 30,
    bytes: 100,
    mime: "image/png",
  };

  it("asset inexistente → CmsValidationError", async () => {
    cmsMediaFindUnique.mockResolvedValue(null);
    await expect(deleteCmsMedia("media-x")).rejects.toBeInstanceOf(CmsValidationError);
  });

  it("en uso por un campo (borrador actual) → rechaza y NO borra nada", async () => {
    cmsMediaFindUnique.mockResolvedValue(MEDIA);
    cmsFieldFindMany.mockResolvedValue([{ key: "home.banners" }]);
    await expect(deleteCmsMedia("media-1")).rejects.toThrow(/home\.banners/);
    expect(cmsMediaDelete).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("en uso por una versión del historial → rechaza (revertir no rompe imágenes)", async () => {
    cmsMediaFindUnique.mockResolvedValue(MEDIA);
    cmsFieldVersionFindFirst.mockResolvedValue({ field: { key: "home.hero.imagen" } });
    await expect(deleteCmsMedia("media-1")).rejects.toThrow(/home\.hero\.imagen/);
    expect(cmsMediaDelete).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("libre → borra fila y archivo del bucket", async () => {
    cmsMediaFindUnique.mockResolvedValue(MEDIA);
    await deleteCmsMedia("media-1");
    expect(cmsMediaDelete).toHaveBeenCalledWith({ where: { id: "media-1" } });
    expect(removeMock).toHaveBeenCalledWith(["media/uuid.png"]);
  });

  it("si falla el borrado del archivo, avisa (la fila ya quedó fuera)", async () => {
    cmsMediaFindUnique.mockResolvedValue(MEDIA);
    removeMock.mockResolvedValueOnce({ error: { message: "boom" } });
    await expect(deleteCmsMedia("media-1")).rejects.toMatchObject({
      name: "StorageError",
      code: "DELETE_FAILED",
    });
  });
});

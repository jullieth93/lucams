/*
 * Unit tests — actions de DISEÑOS prediseñados: edición del "Aplica a"
 * (updateGalleryVariantFilterAction) y asignación masiva
 * (bulkAssignVariantFilterAction), Fase 5b (2026-10-02). B-5 (misma fecha):
 * toggle isActive, restore de archivados y reorden por swap.
 * Fase 3 (2026-10-07): archivar (3.6, rename del soft-delete), eliminación
 * permanente con purga de archivos (3.6) y exposición del thumbUrl watermark
 * en listGalleryImages (3.10).
 *
 * Caso real: los 51 diseños de Separadores Magnéticos quedaron con
 * variantFilter null ("Todas") al subirse antes del selector "Aplica a" — la
 * bulk action los organiza sin SQL (updateMany tag + variantFilter null +
 * deletedAt null).
 *
 * Estrategia: la action corre con el SERVICE REAL (design-gallery.ts) y solo
 * prisma, audit, guard, logger, storage, gallery-strip y next/cache mockeados
 * — mismo harness que app/admin/(panel)/ocasiones/actions.test.ts. No hay DB
 * local en este entorno: prisma está 100% mockeado.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, auditSpy, mockLogger, revalidatePathSpy, mockStorage } = vi.hoisted(() => ({
  mockPrisma: {
    designGalleryImage: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
    },
    // B-5 — reorderGalleryImage hace el swap de `order` en transacción.
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
  auditSpy: { recordAdminAction: vi.fn(async () => {}) },
  mockLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
  revalidatePathSpy: vi.fn(),
  mockStorage: {
    deleteProductImage: vi.fn(async (_url: string) => {}),
    uploadGalleryThumb: vi.fn(async () => ({ path: "t", publicUrl: "https://x/t.webp" })),
    listGalleryThumbPaths: vi.fn(async (_folder: string) => new Set<string>()),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
  Prisma: { DbNull: "DB_NULL", JsonNull: "JSON_NULL" },
}));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: auditSpy.recordAdminAction }));
vi.mock("@/lib/admin-rbac-guard", () => ({
  requireAdminAction: vi.fn(async () => ({
    user: { id: "user1" },
    admin: { id: "admin1", role: "SUPERADMIN" },
  })),
}));
vi.mock("@/lib/logger", () => ({ logger: mockLogger }));
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathSpy,
  // Fase 3 · 3.10/P1 — las actions invalidan el cache de miniaturas y lib/cms
  // envuelve lecturas en unstable_cache: passthrough en tests.
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
// No se ejercitan en estas actions (son del upload), pero actions.ts los
// importa de arriba: se mockean para no arrastrar Supabase/sharp al test.
// La derivación de path de la miniatura (3.10) se implementa REAL en el mock:
// es una función pura y los tests del purge/list la necesitan comportándose
// como la de verdad.
vi.mock("@/lib/storage", () => ({
  StorageError: class StorageError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = "StorageError";
    }
  },
  sniffImageMime: vi.fn(),
  uploadProductImage: vi.fn(),
  deleteProductImage: mockStorage.deleteProductImage,
  uploadGalleryThumb: mockStorage.uploadGalleryThumb,
  listGalleryThumbPaths: mockStorage.listGalleryThumbPaths,
  galleryThumbPathFromUrl: (url: string) => {
    const m = "/storage/v1/object/public/product-images/";
    const i = url.indexOf(m);
    if (i === -1) return null;
    const p = url.slice(i + m.length);
    const s = p.lastIndexOf("/");
    return s === -1 ? null : `${p.slice(0, s)}/thumbs/${p.slice(s + 1)}`;
  },
  galleryThumbUrlFromImageUrl: (url: string) => {
    const m = "/storage/v1/object/public/product-images/";
    const i = url.indexOf(m);
    if (i === -1) return null;
    const p = url.slice(i + m.length);
    const s = p.lastIndexOf("/");
    if (s === -1) return null;
    return `${url.slice(0, i)}${m}${p.slice(0, s)}/thumbs/${p.slice(s + 1)}`;
  },
}));
vi.mock("@/features/personalization/gallery-strip", () => ({
  GalleryStripError: class GalleryStripError extends Error {},
  getGalleryStripExpectations: vi.fn(async () => []),
  splitGalleryStripImage: vi.fn(),
}));

import {
  archiveGalleryImageAction,
  bulkAssignVariantFilterAction,
  purgeGalleryImageAction,
  reorderGalleryImageAction,
  restoreGalleryImageAction,
  toggleGalleryImageActiveAction,
  updateGalleryVariantFilterAction,
} from "./actions";
import { listGalleryImages } from "@/features/personalization/design-gallery";

// Producto dueño del tag "separadores" (galleryTag explícito en el schema) con
// las 2 variantes reales del caso: 2×6 y 4×4.2. listGalleryTagOptions y
// listGalleryTagVariantAttributes leen de este mock (service real).
const SEPARADORES_PRODUCT = {
  name: "Separadores Magnéticos Personalizados",
  slug: "separadores-magneticos",
  personalizationKind: "PHOTO",
  personalizationSchema: { galleryTag: "separadores" },
  variants: [{ attributes: { sizeCm: "2×6" } }, { attributes: { sizeCm: "4×4.2" } }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.designGalleryImage.findFirst.mockResolvedValue({ tag: "separadores" });
  mockPrisma.designGalleryImage.findMany.mockResolvedValue([]);
  mockPrisma.designGalleryImage.count.mockResolvedValue(0);
  mockPrisma.designGalleryImage.update.mockResolvedValue({ id: "g1" });
  mockPrisma.designGalleryImage.updateMany.mockResolvedValue({ count: 51 });
  mockPrisma.designGalleryImage.delete.mockResolvedValue({ id: "g1" });
  mockPrisma.product.findMany.mockResolvedValue([SEPARADORES_PRODUCT]);
  mockStorage.deleteProductImage.mockResolvedValue(undefined);
  mockStorage.listGalleryThumbPaths.mockResolvedValue(new Set());
});

describe("updateGalleryVariantFilterAction — editar el 'Aplica a'", () => {
  it("asigna un filtro válido y audita", async () => {
    const fd = new FormData();
    fd.set("id", "g1");
    fd.set("variantFilter", JSON.stringify({ sizeCm: "4×4.2" }));

    const res = await updateGalleryVariantFilterAction(fd);

    expect(res).toEqual({});
    expect(mockPrisma.designGalleryImage.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { variantFilter: { sizeCm: "4×4.2" }, updatedBy: "admin1" },
    });
    expect(auditSpy.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin1",
        action: "galleryImage.updateVariantFilter",
        entityType: "DesignGalleryImage",
        entityId: "g1",
        metadata: { tag: "separadores", variantFilter: { sizeCm: "4×4.2" } },
      }),
    );
    expect(revalidatePathSpy).toHaveBeenCalledWith("/admin/disenos");
  });

  it("vaciar el filtro vuelve a 'todas las variantes' (DbNull) sin consultar variantes", async () => {
    const fd = new FormData();
    fd.set("id", "g1");

    const res = await updateGalleryVariantFilterAction(fd);

    expect(res).toEqual({});
    expect(mockPrisma.designGalleryImage.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { variantFilter: "DB_NULL", updatedBy: "admin1" },
    });
    // Filtro null no requiere validar contra variantes: no consulta productos.
    expect(mockPrisma.product.findMany).not.toHaveBeenCalled();
  });

  it("rechaza un filtro que no corresponde a ninguna variante real", async () => {
    const fd = new FormData();
    fd.set("id", "g1");
    fd.set("variantFilter", JSON.stringify({ sizeCm: "9×9" }));

    const res = await updateGalleryVariantFilterAction(fd);

    expect(res.error).toBe("Ese filtro no corresponde a ninguna variante de este producto.");
    expect(mockPrisma.designGalleryImage.update).not.toHaveBeenCalled();
    expect(revalidatePathSpy).not.toHaveBeenCalled();
  });

  it("rechaza JSON inválido en variantFilter", async () => {
    const fd = new FormData();
    fd.set("id", "g1");
    fd.set("variantFilter", "{no-json");

    const res = await updateGalleryVariantFilterAction(fd);

    expect(res.error).toBe("El filtro de variante no es válido.");
    expect(mockPrisma.designGalleryImage.update).not.toHaveBeenCalled();
  });

  it("diseño inexistente o borrado → error sin escribir", async () => {
    mockPrisma.designGalleryImage.findFirst.mockResolvedValue(null);
    const fd = new FormData();
    fd.set("id", "g-fantasma");
    fd.set("variantFilter", JSON.stringify({ sizeCm: "4×4.2" }));

    const res = await updateGalleryVariantFilterAction(fd);

    expect(res.error).toBe("El diseño no existe.");
    expect(mockPrisma.designGalleryImage.update).not.toHaveBeenCalled();
    expect(auditSpy.recordAdminAction).not.toHaveBeenCalled();
  });
});

describe("bulkAssignVariantFilterAction — asignación masiva a los sin asignar", () => {
  it("updateMany solo a filas del tag con variantFilter null y no borradas", async () => {
    const fd = new FormData();
    fd.set("tag", "separadores");
    fd.set("variantFilter", JSON.stringify({ sizeCm: "4×4.2" }));

    const res = await bulkAssignVariantFilterAction(fd);

    expect(res).toEqual({ count: 51 });
    expect(mockPrisma.designGalleryImage.updateMany).toHaveBeenCalledWith({
      where: {
        tag: "separadores",
        deletedAt: null,
        OR: [{ variantFilter: { equals: "DB_NULL" } }, { variantFilter: { equals: "JSON_NULL" } }],
      },
      data: { variantFilter: { sizeCm: "4×4.2" }, updatedBy: "admin1" },
    });
    expect(auditSpy.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin1",
        action: "galleryImage.bulkVariantFilter",
        entityType: "DesignGalleryImage",
        metadata: { tag: "separadores", variantFilter: { sizeCm: "4×4.2" }, count: 51 },
      }),
    );
    expect(revalidatePathSpy).toHaveBeenCalledWith("/admin/disenos");
  });

  it("tag que no resuelve producto activo → 'Producto inválido.'", async () => {
    const fd = new FormData();
    fd.set("tag", "no-existe");
    fd.set("variantFilter", JSON.stringify({ sizeCm: "4×4.2" }));

    const res = await bulkAssignVariantFilterAction(fd);

    expect(res.error).toBe("Producto inválido.");
    expect(mockPrisma.designGalleryImage.updateMany).not.toHaveBeenCalled();
  });

  it("filtro vacío se rechaza (asignar 'Todas' a los que ya están en 'Todas' sería no-op)", async () => {
    const fd = new FormData();
    fd.set("tag", "separadores");

    const res = await bulkAssignVariantFilterAction(fd);

    expect(res.error).toBe("Elige la variante a asignar.");
    expect(mockPrisma.designGalleryImage.updateMany).not.toHaveBeenCalled();
  });

  it("filtro que no matchea ninguna variante real → error sin escribir", async () => {
    const fd = new FormData();
    fd.set("tag", "separadores");
    fd.set("variantFilter", JSON.stringify({ sizeCm: "9×9" }));

    const res = await bulkAssignVariantFilterAction(fd);

    expect(res.error).toBe("Ese filtro no corresponde a ninguna variante de este producto.");
    expect(mockPrisma.designGalleryImage.updateMany).not.toHaveBeenCalled();
  });
});

describe("toggleGalleryImageActiveAction — pausar/reactivar sin borrar (B-5)", () => {
  it("pausa un diseño (active=0) y audita", async () => {
    const fd = new FormData();
    fd.set("id", "g1");
    fd.set("active", "0");

    const res = await toggleGalleryImageActiveAction(fd);

    expect(res).toEqual({});
    expect(mockPrisma.designGalleryImage.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { isActive: false, updatedBy: "admin1" },
    });
    expect(auditSpy.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin1",
        action: "galleryImage.setActive",
        entityType: "DesignGalleryImage",
        entityId: "g1",
        metadata: { isActive: false },
      }),
    );
    expect(revalidatePathSpy).toHaveBeenCalledWith("/admin/disenos");
  });

  it("reactiva un diseño pausado (active=1)", async () => {
    const fd = new FormData();
    fd.set("id", "g1");
    fd.set("active", "1");

    const res = await toggleGalleryImageActiveAction(fd);

    expect(res).toEqual({});
    expect(mockPrisma.designGalleryImage.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { isActive: true, updatedBy: "admin1" },
    });
  });

  it("sin id o con active inválido → error sin escribir", async () => {
    const sinId = new FormData();
    sinId.set("active", "1");
    expect((await toggleGalleryImageActiveAction(sinId)).error).toBe("Datos inválidos.");

    const malActive = new FormData();
    malActive.set("id", "g1");
    malActive.set("active", "si");
    expect((await toggleGalleryImageActiveAction(malActive)).error).toBe("Datos inválidos.");

    expect(mockPrisma.designGalleryImage.update).not.toHaveBeenCalled();
    expect(auditSpy.recordAdminAction).not.toHaveBeenCalled();
  });
});

describe("restoreGalleryImageAction — restaurar archivados (B-5)", () => {
  it("deletedAt=null + vuelve PAUSADO al final del orden del tag, y audita", async () => {
    mockPrisma.designGalleryImage.count.mockResolvedValue(7);
    const fd = new FormData();
    fd.set("id", "g9");

    const res = await restoreGalleryImageAction(fd);

    expect(res).toEqual({});
    // Solo filas archivadas: si no está soft-deleted no hay nada que restaurar.
    expect(mockPrisma.designGalleryImage.findFirst).toHaveBeenCalledWith({
      where: { id: "g9", deletedAt: { not: null } },
      select: { tag: true },
    });
    expect(mockPrisma.designGalleryImage.count).toHaveBeenCalledWith({
      where: { tag: "separadores", deletedAt: null },
    });
    expect(mockPrisma.designGalleryImage.update).toHaveBeenCalledWith({
      where: { id: "g9" },
      data: { deletedAt: null, isActive: false, order: 7, updatedBy: "admin1" },
    });
    expect(auditSpy.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin1",
        action: "galleryImage.restore",
        entityType: "DesignGalleryImage",
        entityId: "g9",
      }),
    );
    expect(revalidatePathSpy).toHaveBeenCalledWith("/admin/disenos");
  });

  it("diseño inexistente o NO archivado → error sin escribir ni auditar", async () => {
    mockPrisma.designGalleryImage.findFirst.mockResolvedValue(null);
    const fd = new FormData();
    fd.set("id", "g-vivo");

    const res = await restoreGalleryImageAction(fd);

    expect(res.error).toBe("El diseño no está archivado.");
    expect(mockPrisma.designGalleryImage.update).not.toHaveBeenCalled();
    expect(auditSpy.recordAdminAction).not.toHaveBeenCalled();
    expect(revalidatePathSpy).not.toHaveBeenCalled();
  });
});

describe("reorderGalleryImageAction — swap con el adyacente del grupo (B-5)", () => {
  // Grupo visible del admin: mismo tag + mismo variantFilter. "a2" tiene otro
  // filtro → queda fuera del swap aunque esté en medio por `order`.
  const ROWS = [
    { id: "g1", order: 0, variantFilter: null },
    { id: "a2", order: 1, variantFilter: { sizeCm: "2×6" } },
    { id: "g3", order: 2, variantFilter: null },
    { id: "g4", order: 3, variantFilter: null },
  ];

  function mockReorderContext() {
    mockPrisma.designGalleryImage.findFirst.mockResolvedValue({
      id: "g3",
      tag: "separadores",
      order: 2,
      variantFilter: null,
    });
    mockPrisma.designGalleryImage.findMany.mockResolvedValue(ROWS);
  }

  it("'down' intercambia order con el siguiente del MISMO filtro (salta otros filtros)", async () => {
    mockReorderContext();
    const fd = new FormData();
    fd.set("id", "g3");
    fd.set("direction", "down");

    const res = await reorderGalleryImageAction(fd);

    expect(res).toEqual({});
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.designGalleryImage.update).toHaveBeenCalledWith({
      where: { id: "g3" },
      data: { order: 3, updatedBy: "admin1" },
    });
    expect(mockPrisma.designGalleryImage.update).toHaveBeenCalledWith({
      where: { id: "g4" },
      data: { order: 2, updatedBy: "admin1" },
    });
    expect(auditSpy.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin1",
        action: "galleryImage.reorder",
        entityType: "DesignGalleryImage",
        entityId: "g3",
        metadata: { direction: "down" },
      }),
    );
    expect(revalidatePathSpy).toHaveBeenCalledWith("/admin/disenos");
  });

  it("'up' intercambia con el anterior del grupo (g1, no a2 que tiene otro filtro)", async () => {
    mockReorderContext();
    const fd = new FormData();
    fd.set("id", "g3");
    fd.set("direction", "up");

    const res = await reorderGalleryImageAction(fd);

    expect(res).toEqual({});
    expect(mockPrisma.designGalleryImage.update).toHaveBeenCalledWith({
      where: { id: "g3" },
      data: { order: 0, updatedBy: "admin1" },
    });
    expect(mockPrisma.designGalleryImage.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { order: 2, updatedBy: "admin1" },
    });
  });

  it("sin vecino en esa dirección → no-op silencioso (sin transacción ni audit)", async () => {
    mockPrisma.designGalleryImage.findFirst.mockResolvedValue({
      id: "g1",
      tag: "separadores",
      order: 0,
      variantFilter: null,
    });
    mockPrisma.designGalleryImage.findMany.mockResolvedValue(ROWS);
    const fd = new FormData();
    fd.set("id", "g1");
    fd.set("direction", "up");

    const res = await reorderGalleryImageAction(fd);

    expect(res).toEqual({});
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(auditSpy.recordAdminAction).not.toHaveBeenCalled();
    expect(revalidatePathSpy).not.toHaveBeenCalled();
  });

  it("diseño inexistente o archivado → no-op sin escribir", async () => {
    mockPrisma.designGalleryImage.findFirst.mockResolvedValue(null);
    const fd = new FormData();
    fd.set("id", "g-fantasma");
    fd.set("direction", "down");

    const res = await reorderGalleryImageAction(fd);

    expect(res).toEqual({});
    expect(mockPrisma.designGalleryImage.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("direction inválida → error sin consultar", async () => {
    const fd = new FormData();
    fd.set("id", "g1");
    fd.set("direction", "left");

    const res = await reorderGalleryImageAction(fd);

    expect(res.error).toBe("Datos inválidos.");
    expect(mockPrisma.designGalleryImage.findFirst).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fase 3 · 3.6 (2026-10-07) — Archivar (rename del viejo "Borrar", soft-delete)
// y ELIMINAR PERMANENTE (purge: archivos + fila, solo desde Archivados).
// ─────────────────────────────────────────────────────────────────────────────

describe("archiveGalleryImageAction — archivar (soft-delete, 3.6)", () => {
  it("marca deletedAt + isActive=false (NO borra la fila) y audita galleryImage.archive", async () => {
    const fd = new FormData();
    fd.set("id", "g1");

    const res = await archiveGalleryImageAction(fd);

    expect(res).toEqual({});
    expect(mockPrisma.designGalleryImage.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { deletedAt: expect.any(Date), isActive: false },
    });
    expect(mockPrisma.designGalleryImage.delete).not.toHaveBeenCalled();
    expect(auditSpy.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin1",
        action: "galleryImage.archive",
        entityType: "DesignGalleryImage",
        entityId: "g1",
      }),
    );
    expect(revalidatePathSpy).toHaveBeenCalledWith("/admin/disenos");
  });

  it("sin id → error sin escribir ni auditar", async () => {
    const fd = new FormData();
    const res = await archiveGalleryImageAction(fd);
    expect(res.error).toBe("Datos inválidos.");
    expect(mockPrisma.designGalleryImage.update).not.toHaveBeenCalled();
    expect(auditSpy.recordAdminAction).not.toHaveBeenCalled();
  });
});

describe("purgeGalleryImageAction — eliminar permanentemente (3.6)", () => {
  const URL_A =
    "https://ref.supabase.co/storage/v1/object/public/product-images/gallery-separadores/uuid-a.webp";
  const URL_B =
    "https://ref.supabase.co/storage/v1/object/public/product-images/gallery-separadores-b/uuid-b.webp";

  function mockArchivedRow() {
    // Solo filas ARCHIVADAS se pueden purgar (deletedAt not null).
    mockPrisma.designGalleryImage.findFirst.mockResolvedValue({
      imageUrl: URL_A,
      imageUrlB: URL_B,
    });
  }

  it("purga miniatura watermark + original de AMBAS caras, borra la fila y audita galleryImage.purge", async () => {
    mockArchivedRow();
    const fd = new FormData();
    fd.set("id", "g9");

    const res = await purgeGalleryImageAction(fd);

    expect(res).toEqual({});
    // Solo se purgan archivados.
    expect(mockPrisma.designGalleryImage.findFirst).toHaveBeenCalledWith({
      where: { id: "g9", deletedAt: { not: null } },
      select: { imageUrl: true, imageUrlB: true },
    });
    // Purga física: thumb A + original A + thumb B + original B (las URLs de
    // miniatura derivadas por la convención 3.10: /thumbs/<uuid>.webp).
    const removed = mockStorage.deleteProductImage.mock.calls.map((c) => c[0]);
    expect(removed).toEqual([
      "https://ref.supabase.co/storage/v1/object/public/product-images/gallery-separadores/thumbs/uuid-a.webp",
      URL_A,
      "https://ref.supabase.co/storage/v1/object/public/product-images/gallery-separadores-b/thumbs/uuid-b.webp",
      URL_B,
    ]);
    // La fila se borra DESPUÉS de la purga.
    expect(mockPrisma.designGalleryImage.delete).toHaveBeenCalledWith({ where: { id: "g9" } });
    expect(auditSpy.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin1",
        action: "galleryImage.purge",
        entityType: "DesignGalleryImage",
        entityId: "g9",
      }),
    );
    expect(revalidatePathSpy).toHaveBeenCalledWith("/admin/disenos");
  });

  it("sin cara B purga solo la A (2 llamadas: thumb + original)", async () => {
    mockPrisma.designGalleryImage.findFirst.mockResolvedValue({
      imageUrl: URL_A,
      imageUrlB: null,
    });
    const fd = new FormData();
    fd.set("id", "g9");

    const res = await purgeGalleryImageAction(fd);

    expect(res).toEqual({});
    expect(mockStorage.deleteProductImage).toHaveBeenCalledTimes(2);
    expect(mockPrisma.designGalleryImage.delete).toHaveBeenCalled();
  });

  it("diseño inexistente o NO archivado → error sin tocar storage ni la fila", async () => {
    mockPrisma.designGalleryImage.findFirst.mockResolvedValue(null);
    const fd = new FormData();
    fd.set("id", "g-vivo");

    const res = await purgeGalleryImageAction(fd);

    expect(res.error).toBe("El diseño no está archivado.");
    expect(mockStorage.deleteProductImage).not.toHaveBeenCalled();
    expect(mockPrisma.designGalleryImage.delete).not.toHaveBeenCalled();
    expect(auditSpy.recordAdminAction).not.toHaveBeenCalled();
  });

  it("fallo de storage ABORTA: la fila se CONSERVA (reintentable, sin huérfanos) y no audita", async () => {
    mockArchivedRow();
    mockStorage.deleteProductImage.mockRejectedValueOnce(new Error("storage down"));
    const fd = new FormData();
    fd.set("id", "g9");

    const res = await purgeGalleryImageAction(fd);

    expect(res.error).toBe(
      "No se pudieron borrar los archivos del servidor. El diseño sigue archivado; inténtalo de nuevo.",
    );
    expect(mockPrisma.designGalleryImage.delete).not.toHaveBeenCalled();
    expect(auditSpy.recordAdminAction).not.toHaveBeenCalled();
    expect(revalidatePathSpy).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "admin.gallery.purge_fail", id: "g9" }),
      "Failed to purge gallery image",
    );
  });

  it("sin id → error sin consultar", async () => {
    const fd = new FormData();
    const res = await purgeGalleryImageAction(fd);
    expect(res.error).toBe("Datos inválidos.");
    expect(mockPrisma.designGalleryImage.findFirst).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fase 3 · 3.10 — listGalleryImages expone thumbUrl (miniatura watermark) SOLO
// cuando el objeto EXISTE en el bucket (list del folder de thumbs); si no,
// null → el Estudio cae al original (fallback transitorio pre-backfill).
// ─────────────────────────────────────────────────────────────────────────────

describe("listGalleryImages — exposición de thumbUrl (3.10)", () => {
  const URL_1 =
    "https://ref.supabase.co/storage/v1/object/public/product-images/gallery-separadores/u1.webp";
  const URL_2 =
    "https://ref.supabase.co/storage/v1/object/public/product-images/gallery-separadores/u2.webp";

  beforeEach(() => {
    mockPrisma.designGalleryImage.findMany.mockResolvedValue([
      { id: "g1", name: "Flores", imageUrl: URL_1, imageUrlB: null, variantFilter: null },
      { id: "g2", name: "Selva", imageUrl: URL_2, imageUrlB: null, variantFilter: null },
    ]);
  });

  it("thumbUrl derivada solo para la fila cuya miniatura EXISTE en el bucket", async () => {
    mockStorage.listGalleryThumbPaths.mockResolvedValue(
      new Set(["gallery-separadores/thumbs/u1.webp"]),
    );

    const list = await listGalleryImages("separadores");

    expect(mockStorage.listGalleryThumbPaths).toHaveBeenCalledWith("gallery-separadores");
    expect(list).toHaveLength(2);
    expect(list[0].thumbUrl).toBe(
      "https://ref.supabase.co/storage/v1/object/public/product-images/gallery-separadores/thumbs/u1.webp",
    );
    expect(list[1].thumbUrl).toBeNull();
    // El imageUrl original sigue disponible (fallback transitorio pre-backfill).
    expect(list[1].imageUrl).toBe(URL_2);
  });

  it("sin miniaturas en el bucket (fail-open) → thumbUrl null en todas", async () => {
    mockStorage.listGalleryThumbPaths.mockResolvedValue(new Set());

    const list = await listGalleryImages("separadores");

    expect(list.every((i) => i.thumbUrl === null)).toBe(true);
  });

  it("imageUrl ajena al bucket → thumbUrl null aunque el folder tenga objetos", async () => {
    mockPrisma.designGalleryImage.findMany.mockResolvedValue([
      {
        id: "g3",
        name: "Externa",
        imageUrl: "https://cdn-ajeno.example/x.webp",
        imageUrlB: null,
        variantFilter: null,
      },
    ]);
    mockStorage.listGalleryThumbPaths.mockResolvedValue(
      new Set(["gallery-separadores/thumbs/x.webp"]),
    );

    const list = await listGalleryImages("separadores");

    expect(list[0].thumbUrl).toBeNull();
  });

  it("el filtrado por variante (Fase 5) conserva el thumbUrl", async () => {
    mockPrisma.designGalleryImage.findMany.mockResolvedValue([
      {
        id: "g1",
        name: "Flores",
        imageUrl: URL_1,
        imageUrlB: null,
        variantFilter: { sizeCm: "2×6" },
      },
      { id: "g2", name: "Selva", imageUrl: URL_2, imageUrlB: null, variantFilter: null },
    ]);
    mockStorage.listGalleryThumbPaths.mockResolvedValue(
      new Set(["gallery-separadores/thumbs/u1.webp"]),
    );

    const list = await listGalleryImages("separadores", { sizeCm: "4×4.2" });

    // Solo g2 (sin filtro) aplica a 4×4.2; g1 queda fuera con su thumb.
    expect(list.map((i) => i.id)).toEqual(["g2"]);
  });
});

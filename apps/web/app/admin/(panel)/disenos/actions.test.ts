/*
 * Unit tests — actions de DISEÑOS prediseñados: edición del "Aplica a"
 * (updateGalleryVariantFilterAction) y asignación masiva
 * (bulkAssignVariantFilterAction), Fase 5b (2026-10-02). B-5 (misma fecha):
 * toggle isActive, restore de archivados y reorden por swap.
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

const { mockPrisma, auditSpy, mockLogger, revalidatePathSpy } = vi.hoisted(() => ({
  mockPrisma: {
    designGalleryImage: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
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
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathSpy }));
// No se ejercitan en estas actions (son del upload), pero actions.ts los
// importa de arriba: se mockean para no arrastrar Supabase/sharp al test.
vi.mock("@/lib/storage", () => ({
  StorageError: class StorageError extends Error {},
  sniffImageMime: vi.fn(),
  uploadProductImage: vi.fn(),
}));
vi.mock("@/features/personalization/gallery-strip", () => ({
  GalleryStripError: class GalleryStripError extends Error {},
  getGalleryStripExpectations: vi.fn(async () => []),
  splitGalleryStripImage: vi.fn(),
}));

import {
  bulkAssignVariantFilterAction,
  reorderGalleryImageAction,
  restoreGalleryImageAction,
  toggleGalleryImageActiveAction,
  updateGalleryVariantFilterAction,
} from "./actions";

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
  mockPrisma.product.findMany.mockResolvedValue([SEPARADORES_PRODUCT]);
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

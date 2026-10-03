/*
 * Unit tests — actions de DISEÑOS prediseñados: edición del "Aplica a"
 * (updateGalleryVariantFilterAction) y asignación masiva
 * (bulkAssignVariantFilterAction), Fase 5b (2026-10-02).
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
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
    },
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

import { bulkAssignVariantFilterAction, updateGalleryVariantFilterAction } from "./actions";

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

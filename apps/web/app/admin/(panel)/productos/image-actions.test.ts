/*
 * Unit tests — image-actions de PRODUCTO (Product.images).
 *
 * Regresión A3-01 (cert 2026-09-26): upload/reorder/delete de imágenes de
 * producto solo revalidaban paths /admin/* → las cards del PLP, /ocasion,
 * cross-sell y /api/catalog/* (bot) servían la foto vieja hasta el TTL
 * (5 min / 1 h). Ahora cada mutación emite updateTag("catalog"), igual que el
 * resto de las mutaciones del catálogo (features/products/service.ts).
 *
 * Patrón: lógica de la action con prisma/storage/audit/guard/next/cache
 * mockeados — mismo harness que [id]/variants/image-actions.test.ts; el gate
 * MFA/RBAC real se cubre aparte en product-actions-aal2.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockStorage, auditSpy, mockLogger, updateTagSpy, revalidatePathSpy } =
  vi.hoisted(() => ({
    mockPrisma: {
      product: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    },
    mockStorage: {
      uploadProductImage: vi.fn(),
      deleteProductImage: vi.fn(),
    },
    auditSpy: { recordAdminAction: vi.fn(async () => {}) },
    mockLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
    updateTagSpy: vi.fn(),
    revalidatePathSpy: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/storage", () => ({
  uploadProductImage: mockStorage.uploadProductImage,
  deleteProductImage: mockStorage.deleteProductImage,
  StorageError: class StorageError extends Error {},
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
  updateTag: updateTagSpy,
}));

import {
  deleteProductImageAction,
  reorderProductImagesAction,
  uploadProductImagesAction,
} from "./image-actions";

const PRODUCT = {
  id: "prod1",
  name: "Fotoimán",
  images: ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.product.findFirst.mockResolvedValue(PRODUCT);
  mockPrisma.product.update.mockResolvedValue({});
  mockStorage.uploadProductImage.mockImplementation(async ({ file }: { file: File }) => ({
    publicUrl: `https://cdn.test/${file.name}`,
  }));
  mockStorage.deleteProductImage.mockResolvedValue(undefined);
});

describe("invalidación storefront (A3-01): updateTag('catalog')", () => {
  it("upload exitoso emite updateTag('catalog')", async () => {
    const fd = new FormData();
    fd.set("productId", PRODUCT.id);
    fd.append("files", new File([new Uint8Array([1, 2, 3])], "nueva.jpg", { type: "image/jpeg" }));

    const res = await uploadProductImagesAction(fd);

    expect(res).toEqual({});
    expect(updateTagSpy).toHaveBeenCalledWith("catalog");
  });

  it("upload sin archivos NO emite updateTag (no hubo mutación)", async () => {
    const fd = new FormData();
    fd.set("productId", PRODUCT.id);

    const res = await uploadProductImagesAction(fd);

    expect(res.error).toBeTruthy();
    expect(updateTagSpy).not.toHaveBeenCalled();
  });

  it("reorder válido emite updateTag('catalog')", async () => {
    const fd = new FormData();
    fd.set("productId", PRODUCT.id);
    fd.set("order", JSON.stringify([...PRODUCT.images].reverse()));

    const res = await reorderProductImagesAction(fd);

    expect(res).toEqual({});
    expect(updateTagSpy).toHaveBeenCalledWith("catalog");
  });

  it("reorder que no coincide con las imágenes actuales NO emite updateTag", async () => {
    const fd = new FormData();
    fd.set("productId", PRODUCT.id);
    fd.set("order", JSON.stringify(["https://cdn.test/a.jpg"]));

    const res = await reorderProductImagesAction(fd);

    expect(res.error).toBeTruthy();
    expect(updateTagSpy).not.toHaveBeenCalled();
  });

  it("delete emite updateTag('catalog')", async () => {
    const fd = new FormData();
    fd.set("productId", PRODUCT.id);
    fd.set("url", "https://cdn.test/a.jpg");

    const res = await deleteProductImageAction(fd);

    expect(res).toEqual({});
    expect(updateTagSpy).toHaveBeenCalledWith("catalog");
  });

  it("delete de una URL ajena al producto NO emite updateTag", async () => {
    const fd = new FormData();
    fd.set("productId", PRODUCT.id);
    fd.set("url", "https://cdn.test/ajena.jpg");

    const res = await deleteProductImageAction(fd);

    expect(res.error).toBeTruthy();
    expect(updateTagSpy).not.toHaveBeenCalled();
  });
});

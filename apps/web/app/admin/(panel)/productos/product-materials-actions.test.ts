/*
 * Fase 7b — tests de las Server Actions de receta (ProductMaterial).
 *
 * Mockea el guard RBAC, Prisma, audit y redirect (imitando el NEXT_REDIRECT
 * real de Next para ejercitar el rethrow de los catch) y verifica:
 *   - validación de cantidad (> 0, decimales con coma, tope anti-dedazo),
 *   - no se puede recetar un material eliminado/inexistente,
 *   - duplicado (P2002) → error amable sin romper,
 *   - happy path: create/update/delete con los datos correctos + audit.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock, state } = vi.hoisted(() => ({
  prismaMock: {
    material: { findFirst: vi.fn() },
    productMaterial: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
  auditMock: { recordAdminAction: vi.fn() },
  state: { role: "MANAGER" as string },
}));

class RedirectError extends Error {
  constructor(public to: string) {
    // El mensaje IMITA al redirect real de Next para que el patrón
    // `if (err.message === "NEXT_REDIRECT") throw err` de las actions funcione.
    super("NEXT_REDIRECT");
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/admin-audit", () => auditMock);
vi.mock("@/lib/logger", () => ({ logger: { info: () => {}, error: () => {}, warn: () => {} } }));
vi.mock("@/lib/admin-rbac-guard", () => ({
  requireAdminAction: async () => ({ admin: { id: "admin-1", role: state.role } }),
}));

import {
  addProductMaterialAction,
  removeProductMaterialAction,
  updateProductMaterialAction,
} from "./product-materials-actions";

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const BASE = { productId: "prod-1", materialId: "mat-1" };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.material.findFirst.mockResolvedValue({ id: "mat-1", name: "Papel fotográfico" });
  prismaMock.productMaterial.create.mockResolvedValue({ id: "pm-1" });
});

describe("addProductMaterialAction (Fase 7b)", () => {
  it("happy path: crea la fila con cantidad parseada y audit", async () => {
    await expect(
      addProductMaterialAction(fd({ ...BASE, quantity: "2,5", note: " para la base " })),
    ).rejects.toMatchObject({ to: "/admin/productos/prod-1?section=materiales&added=1" });

    expect(prismaMock.productMaterial.create).toHaveBeenCalledWith({
      data: {
        productId: "prod-1",
        materialId: "mat-1",
        quantity: 2.5,
        note: "para la base",
        createdBy: "admin-1",
      },
    });
    expect(auditMock.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "product.material.add", entityType: "ProductMaterial" }),
    );
  });

  it.each(["0", "-3", "abc", "", "2000000"])(
    "cantidad inválida (%s) → error amable, sin tocar la DB",
    async (quantity) => {
      await expect(addProductMaterialAction(fd({ ...BASE, quantity }))).rejects.toMatchObject({
        to: expect.stringContaining("error="),
      });
      expect(prismaMock.productMaterial.create).not.toHaveBeenCalled();
    },
  );

  it("material eliminado/inexistente → error, sin crear", async () => {
    prismaMock.material.findFirst.mockResolvedValue(null);
    await expect(addProductMaterialAction(fd({ ...BASE, quantity: "1" }))).rejects.toMatchObject({
      to: expect.stringContaining(encodeURIComponent("ya no existe o fue eliminado")),
    });
    expect(prismaMock.productMaterial.create).not.toHaveBeenCalled();
  });

  it("duplicado (P2002) → error amable 'ya está en la receta'", async () => {
    prismaMock.productMaterial.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );
    await expect(addProductMaterialAction(fd({ ...BASE, quantity: "1" }))).rejects.toMatchObject({
      to: expect.stringContaining(encodeURIComponent("ya está en la receta")),
    });
  });
});

describe("updateProductMaterialAction (Fase 7b)", () => {
  it("actualiza cantidad y nota", async () => {
    await expect(
      updateProductMaterialAction(fd({ id: "pm-1", productId: "prod-1", quantity: "3" })),
    ).rejects.toMatchObject({ to: "/admin/productos/prod-1?section=materiales&updated=1" });

    expect(prismaMock.productMaterial.update).toHaveBeenCalledWith({
      where: { id: "pm-1" },
      data: { quantity: 3, note: null, updatedBy: "admin-1" },
    });
  });

  it("cantidad inválida → error, sin update", async () => {
    await expect(
      updateProductMaterialAction(fd({ id: "pm-1", productId: "prod-1", quantity: "0" })),
    ).rejects.toMatchObject({ to: expect.stringContaining("error=") });
    expect(prismaMock.productMaterial.update).not.toHaveBeenCalled();
  });
});

describe("removeProductMaterialAction (Fase 7b)", () => {
  it("borra la fila de receta y audita", async () => {
    await expect(
      removeProductMaterialAction(fd({ id: "pm-1", productId: "prod-1" })),
    ).rejects.toMatchObject({ to: "/admin/productos/prod-1?section=materiales&removed=1" });

    expect(prismaMock.productMaterial.delete).toHaveBeenCalledWith({ where: { id: "pm-1" } });
    expect(auditMock.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "product.material.remove" }),
    );
  });
});

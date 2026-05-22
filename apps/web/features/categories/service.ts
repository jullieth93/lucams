import "server-only";
import { prisma } from "@/lib/db";
import type { CategoryCreateInput } from "./schemas";

export class CategoryValidationError extends Error {
  constructor(
    public field: "slug" | "general",
    message: string,
  ) {
    super(message);
    this.name = "CategoryValidationError";
  }
}

export type CategoryListOpts = {
  /** Búsqueda en name/slug (case-insensitive). */
  q?: string;
  /** Filtro por estado. Default: "all" (muestra todo incluso archivadas). */
  status?: "active" | "inactive" | "archived" | "all";
  /** Orden. Default: por order asc + name asc. */
  sort?: "order" | "name" | "recent";
};

export async function listCategories(opts: CategoryListOpts = {}) {
  const q = opts.q?.trim();
  const orderBy = (() => {
    switch (opts.sort) {
      case "name":
        return [{ name: "asc" as const }];
      case "recent":
        return [{ createdAt: "desc" as const }];
      case "order":
      default:
        return [{ order: "asc" as const }, { name: "asc" as const }];
    }
  })();

  // Default: admin ve TODO (activas + inactivas + archivadas). Storefront
  // filtra deletedAt+isActive aparte. Lucy 2026-05-22: modularidad.
  return prisma.category.findMany({
    where: {
      ...(opts.status === "active" ? { isActive: true, deletedAt: null } : {}),
      ...(opts.status === "inactive" ? { isActive: false, deletedAt: null } : {}),
      ...(opts.status === "archived" ? { deletedAt: { not: null } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { slug: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy,
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      isActive: true,
      deletedAt: true,
      order: true,
      _count: { select: { products: true } },
    },
  });
}

export async function createCategory(input: CategoryCreateInput, createdBy: string | null) {
  const conflict = await prisma.category.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (conflict) throw new CategoryValidationError("slug", `Slug "${input.slug}" ya existe`);

  return prisma.category.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      isActive: input.isActive,
      order: input.order,
      ...(createdBy ? { createdBy } : {}),
    },
  });
}

export async function updateCategory(
  id: string,
  input: Partial<CategoryCreateInput>,
  updatedBy: string | null,
) {
  if (input.slug) {
    const conflict = await prisma.category.findFirst({
      where: { slug: input.slug, id: { not: id }, deletedAt: null },
      select: { id: true },
    });
    if (conflict) throw new CategoryValidationError("slug", `Slug "${input.slug}" ya existe`);
  }
  return prisma.category.update({
    where: { id },
    data: { ...input, ...(updatedBy ? { updatedBy } : {}) },
  });
}

export async function softDeleteCategory(id: string, deletedBy: string | null) {
  // Bloquear borrado si tiene productos activos asociados — evita
  // huérfanos en Product.categoryId.
  const productCount = await prisma.product.count({
    where: { categoryId: id, deletedAt: null },
  });
  if (productCount > 0) {
    throw new CategoryValidationError(
      "general",
      `No se puede archivar: tiene ${productCount} producto(s) activo(s). Movelos a otra categoría primero.`,
    );
  }
  return prisma.category.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
      ...(deletedBy ? { deletedBy } : {}),
    },
  });
}

/** Restaura una categoría archivada. isActive queda false; admin la activa
 * explícito desde el listado para evitar que reaparezca en storefront sin querer. */
export async function restoreCategory(id: string, restoredBy: string | null) {
  return prisma.category.update({
    where: { id },
    data: {
      deletedAt: null,
      deletedBy: null,
      isActive: false,
      ...(restoredBy ? { updatedBy: restoredBy } : {}),
    },
  });
}

/** Toggle isActive de una categoría (activar/desactivar sin archivar). */
export async function toggleCategoryActive(
  id: string,
  isActive: boolean,
  actorAdminId: string | null,
) {
  return prisma.category.update({
    where: { id },
    data: { isActive, ...(actorAdminId ? { updatedBy: actorAdminId } : {}) },
  });
}

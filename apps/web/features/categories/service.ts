import "server-only";
import { prisma } from "@/lib/db";
import type { CategoryCreateInput } from "./schemas";

export class CategoryValidationError extends Error {
  constructor(public field: "slug" | "general", message: string) {
    super(message);
    this.name = "CategoryValidationError";
  }
}

export async function listCategories() {
  return prisma.category.findMany({
    where: { deletedAt: null },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      isActive: true,
      order: true,
      _count: { select: { products: true } },
    },
  });
}

export async function createCategory(
  input: CategoryCreateInput,
  createdBy: string | null,
) {
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

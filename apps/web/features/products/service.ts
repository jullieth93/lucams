/*
 * Service layer — Products.
 *
 * Patrón CONVENTIONS § capa de servicio: lógica de dominio pura,
 * sin imports de next/* ni @/lib/supabase. Solo Prisma + tipos.
 * Server actions llaman a este service.
 *
 * Soft delete: `deleteProduct` marca `deletedAt` (no hard delete).
 * Filtros: las queries de listado excluyen soft-deleted por default.
 */

import "server-only";
import { prisma, type Prisma } from "@/lib/db";
import type {
  ProductCreateInput,
  ProductUpdateInput,
} from "./schemas";

export type ProductListItem = {
  id: string;
  slug: string;
  name: string;
  basePrice: number;
  sku: string;
  isActive: boolean;
  isFeatured: boolean;
  isPersonalizable: boolean;
  category: { id: string; name: string; slug: string };
  imagesCount: number;
  variantsCount: number;
  createdAt: Date;
  updatedAt: Date;
};

const LIST_PAGE_SIZE = 20;

export async function listProducts(opts: {
  page?: number;
  search?: string;
  categoryId?: string;
  onlyActive?: boolean;
}): Promise<{ items: ProductListItem[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    ...(opts.onlyActive ? { isActive: true } : {}),
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(opts.search
      ? {
          OR: [
            { name: { contains: opts.search, mode: "insensitive" } },
            { sku: { contains: opts.search, mode: "insensitive" } },
            { slug: { contains: opts.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * LIST_PAGE_SIZE,
      take: LIST_PAGE_SIZE,
      select: {
        id: true,
        slug: true,
        name: true,
        basePrice: true,
        sku: true,
        isActive: true,
        isFeatured: true,
        isPersonalizable: true,
        images: true,
        createdAt: true,
        updatedAt: true,
        category: { select: { id: true, name: true, slug: true } },
        _count: { select: { variants: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    items: items.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      basePrice: p.basePrice,
      sku: p.sku,
      isActive: p.isActive,
      isFeatured: p.isFeatured,
      isPersonalizable: p.isPersonalizable,
      category: p.category,
      imagesCount: p.images.length,
      variantsCount: p._count.variants,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
    total,
    page,
    pageSize: LIST_PAGE_SIZE,
  };
}

export async function getProductById(id: string) {
  return prisma.product.findFirst({
    where: { id, deletedAt: null },
    include: { category: true, variants: true },
  });
}

export async function createProduct(
  input: ProductCreateInput,
  createdBy: string | null,
) {
  // Verificar unicidad slug + sku (mejor mensaje de error que el de
  // Prisma P2002 genérico).
  const [slugConflict, skuConflict] = await Promise.all([
    prisma.product.findUnique({ where: { slug: input.slug }, select: { id: true } }),
    prisma.product.findUnique({ where: { sku: input.sku }, select: { id: true } }),
  ]);
  if (slugConflict) throw new ProductValidationError("slug", `Slug "${input.slug}" ya existe`);
  if (skuConflict) throw new ProductValidationError("sku", `SKU "${input.sku}" ya existe`);

  // Crear producto + variante default en la misma transacción.
  // CartItem y OrderItem requieren variantId — sin variante el producto
  // no se puede comprar. Pre-variantes-admin: cada producto tiene una
  // "Default" 1:1 con price=null (hereda basePrice) y stock=0 (sin
  // enforcement). Cuando se sumen variantes reales se reemplazan o
  // expanden.
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description,
        basePrice: input.basePrice,
        compareAtPrice: input.compareAtPrice ?? null,
        cost: input.cost ?? null,
        sku: input.sku,
        isPersonalizable: input.isPersonalizable,
        isActive: input.isActive,
        isFeatured: input.isFeatured,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        categoryId: input.categoryId,
        images: [],
        ...(createdBy ? { createdBy } : {}),
      },
    });
    await tx.productVariant.create({
      data: {
        productId: product.id,
        name: "Default",
        sku: `${input.sku}-DEFAULT`,
        price: null,
        stock: 0,
        attributes: {},
        ...(createdBy ? { createdBy } : {}),
      },
    });
    return product;
  });
}

export async function updateProduct(
  input: ProductUpdateInput,
  updatedBy: string | null,
) {
  const { id, ...rest } = input;

  // Si cambian slug/sku, verificar unicidad excluyendo el propio.
  if (rest.slug) {
    const conflict = await prisma.product.findFirst({
      where: { slug: rest.slug, id: { not: id }, deletedAt: null },
      select: { id: true },
    });
    if (conflict) throw new ProductValidationError("slug", `Slug "${rest.slug}" ya existe`);
  }
  if (rest.sku) {
    const conflict = await prisma.product.findFirst({
      where: { sku: rest.sku, id: { not: id }, deletedAt: null },
      select: { id: true },
    });
    if (conflict) throw new ProductValidationError("sku", `SKU "${rest.sku}" ya existe`);
  }

  return prisma.product.update({
    where: { id },
    data: {
      ...rest,
      ...(updatedBy ? { updatedBy } : {}),
    },
  });
}

export async function softDeleteProduct(id: string, deletedBy: string | null) {
  return prisma.product.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      ...(deletedBy ? { deletedBy } : {}),
      isActive: false, // dejarlo invisible al storefront además del soft delete
    },
  });
}

export async function listCategoriesForSelect() {
  return prisma.category.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Errores específicos del dominio products. Se mapean a fieldErrors en
// las server actions.

export class ProductValidationError extends Error {
  constructor(
    public field: "slug" | "sku" | "categoryId" | "general",
    message: string,
  ) {
    super(message);
    this.name = "ProductValidationError";
  }
}

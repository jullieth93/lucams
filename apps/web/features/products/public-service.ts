/*
 * Service layer — Products (lectura pública, storefront).
 *
 * Separado de service.ts (admin) para que sea evidente que estas
 * queries son las que el storefront público consume y nunca filtran
 * datos no-publicables:
 *   - deletedAt: null   (no archivados)
 *   - isActive: true    (admin-toggled visible)
 *   - category.isActive: true + category.deletedAt: null
 *
 * Si el catálogo crece y se vuelve lento, acá es donde se mete cache
 * con unstable_cache + revalidateTag('products') en createProduct/
 * updateProduct/softDeleteProduct.
 */

import "server-only";
import { prisma } from "@/lib/db";

export type StorefrontProductCard = {
  id: string;
  slug: string;
  name: string;
  basePrice: number;
  compareAtPrice: number | null;
  isPersonalizable: boolean;
  images: string[];
  category: { slug: string; name: string };
};

export type StorefrontProductDetail = StorefrontProductCard & {
  description: string;
  sku: string;
  seoTitle: string | null;
  seoDescription: string | null;
};

const STOREFRONT_WHERE = {
  deletedAt: null,
  isActive: true,
  category: { deletedAt: null, isActive: true },
} as const;

export async function listStorefrontCategories() {
  return prisma.category.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      _count: {
        select: {
          products: { where: { deletedAt: null, isActive: true } },
        },
      },
    },
  });
}

export async function listStorefrontProducts(opts: {
  categorySlug?: string;
  featured?: boolean;
  limit?: number;
}): Promise<StorefrontProductCard[]> {
  const items = await prisma.product.findMany({
    where: {
      ...STOREFRONT_WHERE,
      ...(opts.categorySlug ? { category: { ...STOREFRONT_WHERE.category, slug: opts.categorySlug } } : {}),
      ...(opts.featured ? { isFeatured: true } : {}),
    },
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    take: opts.limit,
    select: {
      id: true,
      slug: true,
      name: true,
      basePrice: true,
      compareAtPrice: true,
      isPersonalizable: true,
      images: true,
      category: { select: { slug: true, name: true } },
    },
  });
  return items;
}

export async function getStorefrontProductBySlug(
  slug: string,
): Promise<StorefrontProductDetail | null> {
  return prisma.product.findFirst({
    where: { ...STOREFRONT_WHERE, slug },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      basePrice: true,
      compareAtPrice: true,
      sku: true,
      isPersonalizable: true,
      images: true,
      seoTitle: true,
      seoDescription: true,
      category: { select: { slug: true, name: true } },
    },
  });
}

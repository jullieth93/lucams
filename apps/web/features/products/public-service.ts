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
      ...(opts.categorySlug
        ? { category: { ...STOREFRONT_WHERE.category, slug: opts.categorySlug } }
        : {}),
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

/**
 * Búsqueda fuzzy de productos via pg_trgm + unaccent. Usado por header
 * Cmd+K palette. La función SQL `immutable_unaccent` se creó en la
 * migración supabase/00000000000005_search_and_storage.sql.
 *
 * Estrategia:
 *  - Si la query es < 2 chars devuelve vacío (evita full table scan).
 *  - Sanitiza: trim + max 80 chars + sin caracteres especiales SQL.
 *  - Usa LIKE con unaccent en name/description/sku/slug.
 *  - Limit 8 — suficiente para autocomplete.
 */
export async function searchStorefrontProducts(rawQuery: string): Promise<StorefrontProductCard[]> {
  const q = rawQuery.trim().slice(0, 80);
  if (q.length < 2) return [];

  // Escape para LIKE: % y _ son wildcards en LIKE; ' es delimitador.
  // Reemplazamos con espacio para no romper la query.
  const safe = q.replace(/[%_'"\\]/g, " ").trim();
  if (safe.length < 2) return [];

  const pattern = `%${safe}%`;
  // $queryRaw con Prisma.sql template tag previene SQL injection
  // automáticamente — los $1/$2/etc se bindean parametrizados.
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      slug: string;
      name: string;
      basePrice: number;
      compareAtPrice: number | null;
      isPersonalizable: boolean;
      images: string[];
      categoryName: string;
      categorySlug: string;
    }>
  >`
    SELECT
      p.id, p.slug, p.name, p."basePrice", p."compareAtPrice",
      p."isPersonalizable", p.images,
      c.name as "categoryName", c.slug as "categorySlug"
    FROM "Product" p
    JOIN "Category" c ON c.id = p."categoryId"
    WHERE p."deletedAt" IS NULL
      AND p."isActive" = true
      AND c."deletedAt" IS NULL
      AND c."isActive" = true
      AND (
        immutable_unaccent(p.name) ILIKE immutable_unaccent(${pattern})
        OR immutable_unaccent(p.description) ILIKE immutable_unaccent(${pattern})
        OR p.sku ILIKE ${pattern}
        OR p.slug ILIKE ${pattern}
      )
    ORDER BY p."isFeatured" DESC, p."createdAt" DESC
    LIMIT 8
  `;
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    basePrice: r.basePrice,
    compareAtPrice: r.compareAtPrice,
    isPersonalizable: r.isPersonalizable,
    images: r.images,
    category: { slug: r.categorySlug, name: r.categoryName },
  }));
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

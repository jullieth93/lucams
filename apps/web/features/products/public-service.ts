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
 * Búsqueda fuzzy con tolerancia a typos via pg_trgm similarity.
 *
 * Algoritmo (ordenado por rendimiento):
 *  1. Si query es 1 char → vacío (full scan no vale).
 *  2. Si query ≥ 2 chars:
 *     a. Match exacto/prefix con ILIKE (rápido y prioritario).
 *     b. Fuzzy match con similarity() ≥ 0.25 (tolera typos como
 *        "fotoiman" → "fotoimanes", "calenadrio" → "calendario").
 *     c. Match por substring en SKU/slug (códigos exactos).
 *  3. Combinamos resultados ordenados por score DESC (exact > prefix
 *     > similarity > sku), dedup por id. Top 8.
 *  4. Si 0 resultados con threshold 0.25, retornamos "suggestions"
 *     con threshold 0.1 (max 3) marcadas con `isSuggestion=true`
 *     para que el cliente muestre "¿Querías decir...?".
 *
 * `immutable_unaccent` se creó en supabase/00000000000005_search...sql
 * con índice GIN trigram en Product.name + description.
 *
 * Referencia: https://www.postgresql.org/docs/current/pgtrgm.html
 */
export type SearchResult = StorefrontProductCard & {
  score: number;
  isSuggestion?: boolean;
};

export async function searchStorefrontProducts(rawQuery: string): Promise<SearchResult[]> {
  const q = rawQuery.trim().slice(0, 80);
  if (q.length < 2) return [];

  // Sanitización: quitamos wildcards LIKE y SQL delimiters.
  const safe = q.replace(/[%_'"\\]/g, " ").trim();
  if (safe.length < 2) return [];

  type Row = {
    id: string;
    slug: string;
    name: string;
    basePrice: number;
    compareAtPrice: number | null;
    isPersonalizable: boolean;
    images: string[];
    categoryName: string;
    categorySlug: string;
    score: number;
  };

  const pattern = `%${safe}%`;
  const prefixPattern = `${safe}%`;

  // Query principal: scoring híbrido.
  //   - 3.0 si match exacto en name (case-insensitive + unaccent)
  //   - 2.0 si prefix en name
  //   - 1.5 si prefix en sku/slug
  //   - similarity(name, q) escalado [0, 1] como base si pasa threshold
  //   - 0.6 si substring en description
  // GREATEST() toma el mayor → un mismo row no se "infla" sumando.
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      p.id, p.slug, p.name, p."basePrice", p."compareAtPrice",
      p."isPersonalizable", p.images,
      c.name AS "categoryName", c.slug AS "categorySlug",
      GREATEST(
        CASE WHEN immutable_unaccent(LOWER(p.name)) = immutable_unaccent(LOWER(${safe})) THEN 3.0 ELSE 0 END,
        CASE WHEN immutable_unaccent(LOWER(p.name)) LIKE immutable_unaccent(LOWER(${prefixPattern})) THEN 2.0 ELSE 0 END,
        CASE WHEN LOWER(p.sku) LIKE LOWER(${prefixPattern}) OR LOWER(p.slug) LIKE LOWER(${prefixPattern}) THEN 1.5 ELSE 0 END,
        similarity(immutable_unaccent(p.name), immutable_unaccent(${safe})),
        CASE WHEN immutable_unaccent(LOWER(p.description)) LIKE immutable_unaccent(LOWER(${pattern})) THEN 0.6 ELSE 0 END,
        CASE WHEN LOWER(p.sku) LIKE LOWER(${pattern}) OR LOWER(p.slug) LIKE LOWER(${pattern}) THEN 0.8 ELSE 0 END
      ) AS score
    FROM "Product" p
    JOIN "Category" c ON c.id = p."categoryId"
    WHERE p."deletedAt" IS NULL
      AND p."isActive" = true
      AND c."deletedAt" IS NULL
      AND c."isActive" = true
      AND (
        immutable_unaccent(LOWER(p.name)) LIKE immutable_unaccent(LOWER(${pattern}))
        OR immutable_unaccent(LOWER(p.description)) LIKE immutable_unaccent(LOWER(${pattern}))
        OR LOWER(p.sku) LIKE LOWER(${pattern})
        OR LOWER(p.slug) LIKE LOWER(${pattern})
        OR similarity(immutable_unaccent(p.name), immutable_unaccent(${safe})) > 0.25
      )
    ORDER BY score DESC, p."isFeatured" DESC, p."createdAt" DESC
    LIMIT 8
  `;

  if (rows.length > 0) {
    return rows.map((r) => mapRow(r));
  }

  // Fallback "did you mean": threshold más permisivo (0.1), top 3,
  // marcadas como sugerencias.
  const suggestions = await prisma.$queryRaw<Row[]>`
    SELECT
      p.id, p.slug, p.name, p."basePrice", p."compareAtPrice",
      p."isPersonalizable", p.images,
      c.name AS "categoryName", c.slug AS "categorySlug",
      similarity(immutable_unaccent(p.name), immutable_unaccent(${safe})) AS score
    FROM "Product" p
    JOIN "Category" c ON c.id = p."categoryId"
    WHERE p."deletedAt" IS NULL
      AND p."isActive" = true
      AND c."deletedAt" IS NULL
      AND c."isActive" = true
      AND similarity(immutable_unaccent(p.name), immutable_unaccent(${safe})) > 0.1
    ORDER BY score DESC
    LIMIT 3
  `;
  return suggestions.map((r) => ({ ...mapRow(r), isSuggestion: true }));
}

function mapRow(r: {
  id: string;
  slug: string;
  name: string;
  basePrice: number;
  compareAtPrice: number | null;
  isPersonalizable: boolean;
  images: string[];
  categoryName: string;
  categorySlug: string;
  score: number;
}): SearchResult {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    basePrice: r.basePrice,
    compareAtPrice: r.compareAtPrice,
    isPersonalizable: r.isPersonalizable,
    images: r.images,
    category: { slug: r.categorySlug, name: r.categoryName },
    score: Number(r.score),
  };
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

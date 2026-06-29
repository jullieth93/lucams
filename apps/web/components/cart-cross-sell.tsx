/*
 * <CartCrossSell /> — Widget "Completa tu regalo con..."
 *
 * PLAN_CATALOG_V2 decisión 6.3.
 * Algoritmo:
 *   1. Detecta la ocasión dominante sumando tags de los productos del cart.
 *   2. Sugiere 3-4 productos de OTRA categoría que comparten esa ocasión.
 *   3. Excluye productos ya en cart.
 *   4. Ordena por isFeatured + match.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { listCatalogProducts, type CatalogProductSummary } from "@/lib/catalog";
import { ProductFromCatalogCard } from "./product-from-catalog-card";

async function getCrossSellSuggestions(
  productSlugsInCart: string[],
  limit = 3,
): Promise<{ ocasionName: string; products: CatalogProductSummary[] } | null> {
  if (productSlugsInCart.length === 0) return null;

  // 1. Detectar ocasión dominante
  const products = await prisma.product.findMany({
    where: { slug: { in: productSlugsInCart } },
    select: {
      id: true,
      categoryId: true,
      ocasionTags: {
        include: { ocasionTag: { select: { slug: true, name: true } } },
      },
    },
  });

  const ocasionCount: Record<string, { slug: string; name: string; count: number }> = {};
  const categoriesInCart = new Set<string>();
  for (const p of products) {
    categoriesInCart.add(p.categoryId);
    for (const t of p.ocasionTags) {
      const key = t.ocasionTag.slug;
      if (!ocasionCount[key]) {
        ocasionCount[key] = { slug: t.ocasionTag.slug, name: t.ocasionTag.name, count: 0 };
      }
      ocasionCount[key].count++;
    }
  }

  const sortedOcasiones = Object.values(ocasionCount).sort((a, b) => b.count - a.count);
  if (sortedOcasiones.length === 0) return null;

  const dominant = sortedOcasiones[0];

  // 2. Buscar productos de la ocasión, EXCLUYENDO categorías ya en cart
  const suggestions = await listCatalogProducts({
    ocasionSlug: dominant.slug,
    limit: 30,
  });

  const filtered = suggestions
    .filter(
      (s) =>
        !productSlugsInCart.includes(s.slug) &&
        // Excluir misma categoría (queremos cross-category)
        !categoriesInCart.has(s.categorySlug),
    )
    .slice(0, limit);

  if (filtered.length === 0) return null;

  return { ocasionName: dominant.name, products: filtered };
}

export async function CartCrossSell({ productSlugsInCart }: { productSlugsInCart: string[] }) {
  const suggestion = await getCrossSellSuggestions(productSlugsInCart);
  if (!suggestion) return null;

  return (
    <section className="mt-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-brand-purple-dark text-lg font-bold">
          Completa tu regalo de {suggestion.ocasionName.toLowerCase()}
        </h2>
        <Link
          href={`/ocasion/${suggestion.products[0].ocasionSlugs[0] ?? "matrimonio"}`}
          className="text-brand-purple hover:text-brand-purple-dark text-sm font-semibold"
        >
          Ver más →
        </Link>
      </div>
      <p className="text-brand-purple-dark/70 mb-5 text-sm">
        Otros productos que combinan perfecto con lo que tienes.
      </p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {suggestion.products.map((p) => (
          <ProductFromCatalogCard key={p.slug} product={p} />
        ))}
      </div>
    </section>
  );
}

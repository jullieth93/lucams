/*
 * Storefront — Catálogo público con filtros.
 *
 * Filtros vía query params (todos opcionales):
 *   - q: búsqueda libre (pg_trgm fuzzy)
 *   - categoria: slug de Category
 *   - minPrice / maxPrice: rango en centavos COP
 *   - personalizable: "1"
 *   - descuento: "1" (Product.compareAtPrice != null)
 *   - destacados: "1" (Product.isFeatured)
 *   - orden: recent | price-asc | price-desc | featured | name
 *
 * SSR puro: cada combinación de filtros consulta DB. listStorefront-
 * Products acepta todos los filtros. Si el catálogo crece y se vuelve
 * lento, sumar unstable_cache con tag "products" invalidado en admin.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { ActiveFilterChips, ProductsFilters } from "@/components/products-filters";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  getStorefrontPriceRange,
  listStorefrontCategories,
  listStorefrontProducts,
  searchStorefrontProducts,
  type StorefrontProductCard,
} from "@/features/products/public-service";
import { listOcasiones } from "@/lib/catalog";
import { OcasionFilterStrip } from "@/components/ocasion-filter-strip";

export const metadata: Metadata = {
  title: "Tienda",
  description:
    "Imanes magnéticos personalizados, fotoimanes, recuerdos para eventos y más. Hechos a mano en Colombia.",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

function pickFlag(sp: Record<string, string | string[] | undefined>, key: string) {
  return pickString(sp, key) === "1";
}

function pickInt(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = pickString(sp, key);
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

export default async function ProductosPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = pickString(sp, "q")?.trim();
  const categoria = pickString(sp, "categoria");
  const ocasion = pickString(sp, "ocasion");
  const personalizable = pickFlag(sp, "personalizable");
  const descuento = pickFlag(sp, "descuento");
  const destacados = pickFlag(sp, "destacados");
  const minPrice = pickInt(sp, "minPrice");
  const maxPrice = pickInt(sp, "maxPrice");
  const ordenRaw = pickString(sp, "orden");
  const orden = (
    ordenRaw && ["recent", "price-asc", "price-desc", "featured", "name"].includes(ordenRaw)
      ? ordenRaw
      : "recent"
  ) as "recent" | "price-asc" | "price-desc" | "featured" | "name";

  const [categories, priceRange, ocasiones] = await Promise.all([
    listStorefrontCategories(),
    getStorefrontPriceRange(),
    listOcasiones(),
  ]);

  // Si hay query de búsqueda, usar searchStorefrontProducts (fuzzy).
  // Si no, usar filtros estructurados via listStorefrontProducts.
  let products: StorefrontProductCard[];
  if (q && q.length >= 2) {
    const results = await searchStorefrontProducts(q);
    products = results.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      basePrice: r.basePrice,
      compareAtPrice: r.compareAtPrice,
      isPersonalizable: r.isPersonalizable,
      images: r.images,
      category: r.category,
    }));
    // Aplicar filtros estructurados sobre los results de búsqueda
    products = products.filter((p) => {
      if (categoria && p.category.slug !== categoria) return false;
      if (personalizable && !p.isPersonalizable) return false;
      if (descuento && p.compareAtPrice == null) return false;
      if (minPrice != null && p.basePrice < minPrice) return false;
      if (maxPrice != null && p.basePrice > maxPrice) return false;
      return true;
    });
  } else {
    products = await listStorefrontProducts({
      categorySlug: categoria,
      ocasionSlug: ocasion,
      isPersonalizable: personalizable,
      onlyDiscounted: descuento,
      featured: destacados,
      minPrice,
      maxPrice,
      sort: orden,
    });
  }

  const activeCategory = categoria ? categories.find((c) => c.slug === categoria) : null;

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1 px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-7xl">
          <header className="mb-8">
            <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
              {activeCategory ? activeCategory.name : "Tienda Lucams"}
            </h1>
            <p className="text-brand-purple-dark/70 mt-2 max-w-2xl text-base">
              {activeCategory?.description ??
                "Imanes que cuentan historias. Personalizables, hechos a mano, listos para llegar a tu nevera."}
            </p>
          </header>

          <div className="flex flex-col gap-6 lg:flex-row">
            <ProductsFilters categories={categories} priceRange={priceRange} />

            <div className="flex-1">
              <OcasionFilterStrip ocasiones={ocasiones} />
              <ActiveFilterChips categories={categories} />

              <div className="text-brand-purple-dark/70 mb-4 text-sm">
                {products.length}{" "}
                {products.length === 1 ? "producto encontrado" : "productos encontrados"}
              </div>

              {products.length === 0 ? (
                <div className="border-brand-purple/10 rounded-xl border bg-white px-6 py-16 text-center">
                  <Sparkles className="text-brand-purple/40 mx-auto h-10 w-10" />
                  <p className="text-brand-purple-dark mt-4 text-lg font-semibold">
                    No encontramos productos
                  </p>
                  <p className="text-brand-purple-dark/60 mt-1 text-sm">
                    {q
                      ? `No hay coincidencias para "${q}" con los filtros actuales. Probá quitando algún filtro o cambiando el texto.`
                      : "Ningún producto coincide con los filtros aplicados."}
                  </p>
                  <Link
                    href="/productos"
                    className="text-brand-purple hover:text-brand-purple-dark mt-4 inline-block text-sm font-semibold"
                  >
                    Limpiar filtros →
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {products.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

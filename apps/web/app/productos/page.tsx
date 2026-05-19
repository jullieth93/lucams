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
  listStorefrontProductsPaginated,
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
  const page = Math.max(1, pickInt(sp, "page") ?? 1);
  const PAGE_SIZE = 12;

  const [categories, priceRange, ocasiones] = await Promise.all([
    listStorefrontCategories(),
    getStorefrontPriceRange(),
    listOcasiones(),
  ]);

  // Si hay query de búsqueda, usar searchStorefrontProducts (fuzzy).
  // Search results pueden ser >100; paginamos client-side el resultado
  // filtrado. Para queries vacías, listStorefrontProductsPaginated hace
  // skip+take server-side.
  let products: StorefrontProductCard[];
  let total: number;
  let totalPages: number;

  if (q && q.length >= 2) {
    const results = await searchStorefrontProducts(q);
    const allCards: StorefrontProductCard[] = results.map((r) => ({
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
    const filtered = allCards.filter((p) => {
      if (categoria && p.category.slug !== categoria) return false;
      if (personalizable && !p.isPersonalizable) return false;
      if (descuento && p.compareAtPrice == null) return false;
      if (minPrice != null && p.basePrice < minPrice) return false;
      if (maxPrice != null && p.basePrice > maxPrice) return false;
      return true;
    });
    total = filtered.length;
    totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    products = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  } else {
    const paginated = await listStorefrontProductsPaginated({
      categorySlug: categoria,
      ocasionSlug: ocasion,
      isPersonalizable: personalizable,
      onlyDiscounted: descuento,
      featured: destacados,
      minPrice,
      maxPrice,
      sort: orden,
      page,
      pageSize: PAGE_SIZE,
    });
    products = paginated.items;
    total = paginated.total;
    totalPages = paginated.totalPages;
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
                {total} {total === 1 ? "producto encontrado" : "productos encontrados"}
                {totalPages > 1 && (
                  <span className="text-brand-purple-dark/55 ml-1.5">
                    · página {page} de {totalPages}
                  </span>
                )}
              </div>

              {products.length === 0 ? (
                <div className="border-brand-purple/10 rounded-xl border bg-white px-6 py-16 text-center">
                  <Sparkles className="text-brand-purple/40 mx-auto h-10 w-10" />
                  <p className="text-brand-purple-dark mt-4 text-lg font-semibold">
                    No encontramos productos
                  </p>
                  <p className="text-brand-purple-dark/60 mt-1 text-sm">
                    {q
                      ? `No hay coincidencias para "${q}" con los filtros actuales. Prueba quitando algún filtro o cambiando el texto.`
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
                <>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {products.map((p) => (
                      <ProductCard key={p.id} product={p} />
                    ))}
                  </div>
                  {totalPages > 1 && (
                    <Pagination currentPage={page} totalPages={totalPages} searchParams={sp} />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/**
 * Paginación storefront. Server component — solo renderea links con
 * el page param actualizado, preservando los demás filtros activos.
 * Estilo brand. Muestra: prev · página actual · siguiente · saltos
 * inteligentes cuando hay muchas páginas (1 ... 4 5 [6] 7 8 ... 20).
 */
function Pagination({
  currentPage,
  totalPages,
  searchParams,
}: {
  currentPage: number;
  totalPages: number;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  function buildHref(p: number): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (typeof v === "string" && k !== "page") params.set(k, v);
    }
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/productos?${qs}` : "/productos";
  }

  // Algoritmo de "windowed pagination": mostrar 5 páginas alrededor del
  // current, con ellipsis si hay saltos.
  const window: (number | "...")[] = [];
  const WINDOW = 2; // 2 a cada lado del current
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - WINDOW && i <= currentPage + WINDOW)) {
      window.push(i);
    } else if (window[window.length - 1] !== "...") {
      window.push("...");
    }
  }

  return (
    <nav
      className="border-brand-purple/10 mt-8 flex items-center justify-between border-t pt-6"
      aria-label="Paginación de productos"
    >
      <div className="text-brand-purple-dark/65 text-xs">
        Página {currentPage} de {totalPages}
      </div>
      <div className="flex items-center gap-1.5">
        {currentPage > 1 ? (
          <Link
            href={buildHref(currentPage - 1)}
            rel="prev"
            className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/8 inline-flex items-center gap-1 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold"
          >
            ← Anterior
          </Link>
        ) : (
          <span className="border-brand-purple/10 text-brand-purple-dark/35 inline-flex items-center gap-1 rounded-md border bg-white/40 px-3 py-1.5 text-xs font-semibold">
            ← Anterior
          </span>
        )}
        <div className="hidden items-center gap-1 sm:flex">
          {window.map((p, idx) =>
            p === "..." ? (
              <span
                key={`gap-${idx}`}
                className="text-brand-purple-dark/40 px-2 text-xs"
                aria-hidden
              >
                …
              </span>
            ) : p === currentPage ? (
              <span
                key={p}
                aria-current="page"
                className="bg-brand-purple inline-flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-xs font-bold text-white"
              >
                {p}
              </span>
            ) : (
              <Link
                key={p}
                href={buildHref(p)}
                className="text-brand-purple-dark hover:bg-brand-purple/8 inline-flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-xs font-semibold"
              >
                {p}
              </Link>
            ),
          )}
        </div>
        {currentPage < totalPages ? (
          <Link
            href={buildHref(currentPage + 1)}
            rel="next"
            className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/8 inline-flex items-center gap-1 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold"
          >
            Siguiente →
          </Link>
        ) : (
          <span className="border-brand-purple/10 text-brand-purple-dark/35 inline-flex items-center gap-1 rounded-md border bg-white/40 px-3 py-1.5 text-xs font-semibold">
            Siguiente →
          </span>
        )}
      </div>
    </nav>
  );
}

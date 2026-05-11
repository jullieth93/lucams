/*
 * Storefront — Catálogo público.
 *
 * Listado de productos activos. Filtro por categoría vía query param
 * `?categoria=<slug>`. Sin paginación todavía (catálogo inicial < 50
 * productos). Cuando crezca, sumar `?page=N` + cursor.
 *
 * SSR puro: cada hit consulta la DB. Si volume real lo justifica,
 * envolver con unstable_cache + revalidateTag('products') en las
 * mutaciones admin.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { ProductCard } from "@/components/product-card";
import {
  listStorefrontCategories,
  listStorefrontProducts,
} from "@/features/products/public-service";

export const metadata: Metadata = {
  title: "Tienda",
  description:
    "Imanes magnéticos personalizados, fotoimanes, recorditos para eventos y más. Hechos a mano en Colombia.",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function ProductosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const categorySlug = typeof sp.categoria === "string" ? sp.categoria : undefined;

  const [categories, products] = await Promise.all([
    listStorefrontCategories(),
    listStorefrontProducts({ categorySlug }),
  ]);

  const activeCategory = categorySlug
    ? categories.find((c) => c.slug === categorySlug)
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-brand-cream">
      <SiteHeader />

      <main className="flex-1 px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8">
            <h1 className="font-display text-3xl text-brand-purple-dark sm:text-4xl">
              {activeCategory ? activeCategory.name : "Tienda Lucams"}
            </h1>
            <p className="mt-2 max-w-2xl text-base text-brand-purple-dark/70">
              {activeCategory?.description ??
                "Imanes que cuentan historias. Personalizables, hechos a mano, listos para llegar a tu nevera."}
            </p>
          </header>

          {categories.length > 0 && (
            <nav className="mb-8 flex flex-wrap gap-2" aria-label="Categorías">
              <CategoryChip
                href="/productos"
                label="Todo"
                active={!categorySlug}
              />
              {categories.map((c) => (
                <CategoryChip
                  key={c.id}
                  href={`/productos?categoria=${c.slug}`}
                  label={`${c.name}`}
                  count={c._count.products}
                  active={c.slug === categorySlug}
                />
              ))}
            </nav>
          )}

          {products.length === 0 ? (
            <div className="rounded-xl border border-brand-purple/10 bg-white px-6 py-16 text-center">
              <Sparkles className="mx-auto h-10 w-10 text-brand-purple/40" />
              <p className="mt-4 text-lg font-semibold text-brand-purple-dark">
                Sin productos por ahora
              </p>
              <p className="mt-1 text-sm text-brand-purple-dark/60">
                {activeCategory
                  ? "Esta categoría todavía no tiene productos publicados."
                  : "Estamos cargando el catálogo. Vuelve pronto."}
              </p>
              {activeCategory && (
                <Link
                  href="/productos"
                  className="mt-4 inline-block text-sm font-semibold text-brand-purple hover:text-brand-purple-dark"
                >
                  Ver todo el catálogo →
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function CategoryChip({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count?: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full bg-brand-purple px-4 py-1.5 text-sm font-semibold text-white"
          : "rounded-full border border-brand-purple/20 bg-white px-4 py-1.5 text-sm font-medium text-brand-purple-dark hover:border-brand-purple/40 hover:bg-brand-purple/5"
      }
    >
      {label}
      {count !== undefined && (
        <span
          className={
            active
              ? "ml-1.5 text-white/70"
              : "ml-1.5 text-brand-purple-dark/40"
          }
        >
          ({count})
        </span>
      )}
    </Link>
  );
}

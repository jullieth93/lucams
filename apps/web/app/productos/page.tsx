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
import { ProductCard } from "@/components/product-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  listStorefrontCategories,
  listStorefrontProducts,
} from "@/features/products/public-service";

export const metadata: Metadata = {
  title: "Tienda",
  description:
    "Imanes magnéticos personalizados, fotoimanes, recuerdos para eventos y más. Hechos a mano en Colombia.",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function ProductosPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const categorySlug = typeof sp.categoria === "string" ? sp.categoria : undefined;

  const [categories, products] = await Promise.all([
    listStorefrontCategories(),
    listStorefrontProducts({ categorySlug }),
  ]);

  const activeCategory = categorySlug ? categories.find((c) => c.slug === categorySlug) : null;

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1 px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8">
            <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
              {activeCategory ? activeCategory.name : "Tienda Lucams"}
            </h1>
            <p className="text-brand-purple-dark/70 mt-2 max-w-2xl text-base">
              {activeCategory?.description ??
                "Imanes que cuentan historias. Personalizables, hechos a mano, listos para llegar a tu nevera."}
            </p>
          </header>

          {categories.length > 0 && (
            <nav className="mb-8 flex flex-wrap gap-2" aria-label="Categorías">
              <CategoryChip href="/productos" label="Todo" active={!categorySlug} />
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
            <div className="border-brand-purple/10 rounded-xl border bg-white px-6 py-16 text-center">
              <Sparkles className="text-brand-purple/40 mx-auto h-10 w-10" />
              <p className="text-brand-purple-dark mt-4 text-lg font-semibold">
                Sin productos por ahora
              </p>
              <p className="text-brand-purple-dark/60 mt-1 text-sm">
                {activeCategory
                  ? "Esta categoría todavía no tiene productos publicados."
                  : "Estamos cargando el catálogo. Vuelve pronto."}
              </p>
              {activeCategory && (
                <Link
                  href="/productos"
                  className="text-brand-purple hover:text-brand-purple-dark mt-4 inline-block text-sm font-semibold"
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
      <SiteFooter />
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
          ? "bg-brand-purple rounded-full px-4 py-1.5 text-sm font-semibold text-white"
          : "border-brand-purple/20 text-brand-purple-dark hover:border-brand-purple/40 hover:bg-brand-purple/5 rounded-full border bg-white px-4 py-1.5 text-sm font-medium"
      }
    >
      {label}
      {count !== undefined && (
        <span className={active ? "ml-1.5 text-white/70" : "text-brand-purple-dark/40 ml-1.5"}>
          ({count})
        </span>
      )}
    </Link>
  );
}

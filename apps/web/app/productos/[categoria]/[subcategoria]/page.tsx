/*
 * /productos/[categoria]/[subcategoria] — PLAN_CATALOG_V2 1.3 + 1.4.
 *
 * Página de sub-categoría con grid de productos. SEO específico.
 * Sub-cat invisible si Category.isActive=false o no existe.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getCategoryBySlug, listCatalogProducts } from "@/lib/catalog";
import { ProductFromCatalogCard } from "@/components/product-from-catalog-card";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ categoria: string; subcategoria: string }>;
}): Promise<Metadata> {
  const { subcategoria } = await params;
  const cat = await getCategoryBySlug(subcategoria);
  if (!cat) return { title: "Categoría no encontrada" };
  return {
    title: `Lucams · ${cat.name}`,
    description:
      cat.richDescription?.slice(0, 160) ??
      cat.description ??
      `Imanes magnéticos personalizados — ${cat.name} Colombia`,
    openGraph: {
      title: `Lucams · ${cat.name}`,
      description: cat.richDescription?.slice(0, 200) ?? cat.description ?? cat.name,
      type: "website",
    },
  };
}

export default async function SubCategoryPage({
  params,
}: {
  params: Promise<{ categoria: string; subcategoria: string }>;
}) {
  const { categoria, subcategoria } = await params;

  const subCat = await getCategoryBySlug(subcategoria);
  if (!subCat || !subCat.isActive) notFound();

  const parentCat = await getCategoryBySlug(categoria);

  const products = await listCatalogProducts({
    subCategorySlug: subcategoria,
    sort: (subCat.defaultSort as "recent" | "price_asc" | "price_desc" | "featured") ?? "recent",
    limit: 48,
  });

  return (
    <div className="min-h-screen">
      <section className="from-brand-cream to-brand-pink/5 bg-gradient-to-br py-8 md:py-12">
        <div className="mx-auto max-w-6xl px-6">
          <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-600">
            <Link href="/" className="hover:underline">
              Inicio
            </Link>
            <span className="mx-2">›</span>
            <Link href="/productos" className="hover:underline">
              Productos
            </Link>
            {parentCat && (
              <>
                <span className="mx-2">›</span>
                <Link href={`/productos?categoria=${parentCat.slug}`} className="hover:underline">
                  {parentCat.name}
                </Link>
              </>
            )}
            <span className="mx-2">›</span>
            <span className="font-semibold">{subCat.name}</span>
          </nav>

          <h1 className="text-brand-purple-dark text-3xl font-bold md:text-4xl">{subCat.name}</h1>
          {subCat.description && (
            <p className="text-brand-purple/80 mt-2 max-w-3xl text-base">{subCat.description}</p>
          )}
          {subCat.useCase && (
            <p className="text-brand-muted mt-1 max-w-3xl text-sm italic">{subCat.useCase}</p>
          )}
          <p className="mt-3 text-sm text-slate-500">
            {subCat.productCount} {subCat.productCount === 1 ? "producto" : "productos"} disponibles
          </p>
        </div>
      </section>

      <section className="py-10">
        <div className="mx-auto max-w-6xl px-6">
          {products.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <Sparkles className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 font-medium text-slate-700">
                Pronto tendremos productos en {subCat.name}.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Mientras tanto, explorá{" "}
                <Link href="/productos" className="text-brand-purple underline">
                  todo el catálogo
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {products.map((p) => (
                <ProductFromCatalogCard key={p.slug} product={p} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Descripción rica como SEO + bot context */}
      {subCat.richDescription && (
        <section className="border-t border-slate-200 bg-white py-10">
          <div className="mx-auto max-w-3xl px-6">
            <h2 className="text-brand-purple-dark mb-3 text-lg font-bold">Sobre {subCat.name}</h2>
            <div className="text-sm leading-relaxed whitespace-pre-line text-slate-600">
              {subCat.richDescription}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

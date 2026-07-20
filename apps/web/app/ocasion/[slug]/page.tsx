/*
 * /ocasion/[slug] — PLAN_CATALOG_V2 6.8 + 1.5.
 *
 * Página dedicada por ocasión (Cumpleaños, Matrimonio, Día Madre, etc.).
 * Hero con descripción semántica de la ocasión + sugerencia cantidad +
 * grid de productos matcheados ordenados por score.
 *
 * SEO: meta description usa OcasionTag.description (rica, semántica).
 * Bot AI Fase 5+ puede recomendar esta URL al cliente.
 */

import type { Metadata, ResolvingMetadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles, Users, Calendar } from "lucide-react";
import { getOcasionBySlug, listCatalogProducts } from "@/lib/catalog";
import { ProductFromCatalogCard } from "@/components/product-from-catalog-card";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbList, collectionPage } from "@/lib/seo/structured-data";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const MONTH_NAMES: Record<number, string> = {
  1: "Enero",
  2: "Febrero",
  3: "Marzo",
  4: "Abril",
  5: "Mayo",
  6: "Junio",
  7: "Julio",
  8: "Agosto",
  9: "Septiembre",
  10: "Octubre",
  11: "Noviembre",
  12: "Diciembre",
};

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { slug } = await params;
  const ocasion = await getOcasionBySlug(slug);
  if (!ocasion) return { title: "Ocasión no encontrada" };

  const description = ocasion.description.slice(0, 160);
  // #25 — heredar las imágenes OG del layout (el merge shallow de Next las borraría).
  const previousImages = (await parent).openGraph?.images ?? [];
  return {
    // #27 — solo el nombre; el template global añade "· Lucams_shop" una vez (evita duplicarla).
    title: ocasion.name,
    description,
    // Canonical self-referencial (auditoría 2026-07-17): evita indexar variantes con utm_*/fbclid.
    alternates: { canonical: `/ocasion/${slug}` },
    openGraph: {
      title: `Imanes para ${ocasion.name}`,
      description,
      type: "website",
      siteName: "Lucams_shop",
      locale: "es_CO",
      images: previousImages,
    },
  };
}

export default async function OcasionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ocasion = await getOcasionBySlug(slug);
  if (!ocasion) notFound();

  const products = await listCatalogProducts({ ocasionSlug: slug, limit: 24 });

  // JSON-LD (auditoría 2026-07-17): BreadcrumbList + CollectionPage/ItemList de los productos de la
  // ocasión.
  const ocasionPath = `/ocasion/${slug}`;
  const jsonLdData = [
    breadcrumbList([
      { name: "Inicio", path: "/" },
      { name: "Tienda", path: "/productos" },
      { name: ocasion.name, path: ocasionPath },
    ]),
    collectionPage({
      name: `Imanes para ${ocasion.name}`,
      path: ocasionPath,
      description: ocasion.description.slice(0, 300),
      products: products.map((p) => ({ name: p.name, slug: p.slug })),
    }),
  ];

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <JsonLd data={jsonLdData} />
      <SiteHeader />
      <main id="contenido" tabIndex={-1} className="flex-1">
        {/* Hero */}
        <section className="from-brand-pink/10 via-brand-cream to-brand-turquoise/10 bg-gradient-to-br py-12 md:py-16">
          <div className="mx-auto max-w-6xl px-6">
            <nav aria-label="Breadcrumb" className="text-brand-muted mb-4 text-sm">
              <Link href="/" className="hover:text-brand-purple">
                Inicio
              </Link>
              <span className="mx-2">›</span>
              <span>Ocasiones</span>
              <span className="mx-2">›</span>
              <span className="font-semibold">{ocasion.name}</span>
            </nav>

            <div className="flex flex-col items-start gap-6 md:flex-row md:items-center">
              <div className="bg-brand-purple/10 rounded-full p-4">
                <Sparkles className="text-brand-purple h-10 w-10" />
              </div>
              <div className="flex-1">
                <h1 className="text-brand-purple-dark text-3xl font-bold md:text-4xl">
                  Imanes para {ocasion.name}
                </h1>
                <p className="text-brand-purple/80 mt-2 max-w-3xl text-base md:text-lg">
                  {ocasion.description.split(".")[0]}.
                </p>

                <div className="mt-4 flex flex-wrap gap-3 text-sm">
                  {ocasion.monthHint && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-slate-700 shadow-sm">
                      <Calendar className="h-3.5 w-3.5" />
                      Destacado en {MONTH_NAMES[ocasion.monthHint]}
                    </span>
                  )}
                  {ocasion.suggestedQuantityRange && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-slate-700 shadow-sm">
                      <Users className="h-3.5 w-3.5" />
                      Cantidad sugerida: {ocasion.suggestedQuantityRange.min}–
                      {ocasion.suggestedQuantityRange.max} unidades (ideal{" "}
                      {ocasion.suggestedQuantityRange.ideal})
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-slate-700 shadow-sm">
                    {ocasion.productCount} productos disponibles
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Descripción rica completa */}
        {ocasion.description.length > 200 && (
          <section className="border-b border-slate-200 bg-white py-8">
            <div className="mx-auto max-w-3xl px-6">
              <h2 className="mb-3 text-base font-semibold text-slate-700">
                Sobre {ocasion.name} en Colombia
              </h2>
              <p className="text-sm leading-relaxed text-slate-600">{ocasion.description}</p>
            </div>
          </section>
        )}

        {/* Grid productos */}
        <section className="py-12">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-brand-purple-dark mb-6 text-xl font-bold">
              Lo mejor para {ocasion.name}
            </h2>

            {products.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                <Sparkles className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 font-medium text-slate-700">
                  Pronto tendremos productos especialmente para {ocasion.name}.
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Mientras tanto, explora nuestro{" "}
                  <Link href="/productos" className="text-brand-purple underline">
                    catálogo completo
                  </Link>{" "}
                  o usa el{" "}
                  <Link href="/recomendador" className="text-brand-purple underline">
                    recomendador
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {products.map((p) => (
                  <ProductFromCatalogCard key={p.slug} product={p} />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

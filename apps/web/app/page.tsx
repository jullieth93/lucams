/*
 * Home — landing del storefront.
 *
 * Casi todo el contenido editorial viene del CMS (CmsBlock / SiteSetting)
 * con fallback hardcoded — Lucy puede editar desde /admin/contenido.
 *
 * Secciones (en orden):
 *   1. SiteHeader (mega-menú + búsqueda)
 *   2. Hero kawaii
 *   3. Categorías visuales (7)
 *   4. "Así de fácil" — 3 pasos
 *   5. Productos destacados (Embla)
 *   6. Lo que dicen quienes nos compran (reseñas reales o empty kawaii)
 *   7. CTA cierre
 */

import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { LucamsLogo } from "@/components/lucams-logo";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CategoryGrid } from "@/components/home/category-grid";
import { FeaturedCarousel } from "@/components/home/featured-carousel";
import { HomeHero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";
import { ReviewsCarousel } from "@/components/home/reviews-carousel";
import {
  listStorefrontCategories,
  listStorefrontProducts,
} from "@/features/products/public-service";
import { listFeaturedReviews } from "@/features/reviews/public-service";
import { CmsText } from "@/components/cms/cms-text";
import { buildWhatsAppUrl } from "@/lib/wa";

export const metadata: Metadata = {
  title: "Lucams_shop — Tus recuerdos en imán",
  description:
    "Imanes magnéticos personalizados, fotoimanes, recuerdos para eventos, calendarios y planners. Hechos a mano en Colombia con entrega a 1.100+ destinos.",
};

// Home consulta DB en SSR — dynamic para que Next no pre-renderice
// en build con DATABASE_URL placeholder.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [categories, featured, reviews, waSupportUrl] = await Promise.all([
    // Solo top-level: la home muestra ~11 categorías padre, no 57 (mismo
    // patrón que footer y mega-menú).
    listStorefrontCategories({ topLevelOnly: true }),
    listStorefrontProducts({ featured: true, limit: 10 }),
    listFeaturedReviews(8),
    buildWhatsAppUrl({ kind: "support" }),
  ]);

  // #2 — despriorizar agotados en el carrusel destacado: disponibles primero, agotados al final
  // (sin filtrarlos → siguen visibles con su badge "Agotado"). Sort estable (ES2019) → entre los
  // disponibles se conserva el orden isFeatured/createdAt. La home es force-dynamic (sin caché de
  // stock), así que ordenar por request es correcto.
  const featuredSorted = [...featured].sort(
    (a, b) => Number(b.inStock ?? true) - Number(a.inStock ?? true),
  );

  // Structured data del sitio (auditoría 2026-07-13): Organization (knowledge panel) + WebSite
  // (nombre para sitelinks). Escapado anti-XSS + nonce, como el JSON-LD del PDP.
  const siteJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Lucams_shop",
      url: "https://lucamsshop.co",
      logo: "https://lucamsshop.co/brand/lucams-logo.png",
      sameAs: ["https://www.instagram.com/lucams_shop"],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Lucams_shop",
      url: "https://lucamsshop.co",
    },
  ];
  const siteJsonLdSafe = JSON.stringify(siteJsonLd)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: siteJsonLdSafe }}
      />
      <SiteHeader />
      <main id="contenido" tabIndex={-1} className="bg-brand-cream flex-1">
        {/* Hero */}
        <div className="mx-auto max-w-6xl px-6 sm:px-10">
          <HomeHero />
        </div>

        {/* Categorías */}
        <section className="mx-auto max-w-6xl px-6 py-12 sm:px-10 sm:py-16">
          <header className="mb-8 text-center">
            <h2 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
              <CmsText blockKey="home.categories.heading" fallback="Explora las categorías" />
            </h2>
            <p className="text-brand-purple-dark/70 mt-2">
              <CmsText
                blockKey="home.categories.subtext"
                fallback="Imanes para cada rincón de tu vida."
              />
            </p>
          </header>
          <CategoryGrid categories={categories} />
          <div className="mt-8 text-center">
            <Link
              href="/productos"
              className="text-brand-purple-dark hover:text-brand-purple border-brand-purple/30 hover:bg-brand-purple/5 inline-flex items-center gap-1.5 rounded-full border px-5 py-2 text-sm font-semibold transition-colors"
            >
              Ver todas las categorías y productos →
            </Link>
          </div>
        </section>

        {/* Cómo funciona */}
        <section className="bg-white">
          <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10 sm:py-16">
            <header className="mb-10 text-center">
              <h2 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
                <CmsText blockKey="home.howitworks.heading" fallback="Así de fácil" />
              </h2>
              <p className="text-brand-purple-dark/70 mt-2">
                <CmsText
                  blockKey="home.howitworks.subtext"
                  fallback="Tu imán hecho con cariño en 3 pasos."
                />
              </p>
            </header>
            <HowItWorks />
          </div>
        </section>

        {/* Productos destacados */}
        <section className="mx-auto max-w-6xl px-6 py-12 sm:px-10 sm:py-16">
          <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
                <CmsText blockKey="home.featured.heading" fallback="Imanes que están enamorando" />
              </h2>
              <p className="text-brand-purple-dark/70 mt-2">
                <CmsText
                  blockKey="home.featured.subtext"
                  fallback="Los favoritos de la temporada."
                />
              </p>
            </div>
            <Link
              href="/productos"
              className="text-brand-purple-dark hover:text-brand-purple text-sm font-semibold"
            >
              Ver todo →
            </Link>
          </header>
          {featuredSorted.length > 0 ? (
            <FeaturedCarousel products={featuredSorted} />
          ) : (
            <div className="border-brand-purple/10 rounded-xl border bg-white px-6 py-12 text-center">
              <p className="text-brand-purple-dark/70">
                <CmsText blockKey="home.featured.empty" fallback="Cargando destacados pronto ✨" />
              </p>
            </div>
          )}
        </section>

        {/* Reseñas */}
        <section className="bg-white">
          <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10 sm:py-16">
            <header className="mb-8 text-center">
              <h2 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
                <CmsText
                  blockKey="home.reviews.heading"
                  fallback="Lo que dicen quienes ya nos compran"
                />
              </h2>
              <p className="text-brand-purple-dark/70 mt-2">
                <CmsText
                  blockKey="home.reviews.subtext"
                  fallback="Historias reales de neveras felices."
                />
              </p>
            </header>
            {reviews.length > 0 ? (
              <ReviewsCarousel reviews={reviews} />
            ) : (
              <div className="mx-auto max-w-md text-center">
                <LucamsLogo variant="full" size={120} className="mx-auto opacity-80" />
                <p className="text-brand-purple-dark mt-4 font-semibold">
                  <CmsText
                    blockKey="home.reviews.empty"
                    fallback="Sé el primero en contarnos cómo te llegó tu imán 💜"
                  />
                </p>
                <p className="text-brand-muted mt-1 text-sm">
                  Cuando los primeros clientes reseñen, aparecerán acá.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* CTA cierre */}
        <section className="mx-auto max-w-6xl px-6 py-12 sm:px-10 sm:py-16">
          <div className="from-brand-purple to-brand-purple-dark relative overflow-hidden rounded-2xl bg-gradient-to-br p-8 text-center sm:p-12">
            <div
              aria-hidden="true"
              className="bg-brand-pink/30 absolute -top-12 -right-12 h-48 w-48 rounded-full blur-3xl"
            />
            <div
              aria-hidden="true"
              className="bg-brand-turquoise/30 absolute -bottom-12 -left-12 h-48 w-48 rounded-full blur-3xl"
            />
            <h2 className="font-display relative text-3xl text-white sm:text-4xl">
              <CmsText blockKey="home.cta.heading" fallback="¿Tienes una idea distinta?" />
            </h2>
            <p className="relative mt-3 text-white/80">
              <CmsText
                blockKey="home.cta.description"
                fallback="Cotizamos a medida: regalos corporativos, eventos, bodas y proyectos especiales."
              />
            </p>
            <div className="relative mt-6 flex flex-wrap justify-center gap-3">
              <a
                href={waSupportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-purple-dark hover:bg-brand-cream inline-block rounded-full bg-white px-6 py-3 text-sm font-semibold transition-colors"
              >
                Háblanos por WhatsApp
              </a>
              <Link
                href="/productos"
                className="inline-block rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Ver catálogo
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

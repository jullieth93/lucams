/*
 * /ocasion — índice público de ocasiones (SEO-002, auditoría 2026-10-28).
 *
 * Cada ocasión activa (OcasionTag) tiene su landing /ocasion/[slug], pero el
 * índice /ocasion no existía (404) aunque el breadcrumb de las landings y el
 * mega-menú lo nombraban. Acá se listan todas las ocasiones activas con
 * descripción y conteo de productos, y el breadcrumb (visual + JSON-LD) queda
 * coherente en todo el sitio: Inicio › Ocasiones › {ocasión}.
 *
 * Orden: listOcasiones() ya ordena por OcasionTag.order; encima ponemos
 * primero las ocasiones cuyo monthHint coincide con el mes en curso (sort
 * estable — el resto conserva el orden del admin). Se reevalúa en cada
 * render/revalidación de la página.
 */

import type { Metadata, ResolvingMetadata } from "next";
import Link from "next/link";
import { Calendar, Sparkles } from "lucide-react";
import { listOcasiones } from "@/lib/catalog";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbList, collectionPage } from "@/lib/seo/structured-data";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

// Espejo del mapa de /ocasion/[slug]/page.tsx (badge "Destacado en <mes>").
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

const DESCRIPTION =
  "Imanes personalizados para cada ocasión: cumpleaños, matrimonios, Día de la Madre, Navidad y más. Hechos a mano en Colombia.";

export async function generateMetadata(
  _props: object,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  // #25 — heredar las imágenes OG del layout (el merge shallow de Next las borraría).
  const previousImages = (await parent).openGraph?.images ?? [];
  return {
    title: "Ocasiones",
    description: DESCRIPTION,
    // Canonical self-referencial (auditoría 2026-07-17): evita indexar variantes con utm_*/fbclid.
    alternates: { canonical: "/ocasion" },
    openGraph: {
      title: "Ocasiones · Lucams Shop",
      description: DESCRIPTION,
      type: "website",
      siteName: "Lucams Shop",
      locale: "es_CO",
      images: previousImages,
    },
  };
}

export default async function OcasionesPage() {
  const ocasiones = await listOcasiones();

  // Las del mes en curso primero (monthHint); el resto conserva el order del admin.
  const currentMonth = new Date().getMonth() + 1;
  const sortedOcasiones = [...ocasiones].sort(
    (a, b) => Number(b.monthHint === currentMonth) - Number(a.monthHint === currentMonth),
  );

  // JSON-LD: BreadcrumbList (Inicio › Ocasiones) + CollectionPage/ItemList con
  // las landings de cada ocasión (itemUrlPrefix "/ocasion/" — el builder
  // apunta por defecto a /producto/, que no aplica acá).
  const jsonLdData = [
    breadcrumbList([
      { name: "Inicio", path: "/" },
      { name: "Ocasiones", path: "/ocasion" },
    ]),
    collectionPage({
      name: "Ocasiones",
      path: "/ocasion",
      description: DESCRIPTION,
      products: sortedOcasiones.map((o) => ({ name: o.name, slug: o.slug })),
      itemUrlPrefix: "/ocasion/",
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
            <nav aria-label="Ruta de navegación" className="text-brand-muted mb-4 text-sm">
              <Link href="/" className="hover:text-brand-purple">
                Inicio
              </Link>
              <span className="mx-2">›</span>
              <span className="font-semibold">Ocasiones</span>
            </nav>

            <div className="flex flex-col items-start gap-6 md:flex-row md:items-center">
              <div className="bg-brand-purple/10 rounded-full p-4">
                <Sparkles className="text-brand-purple h-10 w-10" />
              </div>
              <div className="flex-1">
                <h1 className="text-brand-purple-dark text-3xl font-bold md:text-4xl">Ocasiones</h1>
                <p className="text-brand-purple/80 mt-2 max-w-3xl text-base md:text-lg">
                  Un imán para cada momento: encuentra el detalle perfecto según la ocasión que
                  estás celebrando, con la curaduría de productos que preparamos para cada una.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Grid de ocasiones */}
        <section className="py-12">
          <div className="mx-auto max-w-6xl px-6">
            {sortedOcasiones.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                <Sparkles className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 font-medium text-slate-700">
                  Pronto publicaremos nuestras ocasiones especiales.
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Mientras tanto, explora nuestro{" "}
                  <Link href="/productos" className="text-brand-purple underline">
                    catálogo completo
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sortedOcasiones.map((o) => (
                  <Link
                    key={o.slug}
                    href={`/ocasion/${o.slug}`}
                    className="group border-brand-purple/10 hover:border-brand-purple/40 flex flex-col rounded-xl border bg-white p-5 transition-colors"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-brand-purple-dark group-hover:text-brand-purple text-lg font-bold">
                        {o.name}
                      </h2>
                      {o.monthHint && (
                        <span className="bg-brand-yellow/30 text-brand-purple-dark inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                          <Calendar className="h-3 w-3" />
                          {MONTH_NAMES[o.monthHint]}
                        </span>
                      )}
                    </div>
                    <p className="text-brand-muted mt-2 flex-1 text-sm">
                      {o.description.split(".")[0]}.
                    </p>
                    <p className="text-brand-purple-dark/70 mt-3 text-xs font-semibold">
                      {o.productCount} {o.productCount === 1 ? "producto" : "productos"} →
                    </p>
                  </Link>
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

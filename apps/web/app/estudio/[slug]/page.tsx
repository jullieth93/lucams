/*
 * Estudio de Personalización — entry server component.
 *
 * Estado actual: M.3.b Capa 1 cerrada (modelo V2 multi-slot canvas). Editor
 * client (Capa 2) en construcción — el page muestra mensaje de transición.
 *
 * El backend M.3.b ya está listo:
 *   - canvasData V2 (MultiSlotCanvasData) en types.ts + schemas.ts
 *   - createDraftDesign genera V2 con N slots según photoSlots del producto
 *   - finalizeDesign acepta N productionDataUrls (uno por imán físico)
 *   - migration Prisma Design.productionUrls: String[] aplicada
 *   - lib/grid-layout.ts + lib/canvas-migrate.ts helpers
 *
 * Capa 2 implementará el editor multi-slot real con react-konva.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle, Sparkles, Construction } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { buildWhatsAppUrl } from "@/lib/wa";
import { getStorefrontProductBySlug } from "@/features/products/public-service";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getStorefrontProductBySlug(slug);
  if (!product) return { title: "Producto no encontrado" };
  return {
    title: `Personalizar — ${product.name}`,
    description: `Diseñá tu ${product.name.toLowerCase()} en vivo. Estudio de personalización Lucams.`,
    robots: { index: false, follow: false },
  };
}

export default async function EstudioPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await getStorefrontProductBySlug(slug);
  if (!product) notFound();
  if (product.personalizationKind === "NONE") notFound();

  const waHref = await buildWhatsAppUrl({
    kind: "personalize",
    productName: product.name,
    sku: product.sku,
  });

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1 px-6 py-12 sm:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <Link
            href={`/producto/${product.slug}`}
            className="text-brand-purple/70 hover:text-brand-purple mb-8 inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al producto
          </Link>

          <div className="shadow-brand-purple/10 rounded-3xl bg-white p-8 shadow-lg sm:p-12">
            <div className="bg-brand-purple/10 mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full">
              <Construction className="text-brand-purple h-10 w-10" />
            </div>

            <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
              Estudio v2 — en construcción
            </h1>

            <p className="text-brand-purple-dark/80 mt-4 text-base leading-relaxed">
              Estamos puliendo el editor para que diseñes <strong>{product.name}</strong> con la
              experiencia que merece. La estructura de datos multi-slot ya está lista; el editor
              interactivo se conecta en los próximos commits.
            </p>

            <p className="text-brand-purple-dark/70 mt-4 text-sm">
              Mientras tanto, contanos por WhatsApp qué querés personalizar — te guiamos paso a
              paso, recibimos tus fotos y te mostramos vista previa antes de imprimir.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3">
              {waHref && (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-brand-purple hover:bg-brand-purple-dark shadow-brand-purple/30 inline-flex h-12 items-center justify-center gap-2 rounded-md px-8 text-base font-semibold text-white shadow-lg"
                >
                  <MessageCircle className="h-5 w-5" />
                  Personalizar por WhatsApp
                </a>
              )}
              <Link
                href={`/producto/${product.slug}`}
                className="text-brand-purple/70 hover:text-brand-purple text-sm"
              >
                ← Volver al producto
              </Link>
            </div>

            <div className="border-brand-purple/10 mt-10 border-t pt-6">
              <p className="text-brand-purple-dark/50 text-xs">
                <Sparkles className="mr-1 inline h-3 w-3" />
                Próximamente: editor en vivo con tus fotos, plantillas kawaii, vista previa
                instantánea y ajustes profesionales.
              </p>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

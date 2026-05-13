/*
 * Estudio de Personalización — placeholder (sub-bloque M.2 cierre).
 *
 * Esta página existe para que la CTA "Personalizar tu imán →" del PDP
 * no devuelva 404. M.3 reemplaza con el editor react-konva real.
 *
 * Mientras tanto: mensaje kawaii + CTA WhatsApp con mensaje pre-armado
 * que incluye el producto. Lucy puede atender personalizaciones por
 * el flujo manual actual (chat WhatsApp + fotos por ese canal).
 *
 * Cuando M.3 cierre: borrar este archivo, reemplazar por
 * `studio-editor.tsx` client component con canvas Konva.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle, Sparkles } from "lucide-react";
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
    description: `Diseñá tu ${product.name.toLowerCase()} con tus fotos. Estudio de personalización Lucams.`,
    // Estudio no es indexable público — robots noindex hasta que esté completo
    robots: { index: false, follow: false },
  };
}

export default async function EstudioPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await getStorefrontProductBySlug(slug);
  if (!product) notFound();

  // Si por error linkearon un producto NONE acá, devolver al PDP.
  if (product.personalizationKind === "NONE") {
    notFound();
  }

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

          <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-lg shadow-brand-purple/10">
            <div className="bg-brand-purple/10 mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full">
              <Sparkles className="text-brand-purple h-10 w-10" />
            </div>

            <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
              Estudio en construcción
            </h1>

            <p className="text-brand-purple-dark/80 mt-4 text-base leading-relaxed">
              Estamos puliendo los últimos detalles del Estudio para que diseñes{" "}
              <strong>{product.name}</strong> en vivo desde acá.
            </p>

            <p className="text-brand-purple-dark/70 mt-4 text-sm">
              Mientras tanto, contanos por WhatsApp qué querés personalizar — nuestro equipo te
              guía paso a paso, recibe tus fotos y te muestra una vista previa antes de imprimir.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3">
              {waHref && (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-brand-purple hover:bg-brand-purple-dark inline-flex h-12 items-center justify-center gap-2 rounded-md px-8 text-base font-semibold text-white shadow-lg shadow-brand-purple/30"
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
                💜 Próximamente: editor en vivo con tus fotos, plantillas kawaii y vista previa
                instantánea. Te avisamos al lanzar.
              </p>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

/*
 * /d/[token] — Vista PÚBLICA de un diseño compartido (Fase 3 — compartir diseño).
 *
 * El cliente genera un shareToken desde /mi-cuenta/disenos y comparte este link. La
 * vista muestra SOLO el preview + el producto + un CTA para crear el tuyo — sin PII ni
 * datos de la cuenta. Token imposible de adivinar (32 hex) → sin IDOR. noindex (es un
 * diseño personal, no contenido de catálogo). El preview sirve como OG image para que
 * al compartir por WhatsApp/redes se vea la miniatura.
 */

import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { LucamsLogo } from "@/components/lucams-logo";
import { getSharedDesign } from "@/features/personalization/service";

export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

// generateMetadata y la página resuelven el mismo diseño; cache() (request-scoped)
// deduplica la query Prisma para no golpear la DB dos veces por visita. Prisma no se
// auto-memoiza como fetch en Next 16 → hay que envolverlo explícitamente.
const loadSharedDesign = cache(getSharedDesign);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { token } = await params;
  const design = await loadSharedDesign(token);
  if (!design) return { title: "Diseño no encontrado · Lucams", robots: { index: false } };
  return {
    title: `Un ${design.product.name} personalizado · Lucams_shop`,
    description: `Mira este ${design.product.name} hecho en el Estudio de Lucams_shop. Crea el tuyo con tus fotos.`,
    robots: { index: false, follow: false },
    openGraph: {
      title: `Un ${design.product.name} personalizado · Lucams_shop`,
      description: "Hecho en el Estudio de Lucams_shop 🦝✨",
      images: design.previewUrl ? [{ url: design.previewUrl }] : [],
    },
  };
}

export default async function SharedDesignPage({ params }: { params: Params }) {
  const { token } = await params;
  const design = await loadSharedDesign(token);
  if (!design) notFound();

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <header className="border-brand-purple/10 border-b bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2">
            <LucamsLogo variant="full" size={36} />
            <span className="text-brand-purple-dark font-display text-lg font-bold">Lucams_shop</span>
          </Link>
          <Link
            href="/productos"
            className="text-brand-purple-dark/70 hover:text-brand-purple text-xs font-medium"
          >
            Ver catálogo →
          </Link>
        </div>
      </header>

      <main id="contenido" tabIndex={-1} className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-lg text-center">
          <p className="text-brand-muted text-xs tracking-wider uppercase">Diseño compartido</p>
          <h1 className="font-display text-brand-purple-dark mt-1 text-2xl sm:text-3xl">
            Un {design.product.name} personalizado
          </h1>

          <div className="border-brand-purple/15 mx-auto mt-6 max-w-sm overflow-hidden rounded-2xl border bg-white p-3 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element -- preview público de Supabase */}
            <img
              src={design.previewUrl ?? ""}
              alt={`Diseño de ${design.product.name}`}
              className="bg-brand-cream aspect-square w-full rounded-lg object-contain"
            />
          </div>

          <p className="text-brand-muted mt-6 text-sm">
            Hecho en el <strong className="text-brand-purple-dark">Estudio de Personalización</strong>{" "}
            de Lucams_shop. Sube tus fotos y crea el tuyo en minutos.
          </p>

          <Link
            href={`/producto/${design.product.slug}`}
            className="bg-gradient-brand mt-5 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white hover:brightness-110"
          >
            <Sparkles className="h-4 w-4" />
            Crear el mío
          </Link>
        </div>
      </main>
    </div>
  );
}

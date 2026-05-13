/*
 * Estudio de Personalización — entry point server component.
 *
 * Flow:
 *   1. Verifica que el slug existe y que el producto requiere personalización.
 *   2. Lista plantillas disponibles para el kind del producto.
 *   3. Renderiza <StudioEditor> client component con todas las props necesarias.
 *      El editor crea el Design draft al montar (via server action) si no
 *      hay designId en query params, o levanta el existente si lo hay.
 *
 * No requiere auth — anon flow OK con sessionId cookie. El editor cliente
 * llama createDraftDesignAction que resuelve owner internamente.
 *
 * NoIndex robots — el estudio no es página pública crawlable.
 */

import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getStorefrontProductBySlug } from "@/features/products/public-service";
import { listTemplatesForKind } from "@/features/personalization/service";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ designId?: string; template?: string }>;

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

// Editor es client-only (Konva depende de window). Loadeado dinámicamente
// con loading placeholder mientras descarga.
const StudioEditor = dynamic(
  () => import("./studio-editor").then((mod) => ({ default: mod.StudioEditor })),
  {
    loading: () => (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-brand-purple/70 flex items-center gap-3">
          <div className="border-brand-purple/30 border-t-brand-purple h-6 w-6 animate-spin rounded-full border-2" />
          <span>Cargando estudio...</span>
        </div>
      </div>
    ),
  },
);

export default async function EstudioPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const product = await getStorefrontProductBySlug(slug);
  if (!product) notFound();
  if (product.personalizationKind === "NONE") notFound();

  // Levantar plantillas del kind. Incluye globales + específicas del producto.
  // canvasData viene como Prisma JsonValue (puede ser null); el seed garantiza
  // que TODAS las plantillas tienen canvasData válido, así que casteamos.
  const templatesRaw = await listTemplatesForKind(product.personalizationKind, {
    productId: product.id,
  });
  const templates = templatesRaw.map((t) => ({
    ...t,
    canvasData: t.canvasData as unknown as import("./types").CanvasData,
  }));

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex flex-1 flex-col">
        <StudioEditor
          product={{
            id: product.id,
            slug: product.slug,
            name: product.name,
            sku: product.sku,
            personalizationKind: product.personalizationKind,
            personalizationSchema: product.personalizationSchema,
            images: product.images,
          }}
          templates={templates}
          initialDesignId={sp.designId ?? null}
          initialTemplateSlug={sp.template ?? null}
        />
      </main>
    </div>
  );
}

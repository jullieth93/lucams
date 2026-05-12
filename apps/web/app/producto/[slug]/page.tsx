/*
 * Storefront — Detalle de producto.
 *
 * Página individual de producto. Renderiza:
 *   - galería (placeholder hasta que haya imágenes reales en Storage),
 *   - nombre / categoría / precio + descuento si aplica,
 *   - descripción larga,
 *   - botones: añadir al carrito (placeholder) + consultar por WhatsApp,
 *   - breadcrumb minimalista.
 *
 * SEO: metadata dinámica usa seoTitle/seoDescription si están seteados,
 * fallback al name/description.
 */

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Sparkles, MessageCircle } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { formatCOP } from "@/lib/format";
import { buildWhatsAppUrl } from "@/lib/wa";
import { addToCartAction } from "@/app/carrito/actions";
import { getStorefrontProductBySlug } from "@/features/products/public-service";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getStorefrontProductBySlug(slug);
  if (!product) return { title: "Producto no encontrado" };
  return {
    title: product.seoTitle ?? product.name,
    description: product.seoDescription ?? product.description.slice(0, 160),
  };
}

export default async function ProductoDetallePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const product = await getStorefrontProductBySlug(slug);
  if (!product) notFound();
  const justAdded = sp.added === "1";
  const errorMsg = typeof sp.error === "string" ? sp.error : null;

  const hasDiscount = product.compareAtPrice != null && product.compareAtPrice > product.basePrice;
  const waHref = buildWhatsAppUrl({
    kind: "product",
    productName: product.name,
    sku: product.sku,
  });

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1 px-6 py-8 sm:px-10">
        <div className="mx-auto max-w-5xl">
          {justAdded && (
            <div className="border-brand-turquoise/30 bg-brand-turquoise/10 text-brand-purple-dark mb-4 flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm">
              <span>✨ Agregado al carrito.</span>
              <Link
                href="/carrito"
                className="text-brand-purple hover:text-brand-purple-dark font-semibold"
              >
                Ver carrito →
              </Link>
            </div>
          )}
          {errorMsg && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          <nav
            className="text-brand-purple-dark/60 mb-6 flex items-center gap-1 text-xs"
            aria-label="Breadcrumb"
          >
            <Link href="/productos" className="hover:text-brand-purple">
              Tienda
            </Link>
            <ChevronRight className="h-3 w-3" />
            <Link
              href={`/productos?categoria=${product.category.slug}`}
              className="hover:text-brand-purple"
            >
              {product.category.name}
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-brand-purple-dark/40">{product.name}</span>
          </nav>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div className="space-y-3">
              <div className="border-brand-purple/10 from-brand-turquoise/15 via-brand-cream to-brand-pink/15 relative aspect-square w-full overflow-hidden rounded-xl border bg-gradient-to-br text-transparent">
                {product.images.length > 0 ? (
                  <Image
                    src={product.images[0]}
                    alt={product.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    priority
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Sparkles className="text-brand-purple/30 h-20 w-20" />
                  </div>
                )}
              </div>
              {product.images.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {product.images.slice(1, 5).map((img, idx) => (
                    <div
                      key={idx}
                      className="relative aspect-square w-full overflow-hidden rounded-md text-transparent"
                    >
                      <Image
                        src={img}
                        alt={`${product.name} — vista ${idx + 2}`}
                        fill
                        sizes="(max-width: 768px) 25vw, 12vw"
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-5">
              <div>
                <p className="text-brand-purple/70 text-xs font-medium tracking-wider uppercase">
                  {product.category.name}
                </p>
                <h1 className="font-display text-brand-purple-dark mt-1 text-3xl sm:text-4xl">
                  {product.name}
                </h1>
                {product.isPersonalizable && (
                  <span className="bg-brand-purple mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold tracking-wider text-white uppercase">
                    ✨ Personalizable
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-3">
                <span className="text-brand-purple-dark text-3xl font-bold tabular-nums">
                  {formatCOP(product.basePrice)}
                </span>
                {hasDiscount && (
                  <span className="text-brand-purple-dark/40 text-lg tabular-nums line-through">
                    {formatCOP(product.compareAtPrice!)}
                  </span>
                )}
              </div>

              <p className="text-brand-purple-dark/80 text-base leading-relaxed whitespace-pre-line">
                {product.description}
              </p>

              <div className="space-y-2 pt-2">
                <form action={addToCartAction}>
                  <input type="hidden" name="slug" value={product.slug} />
                  <input type="hidden" name="qty" value={1} />
                  <input type="hidden" name="returnTo" value={`/producto/${product.slug}`} />
                  <Button
                    type="submit"
                    className="bg-brand-purple hover:bg-brand-purple-dark w-full text-white"
                    size="lg"
                  >
                    Añadir al carrito
                  </Button>
                </form>
                {waHref && (
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-brand-turquoise bg-brand-turquoise/10 text-brand-purple-dark hover:bg-brand-turquoise/20 inline-flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Consultar por WhatsApp
                  </a>
                )}
              </div>

              <p className="text-brand-purple-dark/50 pt-2 text-xs">
                SKU: <span className="font-mono">{product.sku}</span>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

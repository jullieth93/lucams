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
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, MessageCircle, Sparkles } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WishlistButton } from "@/components/wishlist-button";
import { BackInStockButton } from "@/components/back-in-stock-button";
import { getCurrentCustomer } from "@/lib/auth";
import { getWishlistedProductIds } from "@/features/wishlist/service";
import { SubmitButton } from "@/components/admin/submit-button";
import { ProductGallery } from "@/components/product-detail/product-gallery";
import { RelatedProducts } from "@/components/product-detail/related-products";
import { ProductReviews } from "./product-reviews";
import { TemplatesStrip } from "@/components/product-detail/templates-strip";
import { VariantSelector } from "./variant-selector";
import { formatCOP } from "@/lib/format";
import { buildWhatsAppUrl } from "@/lib/wa";
import { addToCartAction } from "@/app/carrito/actions";
import { selectableVariants, parseVariantAttributes } from "@/features/products/variant-schemas";
import { NamePricePicker } from "./name-price-picker";
import {
  getStorefrontProductBySlug,
  listRelatedProducts,
} from "@/features/products/public-service";
import { getProductRatingAggregate } from "@/features/reviews/public-service";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getStorefrontProductBySlug(slug);
  if (!product) return { title: "Producto no encontrado" };
  const title = product.seoTitle ?? product.name;
  const description = product.seoDescription ?? product.description.slice(0, 160);
  const image = product.images[0] ?? "/brand/lucams-logo.png";
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: image, alt: product.name }],
      locale: "es_CO",
      siteName: "Lucams_shop",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    alternates: {
      canonical: `/producto/${product.slug}`,
    },
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

  // M.3.b.CAT.3 — Variant seleccionado via ?variant=id (deep-link).
  // ADR-057 cert: derivar del MISMO conjunto que el VariantSelector (sin la variante
  // "Default" vacía) para que galería/precio coincidan con el chip resaltado por defecto.
  const requestedVariantId = typeof sp.variant === "string" ? sp.variant : undefined;
  const selectable = selectableVariants(product.variants);
  const selectedVariant =
    selectable.find((v) => v.id === requestedVariantId) ?? selectable[0] ?? null;
  // Precio final: variant.price override o basePrice
  const displayPrice = selectedVariant?.price ?? product.basePrice;

  // D1 (Lucy 2026-06-27): la galería muestra las fotos de la OPCIÓN elegida si
  // tiene propias; si no, hereda las del producto (espeja la herencia de price).
  // El selector hace router.replace(?variant=id) → este RSC re-renderiza con la
  // opción nueva y la galería se actualiza.
  const galleryImages =
    selectedVariant?.images && selectedVariant.images.length > 0
      ? selectedVariant.images
      : product.images;

  // ADR-057 — atributos de la variante elegida: guían el CTA y el modelo de precio.
  const selectedAttrs = parseVariantAttributes(selectedVariant?.attributes);
  // Set de letras (Completo/Vocales): abre el Estudio (color + estilo). El visual del set
  // vive DENTRO del Estudio (no duplicamos "Esto recibes" en la ficha — Lucy 2026-07-12).
  const letterSet = (product.personalizationSchema as { letterSet?: string } | null)?.letterSet;
  const isLetterSetProduct = letterSet === "full" || letterSet === "vowels";
  // Nombre Personalizado: precio POR FICHA → selector de cantidad en la ficha.
  const isNamePerTile = selectedAttrs.variant === "name";
  const nameMin = selectedAttrs.letterCountMin ?? 3;
  const nameMax = selectedAttrs.letterCountMax ?? 10;
  // CTA adaptativo: "Sin imán" es un adhesivo, no un imán → no llamarlo "imán". (magnet
  // undefined = con imán por defecto.)
  const ctaNoun = selectedAttrs.magnet === false ? "tu adhesivo" : "tu imán";

  const [related, ratingAggregate] = await Promise.all([
    listRelatedProducts({
      productId: product.id,
      categorySlug: product.category.slug,
      limit: 4,
    }),
    // Rating real para el JSON-LD (auditoría 2026-07-16). null si no hay reseñas.
    getProductRatingAggregate(product.id),
  ]);

  // Precio tachado (promo) de la OPCIÓN elegida (Lucy 2026-06-27). Solo se
  // muestra si es estrictamente mayor al precio actual → nunca descuento negativo.
  const displayCompareAt = selectedVariant?.compareAtPrice ?? null;
  const hasDiscount = displayCompareAt != null && displayCompareAt > displayPrice;
  const waHref = await buildWhatsAppUrl({
    kind: "product",
    productName: product.name,
    sku: product.sku,
  });

  // Wishlist + "avísame cuando vuelva" (palancas, auditoría 2026-07-13): estado del corazón para el
  // cliente logueado + su email (prellenar el aviso de reposición).
  const customer = await getCurrentCustomer();
  const initialWishlisted = customer
    ? (await getWishlistedProductIds(customer.customer.id, [product.id])).has(product.id)
    : false;
  const customerEmail = customer?.customer.email ?? "";

  // M.2 — "Personalizar primero": si el producto requiere personalización,
  // la CTA primaria es ir al Estudio. "Añadir al carrito" se oculta hasta
  // que haya un Design READY (M.4 cablea ese flow). Si kind=NONE, mantiene
  // el flujo clásico de añadir al carrito directo.
  const requiresPersonalization = product.personalizationKind !== "NONE";

  // JSON-LD Product structured data — Google rich results.
  // basePrice está en centavos COP → dividir por 100 para schema.org.
  // priceValidUntil usa la updatedAt + 1 año (no Date.now() para evitar
  // impuras; se actualiza naturalmente cada vez que admin edita el producto).
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  const priceValidUntil = new Date(product.updatedAt.getTime() + oneYearMs)
    .toISOString()
    .slice(0, 10);
  // Agotado = ninguna opción activa con stock (auditoría 2026-07-13).
  const outOfStock = product.inStock === false;
  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    description: product.description.slice(0, 5000),
    sku: product.sku,
    image: product.images.length > 0 ? product.images : ["/brand/lucams-logo.png"],
    category: product.category.name,
    brand: { "@type": "Brand", name: "Lucams_shop" },
    // aggregateRating solo si hay reseñas reales aprobadas (Google rechaza rating vacío/inventado).
    // El valor es visible en la página (sección Reseñas) — requisito de la política de rich results.
    ...(ratingAggregate
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: ratingAggregate.ratingValue.toFixed(1),
            reviewCount: ratingAggregate.reviewCount,
          },
        }
      : {}),
    offers: {
      "@type": "Offer",
      url: `https://lucamsshop.co/producto/${product.slug}`,
      priceCurrency: "COP",
      price: (product.basePrice / 100).toFixed(0),
      priceValidUntil,
      availability:
        product.inStock === false
          ? "https://schema.org/OutOfStock"
          : "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: "Lucams_shop" },
    },
  };

  // BreadcrumbList (auditoría 2026-07-13): Tienda → Categoría → Producto → migas en Google.
  const breadcrumbJsonLd = {
    "@context": "https://schema.org/",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Tienda", item: "https://lucamsshop.co/productos" },
      {
        "@type": "ListItem",
        position: 2,
        name: product.category.name,
        item: `https://lucamsshop.co/productos?categoria=${product.category.slug}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: product.name,
        item: `https://lucamsshop.co/producto/${product.slug}`,
      },
    ],
  };

  // Auditoría 2026-07-13: escapar <, >, & del JSON embebido → un nombre/descripción con
  // "</script>" o "<" no puede romper el tag ni inyectar (XSS). JSON.stringify no los escapa.
  const jsonLdSafe = JSON.stringify([jsonLd, breadcrumbJsonLd])
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

  // CSP por nonce (C3): el JSON-LD es un bloque de datos (exento de script-src),
  // pero le pasamos el nonce por robustez ante navegadores estrictos.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      {/* suppressHydrationWarning: el navegador BORRA el nonce del DOM tras aplicar
          la CSP (seguridad), así que el cliente ve nonce="" y no matchea el del
          servidor. Es esperado — no es un bug de datos. */}
      <script
        type="application/ld+json"
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: jsonLdSafe }}
      />
      <SiteHeader />

      <main id="contenido" tabIndex={-1} className="flex-1 px-6 py-8 sm:px-10">
        <div className="mx-auto max-w-5xl">
          <nav
            className="text-brand-muted mb-6 flex items-center gap-1 text-xs"
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
            <span className="text-brand-muted">{product.name}</span>
          </nav>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {/* key por opción: reinicia la galería a la portada al cambiar de opción. */}
            <ProductGallery
              key={selectedVariant?.id ?? "base"}
              images={galleryImages}
              alt={product.name}
            />

            <div className="space-y-5">
              <div>
                <p className="text-brand-muted text-xs font-medium tracking-wider uppercase">
                  {product.category.name}
                </p>
                <div className="mt-1 flex items-start justify-between gap-3">
                  <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
                    {product.name}
                  </h1>
                  <WishlistButton
                    productId={product.id}
                    initialWishlisted={initialWishlisted}
                    className="hover:bg-brand-pink/10 mt-1 flex-shrink-0 p-2"
                  />
                </div>
                {product.isPersonalizable && (
                  <span className="bg-brand-purple mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold tracking-wider text-white uppercase">
                    ✨ Personalizable
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {isNamePerTile ? (
                  <>
                    {/* Precio POR FICHA: el grande es "desde" (mínimo de letras); el exacto
                        lo calcula el selector de cantidad abajo. */}
                    <span className="text-brand-muted text-lg font-semibold">Desde</span>
                    <span className="text-brand-purple-dark text-3xl font-bold tabular-nums">
                      {formatCOP(displayPrice * nameMin)}
                    </span>
                    <span className="text-brand-muted text-sm">
                      · {formatCOP(displayPrice)} por ficha
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-brand-purple-dark text-3xl font-bold tabular-nums">
                      {formatCOP(displayPrice)}
                    </span>
                    {hasDiscount && (
                      <span className="text-brand-muted text-lg tabular-nums line-through">
                        {formatCOP(displayCompareAt!)}
                      </span>
                    )}
                  </>
                )}
              </div>

              <p className="text-brand-purple-dark/80 text-base leading-relaxed whitespace-pre-line">
                {product.description}
              </p>

              {/* M.3.b.CAT.3 — Selector de variants si product tiene 2+ */}
              {selectable.length > 1 && (
                <VariantSelector productBasePrice={product.basePrice} variants={selectable} />
              )}

              <div className="space-y-2 pt-2">
                {outOfStock ? (
                  <div className="space-y-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3">
                    <p className="text-center text-sm font-semibold text-rose-800">
                      Producto agotado 😢
                    </p>
                    <BackInStockButton productId={product.id} defaultEmail={customerEmail} />
                  </div>
                ) : isNamePerTile ? (
                  // Nombre Personalizado: precio POR FICHA → selector de cantidad + CTA al Estudio.
                  <NamePricePicker
                    slug={product.slug}
                    variantId={selectedVariant?.id ?? null}
                    perTilePrice={displayPrice}
                    min={nameMin}
                    max={nameMax}
                    ctaNoun={ctaNoun}
                  />
                ) : requiresPersonalization || isLetterSetProduct ? (
                  <>
                    {/* CTA primaria: ir al Estudio con variant pre-seleccionado. Los sets de
                        letras (Completo/Vocales) personalizan color + estilo dentro del Estudio.
                        Sustantivo adaptativo: "tu imán" o "tu adhesivo" según la variante. */}
                    <Link
                      href={`/estudio/${product.slug}${selectedVariant ? `?variant=${selectedVariant.id}` : ""}`}
                      className="bg-brand-purple hover:bg-brand-purple-dark shadow-brand-purple/30 hover:shadow-brand-purple/40 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md px-6 text-base font-semibold text-white shadow-lg transition-all hover:shadow-xl"
                    >
                      <Sparkles className="h-5 w-5" />
                      Personalizar {ctaNoun} →
                    </Link>
                    <p className="text-brand-muted text-center text-xs">
                      Diseña en vivo • Vista previa al instante
                    </p>
                  </>
                ) : (
                  <form action={addToCartAction}>
                    <input type="hidden" name="slug" value={product.slug} />
                    <input type="hidden" name="qty" value={1} />
                    <input type="hidden" name="returnTo" value={`/producto/${product.slug}`} />
                    {/* ADR-057 — variante elegida en el selector (tamaño/imantado/idioma). */}
                    {selectedVariant && (
                      <input type="hidden" name="variantId" value={selectedVariant.id} />
                    )}
                    {/* SubmitButton: spinner + disabled al enviar → evita doble-clic
                        (compra duplicada). Lucy 2026-06-27. */}
                    <SubmitButton
                      label="Añadir al carrito"
                      pendingLabel="Añadiendo…"
                      size="lg"
                      className="bg-brand-purple hover:bg-brand-purple-dark w-full text-white"
                    />
                  </form>
                )}
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

              <p className="text-brand-muted pt-2 text-xs">
                SKU: <span className="font-mono">{product.sku}</span>
              </p>
            </div>
          </div>

          <TemplatesStrip productSlug={product.slug} isPersonalizable={product.isPersonalizable} />

          <ProductReviews productId={product.id} slug={product.slug} />

          <RelatedProducts products={related} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

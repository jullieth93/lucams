/*
 * ProductCard — tarjeta usada en /productos y módulos "destacados".
 *
 * Sin imágenes reales todavía: fallback con gradient + nombre + icon.
 * Cuando se conecten imágenes (Supabase Storage) se reemplaza el block
 * placeholder por <Image src={product.images[0]} ... />.
 *
 * Navegación: patrón stretched-link INVERSO — el <Link> es un overlay
 * absoluto que cubre toda la card (zona clickeable idéntica a antes) en
 * vez de envolver el contenido. Así el <WishlistButton> NO queda anidado
 * dentro del enlace (contenido interactivo anidado = HTML inválido);
 * el corazón va por ENCIMA del overlay con z-10 y su click no navega.
 */

import Image from "next/image";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { formatCOP } from "@/lib/format";
import { WishlistButton } from "@/components/wishlist-button";
import type { StorefrontProductCard } from "@/features/products/public-service";

export function ProductCard({
  product,
  wishlisted,
}: {
  product: StorefrontProductCard;
  /** Si se pasa (cliente logueado), muestra el corazón de favoritos con este estado inicial. */
  wishlisted?: boolean;
}) {
  // #20 — el descuento se basa en el precio REALMENTE mostrado (minVariantPrice si aplica), no en el
  // basePrice, para que el tachado y el % coincidan con la cifra visible.
  const displayPrice = product.minVariantPrice ?? product.basePrice;
  const hasDiscount = product.compareAtPrice != null && product.compareAtPrice > displayPrice;
  const discountPct = hasDiscount
    ? Math.round(((product.compareAtPrice! - displayPrice) / product.compareAtPrice!) * 100)
    : 0;
  // inStock === false → agotado (undefined = paths sin dato de stock → se trata como disponible).
  const outOfStock = product.inStock === false;

  return (
    <div className="group border-brand-purple/10 relative flex flex-col overflow-hidden rounded-xl border bg-white transition-shadow hover:shadow-lg">
      <div className="from-brand-turquoise/15 via-brand-cream to-brand-pink/15 relative aspect-square w-full overflow-hidden bg-gradient-to-br">
        {product.images.length > 0 ? (
          <Image
            src={product.images[0]}
            alt=""
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            loading="lazy"
            className={`object-cover transition-transform duration-300 group-hover:scale-105 ${
              outOfStock ? "opacity-50 grayscale" : ""
            }`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Sparkles className="text-brand-muted h-12 w-12" />
          </div>
        )}

        {outOfStock && (
          <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-black/45 py-1 text-center text-xs font-bold tracking-wider text-white uppercase backdrop-blur-[1px]">
            Agotado
          </span>
        )}
        {product.isPersonalizable && (
          <span className="bg-brand-purple absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider text-white uppercase">
            Personalizable
          </span>
        )}
        {wishlisted !== undefined && (
          // z-10: el corazón queda POR ENCIMA del overlay-link (ver abajo) para que su
          // click haga toggle y no navegue a la PDP.
          <div className="absolute top-1.5 right-1.5 z-10">
            <WishlistButton
              productId={product.id}
              initialWishlisted={wishlisted}
              size="sm"
              className="bg-white/85 p-1.5 shadow-sm backdrop-blur-sm hover:bg-white"
            />
          </div>
        )}
        {hasDiscount && (
          <span className="bg-brand-pink-ink absolute right-2 bottom-2 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider text-white uppercase">
            -{discountPct}%
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="text-brand-muted flex items-center gap-1.5 text-[10px] font-medium tracking-wider uppercase">
          <span>{product.category.name}</span>
          {product.variantCount != null && product.variantCount > 1 && (
            <>
              <span className="text-brand-purple/30" aria-hidden>
                ·
              </span>
              <span className="bg-brand-turquoise/15 text-brand-purple-dark rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-normal normal-case">
                {product.variantCount} opciones
              </span>
            </>
          )}
        </p>
        <h3 className="text-brand-purple-dark group-hover:text-brand-purple line-clamp-2 font-semibold">
          {product.name}
        </h3>
        {/* #20 — flex-wrap: en cards angostas (2-col móvil) el tachado ya no se corta. */}
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-2">
          {product.variantCount != null &&
            product.variantCount > 1 &&
            product.minVariantPrice != null &&
            product.minVariantPrice < product.basePrice && (
              <span className="text-brand-muted text-[10px] font-semibold tracking-wider uppercase">
                desde
              </span>
            )}
          <span className="text-brand-purple-dark text-lg font-bold tabular-nums">
            {formatCOP(product.minVariantPrice ?? product.basePrice)}
          </span>
          {hasDiscount && (
            <span className="text-brand-muted text-xs tabular-nums line-through">
              {formatCOP(product.compareAtPrice!)}
            </span>
          )}
        </div>
      </div>

      {/* Stretched-link: overlay transparente que cubre TODA la card (misma zona
          clickeable que cuando el Link envolvía el contenido). Va de último para
          pintar encima; el WishlistButton lo supera con z-10. ring-inset: el foco
          visible (WCAG 2.4.7) se dibuja DENTRO de la card, no por fuera. */}
      <Link
        href={`/producto/${product.slug}`}
        aria-label={product.name}
        className="focus-visible:ring-brand-purple absolute inset-0 focus-visible:ring-2 focus-visible:ring-inset"
      />
    </div>
  );
}

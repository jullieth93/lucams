/*
 * ProductCard — tarjeta usada en /productos y módulos "destacados".
 *
 * Sin imágenes reales todavía: fallback con gradient + nombre + icon.
 * Cuando se conecten imágenes (Supabase Storage) se reemplaza el block
 * placeholder por <Image src={product.images[0]} ... />.
 */

import Image from "next/image";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { formatCOP } from "@/lib/format";
import type { StorefrontProductCard } from "@/features/products/public-service";

export function ProductCard({ product }: { product: StorefrontProductCard }) {
  const hasDiscount = product.compareAtPrice != null && product.compareAtPrice > product.basePrice;
  const discountPct = hasDiscount
    ? Math.round(((product.compareAtPrice! - product.basePrice) / product.compareAtPrice!) * 100)
    : 0;
  // inStock === false → agotado (undefined = paths sin dato de stock → se trata como disponible).
  const outOfStock = product.inStock === false;

  return (
    <Link
      href={`/producto/${product.slug}`}
      aria-label={product.name}
      className="group border-brand-purple/10 flex flex-col overflow-hidden rounded-xl border bg-white transition-shadow hover:shadow-lg"
    >
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
        {hasDiscount && (
          <span className="bg-brand-pink-ink absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider text-white uppercase">
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
        <div className="mt-auto flex items-baseline gap-2 pt-2">
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
    </Link>
  );
}

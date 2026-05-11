/*
 * ProductCard — tarjeta usada en /productos y módulos "destacados".
 *
 * Sin imágenes reales todavía: fallback con gradient + nombre + icon.
 * Cuando se conecten imágenes (Supabase Storage) se reemplaza el block
 * placeholder por <Image src={product.images[0]} ... />.
 */

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { formatCOP } from "@/lib/format";
import type { StorefrontProductCard } from "@/features/products/public-service";

export function ProductCard({ product }: { product: StorefrontProductCard }) {
  const hasDiscount =
    product.compareAtPrice != null && product.compareAtPrice > product.basePrice;
  const discountPct = hasDiscount
    ? Math.round(
        ((product.compareAtPrice! - product.basePrice) /
          product.compareAtPrice!) *
          100,
      )
    : 0;

  return (
    <Link
      href={`/producto/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-brand-purple/10 bg-white transition-shadow hover:shadow-lg"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-brand-turquoise/15 via-brand-cream to-brand-pink/15">
        {product.images.length > 0 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.images[0]}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Sparkles className="h-12 w-12 text-brand-purple/40" />
          </div>
        )}

        {product.isPersonalizable && (
          <span className="absolute left-2 top-2 rounded-full bg-brand-purple px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
            Personalizable
          </span>
        )}
        {hasDiscount && (
          <span className="absolute right-2 top-2 rounded-full bg-brand-pink px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
            -{discountPct}%
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-brand-purple/70">
          {product.category.name}
        </p>
        <h3 className="font-semibold text-brand-purple-dark line-clamp-2 group-hover:text-brand-purple">
          {product.name}
        </h3>
        <div className="mt-auto pt-2 flex items-baseline gap-2">
          <span className="text-lg font-bold text-brand-purple-dark tabular-nums">
            {formatCOP(product.basePrice)}
          </span>
          {hasDiscount && (
            <span className="text-xs text-brand-purple/50 line-through tabular-nums">
              {formatCOP(product.compareAtPrice!)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

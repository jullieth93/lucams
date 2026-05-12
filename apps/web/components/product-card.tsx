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

  return (
    <Link
      href={`/producto/${product.slug}`}
      className="group border-brand-purple/10 flex flex-col overflow-hidden rounded-xl border bg-white transition-shadow hover:shadow-lg"
    >
      <div className="from-brand-turquoise/15 via-brand-cream to-brand-pink/15 relative aspect-square w-full overflow-hidden bg-gradient-to-br text-transparent">
        {product.images.length > 0 ? (
          <Image
            src={product.images[0]}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            loading="lazy"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Sparkles className="text-brand-purple/40 h-12 w-12" />
          </div>
        )}

        {product.isPersonalizable && (
          <span className="bg-brand-purple absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider text-white uppercase">
            Personalizable
          </span>
        )}
        {hasDiscount && (
          <span className="bg-brand-pink absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider text-white uppercase">
            -{discountPct}%
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="text-brand-purple/70 text-[10px] font-medium tracking-wider uppercase">
          {product.category.name}
        </p>
        <h3 className="text-brand-purple-dark group-hover:text-brand-purple line-clamp-2 font-semibold">
          {product.name}
        </h3>
        <div className="mt-auto flex items-baseline gap-2 pt-2">
          <span className="text-brand-purple-dark text-lg font-bold tabular-nums">
            {formatCOP(product.basePrice)}
          </span>
          {hasDiscount && (
            <span className="text-brand-purple/50 text-xs tabular-nums line-through">
              {formatCOP(product.compareAtPrice!)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

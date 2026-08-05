/*
 * ProductFromCatalogCard — Card que renderiza un CatalogProductSummary
 * (devuelto por lib/catalog.ts). Independiente del legacy ProductCard.
 *
 * PLAN_CATALOG_V2 — usado en /ocasion/[slug], /productos/[cat]/[subcat],
 * /recomendador, cross-sell, related PDP.
 */

import Image from "next/image";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { formatCOP } from "@/lib/format";
import type { CatalogProductSummary } from "@/lib/catalog";

export function ProductFromCatalogCard({
  product,
  showReason,
}: {
  product: CatalogProductSummary & { reasons?: string[] };
  showReason?: boolean;
}) {
  const hasDiscount = product.compareAtPrice !== null && product.compareAtPrice > product.basePrice;
  const discountPct = hasDiscount
    ? Math.round(((product.compareAtPrice! - product.basePrice) / product.compareAtPrice!) * 100)
    : 0;
  const priceRange =
    product.minPrice === product.maxPrice
      ? formatCOP(product.minPrice)
      : `${formatCOP(product.minPrice)} – ${formatCOP(product.maxPrice)}`;
  const outOfStock = !product.inStock; // #5 — misma señal de agotado que ProductCard
  // #9 — en el recomendador (showReason), quien pidió "personalizable" merece un atajo directo
  // al Estudio (diferenciador #1) sin pasar por el PDP. CTA secundaria; el link principal sigue
  // al PDP. Se renderiza fuera del <Link> del PDP para no anidar <a> dentro de <a> (HTML inválido).
  const showStudioCta = Boolean(showReason && product.isPersonalizable);

  const card = (
    <Link
      href={`/producto/${product.slug}`}
      aria-label={product.name}
      className={`group border-brand-purple/10 flex flex-1 flex-col overflow-hidden border bg-white transition-shadow hover:shadow-lg ${
        showStudioCta ? "rounded-t-xl border-b-0" : "rounded-xl"
      }`}
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

        {/* #5 — overlay "Agotado" idéntico al ProductCard. */}
        {outOfStock && (
          <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-black/45 py-1 text-center text-xs font-bold tracking-wider text-white uppercase backdrop-blur-[1px]">
            Agotado
          </span>
        )}

        {product.isPersonalizable && (
          <span className="bg-brand-purple absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white">
            Personalizable
          </span>
        )}
        {hasDiscount && (
          <span className="bg-brand-pink-ink absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white">
            -{discountPct}%
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <p className="text-brand-muted text-[10px] font-medium tracking-wider uppercase">
          {product.parentCategoryName ?? product.categoryName}
        </p>
        <h3 className="text-brand-purple-dark mt-1 line-clamp-2 text-sm leading-snug font-semibold">
          {product.name}
        </h3>

        <div className="mt-auto pt-2">
          {product.variantCount > 1 ? (
            <p className="text-brand-purple-dark text-sm font-bold">
              Desde {formatCOP(product.minPrice)}
              {product.minPrice !== product.maxPrice && (
                <span className="text-brand-muted ml-1 text-xs font-normal">
                  · hasta {formatCOP(product.maxPrice)}
                </span>
              )}
            </p>
          ) : (
            <p className="text-brand-purple-dark text-sm font-bold">{priceRange}</p>
          )}
          {hasDiscount && product.minPrice === product.basePrice && (
            <p className="text-xs text-slate-400 line-through">
              {formatCOP(product.compareAtPrice!)}
            </p>
          )}
        </div>

        {/* a11y: brand-turquoise-dark no existe como token — el más cercano con
            contraste AA sobre blanco es brand-purple (≈4.6:1). */}
        {showReason && product.reasons && product.reasons.length > 0 && (
          <p className="text-brand-purple mt-2 line-clamp-2 text-xs italic">
            ✨ {product.reasons[0]}
          </p>
        )}
      </div>
    </Link>
  );

  if (!showStudioCta) return card;

  return (
    <div className="flex h-full flex-col">
      {card}
      <Link
        href={`/estudio/${product.slug}`}
        className="bg-brand-purple/10 text-brand-purple-dark hover:bg-brand-purple border-brand-purple/10 flex items-center justify-center gap-1 rounded-b-xl border border-t-0 px-3 py-2 text-xs font-bold transition-colors hover:text-white"
      >
        <Sparkles className="h-3.5 w-3.5" /> Personalízalo
      </Link>
    </div>
  );
}

/*
 * Resumen del pedido — sticky sidebar visible en todos los steps.
 * Muestra items + subtotal + envío (si ya se eligió) + total.
 *
 * Etapa 1 (modo catálogo): no hay envío calculado ni cupones — la línea de
 * envío avisa que se coordina por WhatsApp y el total es el subtotal de
 * productos (la cotización se concreta en la conversación).
 */

import Image from "next/image";
import { ShoppingBag, Sparkles } from "lucide-react";
import { formatCOP } from "@/lib/format";
import { isCatalogMode } from "@/lib/store-mode";
import type { CartDetail } from "@/features/cart/service";
import type { CheckoutTexts } from "../checkout-texts";

export function OrderSummary({
  cart,
  shippingCost,
  shippingLabel,
  discount,
  couponCode,
  texts,
}: {
  cart: CartDetail;
  shippingCost?: number | null;
  shippingLabel?: string;
  discount?: number; // F1 — descuento por cupón (COP centavos)
  couponCode?: string;
  /** Textos CMS del resumen (roadmap B8) — los resuelve el padre server con getCheckoutTexts. */
  texts: CheckoutTexts["summary"];
}) {
  const subtotal = cart.subtotal;
  const shipping = shippingCost ?? null;
  const appliedDiscount = discount ?? 0;
  const total = Math.max(0, subtotal + (shipping ?? 0) - appliedDiscount);
  const catalog = isCatalogMode();

  return (
    <aside className="border-brand-purple/15 sticky top-24 rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-brand-purple-dark font-display mb-4 flex items-center gap-2 text-base font-bold">
        <ShoppingBag className="h-4 w-4" />
        {texts.title}
        <span className="text-brand-muted ml-auto text-xs font-normal">
          {cart.itemCount} {cart.itemCount === 1 ? texts.itemSingle : texts.itemMany}
        </span>
      </h2>

      {/* Items compactos */}
      <ul className="divide-brand-purple/10 max-h-60 divide-y overflow-y-auto">
        {cart.items.map((item) => {
          // Sin imagen: fallback inline (Sparkles, igual que checkout/gracias) —
          // jamás pedir una URL que no existe en public/.
          const imgUrl = item.designPreviewUrl ?? item.imageUrl ?? null;
          return (
            <li key={item.itemId} className="flex items-start gap-3 py-3">
              <div className="bg-brand-purple/5 relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg">
                {imgUrl ? (
                  <Image
                    src={imgUrl}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Sparkles className="text-brand-muted h-5 w-5" />
                  </div>
                )}
                <span className="bg-brand-purple-dark/85 absolute top-0 right-0 inline-flex h-5 min-w-5 items-center justify-center rounded-bl-md px-1 text-[10px] font-bold text-white">
                  {item.qty}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-brand-purple-dark line-clamp-2 text-xs leading-snug font-medium">
                  {item.productName}
                </p>
                {item.isPersonalizable && item.designPreviewUrl && (
                  <p className="text-brand-muted text-[10px]">{texts.personalized}</p>
                )}
              </div>
              <div className="text-brand-purple-dark flex-shrink-0 text-xs font-semibold tabular-nums">
                {formatCOP(item.lineTotal)}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Totales */}
      <dl className="border-brand-purple/10 mt-4 space-y-1.5 border-t pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-brand-purple-dark/70">{texts.subtotal}</dt>
          <dd className="text-brand-purple-dark font-medium tabular-nums">{formatCOP(subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-brand-purple-dark/70">{texts.shippingLabel}</dt>
          <dd className="text-brand-purple-dark/85 text-right tabular-nums">
            {catalog ? (
              <span className="text-brand-muted text-xs italic">{texts.shippingCatalog}</span>
            ) : shipping === null ? (
              <span className="text-brand-muted text-xs italic">{texts.shippingPending}</span>
            ) : shipping === 0 ? (
              <span className="font-semibold text-emerald-700">{texts.free}</span>
            ) : (
              <>
                {formatCOP(shipping)}
                {shippingLabel && (
                  <span className="text-brand-muted block text-[10px] font-normal">
                    {shippingLabel}
                  </span>
                )}
              </>
            )}
          </dd>
        </div>
        {appliedDiscount > 0 && (
          <div className="flex justify-between">
            <dt className="text-emerald-700">
              {texts.discount}
              {couponCode && <span className="ml-1 font-semibold">({couponCode})</span>}
            </dt>
            <dd className="font-semibold text-emerald-700 tabular-nums">
              −{formatCOP(appliedDiscount)}
            </dd>
          </div>
        )}
        <div className="border-brand-purple/10 mt-2 flex justify-between border-t pt-3">
          <dt className="text-brand-purple-dark font-display text-base font-bold">{texts.total}</dt>
          <dd className="text-brand-purple-dark font-display text-lg font-bold tabular-nums">
            {formatCOP(total)}
          </dd>
        </div>
        <p className="text-brand-muted mt-1 text-[10px]">
          {catalog ? texts.noteCatalog : texts.noteFinal}
        </p>
      </dl>
    </aside>
  );
}

/*
 * Resumen del pedido — sticky sidebar visible en todos los steps.
 * Muestra items + subtotal + envío (si ya se eligió) + total.
 *
 * Etapa 1 (modo catálogo): no hay envío calculado ni cupones — la línea de
 * envío avisa que se coordina por WhatsApp y el total es el subtotal de
 * productos (la cotización se concreta en la conversación).
 */

import Image from "next/image";
import Link from "next/link";
import { ShoppingBag, Sparkles } from "lucide-react";
import { formatCOP } from "@/lib/format";
import { isCatalogMode } from "@/lib/store-mode";
import type { CartDetail } from "@/features/cart/service";
import type { GuestLoyaltyIncentive } from "@/features/checkout/service";
import type { CheckoutTexts } from "../checkout-texts";

export function OrderSummary({
  cart,
  shippingCost,
  shippingLabel,
  discount,
  couponCode,
  loyaltyDiscount,
  loyaltyPoints,
  loyaltyEarnPreview,
  guestIncentive,
  guestTexts,
  texts,
}: {
  cart: CartDetail;
  shippingCost?: number | null;
  shippingLabel?: string;
  discount?: number; // F1 — descuento por cupón (COP centavos)
  couponCode?: string;
  /** Puntos Lucams (2026-10-12) — descuento por redención de puntos (centavos)
   *  y cantidad aplicada. Se suma al descuento del cupón (orden de aplicación:
   *  primero cupón, luego puntos sobre el restante). */
  loyaltyDiscount?: number;
  loyaltyPoints?: number;
  /** Puntos que el cliente ganará con esta compra (programa activo + sesión). */
  loyaltyEarnPreview?: number;
  /** Incentivo "crea tu cuenta y gana puntos" para INVITADOS (2026-10-26) —
   *  lo resuelve el padre con getGuestLoyaltyIncentive (null si logueado,
   *  programa apagado o catálogo). */
  guestIncentive?: GuestLoyaltyIncentive | null;
  /** Textos CMS del bloque de incentivo (checkout.guest-loyalty.*). */
  guestTexts?: CheckoutTexts["guestLoyalty"];
  /** Textos CMS del resumen (roadmap B8) — los resuelve el padre server con getCheckoutTexts. */
  texts: CheckoutTexts["summary"];
}) {
  const subtotal = cart.subtotal;
  const shipping = shippingCost ?? null;
  const appliedDiscount = discount ?? 0;
  const appliedLoyaltyDiscount = loyaltyDiscount ?? 0;
  const total = Math.max(0, subtotal + (shipping ?? 0) - appliedDiscount - appliedLoyaltyDiscount);
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
                    // Preview del diseño (mosaico de piezas): object-contain con
                    // aire sobre el fondo neutro claro del contenedor — el cover
                    // cuadrado recortaba el diseño (misma regla que /carrito).
                    // Foto de catálogo: cover. (Solo clases de imagen — otro
                    // agente edita este archivo para precios.)
                    className={item.designPreviewUrl ? "object-contain p-1" : "object-cover"}
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
                {/* Paquete F (2026-10-02) — variante + desglose (Con/Sin imán, tamaño…). */}
                <p className="text-brand-muted line-clamp-1 text-[10px]">{item.variantName}</p>
                {item.variantBreakdown.length > 0 && (
                  <p className="text-brand-purple-dark/70 line-clamp-2 text-[10px]">
                    {item.variantBreakdown.join(" · ")}
                  </p>
                )}
                {item.isPersonalizable && item.designPreviewUrl && (
                  <p className="text-brand-muted text-[10px]">{texts.personalized}</p>
                )}
                {item.borderNote && (
                  <p className="text-brand-muted text-[10px]">{item.borderNote}</p>
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
        {appliedLoyaltyDiscount > 0 && (
          <div className="flex justify-between">
            <dt className="text-emerald-700">
              Puntos Lucams
              {loyaltyPoints != null && loyaltyPoints > 0 && (
                <span className="ml-1 font-semibold">
                  ({loyaltyPoints.toLocaleString("es-CO")} pts)
                </span>
              )}
            </dt>
            <dd className="font-semibold text-emerald-700 tabular-nums">
              −{formatCOP(appliedLoyaltyDiscount)}
            </dd>
          </div>
        )}
        <div className="border-brand-purple/10 mt-2 flex justify-between border-t pt-3">
          <dt className="text-brand-purple-dark font-display text-base font-bold">{texts.total}</dt>
          <dd className="text-brand-purple-dark font-display text-lg font-bold tabular-nums">
            {formatCOP(total)}
          </dd>
        </div>
        {loyaltyEarnPreview != null && loyaltyEarnPreview > 0 && !catalog && (
          <p className="text-brand-purple text-[11px] font-semibold">
            {texts.loyaltyEarn.replace("{n}", loyaltyEarnPreview.toLocaleString("es-CO"))}
          </p>
        )}
        {/* Incentivo de cuenta para invitados (2026-10-26 — decisión owner):
            el guest no tiene balance que redimir ni preview de puntos; el
            bloque le muestra lo que ganaría y lo lleva a /registro. El
            carrito vive en cookie de sesión, así que sobrevive al registro. */}
        {guestIncentive && guestTexts && !catalog && (
          <div className="border-brand-purple/15 from-brand-pink/10 to-brand-purple/10 mt-3 rounded-xl border bg-gradient-to-br p-3.5">
            <p className="text-brand-purple-dark text-xs font-bold">{guestTexts.title}</p>
            <p className="text-brand-purple-dark/80 mt-1 text-[11px] leading-snug">
              {guestTexts.body
                .replace("{puntos}", guestIncentive.earnPreviewPoints.toLocaleString("es-CO"))
                .replace("{valor}", formatCOP(guestIncentive.valueCents))}
            </p>
            {guestIncentive.referralsEnabled && (
              <p className="text-brand-muted mt-1 text-[11px] leading-snug">
                {guestTexts.referralNote}
              </p>
            )}
            <Link
              href="/registro"
              className="bg-brand-purple hover:bg-brand-purple-dark mt-2 inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm"
            >
              {guestTexts.cta}
            </Link>
            <p className="text-brand-muted mt-1.5 text-[10px] italic">{guestTexts.cartNote}</p>
          </div>
        )}
        <p className="text-brand-muted mt-1 text-[10px]">
          {catalog ? texts.noteCatalog : texts.noteFinal}
        </p>
      </dl>
    </aside>
  );
}

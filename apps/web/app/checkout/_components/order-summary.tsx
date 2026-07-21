/*
 * Resumen del pedido — sticky sidebar visible en todos los steps.
 * Muestra items + subtotal + envío (si ya se eligió) + total.
 *
 * Etapa 1 (modo catálogo): no hay envío calculado ni cupones — la línea de
 * envío avisa que se coordina por WhatsApp y el total es el subtotal de
 * productos (la cotización se concreta en la conversación).
 */

import Image from "next/image";
import { ShoppingBag } from "lucide-react";
import { formatCOP } from "@/lib/format";
import { isCatalogMode } from "@/lib/store-mode";
import type { CartDetail } from "@/features/cart/service";

export function OrderSummary({
  cart,
  shippingCost,
  shippingLabel,
  discount,
  couponCode,
}: {
  cart: CartDetail;
  shippingCost?: number | null;
  shippingLabel?: string;
  discount?: number; // F1 — descuento por cupón (COP centavos)
  couponCode?: string;
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
        Tu pedido
        <span className="text-brand-muted ml-auto text-xs font-normal">
          {cart.itemCount} {cart.itemCount === 1 ? "producto" : "productos"}
        </span>
      </h2>

      {/* Items compactos */}
      <ul className="divide-brand-purple/10 max-h-60 divide-y overflow-y-auto">
        {cart.items.map((item) => {
          const imgUrl = item.designPreviewUrl ?? item.imageUrl ?? "/placeholder.png";
          return (
            <li key={item.itemId} className="flex items-start gap-3 py-3">
              <div className="bg-brand-purple/5 relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg">
                <Image src={imgUrl} alt="" fill sizes="48px" className="object-cover" unoptimized />
                <span className="bg-brand-purple-dark/85 absolute top-0 right-0 inline-flex h-5 min-w-5 items-center justify-center rounded-bl-md px-1 text-[10px] font-bold text-white">
                  {item.qty}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-brand-purple-dark line-clamp-2 text-xs leading-snug font-medium">
                  {item.productName}
                </p>
                {item.isPersonalizable && item.designPreviewUrl && (
                  <p className="text-brand-muted text-[10px]">Personalizado</p>
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
          <dt className="text-brand-purple-dark/70">Subtotal</dt>
          <dd className="text-brand-purple-dark font-medium tabular-nums">{formatCOP(subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-brand-purple-dark/70">Envío</dt>
          <dd className="text-brand-purple-dark/85 text-right tabular-nums">
            {catalog ? (
              <span className="text-brand-muted text-xs italic">Se coordina por WhatsApp</span>
            ) : shipping === null ? (
              <span className="text-brand-muted text-xs italic">Se calcula al elegir envío</span>
            ) : shipping === 0 ? (
              <span className="font-semibold text-emerald-700">Gratis</span>
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
              Descuento
              {couponCode && <span className="ml-1 font-semibold">({couponCode})</span>}
            </dt>
            <dd className="font-semibold text-emerald-700 tabular-nums">
              −{formatCOP(appliedDiscount)}
            </dd>
          </div>
        )}
        <div className="border-brand-purple/10 mt-2 flex justify-between border-t pt-3">
          <dt className="text-brand-purple-dark font-display text-base font-bold">Total</dt>
          <dd className="text-brand-purple-dark font-display text-lg font-bold tabular-nums">
            {formatCOP(total)}
          </dd>
        </div>
        <p className="text-brand-muted mt-1 text-[10px]">
          {catalog
            ? "Precios en pesos colombianos (COP) · el envío se coordina por WhatsApp al confirmar tu cotización"
            : "Precios en pesos colombianos (COP) · el total es el valor final que pagas"}
        </p>
      </dl>
    </aside>
  );
}

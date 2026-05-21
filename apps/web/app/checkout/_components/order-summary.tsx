/*
 * Resumen del pedido — sticky sidebar visible en todos los steps.
 * Muestra items + subtotal + envío (si ya se eligió) + total.
 */

import Image from "next/image";
import { ShoppingBag } from "lucide-react";
import { formatCOP } from "@/lib/format";
import type { CartDetail } from "@/features/cart/service";

export function OrderSummary({
  cart,
  shippingCost,
  shippingLabel,
}: {
  cart: CartDetail;
  shippingCost?: number | null;
  shippingLabel?: string;
}) {
  const subtotal = cart.subtotal;
  const shipping = shippingCost ?? null;
  const total = subtotal + (shipping ?? 0);

  return (
    <aside className="border-brand-purple/15 sticky top-24 rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-brand-purple-dark font-display mb-4 flex items-center gap-2 text-base font-bold">
        <ShoppingBag className="h-4 w-4" />
        Tu pedido
        <span className="text-brand-purple-dark/55 ml-auto text-xs font-normal">
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
                  <p className="text-brand-purple/70 text-[10px]">Personalizado</p>
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
            {shipping === null ? (
              <span className="text-brand-purple-dark/45 text-xs italic">Calculado en step 2</span>
            ) : shipping === 0 ? (
              <span className="font-semibold text-emerald-700">Gratis</span>
            ) : (
              <>
                {formatCOP(shipping)}
                {shippingLabel && (
                  <span className="text-brand-purple-dark/55 block text-[10px] font-normal">
                    {shippingLabel}
                  </span>
                )}
              </>
            )}
          </dd>
        </div>
        <div className="border-brand-purple/10 mt-2 flex justify-between border-t pt-3">
          <dt className="text-brand-purple-dark font-display text-base font-bold">Total</dt>
          <dd className="text-brand-purple-dark font-display text-lg font-bold tabular-nums">
            {formatCOP(total)}
          </dd>
        </div>
        <p className="text-brand-purple-dark/55 mt-1 text-[10px]">IVA incluido (Colombia)</p>
      </dl>
    </aside>
  );
}

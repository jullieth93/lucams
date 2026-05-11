/*
 * Storefront — Carrito.
 *
 * Lista los items del cart anon (o del cart del customer si está
 * logueado). Controles: editar qty (form con +/-/input), remover ítem.
 * CTA de checkout disabled — Phase 3.
 *
 * Si no hay cart o está vacío → empty state.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Minus, Plus, Sparkles, Trash2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getCartDetail } from "@/features/cart/service";
import { formatCOP } from "@/lib/format";
import { peekCartSession } from "@/lib/cart-session";
import { removeItemAction, updateQtyAction } from "./actions";

export const metadata: Metadata = {
  title: "Carrito",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function CarritoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const justAdded = sp.added === "1";
  const errorMsg = typeof sp.error === "string" ? sp.error : null;

  const sessionId = await peekCartSession();
  const cart = sessionId ? await getCartDetail(sessionId) : null;

  return (
    <div className="flex min-h-screen flex-col bg-brand-cream">
      <SiteHeader />

      <main className="flex-1 px-6 py-8 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-6 font-display text-3xl text-brand-purple-dark sm:text-4xl">
            Tu carrito
          </h1>

          {justAdded && (
            <div className="mb-4 rounded-md border border-brand-turquoise/30 bg-brand-turquoise/10 px-4 py-3 text-sm text-brand-purple-dark">
              ✨ Producto agregado al carrito.
            </div>
          )}
          {errorMsg && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          {!cart || cart.items.length === 0 ? (
            <EmptyCart />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <ul className="md:col-span-2 space-y-3">
                {cart.items.map((item) => (
                  <li
                    key={item.itemId}
                    className="flex gap-4 rounded-xl border border-brand-purple/10 bg-white p-3"
                  >
                    <div className="aspect-square h-24 w-24 flex-shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-brand-turquoise/15 via-brand-cream to-brand-pink/15">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageUrl}
                          alt={item.productName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Sparkles className="h-7 w-7 text-brand-purple/40" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Link
                            href={`/producto/${item.productSlug}`}
                            className="font-semibold text-brand-purple-dark hover:text-brand-purple"
                          >
                            {item.productName}
                          </Link>
                          {item.isPersonalizable && (
                            <p className="text-xs text-brand-purple/70">
                              Personalizable
                            </p>
                          )}
                          <p className="mt-1 text-sm text-brand-purple-dark/70 tabular-nums">
                            {formatCOP(item.unitPrice)} c/u
                          </p>
                        </div>
                        <form action={removeItemAction}>
                          <input type="hidden" name="itemId" value={item.itemId} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            className="text-red-700 hover:bg-red-50"
                            aria-label={`Quitar ${item.productName}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </form>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <QtyControls itemId={item.itemId} qty={item.qty} />
                        <span className="font-bold text-brand-purple-dark tabular-nums">
                          {formatCOP(item.lineTotal)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <aside className="space-y-3 self-start rounded-xl border border-brand-purple/10 bg-white p-5">
                <h2 className="font-display text-lg text-brand-purple-dark">
                  Resumen
                </h2>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-brand-purple-dark/70">
                    <span>
                      Subtotal ({cart.itemCount}{" "}
                      {cart.itemCount === 1 ? "ítem" : "ítems"})
                    </span>
                    <span className="tabular-nums">
                      {formatCOP(cart.subtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-brand-purple-dark/60">
                    <span>Envío</span>
                    <span>Calculado en checkout</span>
                  </div>
                </div>
                <div className="flex justify-between border-t border-brand-purple/10 pt-3 text-lg font-bold text-brand-purple-dark">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCOP(cart.subtotal)}</span>
                </div>
                <Button
                  type="button"
                  className="w-full bg-brand-purple text-white hover:bg-brand-purple-dark"
                  size="lg"
                  disabled
                  title="Checkout en construcción"
                >
                  Ir a pagar (próximamente)
                </Button>
                <Link
                  href="/productos"
                  className="block text-center text-sm text-brand-purple-dark/70 hover:text-brand-purple"
                >
                  ← Seguir comprando
                </Link>
              </aside>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function EmptyCart() {
  return (
    <div className="rounded-xl border border-brand-purple/10 bg-white px-6 py-16 text-center">
      <Sparkles className="mx-auto h-10 w-10 text-brand-purple/40" />
      <p className="mt-4 text-lg font-semibold text-brand-purple-dark">
        Tu carrito está vacío
      </p>
      <p className="mt-1 text-sm text-brand-purple-dark/60">
        Encuentra el imán perfecto para tu nevera.
      </p>
      <Link
        href="/productos"
        className="mt-4 inline-block rounded-full bg-brand-purple px-5 py-2 text-sm font-semibold text-white hover:bg-brand-purple-dark"
      >
        Ver catálogo →
      </Link>
    </div>
  );
}

function QtyControls({ itemId, qty }: { itemId: string; qty: number }) {
  return (
    <div className="inline-flex items-center rounded-md border border-brand-purple/20 bg-white">
      <form action={updateQtyAction}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="qty" value={qty - 1} />
        <button
          type="submit"
          className="flex h-8 w-8 items-center justify-center text-brand-purple-dark hover:bg-brand-purple/10 disabled:opacity-40"
          aria-label="Disminuir cantidad"
          disabled={qty <= 1}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
      </form>
      <span className="w-8 text-center text-sm font-semibold tabular-nums text-brand-purple-dark">
        {qty}
      </span>
      <form action={updateQtyAction}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="qty" value={qty + 1} />
        <button
          type="submit"
          className="flex h-8 w-8 items-center justify-center text-brand-purple-dark hover:bg-brand-purple/10 disabled:opacity-40"
          aria-label="Aumentar cantidad"
          disabled={qty >= 99}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}

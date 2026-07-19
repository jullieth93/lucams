/*
 * Storefront — Carrito.
 *
 * Lista los items del cart anon (o del cart del customer si está
 * logueado). Controles: editar qty (form con +/-/input), remover ítem.
 * CTA "Ir a pagar" → /checkout/datos (F2.1 — Fase 2 checkout).
 *
 * Si no hay cart o está vacío → empty state.
 */

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Sparkles, Trash2 } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getCartDetail } from "@/features/cart/service";
import { CartCrossSell } from "@/components/cart-cross-sell";
import { CmsText } from "@/components/cms/cms-text";
import { formatCOP } from "@/lib/format";
import { peekCartSession } from "@/lib/cart-session";
import { removeItemAction, updateQtyAction } from "./actions";

export const metadata: Metadata = {
  title: "Carrito",
};

export default async function CarritoPage() {
  // RouteToasts en app/layout.tsx maneja ?added=1 y ?error=... como
  // toast sonner, así que acá ya no rendereamos los banners inline.
  const sessionId = await peekCartSession();
  const cart = sessionId ? await getCartDetail(sessionId) : null;

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <SiteHeader />

      <main id="contenido" tabIndex={-1} className="flex-1 px-6 py-8 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <h1 className="font-display text-brand-purple-dark mb-6 text-3xl sm:text-4xl">
            Tu carrito
          </h1>

          {!cart || cart.items.length === 0 ? (
            <EmptyCart />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <ul className="space-y-3 md:col-span-2">
                {cart.items.map((item) => (
                  <li
                    key={item.itemId}
                    className="border-brand-purple/10 flex gap-4 rounded-xl border bg-white p-3"
                  >
                    <div className="from-brand-turquoise/15 via-brand-cream to-brand-pink/15 relative aspect-square h-24 w-24 flex-shrink-0 overflow-hidden rounded-md bg-gradient-to-br">
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt=""
                          fill
                          sizes="96px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Sparkles className="text-brand-muted h-7 w-7" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Link
                            href={`/producto/${item.productSlug}`}
                            className="text-brand-purple-dark hover:text-brand-purple font-semibold"
                          >
                            {item.productName}
                          </Link>
                          {item.designId ? (
                            <p className="text-brand-purple/80 text-xs font-medium">
                              ✨ Tu diseño ·{" "}
                              <Link
                                href={`/estudio/${item.productSlug}?designId=${item.designId}`}
                                className="text-brand-purple-dark hover:text-brand-purple underline"
                              >
                                Editar
                              </Link>
                            </p>
                          ) : (
                            item.isPersonalizable && (
                              <p className="text-brand-muted text-xs">Personalizable</p>
                            )
                          )}
                          <p className="text-brand-purple-dark/70 mt-1 text-sm tabular-nums">
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
                        <span className="text-brand-purple-dark font-bold tabular-nums">
                          {formatCOP(item.lineTotal)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <aside className="border-brand-purple/10 space-y-3 self-start rounded-xl border bg-white p-5">
                <h2 className="font-display text-brand-purple-dark text-lg">Resumen</h2>
                <div className="space-y-1 text-sm">
                  <div className="text-brand-purple-dark/70 flex justify-between">
                    <span>
                      Subtotal ({cart.itemCount} {cart.itemCount === 1 ? "ítem" : "ítems"})
                    </span>
                    <span className="tabular-nums">{formatCOP(cart.subtotal)}</span>
                  </div>
                  <div className="text-brand-muted flex justify-between">
                    <span>Envío</span>
                    <span>Calculado en checkout</span>
                  </div>
                </div>
                <div className="border-brand-purple/10 text-brand-purple-dark flex justify-between border-t pt-3 text-lg font-bold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCOP(cart.subtotal)}</span>
                </div>
                {/* prefetch={false}: /checkout/datos depende del estado MUTABLE del
                    carrito y redirige a /carrito si lo ve vacío. En prod, el prefetch
                    del Link puede cachear ese redirect (si corre en un instante donde
                    el carrito luce vacío — p.ej. read-after-write tras agregar) → "Ir
                    a pagar" rebotaría. Sin prefetch, el clic siempre evalúa fresco.
                    Investigado con E2E (Lucy 2026-06-29). */}
                {/* #31 — un solo interactivo: Button asChild renderiza el <a> (evita <button> dentro
                  de <a>, HTML inválido). */}
                <Button
                  asChild
                  className="bg-gradient-brand w-full text-white hover:brightness-110"
                  size="lg"
                >
                  <Link href="/checkout/datos" prefetch={false}>
                    Ir a pagar →
                  </Link>
                </Button>
                <Link
                  href="/productos"
                  className="text-brand-purple-dark/70 hover:text-brand-purple block text-center text-sm"
                >
                  ← Seguir comprando
                </Link>
              </aside>
            </div>
          )}

          {/* PLAN_CATALOG_V2 6.3 — Cross-sell por ocasión dominante */}
          {cart && cart.items.length > 0 && (
            <CartCrossSell productSlugsInCart={cart.items.map((i) => i.productSlug)} />
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function EmptyCart() {
  return (
    <div className="border-brand-purple/10 rounded-xl border bg-white px-6 py-16 text-center">
      <Sparkles className="text-brand-muted mx-auto h-10 w-10" />
      <p className="text-brand-purple-dark mt-4 text-lg font-semibold">
        <CmsText blockKey="cart.empty.title" fallback="Tu carrito está vacío" />
      </p>
      <p className="text-brand-muted mt-1 text-sm">
        <CmsText
          blockKey="cart.empty.description"
          fallback="Encuentra el imán perfecto para tu nevera."
        />
      </p>
      <Link
        href="/productos"
        className="bg-brand-purple hover:bg-brand-purple-dark mt-4 inline-block rounded-full px-5 py-2 text-sm font-semibold text-white"
      >
        Ver catálogo →
      </Link>
    </div>
  );
}

function QtyControls({ itemId, qty }: { itemId: string; qty: number }) {
  return (
    <div className="border-brand-purple/20 inline-flex items-center rounded-md border bg-white">
      <form action={updateQtyAction}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="qty" value={qty - 1} />
        <button
          type="submit"
          className="text-brand-purple-dark hover:bg-brand-purple/10 flex h-8 w-8 items-center justify-center disabled:opacity-40"
          aria-label="Disminuir cantidad"
          disabled={qty <= 1}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
      </form>
      <span className="text-brand-purple-dark w-8 text-center text-sm font-semibold tabular-nums">
        {qty}
      </span>
      <form action={updateQtyAction}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="qty" value={qty + 1} />
        <button
          type="submit"
          className="text-brand-purple-dark hover:bg-brand-purple/10 flex h-8 w-8 items-center justify-center disabled:opacity-40"
          aria-label="Aumentar cantidad"
          disabled={qty >= 99}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}

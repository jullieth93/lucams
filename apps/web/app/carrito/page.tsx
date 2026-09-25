/*
 * Storefront — Carrito.
 *
 * Lista los items del cart anon (o del cart del customer si está
 * logueado). Controles: editar qty (form con +/-/input) SOLO en líneas de
 * catálogo simple — las personalizadas (designId) muestran las unidades del
 * diseño como texto y ofrecen "Editar" (Estudio) y "Ver" (lightbox del
 * preview); remover ítem en todas.
 * CTA principal → /checkout/datos: "Ir a pagar" en modo full; "Cotizar
 * por WhatsApp" en modo catálogo (Etapa 1 — features/quotes).
 *
 * Si no hay cart o está vacío → empty state.
 */

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Minus, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getCartDetail } from "@/features/cart/service";
import { CartCrossSell } from "@/components/cart-cross-sell";
import { CmsText } from "@/components/cms/cms-text";
import { formatCOP } from "@/lib/format";
import { isCatalogMode } from "@/lib/store-mode";
import { peekCartSession } from "@/lib/cart-session";
import { removeItemAction, updateQtyAction } from "./actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { IconSubmitButton } from "./qty-button";
import { DesignPreviewDialog } from "./design-preview-dialog";

export const metadata: Metadata = {
  title: "Carrito",
  robots: { index: false, follow: false },
};

export default async function CarritoPage() {
  // RouteToasts en app/layout.tsx maneja ?added=1 y ?error=... como
  // toast sonner, así que acá ya no rendereamos los banners inline.
  const sessionId = await peekCartSession();
  const cart = sessionId ? await getCartDetail(sessionId) : null;
  // Etapa 1 (modo catálogo): el CTA principal pide cotización por WhatsApp
  // (misma ruta /checkout/datos, que en este modo es el form de cotización).
  const catalog = isCatalogMode();

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
                            <div className="mt-1 flex flex-col gap-1.5">
                              <p className="text-brand-purple/80 text-xs font-medium">
                                <CmsText blockKey="cart.diseno-badge" fallback="✨ Tu diseño" />
                              </p>
                              {/* QA owner 2026-09-25 — "Editar" era un texto con forma
                                  de enlace; ahora es un botón outline real (mismo href
                                  al Estudio). "Ver" abre el lightbox con el preview del
                                  diseño (DesignPreviewDialog, client — sus textos bajan
                                  resueltos por props porque el client no lee el CMS). */}
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  asChild
                                  variant="outline"
                                  size="sm"
                                  className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/10 hover:text-brand-purple-dark"
                                >
                                  <Link
                                    href={`/estudio/${item.productSlug}?designId=${item.designId}`}
                                  >
                                    <Pencil aria-hidden="true" />
                                    Editar
                                  </Link>
                                </Button>
                                {item.designPreviewUrl && (
                                  <DesignPreviewDialog
                                    previewUrl={item.designPreviewUrl}
                                    productName={item.productName}
                                    triggerLabel={
                                      <CmsText blockKey="cart.ver-diseno" fallback="Ver" />
                                    }
                                    title={
                                      <CmsText
                                        blockKey="cart.vista-previa-diseno-titulo"
                                        fallback="Tu diseño ·"
                                      />
                                    }
                                    description={
                                      <CmsText
                                        blockKey="cart.vista-previa-diseno-desc"
                                        fallback="Vista previa ampliada del diseño personalizado de esta línea del carrito."
                                      />
                                    }
                                  />
                                )}
                              </div>
                            </div>
                          ) : (
                            item.isPersonalizable && (
                              <p className="text-brand-muted text-xs">Personalizable</p>
                            )
                          )}
                          {item.borderNote && (
                            <p className="text-brand-muted text-xs">{item.borderNote}</p>
                          )}
                          {/* Resumen de pieza ("2 tiras de 3 fotos · 6.5×20 cm cada tira"):
                              mismo dato que muestra el checkout (quote-form) — multi-unidad
                              2026-09-09: la línea describe las unidades del diseño. */}
                          {item.pieceSummary && (
                            <p className="text-brand-purple-dark/80 mt-1 text-xs">
                              📐 {item.pieceSummary}
                            </p>
                          )}
                          <p className="text-brand-purple-dark/70 mt-1 text-sm tabular-nums">
                            {formatCOP(item.unitPrice)} c/u
                          </p>
                        </div>
                        <form action={removeItemAction}>
                          <input type="hidden" name="itemId" value={item.itemId} />
                          <SubmitButton
                            variant="ghost"
                            size="sm"
                            className="text-red-700 hover:bg-red-50"
                            aria-label={`Quitar ${item.productName}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </SubmitButton>
                        </form>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        {/* Modelo multi-unidad (QA owner 2026-09-25): una línea
                            personalizada tiene qty=1 y el diseño contiene N unidades
                            — subir qty duplicaría el pack entero (×5 → ×10) y el
                            cliente lo leía como error. Sin stepper: la cantidad se
                            muestra como texto (unidades del diseño × qty) y se cambia
                            editando el diseño. Líneas de catálogo simple conservan
                            el stepper. */}
                        {item.designId ? (
                          <DesignUnitsLabel units={item.designUnits} qty={item.qty} />
                        ) : (
                          <QtyControls itemId={item.itemId} qty={item.qty} />
                        )}
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
                    <span>{catalog ? "Se coordina por WhatsApp" : "Calculado en checkout"}</span>
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
                  className={
                    catalog
                      ? // a11y contraste: emerald-700 + blanco da 5.49:1 (AA); emerald-600 quedaba en 3.77:1.
                        "w-full bg-emerald-700 text-white hover:bg-emerald-800"
                      : "bg-gradient-brand w-full text-white hover:brightness-110"
                  }
                  size="lg"
                >
                  <Link href="/checkout/datos" prefetch={false}>
                    {catalog ? "Cotizar por WhatsApp →" : "Ir a pagar →"}
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
          fallback="Encuentra el producto perfecto para tu espacio."
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

/**
 * Línea personalizada (designId set): la cantidad NO se edita acá. Se muestra
 * el total de unidades físicas que recibirá el cliente: unidades del diseño
 * (designUnits, multi-unidad 2026-09-09) × qty de la línea (qty puede ser >1
 * por agrupación de diseños idénticos o copias legacy del flujo de nombre).
 */
function DesignUnitsLabel({ units, qty }: { units: number | null; qty: number }) {
  const total = (units ?? 1) * qty;
  return (
    <span className="text-brand-purple-dark/80 text-sm font-medium tabular-nums">
      {total} {total === 1 ? "unidad" : "unidades"}
    </span>
  );
}

function QtyControls({ itemId, qty }: { itemId: string; qty: number }) {
  return (
    <div className="border-brand-purple/20 inline-flex items-center rounded-md border bg-white">
      <form action={updateQtyAction}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="qty" value={qty - 1} />
        <IconSubmitButton
          className="text-brand-purple-dark hover:bg-brand-purple/10 flex h-11 w-11 items-center justify-center disabled:opacity-40"
          aria-label="Disminuir cantidad"
          disabled={qty <= 1}
        >
          <Minus className="h-3.5 w-3.5" />
        </IconSubmitButton>
      </form>
      <span className="text-brand-purple-dark w-8 text-center text-sm font-semibold tabular-nums">
        {qty}
      </span>
      <form action={updateQtyAction}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="qty" value={qty + 1} />
        <IconSubmitButton
          className="text-brand-purple-dark hover:bg-brand-purple/10 flex h-11 w-11 items-center justify-center disabled:opacity-40"
          aria-label="Aumentar cantidad"
          disabled={qty >= 99}
        >
          <Plus className="h-3.5 w-3.5" />
        </IconSubmitButton>
      </form>
    </div>
  );
}

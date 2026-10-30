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
import { physicalUnitPriceCents } from "@/features/cart/physical-unit-price";
import { CartCrossSell } from "@/components/cart-cross-sell";
import { CmsText } from "@/components/cms/cms-text";
import { formatCOP } from "@/lib/format";
import { isCatalogMode } from "@/lib/store-mode";
import { getCurrentCustomer } from "@/lib/auth";
import { peekCartSession } from "@/lib/cart-session";
import { removeItemAction, updateQtyAction } from "./actions";
import { TrackViewCart } from "@/components/analytics-trackers";
import { SubmitButton } from "@/components/ui/submit-button";
import { LinkPendingLabel } from "@/components/ui/link-pending-label";
import { IconSubmitButton } from "./qty-button";
import { DesignPreviewDialog } from "@/components/design-preview-dialog";
import { DesignUnitsBadge } from "@/components/design-units-badge";
import { dedupeCartLineDetail, type UnitNoun } from "@/features/cart/line-preview";

export const metadata: Metadata = {
  title: "Carrito",
  robots: { index: false, follow: false },
};

export default async function CarritoPage() {
  // RouteToasts en app/layout.tsx maneja ?added=1 y ?error=... como
  // toast sonner, así que acá ya no rendereamos los banners inline.
  const [sessionId, customer] = await Promise.all([peekCartSession(), getCurrentCustomer()]);
  const cart = sessionId ? await getCartDetail(sessionId, customer?.customer.id ?? null) : null;
  // Etapa 1 (modo catálogo): el CTA principal pide cotización por WhatsApp
  // (misma ruta /checkout/datos, que en este modo es el form de cotización).
  const catalog = isCatalogMode();

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      {/* GA4 view_cart (E09) — solo cuando hay ítems; no-op sin env/consent. */}
      {cart && cart.items.length > 0 && (
        <TrackViewCart
          valueCents={cart.subtotal}
          items={cart.items.map((i) => ({
            sku: i.variantSku,
            name: i.productName,
            variantName: i.variantName,
            priceCents: i.unitPrice,
            quantity: i.qty,
          }))}
        />
      )}
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
                {cart.items.map((item) => {
                  // 2026-10-29 (owner) — el detalle de la línea no repite hechos:
                  // cantidad/tamaño se enuncian UNA vez (variantName → breakdown
                  // → resumen de pieza; el primero que lo dice gana).
                  const detail = dedupeCartLineDetail({
                    variantName: item.variantName,
                    variantBreakdown: item.variantBreakdown,
                    pieceSummary: item.pieceSummary,
                  });
                  // Miniatura compartida entre el disparador clicable (diseños
                  // con preview) y el div estático (catálogo simple).
                  const thumb = (
                    <>
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt=""
                          fill
                          sizes="96px"
                          // Diseño personalizado: el preview es un MOSAICO de las
                          // piezas → object-contain con aire para no recortarlo
                          // (object-cover cuadrado se comía los bordes del
                          // diseño — line-preview.ts). Foto de catálogo: cover.
                          className={item.designId ? "object-contain p-1.5" : "object-cover"}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Sparkles className="text-brand-muted h-7 w-7" />
                        </div>
                      )}
                      {/* 2026-10-13 — «N <sustantivo>» sobre la miniatura cuando el
                          diseño trae varias piezas (el «Ver» pagina por unidad).
                          2026-10-26 — el fallback es kind-aware ("tiras", "sets"…);
                          el bloque CMS publicado manda sobre él cuando existe. */}
                      <DesignUnitsBadge
                        count={item.designPreviewPages?.length ?? 0}
                        label={
                          <CmsText blockKey="cart.unidades-badge" fallback={item.unitNoun.plural} />
                        }
                      />
                    </>
                  );
                  return (
                    <li
                      key={item.itemId}
                      className="border-brand-purple/10 flex gap-4 rounded-xl border bg-white p-3"
                    >
                      {item.designPreviewUrl ? (
                        // 2026-10-13 — la miniatura del diseño también abre el
                        // lightbox (además del botón «Ver»: Radix admite un solo
                        // trigger por Dialog, así que es una 2ª instancia del
                        // mismo componente con trigger personalizado).
                        <DesignPreviewDialog
                          previewUrl={item.designPreviewUrl}
                          pages={item.designPreviewPages}
                          pageLabels={item.designPreviewPageLabels}
                          watermarkNote={
                            item.designWatermarked ? (
                              <CmsText
                                blockKey="cart.vista-previa-watermark-nota"
                                fallback="Vista previa con marca de agua — tu impresión final no la lleva."
                              />
                            ) : null
                          }
                          productName={item.productName}
                          trigger={
                            <button
                              type="button"
                              aria-label={`Ver el diseño de ${item.productName}`}
                              className="from-brand-turquoise/15 via-brand-cream to-brand-pink/15 focus-visible:ring-brand-turquoise relative aspect-square h-24 w-24 flex-shrink-0 cursor-zoom-in overflow-hidden rounded-md bg-gradient-to-br focus-visible:ring-2 focus-visible:outline-none"
                            >
                              {thumb}
                            </button>
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
                      ) : (
                        <div className="from-brand-turquoise/15 via-brand-cream to-brand-pink/15 relative aspect-square h-24 w-24 flex-shrink-0 overflow-hidden rounded-md bg-gradient-to-br">
                          {thumb}
                        </div>
                      )}
                      <div className="flex flex-1 flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <Link
                              href={`/producto/${item.productSlug}`}
                              className="text-brand-purple-dark hover:text-brand-purple font-semibold"
                            >
                              {item.productName}
                            </Link>
                            {/* Paquete F (2026-10-02) — nombre de la variante + su desglose
                              estructurado (variantBreakdown): el nombre libre no siempre
                              informa las dimensiones de compra (p. ej. Con/Sin imán). */}
                            <p className="text-brand-muted mt-0.5 text-xs">{item.variantName}</p>
                            {detail.variantBreakdown.length > 0 && (
                              <p className="text-brand-purple-dark/80 mt-0.5 text-xs">
                                {detail.variantBreakdown.join(" · ")}
                              </p>
                            )}
                            {item.templateName && (
                              <p className="text-brand-purple-dark/80 mt-0.5 text-xs">
                                <CmsText blockKey="cart.plantilla-label" fallback="Plantilla" />:{" "}
                                {item.templateName}
                              </p>
                            )}
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
                                      // 2026-10-13 — páginas por unidad (watermark)
                                      // cuando el diseño las tiene: el "Ver" pagina
                                      // como la Vista Previa del Estudio.
                                      pages={item.designPreviewPages}
                                      pageLabels={item.designPreviewPageLabels}
                                      watermarkNote={
                                        item.designWatermarked ? (
                                          <CmsText
                                            blockKey="cart.vista-previa-watermark-nota"
                                            fallback="Vista previa con marca de agua — tu impresión final no la lleva."
                                          />
                                        ) : null
                                      }
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
                            {detail.pieceSummary && (
                              <p className="text-brand-purple-dark/80 mt-1 text-xs">
                                📐 {detail.pieceSummary}
                              </p>
                            )}
                            <UnitPriceLabel
                              unitPrice={item.unitPrice}
                              designUnits={item.designUnits}
                            />
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
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            {item.designId ? (
                              <DesignUnitsLabel
                                units={item.designUnits}
                                qty={item.qty}
                                noun={item.unitNoun}
                              />
                            ) : (
                              <QtyControls itemId={item.itemId} qty={item.qty} stock={item.stock} />
                            )}
                            <LowStockBadge qty={item.qty} stock={item.stock} />
                          </div>
                          <span className="text-brand-purple-dark font-bold tabular-nums">
                            {formatCOP(item.lineTotal)}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* 2026-10-13 — las miniaturas/previews de líneas personalizadas se
                  exhiben CON marca de agua (anti-copia); el aviso tranquila al
                  cliente: su impresión final no la lleva (decisión de producto). */}
              {cart.items.some((i) => i.designWatermarked) && (
                <p className="text-brand-muted mt-2 text-xs">
                  <CmsText
                    blockKey="cart.watermark-nota"
                    fallback="Las vistas previas de tus diseños llevan marca de agua — tu impresión final no la lleva."
                  />
                </p>
              )}

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
                    {/* Spinner mientras la navegación (sin prefetch) resuelve —
                        antes el clic no daba señal y el usuario re-clickeaba. */}
                    <LinkPendingLabel>
                      {catalog ? "Cotizar por WhatsApp →" : "Ir a pagar →"}
                    </LinkPendingLabel>
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
 * "c/u" de la línea (bug STG 2026-10): en líneas multi-unidad el unitPrice del
 * modelo es el precio del PACK (qty=1 × multiplicador de unidades), así que el
 * "c/u" correcto es por unidad FÍSICA (unitPrice / designUnits) — de lo
 * contrario "2 unidades" junto a "$5.000 c/u" contradecía el total de línea
 * ($5.000). Si la división no es exacta se omite el rótulo "c/u" (queda el
 * precio de la línea a secas): un c/u redondeado podría contradecir el total.
 * El dinero no cambia: lineTotal = qty × unitPrice sigue mandando.
 */
function UnitPriceLabel({
  unitPrice,
  designUnits,
}: {
  unitPrice: number;
  designUnits: number | null;
}) {
  const perUnit = physicalUnitPriceCents(unitPrice, designUnits);
  return (
    <p className="text-brand-purple-dark/70 mt-1 text-sm tabular-nums">
      {perUnit === null ? formatCOP(unitPrice) : `${formatCOP(perUnit)} c/u`}
    </p>
  );
}

/**
 * Línea personalizada (designId set): la cantidad NO se edita acá. Se muestra
 * el total de unidades físicas que recibirá el cliente: unidades del diseño
 * (designUnits, multi-unidad 2026-09-09) × qty de la línea (qty puede ser >1
 * por agrupación de diseños idénticos o copias legacy del flujo de nombre).
 * El sustantivo es el del tipo de producto ("2 tiras", "3 packs", "2 sets" —
 * unitNoun de la línea; antes todo decía "unidades").
 */
function DesignUnitsLabel({
  units,
  qty,
  noun,
}: {
  units: number | null;
  qty: number;
  noun: UnitNoun;
}) {
  const total = (units ?? 1) * qty;
  return (
    <span className="text-brand-purple-dark/80 text-sm font-medium tabular-nums">
      {total} {total === 1 ? noun.singular : noun.plural}
    </span>
  );
}

/**
 * Badge inline de stock bajo (2026-09-29): avisa antes del checkout que la
 * variante está por agotarse. Regla: stock < qty×2 (subir una más ya aprieta)
 * o stock ≤ 5 (piso absoluto). Con stock 0 la línea quedó "en vuelo" tras un
 * agotado — lo decimos explícito para que el cliente la ajuste o quite.
 */
function LowStockBadge({ qty, stock }: { qty: number; stock: number }) {
  if (stock <= 0) {
    return (
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        <CmsText blockKey="cart.stock-badge-agotado" fallback="Agotado" />
      </span>
    );
  }
  if (stock < qty * 2 || stock <= 5) {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
        <CmsText blockKey="cart.stock-badge-bajo" fallback="Solo quedan" /> {stock}
      </span>
    );
  }
  return null;
}

function QtyControls({ itemId, qty, stock }: { itemId: string; qty: number; stock: number }) {
  // Tope del stepper: el stock real de la variante (el 99 queda como límite
  // secundario). El server valida igual — esto solo evita el roundtrip con
  // error cuando el cliente llega al máximo disponible.
  const maxQty = Math.min(99, Math.max(stock, 1));
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
          disabled={qty >= maxQty}
        >
          <Plus className="h-3.5 w-3.5" />
        </IconSubmitButton>
      </form>
    </div>
  );
}

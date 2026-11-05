/*
 * /pedido/[token] — Vista pública de un pedido sin requerir login.
 *
 * Usado por guest checkout: el email transaccional incluye un link
 * https://lucamsshop.com/pedido/<token> con un token único de 32 hex chars
 * (Order.publicAccessTokenHash, F-11: en DB solo vive el hash sha256 del token).
 * El cliente entra y ve timeline + tracking sin autenticarse.
 *
 * Seguridad:
 *   - Token de 16 bytes (128 bits) random — imposible adivinar
 *   - Lookup por hash del token (la columna en claro ya no existe — F-11)
 *   - Vista read-only: NO permite editar nada
 *   - NO indexable (robots noindex)
 *
 * UI espejo de /mi-cuenta/pedidos/[number] pero sin los CTAs de cuenta.
 */

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Package, Truck, Wallet } from "lucide-react";
import {
  designPreviewDisplay,
  previewRefToAuthorizedUrl,
} from "@/features/personalization/preview-artifacts";
import { LucamsLogo } from "@/components/lucams-logo";
import { SITE_NAME } from "@/lib/site";
import { prisma } from "@/lib/db";
import { formatCOP, maskEmail } from "@/lib/format";
import { hashBearerToken } from "@/lib/token-hash";
import { carrierTrackingPageUrl } from "@/features/shipping/tracking-urls";
import { LUCAMS_CARRIER, carrierDisplayName } from "@/features/shipping/lucams-shipping";
import { letterSetBorderNote } from "@/features/personalization/letter-set-border";
import {
  designPreviewPageLabels,
  unitNounForLine,
} from "@/features/personalization/preview-page-labels";
import { unitCountNounForLine } from "@/features/cart/line-preview";
import { isBookmarkGalleryTag } from "@/app/estudio/[slug]/lib/product-kind";
import {
  describeVariantAttributes,
  parseVariantAttributes,
} from "@/features/products/variant-schemas";
import { buildWhatsAppUrl } from "@/lib/wa";
import { resolveFunnelEditorKind } from "@/features/analytics/funnel-schema";
import { DesignPreviewDialog } from "@/components/design-preview-dialog";
import { DesignUnitsBadge } from "@/components/design-units-badge";
import { TrackPurchase } from "@/components/analytics-trackers";
import {
  reorderGuestAction,
  requestGuestRetractAction,
  requestGuestWarrantyAction,
  submitGuestOrderSupportAction,
} from "./actions";
import { ReorderControl, type ReorderTexts } from "@/components/orders/reorder-control";
import { GuestOrderSupportCard } from "@/components/orders/guest-order-support";
import { getRetractableItemsByOrderToken } from "@/features/retract/service";
import { getWarrantyItemsByOrderToken } from "@/features/warranty/service";
import { RetractControl } from "@/app/mi-cuenta/pedidos/[number]/retract-control";
import { WarrantyControl } from "@/app/mi-cuenta/pedidos/[number]/warranty-control";
import { getAccountTexts } from "@/app/mi-cuenta/account-texts.server";
import { formatDateLongCO, formatDateTimeCO } from "@/lib/datetime";
import { humanizeCarrierStatus, listShipmentEvents } from "@/features/shipping/shipment-events";

export const metadata: Metadata = {
  // noindex: la URL es de un solo uso y trae un token opaco.
  title: "Mi pedido",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Esperando pago",
  PAID: "Pagado",
  FULFILLING: "En preparación",
  SHIPPED: "Enviado",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
  REFUNDED: "Reembolsado",
};

const TIMELINE_STEPS = [
  { key: "PAID", label: "Pagado" },
  { key: "FULFILLING", label: "Preparando" },
  { key: "SHIPPED", label: "En camino" },
  { key: "DELIVERED", label: "Entregado" },
] as const;

// Etiquetas humanas para los hitos del carrier cuando el evento no trae descripción.
const SHIPMENT_EVENT_LABEL: Record<string, string> = {
  PENDING: "Guía registrada",
  DISPATCHED: "Despachado de nuestra tienda",
  IN_TRANSIT: "En tránsito",
  DELIVERED: "Entregado",
  RETURNED: "Devuelto a origen",
  EXCEPTION: "Novedad en la entrega",
};

function timelineProgress(status: string): number {
  const idx = TIMELINE_STEPS.findIndex((s) => s.key === status);
  if (idx >= 0) return idx;
  return -1;
}

/**
 * Revalidación 2026-10-20 (feedback owner en /pedido) — el timeline solo cubre el
 * happy path (Pagado→Entregado), pero una orden puede quedar SHIPPED/FULFILLING
 * con una NOVEDAD o DEVOLUCIÓN del carrier (la saga no auto-transiciona esos
 * estados: los marca needsReconciliation + avisa al admin, decisión humana). Sin
 * este banner el cliente veía "En camino" para siempre sin señal del problema.
 * Deriva el tipo desde reconciliationReason (texto que escribe NUESTRA saga:
 * "Envío DEVUELTO (…)" / "Envío con novedad (…)") — solo aplica a órdenes ya
 * pagadas con guía (una reconciliación de pago NO debe pintar banner de envío).
 */
function shippingIssueKind(order: {
  status: string;
  trackingNumber: string | null;
  needsReconciliation: boolean;
  reconciliationReason: string | null;
}): "returned" | "exception" | null {
  if (!order.needsReconciliation || !order.trackingNumber) return null;
  if (!["PAID", "FULFILLING", "SHIPPED"].includes(order.status)) return null;
  const reason = order.reconciliationReason ?? "";
  if (/devuelto|devoluci[oó]n/i.test(reason)) return "returned";
  if (/novedad/i.test(reason)) return "exception";
  return null;
}

type ShippingAddrSnapshot = {
  fullName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  department?: string;
  zip?: string;
  notes?: string;
};

export default async function PublicOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ nueva?: string }>;
}) {
  const { token } = await params;
  const { nueva } = await searchParams;

  // Validación token: debe ser 32 hex chars (anti-fuzzing, evita query DB con basura).
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();

  const order = await prisma.order.findFirst({
    where: { publicAccessTokenHash: hashBearerToken(token), deletedAt: null },
    include: {
      items: {
        include: {
          variant: {
            select: {
              id: true,
              name: true,
              sku: true,
              // Paquete F (2026-10-02) — attributes: desglose estructurado de la variante.
              attributes: true,
              product: {
                select: {
                  slug: true,
                  sku: true,
                  name: true,
                  isPersonalizable: true,
                  personalizationKind: true,
                  personalizationSchema: true,
                },
              },
            },
          },
          design: {
            // 2026-10-13 — sellos de artefactos watermark: el pedido público
            // exhibe la versión con marca de agua (y sus páginas por unidad).
            // 2026-10-22 — canvasData: rótulos por unidad del pager (metadata
            // ya se seleccionaba para la nota de borde).
            select: {
              previewUrl: true,
              metadata: true,
              canvasData: true,
              previewWatermarkedAt: true,
              previewPagesCount: true,
            },
          },
        },
      },
    },
  });
  if (!order) notFound();

  const ship = order.shippingAddress as ShippingAddrSnapshot;
  const progress = timelineProgress(order.status);
  const isCancelled = order.status === "CANCELLED" || order.status === "REFUNDED";
  // Historial granular del carrier (ShipmentEvent, 2026-11-04): hitos reales de la
  // guía con fecha/hora de Colombia y descripción — enriquece la barra de progreso.
  // Solo aplica a guías de transportadora (nunca a "Envío Lucams" INTERNO-*).
  const shipmentEvents =
    order.trackingNumber && order.shippingCarrier !== LUCAMS_CARRIER
      ? await listShipmentEvents(order.id)
      : [];
  // Entrega propia "Envío Lucams" (trackingNumber INTERNO-*): NO hay guía de
  // transportadora ni rastreo externo — el estado se muestra en lenguaje claro
  // con los datos internos (nunca se consulta Aveonline para estas órdenes).
  const isInternalDelivery = order.shippingCarrier === LUCAMS_CARRIER;
  // #2 — contraentrega: el cliente aún NO ha pagado (paga en efectivo al recibir). No mostrar
  // "Pagado"; usar "Confirmado" + un aviso persistente del monto a pagar hasta que se entregue.
  const isCod = order.paymentMethod === "COD";
  const statusText =
    isCod && order.status === "PAID"
      ? "Confirmado"
      : isInternalDelivery && order.status === "SHIPPED"
        ? "En camino con nuestro equipo"
        : (STATUS_LABEL[order.status] ?? order.status);
  const showCodBanner = isCod && !isCancelled && order.status !== "DELIVERED";
  // #5 — PENDING_PAYMENT no es un callejón sin salida: en vez del timeline gris mudo, un banner
  // ámbar que explica ("estamos confirmando tu pago") + salida a WhatsApp para resolver.
  const isPending = order.status === "PENDING_PAYMENT";
  // Novedad/devolución del carrier: la orden no retrocede de estado (decisión de
  // la saga) pero el cliente SÍ debe ver que algo pasa — banner honesto con salida
  // a WhatsApp, al lado del timeline que de otro modo quedaría "En camino" eterno.
  const shippingIssue = shippingIssueKind(order);
  // [CX-01] — mantener canal de ayuda activo en todos los estados no cancelados (incluido
  // `DELIVERED`, donde antes `waUrl` era null y el comprador invitado quedaba sin salida posventa).
  const [waUrl, retractable, warrantyItems, accountTexts] = await Promise.all([
    !isCancelled ? buildWhatsAppUrl({ kind: "order", orderNumber: order.number }) : null,
    order.status === "DELIVERED" ? getRetractableItemsByOrderToken(token) : [],
    order.status === "DELIVERED" ? getWarrantyItemsByOrderToken(token) : [],
    order.status === "DELIVERED" ? getAccountTexts() : null,
  ]);
  const retractByItem = new Map(retractable.map((r) => [r.orderItemId, r]));
  const warrantyByItem = new Map(warrantyItems.map((w) => [w.orderItemId, w]));

  const itemsHeading = `Lo que pediste (${order.items.length})`;
  const accountCtaBody =
    "Crea una cuenta con el email {email} y vas a tener historial, direcciones guardadas y descuentos exclusivos.";
  const codBanner = "Pagas {total} en efectivo cuando el mensajero te entregue el pedido.";

  // Paquete I — textos del "Volver a pedir" (mismos defaults es-CO que mi-cuenta).
  const showReorder = !isCancelled && !isPending;
  const reorderTexts: ReorderTexts | null = showReorder
    ? {
        cta: "Volver a pedir",
        pending: "Armando tu carrito…",
        addedTitle: "Agregamos a tu carrito:",
        needsPhotosTitle: "Para repetir estos, sube las fotos de nuevo:",
        needsPhotosNote:
          "Por privacidad borramos las fotos de los pedidos entregados hace más de 90 días.",
        photosCta: "Crearlo de nuevo",
        unavailableTitle: "Ya no pudimos agregar:",
        goToCart: "Ir al carrito",
        priceNow: "ahora {precio}",
        priceWas: "antes {precio}",
      }
    : null;

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <header className="border-brand-purple/10 border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2">
            <LucamsLogo variant="full" size={36} />
            <span className="text-brand-purple-dark font-display text-lg font-bold">
              {SITE_NAME}
            </span>
          </Link>
          <Link
            href="/productos"
            className="text-brand-purple-dark/70 hover:text-brand-purple text-xs font-medium"
          >
            Ver catálogo →
          </Link>
        </div>
      </header>

      <main id="contenido" tabIndex={-1} className="flex-1 px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-3xl">
          {nueva === "1" && !isCancelled && (
            <>
              {/* GA4 purchase ([ANA-01] / S06): las compras COD redirigen acá con ?nueva=1
                  y nunca pasan por /checkout/gracias. Idempotente por order.number en
                  localStorage y sin un solo dato personal ni token en el evento. */}
              {!isPending && (
                <TrackPurchase
                  transactionId={order.number}
                  valueCents={order.total}
                  shippingCents={order.shipping}
                  taxCents={order.tax}
                  items={order.items.map((it) => ({
                    sku: it.variant.sku || it.variant.product.sku,
                    name: it.variant.product.name,
                    variantName: it.variant.name,
                    priceCents: it.unitPrice,
                    quantity: it.qty,
                  }))}
                  funnelLines={order.items.map((it) => ({
                    productSlug: it.variant.product.slug,
                    editorKind: resolveFunnelEditorKind({
                      isPersonalizable: it.variant.product.isPersonalizable,
                      personalizationKind: it.variant.product.personalizationKind,
                      productSchema: it.variant.product.personalizationSchema,
                      variantAttrs: it.variant.attributes,
                      designMetadata: it.design?.metadata,
                    }),
                  }))}
                />
              )}
              <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="font-display text-lg font-bold text-emerald-900">
                  🎉 ¡Pedido confirmado!
                </p>
                <p className="mt-0.5 text-sm text-emerald-800">
                  {/* #2 — el detalle COD lo lleva el aviso persistente de abajo; aquí solo el saludo. */}
                  Te enviamos los detalles y el seguimiento a tu correo. ¡Gracias por tu compra!
                </p>
              </div>
            </>
          )}

          {/* #5 — pago en verificación (PSE/transferencia async, o webhook demorado): explica y da
            salida a WhatsApp, en vez de dejar el timeline gris mudo. */}
          {isPending && (
            <div role="note" className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Estamos confirmando tu pago</p>
              <p className="mt-1 text-xs text-amber-800">
                Esto puede tardar unos minutos (algunos métodos como PSE o transferencia son así).
                Cuando lo confirmemos te llega un correo y aquí verás el avance. ¿Tienes dudas?
              </p>
              {waUrl && (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                >
                  Escríbenos por WhatsApp
                </a>
              )}
            </div>
          )}

          {/* #2 — aviso de contraentrega persistente (no depende de ?nueva=1): recuerda que el pago
            es en efectivo al recibir, para no confundir "Confirmado" con "ya pagado". */}
          {showCodBanner && (
            <div
              role="note"
              className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"
            >
              <Wallet className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" aria-hidden />
              <p className="text-sm text-amber-900">
                {withStrong(codBanner, "{total}", formatCOP(order.total))}
              </p>
            </div>
          )}

          <header className="mb-6">
            <p className="text-brand-muted text-xs tracking-wider uppercase">Tu pedido</p>
            <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
              {order.number}
            </h1>
            <p className="text-brand-muted mt-1 text-sm">
              {formatDateLongCO(order.createdAt)} · {statusText}
            </p>
          </header>

          {!isCancelled && !isPending && (
            <div className="border-brand-purple/15 mb-6 rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-brand-purple-dark mb-4 text-sm font-bold">Estado de tu pedido</h2>
              {/* Novedad/devolución del carrier (revalidación 2026-10-20): el timeline
                  no retrocede, pero el cliente debe VER que hay un problema logístico
                  en vez de un "En camino" eterno. */}
              {shippingIssue && (
                <div
                  role="alert"
                  className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4"
                >
                  <p className="text-sm font-semibold text-amber-900">
                    {shippingIssue === "returned"
                      ? "Tu pedido viene de vuelta con nosotros"
                      : "Tu envío tiene una novedad"}
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    La transportadora reportó un inconveniente con la entrega. Ya lo estamos
                    gestionando y te contactaremos; si quieres escribirnos antes, estamos atentos.
                  </p>
                  {waUrl && (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                    >
                      Escríbenos por WhatsApp
                    </a>
                  )}
                </div>
              )}
              <ol className="flex justify-between">
                {TIMELINE_STEPS.map((s, i) => {
                  const done = progress >= i;
                  const active = progress === i;
                  // #2 — en COD el primer paso es "Confirmado" (no "Pagado": aún no pagó).
                  const label = i === 0 && isCod ? "Confirmado" : s.label;
                  return (
                    <li key={s.key} className="flex flex-1 flex-col items-center">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                          done ? "bg-brand-purple text-white" : "bg-slate-100 text-slate-400"
                        } ${active ? "ring-brand-purple/30 ring-4" : ""}`}
                      >
                        {i + 1}
                      </div>
                      <span
                        className={`mt-2 text-center text-[10px] font-medium ${
                          done ? "text-brand-purple-dark" : "text-brand-muted"
                        }`}
                      >
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ol>

              {/* Historial granular del carrier (ShipmentEvent, 2026-11-04): hitos
                  reales de la guía con fecha/hora de Colombia y descripción de la
                  transportadora — más reciente primero. */}
              {shipmentEvents.length > 0 && (
                <div className="border-brand-purple/10 mt-5 border-t pt-4">
                  <p className="text-brand-muted mb-3 text-[11px] font-semibold tracking-wider uppercase">
                    Movimientos de la guía
                  </p>
                  <ol className="relative space-y-3">
                    {[...shipmentEvents].reverse().map((ev, idx) => {
                      const tone =
                        ev.status === "DELIVERED"
                          ? "bg-emerald-500"
                          : ev.status === "RETURNED" || ev.status === "EXCEPTION"
                            ? "bg-amber-500"
                            : idx === 0
                              ? "bg-brand-purple"
                              : "bg-brand-purple/30";
                      return (
                        <li key={ev.id} className="flex items-start gap-3">
                          <span
                            aria-hidden="true"
                            className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${tone} ${
                              idx === 0 ? "ring-brand-purple/25 ring-4" : ""
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-brand-purple-dark text-xs leading-snug font-semibold">
                              {ev.description ||
                                humanizeCarrierStatus(ev.carrierStatusRaw) ||
                                SHIPMENT_EVENT_LABEL[ev.status]}
                              {ev.description && ev.carrierStatusRaw ? (
                                <span className="text-brand-muted font-normal">
                                  {" "}
                                  · {humanizeCarrierStatus(ev.carrierStatusRaw)}
                                </span>
                              ) : null}
                            </p>
                            <p className="text-brand-muted mt-0.5 text-[11px]">
                              {formatDateTimeCO(ev.occurredAt)}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </div>
          )}

          {isCancelled && (
            <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm font-semibold text-rose-900">
                {order.status === "REFUNDED"
                  ? "Este pedido fue reembolsado."
                  : "Este pedido fue cancelado."}
              </p>
              <p className="mt-1 text-xs text-rose-800">Si tienes dudas escríbenos por WhatsApp.</p>
            </div>
          )}

          <Card icon={<Package className="h-4 w-4" />} title={itemsHeading}>
            <ul className="divide-brand-purple/10 divide-y">
              {order.items.map((it) => {
                // 2026-10-13 — exhibición CON marca de agua cuando el artefacto
                // existe (preview-wm.webp / wm/pages/NN.webp); el snapshot limpio
                // (designAssetUrl) queda de fallback (diseño sin artefactos o ya
                // purgado — el snapshot sobrevive al borrado del diseño).
                // LUC-SEC-001 (2026-10-30): todas las URLs salen por el handler
                // autorizado con la capacidad ?ot= del token del pedido (solo
                // variantes watermark; el fallback limpio solo carga para
                // dueño/admin — fail-closed para el visitante por token).
                const cap = { name: "ot" as const, value: token };
                const disp = it.design ? designPreviewDisplay(it.design, cap) : null;
                const fallbackRef = it.designAssetUrl ?? it.design?.previewUrl ?? null;
                const previewUrl = disp?.watermarked
                  ? disp.displayUrl
                  : fallbackRef
                    ? previewRefToAuthorizedUrl(fallbackRef, cap)
                    : null; // ADR-070 — snapshot primero
                // Opciones de diseño del set de letras ("Sin borde") — el PNG las refleja, pero el
                // texto evita que el cliente tenga que deducirlas de la miniatura (2026-09-05).
                const borderNote = letterSetBorderNote(it.design?.metadata);
                // 2026-10-22 — rótulo por página del pager ("Set 2 · con borde").
                const pageLabels = designPreviewPageLabels(
                  it.design,
                  unitNounForLine(it.variant.product.personalizationKind, it.variant.name),
                );
                // 2026-10-26 — sustantivo kind-aware del badge «N …» ("tiras",
                // "sets"…); el bloque CMS publicado manda sobre este fallback.
                const unitNounPlural = unitCountNounForLine({
                  personalizationKind: it.variant.product.personalizationKind,
                  variantName: it.variant.name,
                  designMetadata: it.design?.metadata,
                  isBookmark: isBookmarkGalleryTag(it.variant.product.slug),
                }).plural;
                // Paquete F (2026-10-02) — desglose estructurado de la variante (el
                // nombre libre no siempre informa Con/Sin imán, tamaño, idioma…).
                const variantBreakdown = describeVariantAttributes(
                  parseVariantAttributes(it.variant.attributes),
                );
                return (
                  <li key={it.id} className="flex items-start gap-3 py-3">
                    {previewUrl ? (
                      // 2026-10-13 — la miniatura también abre el lightbox
                      // (además del botón «Ver»: Radix admite un solo trigger
                      // por Dialog, así que es una 2ª instancia con trigger
                      // personalizado).
                      <DesignPreviewDialog
                        previewUrl={previewUrl}
                        pages={disp?.pageUrls ?? null}
                        pageLabels={pageLabels}
                        watermarkNote={
                          disp?.watermarked
                            ? "Vista previa con marca de agua — tu impresión final no la lleva."
                            : null
                        }
                        productName={it.variant.product.name}
                        trigger={
                          <button
                            type="button"
                            aria-label={`Ver el diseño de ${it.variant.product.name}`}
                            className="bg-brand-purple/5 focus-visible:ring-brand-turquoise relative h-14 w-14 flex-shrink-0 cursor-zoom-in overflow-hidden rounded-lg focus-visible:ring-2 focus-visible:outline-none"
                          >
                            <Image
                              src={previewUrl}
                              alt=""
                              fill
                              sizes="56px"
                              className="object-cover"
                              unoptimized
                            />
                            {/* 2026-10-13 — «N <sustantivo>» cuando el diseño pagina. */}
                            <DesignUnitsBadge
                              count={disp?.pageUrls?.length ?? 0}
                              label={unitNounPlural}
                            />
                          </button>
                        }
                        title="Tu diseño ·"
                        description="Vista previa ampliada del diseño personalizado de esta línea del pedido."
                      />
                    ) : (
                      <div className="bg-brand-purple/5 relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg">
                        <div className="text-brand-muted flex h-full w-full items-center justify-center text-[10px]">
                          {it.qty}×
                        </div>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-brand-purple-dark text-sm font-semibold">
                        {it.variant.product.name}
                      </div>
                      <div className="text-brand-muted text-xs">
                        {it.variant.name} · {it.qty} × {formatCOP(it.unitPrice)}
                      </div>
                      {variantBreakdown.length > 0 && (
                        <div className="text-brand-purple-dark/70 text-xs">
                          {variantBreakdown.join(" · ")}
                        </div>
                      )}
                      {borderNote && <div className="text-brand-muted text-xs">{borderNote}</div>}
                      {/* Zoom del diseño (fix QA STG 2026-10): la miniatura de
                          56px no deja revisar el diseño — el botón abre el MISMO
                          lightbox con zoom del carrito (DesignPreviewDialog:
                          rueda anclada, pinch, doble-tap, botones +/−). */}
                      {previewUrl && (
                        <div className="mt-1.5">
                          <DesignPreviewDialog
                            previewUrl={previewUrl}
                            // 2026-10-13 — páginas por unidad (watermark) cuando
                            // el diseño las tiene: el "Ver" pagina por unidad.
                            pages={disp?.pageUrls ?? null}
                            pageLabels={pageLabels}
                            watermarkNote={
                              disp?.watermarked
                                ? "Vista previa con marca de agua — tu impresión final no la lleva."
                                : null
                            }
                            productName={it.variant.product.name}
                            triggerLabel="Ver"
                            title="Tu diseño ·"
                            description="Vista previa ampliada del diseño personalizado de esta línea del pedido."
                          />
                        </div>
                      )}
                      {accountTexts && retractByItem.has(it.id) && (
                        <RetractControl
                          item={retractByItem.get(it.id)!}
                          texts={accountTexts.retract}
                          guestToken={token}
                          actionOverride={requestGuestRetractAction}
                        />
                      )}
                      {accountTexts && warrantyByItem.has(it.id) && (
                        <WarrantyControl
                          item={warrantyByItem.get(it.id)!}
                          texts={accountTexts.warranty}
                          guestToken={token}
                          actionOverride={requestGuestWarrantyAction}
                        />
                      )}
                    </div>
                    <div className="text-brand-purple-dark flex-shrink-0 text-right text-sm font-semibold tabular-nums">
                      {formatCOP(it.unitPrice * it.qty)}
                    </div>
                  </li>
                );
              })}
            </ul>
            {/* 2026-10-13 — aviso de marca de agua cuando algún diseño exhibido la lleva. */}
            {order.items.some((it) =>
              it.design ? designPreviewDisplay(it.design)?.watermarked === true : false,
            ) && (
              <p className="text-brand-muted mt-2 text-[11px]">
                Las vistas previas de tus diseños llevan marca de agua — tu impresión final no la
                lleva.
              </p>
            )}
            <dl className="border-brand-purple/10 mt-3 space-y-1 border-t pt-3 text-sm">
              <Row label="Subtotal" value={formatCOP(order.subtotal)} />
              <Row label="Envío" value={formatCOP(order.shipping)} />
              {order.discount > 0 && (
                <Row
                  label="Descuento"
                  value={<span className="text-emerald-700">−{formatCOP(order.discount)}</span>}
                />
              )}
              {/* Puntos Lucams (2026-10-12) — línea propia para que el desglose
                  cuadre con el total cobrado. */}
              {order.loyaltyDiscount > 0 && (
                <Row
                  label={`Puntos Lucams (${order.loyaltyPointsRedeemed.toLocaleString("es-CO")} pts)`}
                  value={
                    <span className="text-emerald-700">−{formatCOP(order.loyaltyDiscount)}</span>
                  }
                />
              )}
              <div className="border-brand-purple/10 mt-2 flex justify-between border-t pt-2">
                <dt className="text-brand-purple-dark font-bold">Total</dt>
                <dd className="text-brand-purple-dark font-bold tabular-nums">
                  {formatCOP(order.total)}
                </dd>
              </div>
            </dl>
          </Card>

          <Card icon={<MapPin className="h-4 w-4" />} title="Dirección de envío">
            {/* #16 — esta vista es pública por token (link reenviable). Minimización PII
                (Ley 1581) PERO con certeza para el comprador: nombre + ciudad visibles y la
                dirección completa bajo un desplegable "Ver dirección exacta" (feedback Lucy
                2026-08-11 — el correo de confirmación YA la incluye, así que ocultarla solo
                acá era inconsistente; el desplegable cubre el hombro curioso). */}
            <p className="text-brand-purple-dark text-sm">
              {ship.fullName ?? ""}
              {ship.fullName && <br />}
              {ship.city}, {ship.department}
            </p>
            {/* FLUJO REGALO — destinatario distinto ("compro yo, lo recibe otra
                persona"): el comprador confirma a nombre de quién sale la guía.
                El teléfono de quien recibe queda bajo el desplegable (vista
                pública por token, link reenviable — minimización PII Ley 1581). */}
            {order.recipientName && (
              <p className="text-brand-purple-dark mt-2 text-sm">
                Recibe: <strong>{order.recipientName}</strong>
                {order.isGift ? " 🎁" : ""}
              </p>
            )}
            <details className="group mt-1">
              <summary className="text-brand-purple-dark hover:text-brand-purple cursor-pointer text-xs font-semibold underline underline-offset-2">
                Ver dirección exacta
              </summary>
              <p className="text-brand-purple-dark mt-1 text-sm">
                {[ship.addressLine1, ship.addressLine2].filter(Boolean).join(", ")}
                {ship.zip ? ` · ${ship.zip}` : ""}
              </p>
              {order.recipientPhone && (
                <p className="text-brand-purple-dark mt-1 text-sm">
                  Tel. de quien recibe: {order.recipientPhone}
                </p>
              )}
            </details>
          </Card>

          {order.trackingNumber && (
            <Card icon={<Truck className="h-4 w-4" />} title="Envío">
              <Row label="Transportadora" value={carrierDisplayName(order.shippingCarrier)} />
              <Row
                label={isInternalDelivery ? "Referencia" : "Número de guía"}
                value={
                  <span className="text-brand-purple-dark/85 font-mono text-xs">
                    {order.trackingNumber}
                  </span>
                }
              />
              {isInternalDelivery && (
                <p className="text-brand-muted mt-2 text-xs">
                  {order.status === "DELIVERED"
                    ? "Tu pedido fue entregado por nuestro equipo Lucams."
                    : "Tu pedido va con nuestro equipo Lucams — la entrega se estima para el mismo día del despacho, sujeta a las condiciones de la ruta."}
                </p>
              )}
              {/* Rastreo (feedback owner 2026-10-20): esta vista YA es el
                  seguimiento en Lucams — el botón "Seguir estado en LUCAMS" era
                  redundante acá y se eliminó (sigue teniendo sentido en los
                  emails). Quedan como BOTONES el portal oficial de la
                  transportadora (el cliente digita la guía ahí) y el documento
                  de guía PDF que archiva Aveonline. El número de guía va visible
                  arriba para copiarlo. */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {carrierTrackingPageUrl(order.shippingCarrier) && (
                  <a
                    href={carrierTrackingPageUrl(order.shippingCarrier)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-semibold shadow-sm"
                  >
                    <Truck aria-hidden className="h-3.5 w-3.5" />
                    Rastrear en el portal de la transportadora
                  </a>
                )}
                {order.trackingUrl && (
                  <a
                    href={order.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-semibold shadow-sm"
                  >
                    <Package aria-hidden className="h-3.5 w-3.5" />
                    Documento de guía (PDF)
                  </a>
                )}
              </div>
            </Card>
          )}

          {!isCancelled && (
            <GuestOrderSupportCard
              token={token}
              orderNumber={order.number}
              maskedEmail={maskEmail(order.email)}
              waUrl={waUrl}
              isDelivered={order.status === "DELIVERED"}
              action={submitGuestOrderSupportAction}
            />
          )}

          {/* Paquete I — "Volver a pedir" (invitado): el token del link autoriza el reorder;
              el resumen inline dice qué entró al carrito, qué requiere fotos y qué ya no está. */}
          {reorderTexts && (
            <div className="border-brand-purple/15 mb-4 rounded-2xl border bg-white p-5 text-center shadow-sm">
              <ReorderControl
                action={reorderGuestAction}
                hiddenField={{ name: "token", value: token }}
                texts={reorderTexts}
              />
            </div>
          )}

          <div className="border-brand-purple/15 from-brand-pink/10 to-brand-purple/10 rounded-2xl border bg-gradient-to-br p-5 text-center shadow-sm">
            <p className="text-brand-purple-dark text-sm font-semibold">
              ¿Quieres ver todos tus pedidos?
            </p>
            <p className="text-brand-muted mt-1 text-xs">
              {/* #13/#16 — email ENMASCARADO (link público reenviable) y NO viaja en el href del CTA
                  (antes ?email= lo dejaba en claro en la URL/HTML). Ley 1581. */}
              {withStrong(accountCtaBody, "{email}", maskEmail(order.email))}
            </p>
            <Link
              href="/registro"
              className="bg-brand-purple hover:bg-brand-purple-dark mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white shadow-sm"
            >
              Crear cuenta
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-brand-purple/15 mb-4 rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-brand-purple-dark mb-3 flex items-center gap-2 text-sm font-bold">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <dt className="text-brand-muted text-xs">{label}</dt>
      <dd className="text-brand-purple-dark text-right text-xs font-medium">{value}</dd>
    </div>
  );
}

// Interpola un placeholder del texto CMS ({total}, {email}) envolviendo el
// valor en <strong>: la administradora mueve el dato dentro de la frase sin
// tocar código, y el énfasis visual se conserva.
function withStrong(text: string, placeholder: string, value: string): React.ReactNode {
  const parts = text.split(placeholder);
  if (parts.length === 1) return text;
  return parts.flatMap((part, i) => (i === 0 ? [part] : [<strong key={i}>{value}</strong>, part]));
}

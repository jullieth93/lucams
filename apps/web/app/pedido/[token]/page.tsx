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
import { isBookmarkGalleryTag } from "@/features/personalization/product-kind";
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
import { friendlyCarrierEventLabel, listShipmentEvents } from "@/features/shipping/shipment-events";

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

type ShippingIssueSummary = {
  kind: "returned" | "exception";
  detail: string;
};

function isConfirmedReturnIssue(
  order: { needsReconciliation: boolean; reconciliationReason: string | null },
  latestEventStatus: string | undefined,
): boolean {
  if (latestEventStatus === "RETURNED") return true;
  if (!order.needsReconciliation) return false;
  return /devuelto|devoluci[oó]n/i.test(order.reconciliationReason ?? "");
}

function isOperationalDeliveryException(
  latestEvent: { status: string; carrierStatusRaw: string } | undefined,
): boolean {
  if (latestEvent?.status !== "EXCEPTION") return false;
  return !/anulad|cancel/i.test(latestEvent.carrierStatusRaw);
}

/**
 * Diferenciación asertiva entre `EXCEPTION` (`NOVEDAD` operativa en reparto, el paquete
 * sigue con la transportadora para reintento) y `RETURNED` (`DEVOLUCIÓN` confirmada al
 * remitente). Solo aplica mientras la orden sigue activa en tránsito (`PAID | FULFILLING | SHIPPED`):
 * apenas el carrier retoma `EN REPARTO` (`IN_TRANSIT`) o marca `DELIVERED`, el aviso superior
 * desaparece automáticamente mientras el hito histórico permanece trazado abajo.
 */
function resolveShippingIssue(
  order: {
    status: string;
    trackingNumber: string | null;
    needsReconciliation: boolean;
    reconciliationReason: string | null;
  },
  shipmentEvents: Array<{ status: string; carrierStatusRaw: string; description: string }>,
): ShippingIssueSummary | null {
  if (!order.trackingNumber) return null;
  if (!["PAID", "FULFILLING", "SHIPPED"].includes(order.status)) return null;

  const latestEvent = shipmentEvents[shipmentEvents.length - 1];
  if (isConfirmedReturnIssue(order, latestEvent?.status)) {
    return { kind: "returned", detail: latestEvent?.description ?? "" };
  }
  if (isOperationalDeliveryException(latestEvent)) {
    return { kind: "exception", detail: latestEvent?.description ?? "" };
  }
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

async function loadPublicOrderByToken(token: string) {
  return prisma.order.findFirst({
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
}

type PublicOrderRecord = NonNullable<Awaited<ReturnType<typeof loadPublicOrderByToken>>>;
type PublicOrderItem = PublicOrderRecord["items"][number];
type PublicShipmentEvent = Awaited<ReturnType<typeof listShipmentEvents>>[number];
type PublicRetractableItem = Awaited<ReturnType<typeof getRetractableItemsByOrderToken>>[number];
type PublicWarrantyItem = Awaited<ReturnType<typeof getWarrantyItemsByOrderToken>>[number];
type PublicAccountTexts = Awaited<ReturnType<typeof getAccountTexts>> | null;

const DEFAULT_REORDER_TEXTS: ReorderTexts = {
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
};

function resolvePublicOrderStatusText(params: {
  status: string;
  isCod: boolean;
  isInternalDelivery: boolean;
}): string {
  if (params.isCod && params.status === "PAID") return "Confirmado";
  if (params.isInternalDelivery && params.status === "SHIPPED") {
    return "En camino con nuestro equipo";
  }
  return STATUS_LABEL[params.status] ?? params.status;
}

function resolveShipmentEventDotTone(status: string, idx: number): string {
  if (status === "DELIVERED") return "bg-emerald-500";
  if (status === "RETURNED" || status === "EXCEPTION") return "bg-amber-500";
  if (idx === 0) return "bg-brand-purple";
  return "bg-brand-purple/30";
}

function resolveItemPreviewUrl(
  it: PublicOrderItem,
  token: string,
  disp: ReturnType<typeof designPreviewDisplay> | null,
): string | null {
  if (disp?.watermarked) return disp.displayUrl;
  const fallbackRef = it.designAssetUrl ?? it.design?.previewUrl ?? null;
  if (!fallbackRef) return null;
  return previewRefToAuthorizedUrl(fallbackRef, { name: "ot", value: token });
}

function formatDesignUnitsPrefix(it: PublicOrderItem, unitNounPlural: string): string {
  if (!it.design || it.designUnits <= 1) return "";
  const copyWord = it.qty === 1 ? "copia" : "copias";
  const totalUnits = it.designUnits * it.qty;
  return `${it.designUnits} diseños × ${it.qty} ${copyWord} (${totalUnits} ${unitNounPlural}) · `;
}

async function loadPostSaleContext(params: {
  token: string;
  orderNumber: string;
  status: string;
  isCancelled: boolean;
}) {
  const isDelivered = params.status === "DELIVERED";
  const [waUrl, retractable, warrantyItems, accountTexts] = await Promise.all([
    params.isCancelled
      ? null
      : buildWhatsAppUrl({ kind: "order", orderNumber: params.orderNumber }),
    isDelivered ? getRetractableItemsByOrderToken(params.token) : [],
    isDelivered ? getWarrantyItemsByOrderToken(params.token) : [],
    isDelivered ? getAccountTexts() : null,
  ]);
  return {
    waUrl,
    retractByItem: new Map(retractable.map((r) => [r.orderItemId, r])),
    warrantyByItem: new Map(warrantyItems.map((w) => [w.orderItemId, w])),
    accountTexts,
  };
}

async function loadPublicShipmentEvents(
  orderId: string,
  trackingNumber: string | null,
  isInternalDelivery: boolean,
): Promise<PublicShipmentEvent[]> {
  if (!trackingNumber || isInternalDelivery) return [];
  return listShipmentEvents(orderId);
}

export default async function PublicOrderPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ token: string }>;
  searchParams: Promise<{ nueva?: string }>;
}>) {
  const { token } = await params;
  const { nueva } = await searchParams;

  // Validación token: debe ser 32 hex chars (anti-fuzzing, evita query DB con basura).
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();

  const order = await loadPublicOrderByToken(token);
  if (!order) notFound();

  const isCancelled = order.status === "CANCELLED" || order.status === "REFUNDED";
  const isPending = order.status === "PENDING_PAYMENT";
  const isInternalDelivery = order.shippingCarrier === LUCAMS_CARRIER;
  const isCod = order.paymentMethod === "COD";

  const [shipmentEvents, postSale] = await Promise.all([
    loadPublicShipmentEvents(order.id, order.trackingNumber, isInternalDelivery),
    loadPostSaleContext({
      token,
      orderNumber: order.number,
      status: order.status,
      isCancelled,
    }),
  ]);
  const statusText = resolvePublicOrderStatusText({
    status: order.status,
    isCod,
    isInternalDelivery,
  });
  const shippingIssue = resolveShippingIssue(order, shipmentEvents);

  return (
    <PublicOrderLayout
      order={order}
      token={token}
      isNewOrder={nueva === "1"}
      isCancelled={isCancelled}
      isPending={isPending}
      isInternalDelivery={isInternalDelivery}
      isCod={isCod}
      statusText={statusText}
      shippingIssue={shippingIssue}
      shipmentEvents={shipmentEvents}
      postSale={postSale}
    />
  );
}

function PublicOrderLayout({
  order,
  token,
  isNewOrder,
  isCancelled,
  isPending,
  isInternalDelivery,
  isCod,
  statusText,
  shippingIssue,
  shipmentEvents,
  postSale,
}: Readonly<{
  order: PublicOrderRecord;
  token: string;
  isNewOrder: boolean;
  isCancelled: boolean;
  isPending: boolean;
  isInternalDelivery: boolean;
  isCod: boolean;
  statusText: string;
  shippingIssue: ShippingIssueSummary | null;
  shipmentEvents: PublicShipmentEvent[];
  postSale: Awaited<ReturnType<typeof loadPostSaleContext>>;
}>) {
  const showActiveTracking = !isCancelled && !isPending;
  const showCodBanner = isCod && !isCancelled && order.status !== "DELIVERED";
  const accountCtaBody =
    "Crea una cuenta con el email {email} y vas a tener historial, direcciones guardadas y descuentos exclusivos.";

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
          <PublicOrderTopBanners
            order={order}
            isNewOrder={isNewOrder}
            isCancelled={isCancelled}
            isPending={isPending}
            showCodBanner={showCodBanner}
            waUrl={postSale.waUrl}
          />

          <header className="mb-6">
            <p className="text-brand-muted text-xs tracking-wider uppercase">Tu pedido</p>
            <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
              {order.number}
            </h1>
            <p className="text-brand-muted mt-1 text-sm">
              {formatDateLongCO(order.createdAt)} · {statusText}
            </p>
          </header>

          {showActiveTracking && (
            <PublicOrderStatusSection
              status={order.status}
              isCod={isCod}
              shippingIssue={shippingIssue}
              shipmentEvents={shipmentEvents}
              waUrl={postSale.waUrl}
            />
          )}

          {isCancelled && <PublicOrderCancelledBanner status={order.status} />}

          <PublicOrderItemsCard
            order={order}
            token={token}
            accountTexts={postSale.accountTexts}
            retractByItem={postSale.retractByItem}
            warrantyByItem={postSale.warrantyByItem}
          />

          <PublicOrderAddressCard order={order} />

          {order.trackingNumber && (
            <PublicOrderShippingCard
              status={order.status}
              trackingNumber={order.trackingNumber}
              trackingUrl={order.trackingUrl}
              shippingCarrier={order.shippingCarrier}
              isInternalDelivery={isInternalDelivery}
            />
          )}

          {!isCancelled && (
            <GuestOrderSupportCard
              token={token}
              orderNumber={order.number}
              maskedEmail={maskEmail(order.email)}
              waUrl={postSale.waUrl}
              isDelivered={order.status === "DELIVERED"}
              action={submitGuestOrderSupportAction}
            />
          )}

          {showActiveTracking && (
            <div className="border-brand-purple/15 mb-4 rounded-2xl border bg-white p-5 text-center shadow-sm">
              <ReorderControl
                action={reorderGuestAction}
                hiddenField={{ name: "token", value: token }}
                texts={DEFAULT_REORDER_TEXTS}
              />
            </div>
          )}

          <div className="border-brand-purple/15 from-brand-pink/10 to-brand-purple/10 rounded-2xl border bg-gradient-to-br p-5 text-center shadow-sm">
            <p className="text-brand-purple-dark text-sm font-semibold">
              ¿Quieres ver todos tus pedidos?
            </p>
            <p className="text-brand-muted mt-1 text-xs">
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

function PublicOrderTopBanners({
  order,
  isNewOrder,
  isCancelled,
  isPending,
  showCodBanner,
  waUrl,
}: Readonly<{
  order: PublicOrderRecord;
  isNewOrder: boolean;
  isCancelled: boolean;
  isPending: boolean;
  showCodBanner: boolean;
  waUrl: string | null;
}>) {
  const codBanner = "Pagas {total} en efectivo cuando el mensajero te entregue el pedido.";
  return (
    <>
      {isNewOrder && !isCancelled && (
        <PublicOrderNewConfirmation order={order} isPending={isPending} />
      )}

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
    </>
  );
}

function PublicOrderNewConfirmation({
  order,
  isPending,
}: Readonly<{
  order: PublicOrderRecord;
  isPending: boolean;
}>) {
  return (
    <>
      {!isPending && (
        <TrackPurchase
          transactionId={order.number}
          valueCents={order.total}
          shippingCents={order.shipping}
          taxCents={order.tax}
          items={order.items.map((it) => {
            const du = Math.max(1, it.designUnits);
            return {
              sku: it.skuSnapshot ?? (it.variant.sku || it.variant.product.sku),
              name: it.titleSnapshot ?? it.variant.product.name,
              variantName: it.variant.name,
              priceCents: Math.round(it.unitPrice / du),
              quantity: it.qty * du,
            };
          })}
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
        <p className="font-display text-lg font-bold text-emerald-900">🎉 ¡Pedido confirmado!</p>
        <p className="mt-0.5 text-sm text-emerald-800">
          Te enviamos los detalles y el seguimiento a tu correo. ¡Gracias por tu compra!
        </p>
      </div>
    </>
  );
}

function PublicShippingIssueAlert({
  shippingIssue,
  waUrl,
}: Readonly<{
  shippingIssue: ShippingIssueSummary;
  waUrl: string | null;
}>) {
  const isReturned = shippingIssue.kind === "returned";
  const boxClass = isReturned ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50";
  const titleClass = isReturned ? "text-rose-900" : "text-amber-900";
  const ctaClass = isReturned ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700";

  return (
    <div role="alert" className={`mb-4 rounded-xl border p-4 ${boxClass}`}>
      <p className={`text-sm font-semibold ${titleClass}`}>
        {isReturned
          ? "Tu pedido viene de vuelta con nosotros"
          : "Novedad operativa en el intento de entrega"}
      </p>
      {isReturned ? (
        <p className="mt-1 text-xs text-rose-800">
          La transportadora nos reportó la devolución del paquete. Apenas lo recibamos te
          contactaremos para acordar el reenvío o la devolución del dinero; si quieres escribirnos
          antes, estamos atentos.
        </p>
      ) : (
        <p className="mt-1 text-xs text-amber-800">
          {shippingIssue.detail ? `Reporte de la transportadora: ${shippingIssue.detail}. ` : ""}
          Tu paquete no ha sido devuelto: permanece con la transportadora en tu ciudad para
          programar un nuevo intento de reparto en el siguiente día hábil. Si necesitas confirmar
          algún dato de tu dirección o portería, escríbenos por WhatsApp.
        </p>
      )}
      {waUrl && (
        <a
          href={waUrl}
          target="_blank"
          rel="noreferrer"
          className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-white ${ctaClass}`}
        >
          Escríbenos por WhatsApp
        </a>
      )}
    </div>
  );
}

function PublicCarrierMovementsList({
  shipmentEvents,
}: Readonly<{
  shipmentEvents: PublicShipmentEvent[];
}>) {
  return (
    <div className="border-brand-purple/10 mt-5 border-t pt-4">
      <p className="text-brand-muted mb-3 text-[11px] font-semibold tracking-wider uppercase">
        Movimientos de la guía
      </p>
      <ol className="relative space-y-3">
        {[...shipmentEvents].reverse().map((ev, idx) => {
          const tone = resolveShipmentEventDotTone(ev.status, idx);
          const friendlyStatus = friendlyCarrierEventLabel(ev.carrierStatusRaw);
          const headline = ev.description || friendlyStatus || SHIPMENT_EVENT_LABEL[ev.status];
          const showSecondaryTag = Boolean(ev.description && ev.carrierStatusRaw);
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
                  {headline}
                  {showSecondaryTag ? (
                    <span className="text-brand-muted font-normal"> · {friendlyStatus}</span>
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
  );
}

function PublicOrderStatusSection({
  status,
  isCod,
  shippingIssue,
  shipmentEvents,
  waUrl,
}: Readonly<{
  status: string;
  isCod: boolean;
  shippingIssue: ShippingIssueSummary | null;
  shipmentEvents: PublicShipmentEvent[];
  waUrl: string | null;
}>) {
  const progress = timelineProgress(status);
  return (
    <div className="border-brand-purple/15 mb-6 rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-brand-purple-dark mb-4 text-sm font-bold">Estado de tu pedido</h2>
      {shippingIssue && <PublicShippingIssueAlert shippingIssue={shippingIssue} waUrl={waUrl} />}
      <ol className="flex justify-between">
        {TIMELINE_STEPS.map((s, i) => {
          const done = progress >= i;
          const active = progress === i;
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
      {shipmentEvents.length > 0 && <PublicCarrierMovementsList shipmentEvents={shipmentEvents} />}
    </div>
  );
}

function PublicOrderCancelledBanner({ status }: Readonly<{ status: string }>) {
  return (
    <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4">
      <p className="text-sm font-semibold text-rose-900">
        {status === "REFUNDED" ? "Este pedido fue reembolsado." : "Este pedido fue cancelado."}
      </p>
      <p className="mt-1 text-xs text-rose-800">Si tienes dudas escríbenos por WhatsApp.</p>
    </div>
  );
}

function PublicOrderItemThumbnail({
  previewUrl,
  pageUrls,
  pageLabels,
  watermarkNote,
  productName,
  unitNounPlural,
  qty,
}: Readonly<{
  previewUrl: string | null;
  pageUrls: string[] | null;
  pageLabels: string[] | null;
  watermarkNote: string | null;
  productName: string;
  unitNounPlural: string;
  qty: number;
}>) {
  if (!previewUrl) {
    return (
      <div className="bg-brand-purple/5 relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg">
        <div className="text-brand-muted flex h-full w-full items-center justify-center text-[10px]">
          {qty}×
        </div>
      </div>
    );
  }

  return (
    <DesignPreviewDialog
      previewUrl={previewUrl}
      pages={pageUrls}
      pageLabels={pageLabels}
      watermarkNote={watermarkNote}
      productName={productName}
      trigger={
        <button
          type="button"
          aria-label={`Ver el diseño de ${productName}`}
          className="bg-brand-purple/5 focus-visible:ring-brand-turquoise relative h-14 w-14 flex-shrink-0 cursor-zoom-in overflow-hidden rounded-lg focus-visible:ring-2 focus-visible:outline-none"
        >
          <Image src={previewUrl} alt="" fill sizes="56px" className="object-cover" unoptimized />
          <DesignUnitsBadge count={pageUrls?.length ?? 0} label={unitNounPlural} />
        </button>
      }
      title="Tu diseño ·"
      description="Vista previa ampliada del diseño personalizado de esta línea del pedido."
    />
  );
}

function PublicOrderItemPostSaleControls({
  token,
  accountTexts,
  retractItem,
  warrantyItem,
}: Readonly<{
  token: string;
  accountTexts: PublicAccountTexts;
  retractItem: PublicRetractableItem | undefined;
  warrantyItem: PublicWarrantyItem | undefined;
}>) {
  if (!accountTexts) return null;
  return (
    <>
      {retractItem && (
        <RetractControl
          item={retractItem}
          texts={accountTexts.retract}
          guestToken={token}
          actionOverride={requestGuestRetractAction}
        />
      )}
      {warrantyItem && (
        <WarrantyControl
          item={warrantyItem}
          texts={accountTexts.warranty}
          guestToken={token}
          actionOverride={requestGuestWarrantyAction}
        />
      )}
    </>
  );
}

function resolvePublicItemPreviewContext(it: PublicOrderItem, token: string) {
  const cap = { name: "ot" as const, value: token };
  const disp = it.design ? designPreviewDisplay(it.design, cap) : null;
  const previewUrl = resolveItemPreviewUrl(it, token, disp);
  const pageUrls = disp?.pageUrls ?? null;
  const borderNote = letterSetBorderNote(it.design?.metadata);
  const pageLabels = designPreviewPageLabels(
    it.design,
    unitNounForLine(
      it.variant.product.personalizationKind,
      it.variant.name,
      it.variant.product.personalizationSchema,
    ),
  );
  const unitNounPlural = unitCountNounForLine({
    personalizationKind: it.variant.product.personalizationKind,
    variantName: it.variant.name,
    designMetadata: it.design?.metadata,
    isBookmark: isBookmarkGalleryTag(it.variant.product.slug),
    productSchema: it.variant.product.personalizationSchema,
  }).plural;
  const watermarkNote = disp?.watermarked
    ? "Vista previa con marca de agua — tu impresión final no la lleva."
    : null;

  return { previewUrl, pageUrls, borderNote, pageLabels, unitNounPlural, watermarkNote };
}

function PublicOrderItemRow({
  it,
  token,
  accountTexts,
  retractItem,
  warrantyItem,
}: Readonly<{
  it: PublicOrderItem;
  token: string;
  accountTexts: PublicAccountTexts;
  retractItem: PublicRetractableItem | undefined;
  warrantyItem: PublicWarrantyItem | undefined;
}>) {
  const { previewUrl, pageUrls, borderNote, pageLabels, unitNounPlural, watermarkNote } =
    resolvePublicItemPreviewContext(it, token);
  const variantBreakdown = describeVariantAttributes(
    parseVariantAttributes(it.variant.attributes),
    it.variant.product.personalizationSchema,
  );
  const designUnitsPrefix = formatDesignUnitsPrefix(it, unitNounPlural);

  return (
    <li className="flex items-start gap-3 py-3">
      <PublicOrderItemThumbnail
        previewUrl={previewUrl}
        pageUrls={pageUrls}
        pageLabels={pageLabels}
        watermarkNote={watermarkNote}
        productName={it.titleSnapshot ?? it.variant.product.name}
        unitNounPlural={unitNounPlural}
        qty={it.qty}
      />
      <div className="min-w-0 flex-1">
        <div className="text-brand-purple-dark text-sm font-semibold">
          {it.titleSnapshot ?? it.variant.product.name}
        </div>
        <div className="text-brand-muted text-xs">
          {it.variant.name} · {designUnitsPrefix}
          {it.qty} × {formatCOP(it.unitPrice)}
        </div>
        {variantBreakdown.length > 0 && (
          <div className="text-brand-purple-dark/70 text-xs">{variantBreakdown.join(" · ")}</div>
        )}
        {borderNote && <div className="text-brand-muted text-xs">{borderNote}</div>}
        {previewUrl && (
          <div className="mt-1.5">
            <DesignPreviewDialog
              previewUrl={previewUrl}
              pages={pageUrls}
              pageLabels={pageLabels}
              watermarkNote={watermarkNote}
              productName={it.titleSnapshot ?? it.variant.product.name}
              triggerLabel="Ver"
              title="Tu diseño ·"
              description="Vista previa ampliada del diseño personalizado de esta línea del pedido."
            />
          </div>
        )}
        <PublicOrderItemPostSaleControls
          token={token}
          accountTexts={accountTexts}
          retractItem={retractItem}
          warrantyItem={warrantyItem}
        />
      </div>
      <div className="text-brand-purple-dark flex-shrink-0 text-right text-sm font-semibold tabular-nums">
        {formatCOP(it.unitPrice * it.qty)}
      </div>
    </li>
  );
}

function PublicOrderItemsCard({
  order,
  token,
  accountTexts,
  retractByItem,
  warrantyByItem,
}: Readonly<{
  order: PublicOrderRecord;
  token: string;
  accountTexts: PublicAccountTexts;
  retractByItem: Map<string, PublicRetractableItem>;
  warrantyByItem: Map<string, PublicWarrantyItem>;
}>) {
  const hasWatermarkedPreview = order.items.some((it) =>
    it.design ? designPreviewDisplay(it.design)?.watermarked === true : false,
  );
  return (
    <Card icon={<Package className="h-4 w-4" />} title={`Lo que pediste (${order.items.length})`}>
      <ul className="divide-brand-purple/10 divide-y">
        {order.items.map((it) => (
          <PublicOrderItemRow
            key={it.id}
            it={it}
            token={token}
            accountTexts={accountTexts}
            retractItem={retractByItem.get(it.id)}
            warrantyItem={warrantyByItem.get(it.id)}
          />
        ))}
      </ul>
      {hasWatermarkedPreview && (
        <p className="text-brand-muted mt-2 text-[11px]">
          Las vistas previas de tus diseños llevan marca de agua — tu impresión final no la lleva.
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
        {order.loyaltyDiscount > 0 && (
          <Row
            label={`Puntos Lucams (${order.loyaltyPointsRedeemed.toLocaleString("es-CO")} pts)`}
            value={<span className="text-emerald-700">−{formatCOP(order.loyaltyDiscount)}</span>}
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
  );
}

function PublicOrderAddressCard({ order }: Readonly<{ order: PublicOrderRecord }>) {
  const ship = order.shippingAddress as ShippingAddrSnapshot;
  return (
    <Card icon={<MapPin className="h-4 w-4" />} title="Dirección de envío">
      <p className="text-brand-purple-dark text-sm">
        {ship.fullName ?? ""}
        {ship.fullName && <br />}
        {ship.city}, {ship.department}
      </p>
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
  );
}

function PublicOrderShippingCard({
  status,
  trackingNumber,
  trackingUrl,
  shippingCarrier,
  isInternalDelivery,
}: Readonly<{
  status: string;
  trackingNumber: string;
  trackingUrl: string | null;
  shippingCarrier: string | null;
  isInternalDelivery: boolean;
}>) {
  const trackingPortalUrl = carrierTrackingPageUrl(shippingCarrier);
  return (
    <Card icon={<Truck className="h-4 w-4" />} title="Envío">
      <Row label="Transportadora" value={carrierDisplayName(shippingCarrier)} />
      <Row
        label={isInternalDelivery ? "Referencia" : "Número de guía"}
        value={
          <span className="text-brand-purple-dark/85 font-mono text-xs">{trackingNumber}</span>
        }
      />
      {isInternalDelivery && (
        <p className="text-brand-muted mt-2 text-xs">
          {status === "DELIVERED"
            ? "Tu pedido fue entregado por nuestro equipo Lucams."
            : "Tu pedido va con nuestro equipo Lucams — la entrega se estima para el mismo día del despacho, sujeta a las condiciones de la ruta."}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {trackingPortalUrl && (
          <a
            href={trackingPortalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-semibold shadow-sm"
          >
            <Truck aria-hidden className="h-3.5 w-3.5" />
            Rastrear en el portal de la transportadora
          </a>
        )}
        {trackingUrl && (
          <a
            href={trackingUrl}
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
  );
}

function Card({
  icon,
  title,
  children,
}: Readonly<{
  icon: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
}>) {
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

function Row({ label, value }: Readonly<{ label: React.ReactNode; value: React.ReactNode }>) {
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
  return parts.flatMap((part, i) =>
    i === 0 ? [part] : [<strong key={`${placeholder}-${i}`}>{value}</strong>, part],
  );
}

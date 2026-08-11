/*
 * /pedido/[token] — Vista pública de un pedido sin requerir login.
 *
 * Usado por guest checkout: el email transaccional incluye un link
 * https://lucamsshop.com/pedido/<token> con un token único de 32 hex chars
 * (Order.publicAccessToken). El cliente entra y ve timeline + tracking
 * sin autenticarse.
 *
 * Seguridad:
 *   - Token de 16 bytes (128 bits) random — imposible adivinar
 *   - Token vive en Order.publicAccessToken @unique
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
import { CmsText } from "@/components/cms/cms-text";
import { LucamsLogo } from "@/components/lucams-logo";
import { getCmsBlock } from "@/lib/cms";
import { prisma } from "@/lib/db";
import { formatCOP, maskEmail } from "@/lib/format";
import { carrierTrackingPageUrl } from "@/features/shipping/tracking-urls";
import { buildWhatsAppUrl } from "@/lib/wa";

export async function generateMetadata(): Promise<Metadata> {
  // noindex: la URL es de un solo uso y trae un token opaco.
  const block = await getCmsBlock("order.status.meta-title");
  return {
    title: block?.body ?? "Mi pedido",
    robots: { index: false, follow: false },
  };
}

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

function timelineProgress(status: string): number {
  const idx = TIMELINE_STEPS.findIndex((s) => s.key === status);
  if (idx >= 0) return idx;
  return -1;
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
    where: { publicAccessToken: token, deletedAt: null },
    include: {
      items: {
        include: {
          variant: {
            select: {
              id: true,
              name: true,
              product: { select: { slug: true, name: true } },
            },
          },
          design: { select: { previewUrl: true } },
        },
      },
    },
  });
  if (!order) notFound();

  const ship = order.shippingAddress as ShippingAddrSnapshot;
  const dateFmt = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const progress = timelineProgress(order.status);
  const isCancelled = order.status === "CANCELLED" || order.status === "REFUNDED";
  // #2 — contraentrega: el cliente aún NO ha pagado (paga en efectivo al recibir). No mostrar
  // "Pagado"; usar "Confirmado" + un aviso persistente del monto a pagar hasta que se entregue.
  const isCod = order.paymentMethod === "COD";
  const statusText =
    isCod && order.status === "PAID" ? "Confirmado" : (STATUS_LABEL[order.status] ?? order.status);
  const showCodBanner = isCod && !isCancelled && order.status !== "DELIVERED";
  // #5 — PENDING_PAYMENT no es un callejón sin salida: en vez del timeline gris mudo, un banner
  // ámbar que explica ("estamos confirmando tu pago") + salida a WhatsApp para resolver.
  const isPending = order.status === "PENDING_PAYMENT";
  const waUrl = isPending
    ? await buildWhatsAppUrl({ kind: "order", orderNumber: order.number })
    : null;

  // Textos con interpolación propia ({total}, {cantidad}, {email}) se leen con
  // getCmsBlock y se reemplazan a mano; el resto va con <CmsText>.
  const [itemsHeadingBlock, accountCtaBodyBlock, codBannerBlock] = await Promise.all([
    getCmsBlock("order.status.items-heading"),
    getCmsBlock("order.status.account-cta-body"),
    showCodBanner ? getCmsBlock("order.status.cod-banner") : Promise.resolve(null),
  ]);
  const itemsHeading = (itemsHeadingBlock?.body ?? "Lo que pediste ({cantidad})").replaceAll(
    "{cantidad}",
    String(order.items.length),
  );
  const accountCtaBody =
    accountCtaBodyBlock?.body ??
    "Crea una cuenta con el email {email} y vas a tener historial, direcciones guardadas y descuentos exclusivos.";
  const codBanner =
    codBannerBlock?.body ?? "Pagas {total} en efectivo cuando el mensajero te entregue el pedido.";

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <header className="border-brand-purple/10 border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2">
            <LucamsLogo variant="full" size={36} />
            <span className="text-brand-purple-dark font-display text-lg font-bold">
              Lucams_shop
            </span>
          </Link>
          <Link
            href="/productos"
            className="text-brand-purple-dark/70 hover:text-brand-purple text-xs font-medium"
          >
            <CmsText blockKey="order.status.catalog-cta" fallback="Ver catálogo →" />
          </Link>
        </div>
      </header>

      <main id="contenido" tabIndex={-1} className="flex-1 px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-3xl">
          {nueva === "1" && !isCancelled && (
            <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="font-display text-lg font-bold text-emerald-900">
                <CmsText
                  blockKey="order.status.confirmed-title"
                  fallback="🎉 ¡Pedido confirmado!"
                />
              </p>
              <p className="mt-0.5 text-sm text-emerald-800">
                {/* #2 — el detalle COD lo lleva el aviso persistente de abajo; aquí solo el saludo. */}
                <CmsText
                  blockKey="order.status.confirmed-body"
                  fallback="Te enviamos los detalles y el seguimiento a tu correo. ¡Gracias por tu compra!"
                />
              </p>
            </div>
          )}

          {/* #5 — pago en verificación (PSE/transferencia async, o webhook demorado): explica y da
            salida a WhatsApp, en vez de dejar el timeline gris mudo. */}
          {isPending && (
            <div role="note" className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">
                <CmsText
                  blockKey="order.status.pending-title"
                  fallback="Estamos confirmando tu pago"
                />
              </p>
              <p className="mt-1 text-xs text-amber-800">
                <CmsText
                  blockKey="order.status.pending-body"
                  fallback="Esto puede tardar unos minutos (algunos métodos como PSE o transferencia son así). Cuando lo confirmemos te llega un correo y aquí verás el avance. ¿Tienes dudas?"
                />
              </p>
              {waUrl && (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                >
                  <CmsText
                    blockKey="order.status.pending-wa-cta"
                    fallback="Escríbenos por WhatsApp"
                  />
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
            <p className="text-brand-muted text-xs tracking-wider uppercase">
              <CmsText blockKey="order.status.eyebrow" fallback="Tu pedido" />
            </p>
            <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
              {order.number}
            </h1>
            <p className="text-brand-muted mt-1 text-sm">
              {dateFmt.format(order.createdAt)} · {statusText}
            </p>
          </header>

          {!isCancelled && !isPending && (
            <div className="border-brand-purple/15 mb-6 rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-brand-purple-dark mb-4 text-sm font-bold">
                <CmsText blockKey="order.status.timeline-heading" fallback="Estado de tu pedido" />
              </h2>
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
            </div>
          )}

          {isCancelled && (
            <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm font-semibold text-rose-900">
                {order.status === "REFUNDED" ? (
                  <CmsText
                    blockKey="order.status.refunded-title"
                    fallback="Este pedido fue reembolsado."
                  />
                ) : (
                  <CmsText
                    blockKey="order.status.cancelled-title"
                    fallback="Este pedido fue cancelado."
                  />
                )}
              </p>
              <p className="mt-1 text-xs text-rose-800">
                <CmsText
                  blockKey="order.status.cancelled-note"
                  fallback="Si tienes dudas escríbenos por WhatsApp."
                />
              </p>
            </div>
          )}

          <Card icon={<Package className="h-4 w-4" />} title={itemsHeading}>
            <ul className="divide-brand-purple/10 divide-y">
              {order.items.map((it) => {
                const previewUrl = it.designAssetUrl ?? it.design?.previewUrl ?? null; // ADR-070 — snapshot primero
                return (
                  <li key={it.id} className="flex items-start gap-3 py-3">
                    <div className="bg-brand-purple/5 relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg">
                      {previewUrl ? (
                        <Image
                          src={previewUrl}
                          alt=""
                          fill
                          sizes="56px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="text-brand-muted flex h-full w-full items-center justify-center text-[10px]">
                          {it.qty}×
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-brand-purple-dark text-sm font-semibold">
                        {it.variant.product.name}
                      </div>
                      <div className="text-brand-muted text-xs">
                        {it.variant.name} · {it.qty} × {formatCOP(it.unitPrice)}
                      </div>
                    </div>
                    <div className="text-brand-purple-dark flex-shrink-0 text-right text-sm font-semibold tabular-nums">
                      {formatCOP(it.unitPrice * it.qty)}
                    </div>
                  </li>
                );
              })}
            </ul>
            <dl className="border-brand-purple/10 mt-3 space-y-1 border-t pt-3 text-sm">
              <Row
                label={<CmsText blockKey="order.status.subtotal-label" fallback="Subtotal" />}
                value={formatCOP(order.subtotal)}
              />
              <Row
                label={<CmsText blockKey="order.status.shipping-label" fallback="Envío" />}
                value={formatCOP(order.shipping)}
              />
              {order.discount > 0 && (
                <Row
                  label={<CmsText blockKey="order.status.discount-label" fallback="Descuento" />}
                  value={<span className="text-emerald-700">−{formatCOP(order.discount)}</span>}
                />
              )}
              <div className="border-brand-purple/10 mt-2 flex justify-between border-t pt-2">
                <dt className="text-brand-purple-dark font-bold">
                  <CmsText blockKey="order.status.total-label" fallback="Total" />
                </dt>
                <dd className="text-brand-purple-dark font-bold tabular-nums">
                  {formatCOP(order.total)}
                </dd>
              </div>
            </dl>
          </Card>

          <Card
            icon={<MapPin className="h-4 w-4" />}
            title={
              <CmsText blockKey="order.status.address-heading" fallback="Dirección de envío" />
            }
          >
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
            <details className="group mt-1">
              <summary className="text-brand-purple-dark hover:text-brand-purple cursor-pointer text-xs font-semibold underline underline-offset-2">
                Ver dirección exacta
              </summary>
              <p className="text-brand-purple-dark mt-1 text-sm">
                {[ship.addressLine1, ship.addressLine2].filter(Boolean).join(", ")}
                {ship.zip ? ` · ${ship.zip}` : ""}
              </p>
            </details>
          </Card>

          {order.trackingNumber && (
            <Card
              icon={<Truck className="h-4 w-4" />}
              title={<CmsText blockKey="order.status.shipping-label" fallback="Envío" />}
            >
              <Row
                label={<CmsText blockKey="order.status.carrier-label" fallback="Transportadora" />}
                value={order.shippingCarrier ?? "—"}
              />
              <Row
                label={<CmsText blockKey="order.status.tracking-label" fallback="Número de guía" />}
                value={
                  <span className="text-brand-purple-dark/85 font-mono text-xs">
                    {order.trackingNumber}
                  </span>
                }
              />
              {/* Rastreo (feedback Lucy 2026-08-11): el portal oficial de la
                  transportadora como enlace principal (el trackingUrl guardado
                  es el PDF del documento de guía — ahora va etiquetado como tal). */}
              {carrierTrackingPageUrl(order.shippingCarrier) && (
                <a
                  href={carrierTrackingPageUrl(order.shippingCarrier)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-purple mt-2 inline-block text-sm font-semibold underline"
                >
                  <CmsText blockKey="order.status.tracking-cta" fallback="Rastrear mi pedido →" />
                </a>
              )}
              {order.trackingUrl && (
                <a
                  href={order.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-muted hover:text-brand-purple mt-1 block text-xs underline"
                >
                  Documento de guía (PDF)
                </a>
              )}
            </Card>
          )}

          <div className="border-brand-purple/15 from-brand-pink/10 to-brand-purple/10 rounded-2xl border bg-gradient-to-br p-5 text-center shadow-sm">
            <p className="text-brand-purple-dark text-sm font-semibold">
              <CmsText
                blockKey="order.status.account-cta-heading"
                fallback="¿Quieres ver todos tus pedidos?"
              />
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
              <CmsText blockKey="order.status.account-cta-button" fallback="Crear cuenta" />
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

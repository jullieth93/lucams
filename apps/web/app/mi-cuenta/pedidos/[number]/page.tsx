/*
 * /mi-cuenta/pedidos/[number] — Detalle del pedido para el cliente.
 *
 * Muestra el pedido SOLO si pertenece al customer logueado (validación
 * de propiedad). Bloques:
 *   - Stepper visual del estado (Pagado → Preparando → Enviado → Entregado)
 *   - Items (con design preview si personalizado)
 *   - Totales
 *   - Dirección de envío
 *   - Envío (carrier + tracking + link Aveonline)
 *   - Botón "Reseñar" si DELIVERED
 */

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, MapPin, Package, Star, Truck, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/auth";
import { formatCOP } from "@/lib/format";
import { getRetractableItems } from "@/features/retract/service";
import { getWarrantyItems } from "@/features/warranty/service";
import { orderStatusLabel } from "@/features/orders/order-status-display";
import { RetractControl } from "./retract-control";
import { WarrantyControl } from "./warranty-control";

export const metadata: Metadata = {
  title: "Detalle de mi pedido",
  robots: { index: false, follow: false },
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
  // PENDING_PAYMENT antes del primero; CANCELLED/REFUNDED en su lado
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

export default async function CustomerPedidoDetallePage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const session = await getCurrentCustomer();
  if (!session) redirect("/login?next=/mi-cuenta/pedidos");

  const { number } = await params;
  const order = await prisma.order.findFirst({
    where: {
      number: decodeURIComponent(number),
      customerId: session.customer.id, // SOLO sus propios pedidos
      deletedAt: null,
    },
    include: {
      items: {
        include: {
          variant: {
            select: {
              id: true,
              name: true,
              sku: true,
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
    hour: "2-digit",
    minute: "2-digit",
  });
  const progress = timelineProgress(order.status);
  const isCancelled = order.status === "CANCELLED" || order.status === "REFUNDED";
  // #2 — contraentrega: no mostrar "Pagado" (aún no paga); "Confirmado" + aviso del monto en efectivo.
  const isCod = order.paymentMethod === "COD";
  const statusText =
    isCod && order.status === "PAID" ? "Confirmado" : orderStatusLabel(order.status);
  const showCodBanner = isCod && !isCancelled && order.status !== "DELIVERED";
  // #9 — transportadora legible (title-case) en vez del slug crudo ("tcc-sa" → "Tcc Sa").
  const carrierLabel = order.shippingCarrier
    ? order.shippingCarrier
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    : "—";

  // F3 — elegibilidad de retracto por item (solo si el pedido fue entregado).
  const retractable =
    order.status === "DELIVERED"
      ? await getRetractableItems(order.id, { customerId: session.customer.id })
      : [];
  const retractByItem = new Map(retractable.map((r) => [r.orderItemId, r]));

  // Garantía (Ley 1480) — elegibilidad por item (solo si el pedido fue entregado).
  const warrantyItems =
    order.status === "DELIVERED" ? await getWarrantyItems(order.id, session.customer.id) : [];
  const warrantyByItem = new Map(warrantyItems.map((w) => [w.orderItemId, w]));

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/mi-cuenta/pedidos"
        className="text-brand-muted hover:text-brand-purple mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ChevronLeft className="h-3 w-3" />
        Mis pedidos
      </Link>
      <header className="mb-6">
        <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
          Pedido {order.number}
        </h1>
        <p className="text-brand-muted mt-1 text-sm">
          {dateFmt.format(order.createdAt)} · {statusText}
        </p>
      </header>

      {/* #2 — aviso de contraentrega persistente (paga en efectivo al recibir). */}
      {showCodBanner && (
        <div
          role="note"
          className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"
        >
          <Wallet className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" aria-hidden />
          <p className="text-sm text-amber-900">
            Pagas <strong>{formatCOP(order.total)}</strong> en efectivo cuando el mensajero te
            entregue el pedido.
          </p>
        </div>
      )}

      {/* Timeline */}
      {!isCancelled && (
        <div className="border-brand-purple/15 mb-6 rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-brand-purple-dark mb-4 text-sm font-bold">Estado de tu pedido</h2>
          <ol className="flex justify-between">
            {TIMELINE_STEPS.map((s, i) => {
              const done = progress >= i;
              const active = progress === i;
              const label = i === 0 && isCod ? "Confirmado" : s.label; // #2
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
            Este pedido fue {order.status === "REFUNDED" ? "reembolsado" : "cancelado"}.
          </p>
          <p className="mt-1 text-xs text-rose-800">
            Si tienes dudas, escríbenos por WhatsApp o responde el email que te enviamos.
          </p>
        </div>
      )}

      {/* Items */}
      <Card icon={<Package className="h-4 w-4" />} title={`Lo que pediste (${order.items.length})`}>
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
                  {retractByItem.has(it.id) && <RetractControl item={retractByItem.get(it.id)!} />}
                  {warrantyByItem.has(it.id) && (
                    <WarrantyControl item={warrantyByItem.get(it.id)!} />
                  )}
                </div>
                <div className="text-brand-purple-dark flex-shrink-0 text-right text-sm font-semibold tabular-nums">
                  {formatCOP(it.unitPrice * it.qty)}
                </div>
              </li>
            );
          })}
        </ul>
        <dl className="border-brand-purple/10 mt-3 space-y-1 border-t pt-3 text-sm">
          <Row label="Subtotal" value={formatCOP(order.subtotal)} />
          <Row label="Envío" value={formatCOP(order.shipping)} />
          {order.discount > 0 && (
            <Row
              label="Descuento"
              value={<span className="text-emerald-700">−{formatCOP(order.discount)}</span>}
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

      {/* Dirección */}
      <Card icon={<MapPin className="h-4 w-4" />} title="Dirección de envío">
        <p className="text-brand-purple-dark text-sm">
          {ship.fullName ?? ""}
          {ship.fullName && <br />}
          {ship.addressLine1}
          {ship.addressLine2 && ` · ${ship.addressLine2}`}
        </p>
        <p className="text-brand-muted mt-1 text-xs">
          {ship.city}, {ship.department}
          {ship.zip ? ` · ${ship.zip}` : ""}
        </p>
        {ship.notes && <p className="text-brand-muted mt-2 text-xs italic">Nota: {ship.notes}</p>}
      </Card>

      {/* Envío */}
      {order.trackingNumber && (
        <Card icon={<Truck className="h-4 w-4" />} title="Envío">
          <Row label="Transportadora" value={carrierLabel} />
          <Row
            label="Número de guía"
            value={
              <span className="text-brand-purple-dark/85 font-mono text-xs">
                {order.trackingNumber}
              </span>
            }
          />
          {order.trackingUrl && (
            <a
              href={order.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-purple mt-2 inline-block text-sm font-semibold underline"
            >
              Rastrear mi pedido →
            </a>
          )}
        </Card>
      )}

      {/* CTA reseña */}
      {order.status === "DELIVERED" && (
        <div className="border-brand-purple/15 from-brand-pink/10 to-brand-purple/10 rounded-2xl border bg-gradient-to-br p-5 text-center shadow-sm">
          <Star className="text-brand-purple mx-auto h-6 w-6" />
          <p className="text-brand-purple-dark mt-2 text-sm font-semibold">
            ¿Cómo te llegó tu pedido?
          </p>
          <p className="text-brand-muted mt-1 text-xs">
            Tu reseña nos ayuda muchísimo (30 segundos).
          </p>
          <Link
            href={`/producto/${order.items[0]?.variant.product.slug}#resenas`}
            className="bg-brand-purple hover:bg-brand-purple-dark mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white shadow-sm"
          >
            <Star className="h-3.5 w-3.5" />
            Dejar reseña
          </Link>
        </div>
      )}
    </div>
  );
}

function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <dt className="text-brand-muted text-xs">{label}</dt>
      <dd className="text-brand-purple-dark text-right text-xs font-medium">{value}</dd>
    </div>
  );
}

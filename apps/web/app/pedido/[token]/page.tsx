/*
 * /pedido/[token] — Vista pública de un pedido sin requerir login.
 *
 * Usado por guest checkout: el email transaccional incluye un link
 * https://lucamsshop.co/pedido/<token> con un token único de 32 hex chars
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
import { MapPin, Package, Truck } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatCOP } from "@/lib/format";
import { LucamsLogo } from "@/components/lucams-logo";

export const metadata: Metadata = {
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
            Ver catálogo →
          </Link>
        </div>
      </header>

      <main id="contenido" tabIndex={-1} className="flex-1 px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-3xl">
          {nueva === "1" && !isCancelled && (
            <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="font-display text-lg font-bold text-emerald-900">
                🎉 ¡Pedido confirmado!
              </p>
              <p className="mt-0.5 text-sm text-emerald-800">
                {order.paymentMethod === "COD" ? (
                  <>
                    Pagas <strong>{formatCOP(order.total)}</strong> en efectivo cuando el mensajero
                    te entregue el pedido. Te enviamos los detalles a tu correo.
                  </>
                ) : (
                  <>
                    Te enviamos los detalles y el seguimiento a tu correo. ¡Gracias por tu compra!
                  </>
                )}
              </p>
            </div>
          )}

          <header className="mb-6">
            <p className="text-brand-muted text-xs tracking-wider uppercase">Tu pedido</p>
            <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
              {order.number}
            </h1>
            <p className="text-brand-muted mt-1 text-sm">
              {dateFmt.format(order.createdAt)} · {STATUS_LABEL[order.status] ?? order.status}
            </p>
          </header>

          {!isCancelled && (
            <div className="border-brand-purple/15 mb-6 rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-brand-purple-dark mb-4 text-sm font-bold">Estado de tu pedido</h2>
              <ol className="flex justify-between">
                {TIMELINE_STEPS.map((s, i) => {
                  const done = progress >= i;
                  const active = progress === i;
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
                        {s.label}
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
              <p className="mt-1 text-xs text-rose-800">Si tienes dudas escríbenos por WhatsApp.</p>
            </div>
          )}

          <Card
            icon={<Package className="h-4 w-4" />}
            title={`Lo que pediste (${order.items.length})`}
          >
            <ul className="divide-brand-purple/10 divide-y">
              {order.items.map((it) => {
                const previewUrl = it.design?.previewUrl ?? null;
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
              <Row label="Subtotal" value={formatCOP(order.subtotal)} />
              <Row label="Envío" value={formatCOP(order.shipping)} />
              <div className="border-brand-purple/10 mt-2 flex justify-between border-t pt-2">
                <dt className="text-brand-purple-dark font-bold">Total</dt>
                <dd className="text-brand-purple-dark font-bold tabular-nums">
                  {formatCOP(order.total)}
                </dd>
              </div>
            </dl>
          </Card>

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
          </Card>

          {order.trackingNumber && (
            <Card icon={<Truck className="h-4 w-4" />} title="Envío">
              <Row label="Transportadora" value={order.shippingCarrier ?? "—"} />
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

          <div className="border-brand-purple/15 from-brand-pink/10 to-brand-purple/10 rounded-2xl border bg-gradient-to-br p-5 text-center shadow-sm">
            <p className="text-brand-purple-dark text-sm font-semibold">
              ¿Quieres ver todos tus pedidos?
            </p>
            <p className="text-brand-muted mt-1 text-xs">
              Crea una cuenta con el email <strong>{order.email}</strong> y vas a tener historial,
              direcciones guardadas y descuentos exclusivos.
            </p>
            <Link
              href={`/signup?email=${encodeURIComponent(order.email)}`}
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

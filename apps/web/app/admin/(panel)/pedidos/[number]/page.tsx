/*
 * Admin > Pedidos > [number] — Detalle completo de un pedido.
 *
 * Bloques:
 *   - Header: número, estado, totales, fecha
 *   - Cliente: contacto + dirección snapshot
 *   - Items: lista con thumbnails + qty + unit price + design preview
 *   - Pago: método, wompiTransactionId, link a Wompi
 *   - Envío: carrier, trackingNumber, trackingUrl, labelUrl
 *   - Acciones: reintentar guía, transicionar manual (admin only)
 *
 * Acepta /admin/pedidos/<id> Y /admin/pedidos/<number> (LCM-2026-0001).
 */

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { Box, User, MapPin, CreditCard, Truck, Package, Undo2 } from "lucide-react";
import { AdminPage, AdminPageHeader, AdminPageBody, AdminBadge } from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import { getOrder } from "@/features/orders/service";
import { formatCOP } from "@/lib/format";
import { OrderActions } from "./order-actions";

export const metadata: Metadata = { title: "Detalle pedido" };

// Esta ruta hostea la server action de reintento de guía (order-actions →
// processPaidOrder → createShipment 20s no-idempotente + auth cold). Las server
// actions heredan el maxDuration del segmento, así que debe contener ese
// presupuesto para no matar createShipment a mitad → guía huérfana. Ver ADR-049.
export const maxDuration = 60;

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Esperando pago",
  PAID: "Pagado",
  FULFILLING: "En preparación",
  SHIPPED: "Enviado",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
  REFUNDED: "Reembolsado",
  DRAFT: "Borrador",
};

const STATUS_TONE: Record<string, "emerald" | "amber" | "purple" | "rose" | "slate"> = {
  PENDING_PAYMENT: "amber",
  PAID: "purple",
  FULFILLING: "purple",
  SHIPPED: "purple",
  DELIVERED: "emerald",
  CANCELLED: "rose",
  REFUNDED: "rose",
  DRAFT: "slate",
};

type ShippingAddrSnapshot = {
  fullName?: string;
  email?: string;
  phone?: string;
  documentType?: string;
  documentNumber?: string;
  city?: string;
  department?: string;
  addressLine1?: string;
  addressLine2?: string;
  zip?: string;
  notes?: string;
};

export default async function AdminPedidoDetallePage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const { number } = await params;
  const order = await getOrder(decodeURIComponent(number));
  if (!order) notFound();

  const ship = order.shippingAddress as ShippingAddrSnapshot;
  const dateFmt = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const isSimulatedTracking = order.trackingNumber?.startsWith("TEST-") ?? false;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Box className="h-5 w-5" />}
        title={order.number}
        subtitle={
          <span className="flex items-center gap-2">
            <AdminBadge tone={STATUS_TONE[order.status] ?? "slate"}>
              {STATUS_LABEL[order.status] ?? order.status}
            </AdminBadge>
            <span>· creado {dateFmt.format(order.createdAt)}</span>
          </span>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Pedidos", href: "/admin/pedidos" },
          { label: order.number },
        ]}
      />

      <AdminPageBody>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Columna principal */}
          <div className="space-y-4 lg:col-span-2">
            {/* Items */}
            <Card icon={<Package className="h-4 w-4" />} title={`Items (${order.items.length})`}>
              <ul className="divide-brand-purple/10 divide-y">
                {order.items.map((it) => {
                  const previewUrl = it.design?.previewUrl ?? null;
                  return (
                    <li key={it.id} className="flex items-start gap-3 py-3">
                      <div className="bg-brand-purple/5 relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg">
                        {previewUrl ? (
                          <Image
                            src={previewUrl}
                            alt=""
                            fill
                            sizes="64px"
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="text-brand-muted flex h-full w-full items-center justify-center text-xs">
                            sin foto
                          </div>
                        )}
                        <span className="bg-brand-purple-dark/85 absolute top-0 right-0 inline-flex h-5 min-w-5 items-center justify-center rounded-bl-md px-1 text-[10px] font-bold text-white">
                          {it.qty}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-brand-purple-dark text-sm font-semibold">
                          {it.variant.sku}
                        </div>
                        <div className="text-brand-muted text-xs">
                          {formatCOP(it.unitPrice)} c/u · qty {it.qty}
                        </div>
                        {it.designAssetUrl && (
                          <a
                            href={it.designAssetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-purple-dark hover:text-brand-purple mt-1 inline-block text-xs underline"
                          >
                            Descargar PNG producción
                          </a>
                        )}
                      </div>
                      <div className="text-brand-purple-dark flex-shrink-0 text-right text-sm font-semibold tabular-nums">
                        {formatCOP(it.unitPrice * it.qty)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>

            {/* Cliente */}
            <Card icon={<User className="h-4 w-4" />} title="Cliente">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Row label="Nombre" value={ship.fullName ?? "—"} />
                <Row label="Email" value={order.email} />
                <Row label="Teléfono" value={order.phone} />
                <Row
                  label="Documento"
                  value={
                    ship.documentType && ship.documentNumber
                      ? `${ship.documentType} ${ship.documentNumber}`
                      : "—"
                  }
                />
                <Row
                  label="Customer ID"
                  value={
                    order.customer ? (
                      <Link
                        href={`/admin/clientes/${order.customer.id}`}
                        className="text-brand-purple-dark hover:text-brand-purple underline"
                      >
                        Ver perfil
                      </Link>
                    ) : (
                      <span className="text-brand-muted">Guest checkout</span>
                    )
                  }
                />
              </dl>
            </Card>

            {/* Dirección */}
            <Card icon={<MapPin className="h-4 w-4" />} title="Dirección de envío">
              <div className="text-brand-purple-dark text-sm">
                {ship.addressLine1}
                {ship.addressLine2 ? ` · ${ship.addressLine2}` : ""}
              </div>
              <div className="text-brand-muted mt-1 text-xs">
                {ship.city}, {ship.department}
                {ship.zip ? ` · ${ship.zip}` : ""}
              </div>
              {ship.notes && (
                <div className="text-brand-muted mt-2 text-xs italic">Nota: {ship.notes}</div>
              )}
            </Card>
          </div>

          {/* Sidebar: totales + pago + envío + acciones */}
          <div className="space-y-4 lg:col-span-1">
            {/* Totales */}
            <Card icon={<Box className="h-4 w-4" />} title="Totales">
              <dl className="space-y-1.5 text-sm">
                <Row label="Subtotal" value={formatCOP(order.subtotal)} />
                <Row label="Envío" value={formatCOP(order.shipping)} />
                {order.discount > 0 && (
                  <Row label="Descuento" value={`- ${formatCOP(order.discount)}`} />
                )}
                <div className="border-brand-purple/10 mt-2 flex justify-between border-t pt-2">
                  <dt className="text-brand-purple-dark font-bold">Total</dt>
                  <dd className="text-brand-purple-dark font-bold tabular-nums">
                    {formatCOP(order.total)}
                  </dd>
                </div>
              </dl>
            </Card>

            {/* Reembolso (F2) — visible solo si la orden fue reembolsada */}
            {order.status === "REFUNDED" && (
              <Card icon={<Undo2 className="h-4 w-4" />} title="Reembolso">
                <Row label="Monto" value={formatCOP(order.refundAmount ?? order.total)} />
                {order.refundedAt && (
                  <Row
                    label="Fecha"
                    value={new Date(order.refundedAt).toLocaleString("es-CO", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  />
                )}
                {order.refundReason && <Row label="Motivo" value={order.refundReason} />}
                <p className="mt-2 text-[11px] text-amber-700">
                  ⚠️ El dinero se emite manualmente en Wompi.
                </p>
              </Card>
            )}

            {/* Pago */}
            <Card icon={<CreditCard className="h-4 w-4" />} title="Pago">
              <Row label="Método" value={order.paymentMethod} />
              {order.wompiTransactionId && (
                <Row
                  label="Wompi TX"
                  value={
                    <a
                      href={`https://comercios.wompi.co/transactions/${order.wompiTransactionId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-purple-dark hover:text-brand-purple font-mono text-xs underline"
                    >
                      {order.wompiTransactionId.slice(0, 18)}…
                    </a>
                  }
                />
              )}
              <Row label="Estado" value={STATUS_LABEL[order.status] ?? order.status} />
            </Card>

            {/* Envío */}
            <Card icon={<Truck className="h-4 w-4" />} title="Envío">
              <Row label="Carrier" value={order.shippingCarrier ?? "—"} />
              {order.trackingNumber ? (
                <>
                  <Row
                    label="Tracking"
                    value={
                      <span className="text-brand-purple-dark/85 font-mono text-xs">
                        {order.trackingNumber}
                      </span>
                    }
                  />
                  {isSimulatedTracking && (
                    <p className="mt-1 text-[10px] text-amber-700">
                      ⚠️ Tracking simulado (modo test). Producción genera guía real.
                    </p>
                  )}
                  {order.trackingUrl && (
                    <a
                      href={order.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-purple mt-2 block text-xs underline"
                    >
                      Ver tracking en Aveonline →
                    </a>
                  )}
                  {order.labelUrl && (
                    <a
                      href={order.labelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-purple mt-1 block text-xs underline"
                    >
                      Descargar etiqueta PDF →
                    </a>
                  )}
                </>
              ) : (
                <p className="text-brand-muted text-xs">Sin guía generada todavía</p>
              )}
            </Card>

            {/* Acciones */}
            <OrderActions
              orderId={order.id}
              orderStatus={order.status}
              hasTracking={!!order.trackingNumber}
            />
          </div>
        </div>
      </AdminPageBody>
    </AdminPage>
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
    <section className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
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
    <div className="flex items-start justify-between gap-3 py-1">
      <dt className="text-brand-muted text-xs">{label}</dt>
      <dd className="text-brand-purple-dark text-right text-xs font-medium">{value}</dd>
    </div>
  );
}

/*
 * Admin > Clientes > [id] — Customer 360.
 *
 * Información completa del cliente para soporte y operación:
 *   - Header con datos personales + DIAN + métricas (total gastado,
 *     pedidos, puntos, referidos)
 *   - Tabs: Pedidos / Reseñas / Direcciones / Puntos / Diseños
 *
 * Ley 1581: admin solo LEE. Si necesita modificar datos, debe pedir
 * al cliente que lo haga desde /mi-cuenta. Excepción: anonimización
 * por solicitud de hábeas data (no implementado acá).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Users,
  ArrowLeft,
  Mail,
  Phone,
  Hash,
  ShoppingBag,
  Star,
  MapPin,
  Sparkles,
  Award,
  UserPlus,
} from "lucide-react";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminCard,
  AdminBadge,
  AdminEmpty,
} from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import { getCustomerDetail, getCustomerTotalSpent } from "@/features/customers/service";
import { formatCOP } from "@/lib/format";

export const metadata: Metadata = {
  title: "Cliente",
  robots: { index: false, follow: false },
};

type RouteParams = Promise<{ id: string }>;

const ORDER_STATUS_TONE: Record<string, "emerald" | "amber" | "rose" | "slate" | "blue"> = {
  DRAFT: "slate",
  PENDING_PAYMENT: "amber",
  PAID: "emerald",
  FULFILLING: "blue",
  SHIPPED: "blue",
  DELIVERED: "emerald",
  CANCELLED: "slate",
  REFUNDED: "rose",
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  PENDING_PAYMENT: "Esperando pago",
  PAID: "Pagada",
  FULFILLING: "En producción",
  SHIPPED: "Enviada",
  DELIVERED: "Entregada",
  CANCELLED: "Cancelada",
  REFUNDED: "Reembolsada",
};

export default async function ClienteDetailPage({ params }: { params: RouteParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const { id } = await params;
  const [customer, totalSpent] = await Promise.all([
    getCustomerDetail(id),
    getCustomerTotalSpent(id),
  ]);

  if (!customer) notFound();

  const fullName = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Cliente";
  const dateFmt = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const dateTimeFmt = new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Users className="h-5 w-5" />}
        title={fullName}
        subtitle={
          <>
            Cliente desde {dateFmt.format(customer.createdAt)} · Código de referido{" "}
            <code className="bg-brand-purple/10 text-brand-purple-dark rounded px-1.5 py-0.5 font-mono text-[11px]">
              {customer.referralCode}
            </code>
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Ventas" },
          { label: "Clientes", href: "/admin/clientes" },
          { label: fullName },
        ]}
        actions={
          <Link
            href="/admin/clientes"
            className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm font-semibold transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
        }
      />

      <AdminPageBody>
        {/* ─────────── Datos personales + métricas ─────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <AdminCard className="p-5 lg:col-span-2">
            <h3 className="text-brand-purple-dark font-display mb-4 text-base font-bold">
              Datos del cliente
            </h3>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                icon={<Mail className="h-3.5 w-3.5" />}
                label="Email"
                value={
                  <a
                    href={`mailto:${customer.email}`}
                    className="text-brand-purple-dark hover:text-brand-purple"
                  >
                    {customer.email}
                  </a>
                }
              />
              <Field
                icon={<Phone className="h-3.5 w-3.5" />}
                label="Teléfono"
                value={
                  customer.phone ? (
                    <a
                      href={`tel:${customer.phone}`}
                      className="text-brand-purple-dark hover:text-brand-purple"
                    >
                      {customer.phone}
                    </a>
                  ) : (
                    "—"
                  )
                }
              />
              <Field
                icon={<Hash className="h-3.5 w-3.5" />}
                label="Documento (DIAN)"
                value={
                  customer.documentType && customer.documentNumber
                    ? `${customer.documentType} ${customer.documentNumber}`
                    : "Sin completar"
                }
              />
              <Field
                icon={<Hash className="h-3.5 w-3.5" />}
                label="Responsabilidad tributaria"
                value={customer.taxResponsibility ?? "—"}
              />
            </dl>
          </AdminCard>

          <AdminCard className="p-5">
            <h3 className="text-brand-purple-dark font-display mb-4 text-base font-bold">
              Métricas
            </h3>
            <div className="space-y-3">
              <Stat label="Total gastado" value={formatCOP(totalSpent)} highlight />
              <Stat label="Pedidos" value={customer._count.orders.toLocaleString("es-CO")} />
              <Stat label="Puntos Lucams" value={customer.loyaltyPoints.toLocaleString("es-CO")} />
              <Stat label="Referidos" value={customer._count.referrals.toLocaleString("es-CO")} />
            </div>
          </AdminCard>
        </div>

        {/* ─────────── Pedidos ─────────── */}
        <section>
          <h2 className="text-brand-purple-dark font-display mb-3 flex items-center gap-2 text-lg font-bold">
            <ShoppingBag className="h-5 w-5" />
            Pedidos
            <span className="text-brand-muted text-sm font-normal">({customer._count.orders})</span>
          </h2>
          {customer.orders.length === 0 ? (
            <AdminEmpty
              icon={<ShoppingBag className="h-5 w-5" />}
              title="Sin pedidos aún"
              description="Cuando este cliente haga su primera compra, aparecerá acá."
            />
          ) : (
            <AdminCard className="overflow-hidden p-0">
              <ul className="divide-brand-purple/10 divide-y">
                {customer.orders.map((order) => (
                  <li
                    key={order.id}
                    className="hover:bg-brand-purple/[0.03] flex items-center justify-between gap-4 p-4 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-brand-purple-dark font-mono text-sm font-bold">
                        {order.number}
                      </div>
                      <div className="text-brand-muted text-xs">
                        {dateTimeFmt.format(order.createdAt)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-brand-purple-dark text-sm font-semibold tabular-nums">
                        {formatCOP(order.total)}
                      </div>
                      <AdminBadge tone={ORDER_STATUS_TONE[order.status] ?? "slate"}>
                        {ORDER_STATUS_LABEL[order.status] ?? order.status}
                      </AdminBadge>
                    </div>
                  </li>
                ))}
              </ul>
            </AdminCard>
          )}
        </section>

        {/* ─────────── Reseñas ─────────── */}
        <section>
          <h2 className="text-brand-purple-dark font-display mb-3 flex items-center gap-2 text-lg font-bold">
            <Star className="h-5 w-5" />
            Reseñas
            <span className="text-brand-muted text-sm font-normal">
              ({customer._count.reviews})
            </span>
          </h2>
          {customer.reviews.length === 0 ? (
            <AdminEmpty
              icon={<Star className="h-5 w-5" />}
              title="Sin reseñas aún"
              description="Las reseñas que escriba aparecerán acá con su estado de moderación."
            />
          ) : (
            <AdminCard className="overflow-hidden p-0">
              <ul className="divide-brand-purple/10 divide-y">
                {customer.reviews.map((review) => (
                  <li key={review.id} className="p-4">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div className="text-brand-purple-dark font-medium">
                        <Link
                          href={`/producto/${review.product.slug}`}
                          target="_blank"
                          rel="noopener"
                          className="hover:text-brand-purple"
                        >
                          {review.product.name}
                        </Link>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-500">
                          {"★".repeat(review.rating)}
                          <span className="text-brand-purple-dark/20">
                            {"★".repeat(5 - review.rating)}
                          </span>
                        </span>
                        {review.isApproved ? (
                          <AdminBadge tone="emerald">Aprobada</AdminBadge>
                        ) : (
                          <AdminBadge tone="amber">Pendiente</AdminBadge>
                        )}
                      </div>
                    </div>
                    <p className="text-brand-purple-dark/85 line-clamp-2 text-sm">
                      {review.comment}
                    </p>
                    <p className="text-brand-muted mt-1 text-[11px]">
                      {dateTimeFmt.format(review.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </AdminCard>
          )}
        </section>

        {/* ─────────── Direcciones ─────────── */}
        <section>
          <h2 className="text-brand-purple-dark font-display mb-3 flex items-center gap-2 text-lg font-bold">
            <MapPin className="h-5 w-5" />
            Direcciones
            <span className="text-brand-muted text-sm font-normal">
              ({customer.addresses.length})
            </span>
          </h2>
          {customer.addresses.length === 0 ? (
            <AdminEmpty
              icon={<MapPin className="h-5 w-5" />}
              title="Sin direcciones guardadas"
              description="El cliente las completará al hacer su primer envío."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {customer.addresses.map((addr) => (
                <AdminCard key={addr.id} className="p-4">
                  <div className="text-brand-purple-dark text-sm font-semibold">{addr.name}</div>
                  <div className="text-brand-purple-dark/75 mt-1 text-xs">
                    {addr.line1}
                    {addr.line2 && `, ${addr.line2}`}
                  </div>
                  <div className="text-brand-purple-dark/75 text-xs">
                    {addr.city}, {addr.department}
                    {addr.zip && ` · ${addr.zip}`}
                  </div>
                  <div className="text-brand-muted mt-1 text-[11px]">Tel: {addr.phone}</div>
                </AdminCard>
              ))}
            </div>
          )}
        </section>

        {/* ─────────── Diseños del Estudio + Referidos ─────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section>
            <h2 className="text-brand-purple-dark font-display mb-3 flex items-center gap-2 text-lg font-bold">
              <Sparkles className="h-5 w-5" />
              Diseños del Estudio
              <span className="text-brand-muted text-sm font-normal">
                ({customer._count.designs})
              </span>
            </h2>
            {customer.designs.length === 0 ? (
              <AdminEmpty
                icon={<Sparkles className="h-5 w-5" />}
                title="Sin diseños guardados"
                description="Cuando use el Estudio de Personalización, sus diseños quedan acá."
              />
            ) : (
              <AdminCard className="overflow-hidden p-0">
                <ul className="divide-brand-purple/10 divide-y">
                  {customer.designs.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                      <span className="text-brand-purple-dark/85 font-mono text-xs">
                        {d.id.slice(0, 12)}…
                      </span>
                      <AdminBadge
                        tone={
                          d.status === "READY" || d.status === "USED_IN_ORDER" ? "emerald" : "slate"
                        }
                      >
                        {d.status}
                      </AdminBadge>
                    </li>
                  ))}
                </ul>
              </AdminCard>
            )}
          </section>

          <section>
            <h2 className="text-brand-purple-dark font-display mb-3 flex items-center gap-2 text-lg font-bold">
              <UserPlus className="h-5 w-5" />
              Referidos
              <span className="text-brand-muted text-sm font-normal">
                ({customer._count.referrals})
              </span>
            </h2>
            {customer.referrals.length === 0 ? (
              <AdminEmpty
                icon={<Award className="h-5 w-5" />}
                title="Sin referidos aún"
                description={`Si comparte su código ${customer.referralCode} y alguien se registra con él, aparecerá acá.`}
              />
            ) : (
              <AdminCard className="overflow-hidden p-0">
                <ul className="divide-brand-purple/10 divide-y">
                  {customer.referrals.map((r) => {
                    const refName = [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email;
                    return (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-2 p-3 text-sm"
                      >
                        <Link
                          href={`/admin/clientes/${r.id}`}
                          className="text-brand-purple-dark hover:text-brand-purple truncate"
                        >
                          {refName}
                        </Link>
                        <span className="text-brand-muted text-[11px]">
                          {dateFmt.format(r.createdAt)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </AdminCard>
            )}
          </section>
        </div>
      </AdminPageBody>
    </AdminPage>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-brand-muted mb-0.5 flex items-center gap-1 text-[11px] font-semibold tracking-wider uppercase">
        {icon}
        {label}
      </dt>
      <dd className="text-brand-purple-dark text-sm font-medium break-all">{value}</dd>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="border-brand-purple/8 flex items-center justify-between border-b pb-2 last:border-b-0 last:pb-0">
      <span className="text-brand-purple-dark/70 text-xs">{label}</span>
      <span
        className={`text-sm font-bold tabular-nums ${
          highlight ? "text-brand-purple font-display text-base" : "text-brand-purple-dark"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

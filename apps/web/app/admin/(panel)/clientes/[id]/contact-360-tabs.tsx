"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Award,
  CheckCircle2,
  Fingerprint,
  Gift,
  Heart,
  LifeBuoy,
  MapPin,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
} from "lucide-react";
import { AdminBadge, AdminCard, AdminEmpty } from "@/components/admin-page";
import { formatCOP } from "@/lib/format";
import type { Contact360Data } from "@/features/identity/contact-360-service";
import { formatDateCO, formatDateTimeCO } from "@/lib/datetime";

type TabId = "orders" | "studio" | "aftersales" | "loyalty" | "privacy" | "identities";

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

const AFTERSALES_KIND_LABEL: Record<"TICKET" | "WARRANTY" | "RETRACT", string> = {
  TICKET: "Ticket soporte",
  WARRANTY: "Garantía legal",
  RETRACT: "Retracto Ley 1480",
};

const CONSENT_SCOPE_LABEL: Record<string, string> = {
  DATA_PROCESSING: "Tratamiento de datos personales (Ley 1581)",
  HABEAS_DATA: "Autorización Habeas Data comercial / B2B (Ley 1581)",
  NEWSLETTER: "Comunicaciones comerciales y newsletter",
  COOKIES_ANALYTICS: "Analítica y medición web",
};

const OPPORTUNITY_STAGE_LABEL: Record<string, string> = {
  NEW: "Nueva",
  QUALIFYING: "En calificación",
  PROPOSAL_SENT: "Propuesta enviada",
  WON: "Ganada",
  LOST: "Perdida",
};

const OPPORTUNITY_STAGE_TONE: Record<string, "purple" | "blue" | "amber" | "emerald" | "slate"> = {
  NEW: "purple",
  QUALIFYING: "blue",
  PROPOSAL_SENT: "amber",
  WON: "emerald",
  LOST: "slate",
};

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

export function Contact360Tabs({ data, canMerge }: { data: Contact360Data; canMerge: boolean }) {
  const [activeTab, setActiveTab] = useState<TabId>("orders");

  const tabs: Array<{
    id: TabId;
    label: string;
    count: number;
    alert?: boolean;
  }> = [
    {
      id: "orders",
      label: "Pedidos, cotizaciones y B2B",
      count: data.orders.length + data.quotes.length + data.opportunities.length,
    },
    {
      id: "studio",
      label: "Diseños e intención",
      count:
        data.designs.length +
        data.intentSignals.wishlist.length +
        data.intentSignals.backInStock.length +
        data.abandonedCarts.length,
    },
    {
      id: "aftersales",
      label: "Posventa",
      count: data.aftersales.length,
      alert: data.kpis.openCareCount > 0,
    },
    {
      id: "loyalty",
      label: "Puntos y reseñas",
      count: data.reviews.length + data.referrals.length + data.personalCoupons.length,
    },
    {
      id: "privacy",
      label: "Ley 1581 y direcciones",
      count: data.consents.length + data.addresses.length,
    },
    {
      id: "identities",
      label: "Identidades",
      count: data.identities.length,
      alert: data.pendingMergesCount > 0 && canMerge,
    },
  ];

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Secciones de Contacto 360"
        className="border-brand-purple/15 flex flex-nowrap gap-1.5 overflow-x-auto rounded-xl border bg-white p-2 shadow-xs sm:flex-wrap"
      >
        {tabs.map((t) => {
          const selected = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveTab(t.id)}
              className={
                selected
                  ? "bg-brand-purple inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors"
                  : "text-brand-purple-dark hover:bg-brand-purple/8 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors"
              }
            >
              <span>{t.label}</span>
              <span
                className={
                  selected
                    ? "rounded-full bg-white/20 px-2 py-0.5 text-[11px] tabular-nums"
                    : t.alert
                      ? "rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 tabular-nums"
                      : "bg-brand-purple/10 text-brand-purple-dark rounded-full px-2 py-0.5 text-[11px] tabular-nums"
                }
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {activeTab === "orders" && (
        <div className="space-y-5" role="tabpanel">
          <section>
            <h3 className="text-brand-purple-dark font-display mb-3 flex items-center gap-2 text-base font-bold">
              <ShoppingBag className="h-4 w-4" />
              Pedidos ({data.orders.length})
            </h3>
            {data.orders.length === 0 ? (
              <AdminEmpty
                icon={<ShoppingBag className="h-5 w-5" />}
                title="Sin pedidos registrados"
                description="Cuando realice su primera compra en tienda o contra entrega, aparecerá aquí."
              />
            ) : (
              <AdminCard className="overflow-hidden p-0">
                <ul className="divide-brand-purple/10 divide-y">
                  {data.orders.map((order) => (
                    <li
                      key={order.id}
                      className="hover:bg-brand-purple/[0.03] flex flex-wrap items-center justify-between gap-3 p-4 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/admin/pedidos/${encodeURIComponent(order.number)}`}
                            className="text-brand-purple-dark hover:text-brand-purple font-mono text-sm font-bold hover:underline"
                          >
                            {order.number}
                          </Link>
                          <span className="text-brand-muted text-xs">
                            {order.paymentMethod === "COD" ? "Contra entrega" : "Wompi"}
                          </span>
                          {order.isGift && (
                            <AdminBadge tone="purple">
                              <Gift className="mr-1 inline h-3 w-3" />
                              Regalo
                            </AdminBadge>
                          )}
                        </div>
                        <div className="text-brand-muted mt-0.5 text-xs">
                          {formatDateTimeCO(toDate(order.createdAt))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-brand-purple-dark text-sm font-semibold tabular-nums">
                          {formatCOP(order.totalCents)}
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

          {data.quotes.length > 0 && (
            <section>
              <h3 className="text-brand-purple-dark font-display mb-3 text-base font-bold">
                Cotizaciones WhatsApp ({data.quotes.length})
              </h3>
              <AdminCard className="overflow-hidden p-0">
                <ul className="divide-brand-purple/10 divide-y">
                  {data.quotes.map((quote) => (
                    <li
                      key={quote.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div>
                        <Link
                          href={`/admin/cotizaciones/${quote.id}`}
                          className="text-brand-purple-dark hover:text-brand-purple font-mono text-sm font-bold hover:underline"
                        >
                          {quote.number}
                        </Link>
                        <div className="text-brand-muted text-xs">
                          {quote.city}, {quote.department} · {formatDateCO(toDate(quote.createdAt))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-brand-purple-dark text-sm font-semibold tabular-nums">
                          {formatCOP(quote.totalCents)}
                        </div>
                        <AdminBadge tone="blue">{quote.status}</AdminBadge>
                      </div>
                    </li>
                  ))}
                </ul>
              </AdminCard>
            </section>
          )}
          {data.opportunities.length > 0 && (
            <section>
              <h3 className="text-brand-purple-dark font-display mb-3 text-base font-bold">
                Oportunidades B2B / Eventos ({data.opportunities.length})
              </h3>
              <AdminCard className="overflow-hidden p-0">
                <ul className="divide-brand-purple/10 divide-y">
                  {data.opportunities.map((opp) => (
                    <li
                      key={opp.id}
                      className="hover:bg-brand-purple/[0.03] flex flex-wrap items-center justify-between gap-3 p-4 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/admin/oportunidades/${encodeURIComponent(opp.id)}`}
                            className="text-brand-purple-dark hover:text-brand-purple font-mono text-sm font-bold hover:underline"
                          >
                            {opp.number}
                          </Link>
                          <span className="text-brand-purple-dark truncate text-xs font-medium">
                            {opp.title}
                          </span>
                        </div>
                        <div className="text-brand-muted mt-0.5 text-xs">
                          {opp.city ? `${opp.city} · ` : ""}
                          {opp.expectedUnits ? `${opp.expectedUnits} uds. · ` : ""}
                          {formatDateCO(toDate(opp.createdAt))}
                        </div>
                      </div>
                      <div className="text-right">
                        {opp.expectedAmountCop > 0 && (
                          <div className="text-brand-purple-dark text-sm font-semibold tabular-nums">
                            {formatCOP(opp.expectedAmountCop)}
                          </div>
                        )}
                        <AdminBadge tone={OPPORTUNITY_STAGE_TONE[opp.stage] ?? "slate"}>
                          {OPPORTUNITY_STAGE_LABEL[opp.stage] ?? opp.stage}
                        </AdminBadge>
                      </div>
                    </li>
                  ))}
                </ul>
              </AdminCard>
            </section>
          )}
        </div>
      )}

      {activeTab === "studio" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" role="tabpanel">
          <section>
            <h3 className="text-brand-purple-dark font-display mb-3 flex items-center gap-2 text-base font-bold">
              <Sparkles className="h-4 w-4" />
              Diseños del Estudio ({data.designs.length})
            </h3>
            {data.designs.length === 0 ? (
              <AdminEmpty
                icon={<Sparkles className="h-5 w-5" />}
                title="Sin diseños asociados"
                description={
                  data.customer
                    ? "Cuando personalice en el Estudio, sus borradores y diseños aparecerán aquí."
                    : "Aquí aparecerán los diseños personalizados de sus pedidos, cotizaciones o carritos."
                }
              />
            ) : (
              <AdminCard className="overflow-hidden p-0">
                <ul className="divide-brand-purple/10 divide-y">
                  {data.designs.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-2 p-3.5 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-brand-purple-dark truncate font-medium">
                          {d.productName}
                        </div>
                        <div className="text-brand-muted font-mono text-[11px]">
                          {d.id.slice(0, 12)}… · {formatDateCO(toDate(d.updatedAt))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <AdminBadge
                          tone={
                            d.status === "READY" || d.status === "USED_IN_ORDER"
                              ? "emerald"
                              : "amber"
                          }
                        >
                          {d.status}
                        </AdminBadge>
                      </div>
                    </li>
                  ))}
                </ul>
              </AdminCard>
            )}
          </section>

          <section className="space-y-4">
            <div>
              <h3 className="text-brand-purple-dark font-display mb-3 flex items-center gap-2 text-base font-bold">
                <Heart className="h-4 w-4" />
                Señales de interés comercial
              </h3>
              {data.intentSignals.wishlist.length === 0 &&
              data.intentSignals.backInStock.length === 0 &&
              data.abandonedCarts.length === 0 ? (
                <AdminEmpty
                  icon={<Heart className="h-5 w-5" />}
                  title="Sin favoritos ni alertas de stock"
                  description="Aquí verás productos en favoritos, suscripciones de agotados y carritos abandonados."
                />
              ) : (
                <AdminCard className="space-y-3 p-4">
                  {data.intentSignals.wishlist.map((w) => (
                    <div key={w.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-brand-purple-dark font-medium">
                        Favorito: {w.productName}
                      </span>
                      <span className="text-brand-muted shrink-0">
                        {formatDateCO(toDate(w.createdAt))}
                      </span>
                    </div>
                  ))}
                  {data.intentSignals.backInStock.map((b) => (
                    <div key={b.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-brand-purple-dark font-medium">
                        Avísame cuando vuelva: {b.productName}
                      </span>
                      <AdminBadge tone={b.notifiedAt ? "emerald" : "amber"}>
                        {b.notifiedAt ? "Notificado" : "Esperando stock"}
                      </AdminBadge>
                    </div>
                  ))}
                  {data.abandonedCarts.map((ac) => {
                    const isRecovered = Boolean(ac.recoveredAt);
                    const isClosedOther = !isRecovered && Boolean(ac.closedReason);
                    const statusLabel = isRecovered
                      ? "Compra cerrada"
                      : ac.closedReason === "QUOTE_CREATED"
                        ? "Convertido a cotización"
                        : ac.closedReason === "CART_EMPTIED"
                          ? "Vaciado por cliente"
                          : isClosedOther
                            ? "Cerrado"
                            : "Abierto";
                    const statusTone = isRecovered ? "emerald" : isClosedOther ? "slate" : "amber";
                    return (
                      <div
                        key={ac.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <Link
                          href={`/admin/carritos/${encodeURIComponent(ac.id)}`}
                          className="text-brand-purple hover:text-brand-purple-dark font-semibold underline underline-offset-2"
                        >
                          Carrito ({ac.reminderCount} recordatorio
                          {ac.reminderCount === 1 ? "" : "s"}
                          {ac.subtotalCents && ac.subtotalCents > 0
                            ? ` · ${formatCOP(ac.subtotalCents)}`
                            : ""}
                          ) →
                        </Link>
                        <AdminBadge tone={statusTone}>{statusLabel}</AdminBadge>
                      </div>
                    );
                  })}
                </AdminCard>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === "aftersales" && (
        <div role="tabpanel">
          {data.aftersales.length === 0 ? (
            <AdminEmpty
              icon={<LifeBuoy className="h-5 w-5" />}
              title="Sin tickets, garantías ni retractos"
              description="Todo el historial posventa de esta persona se centraliza en esta pestaña."
            />
          ) : (
            <AdminCard className="overflow-hidden p-0">
              <ul className="divide-brand-purple/10 divide-y">
                {data.aftersales.map((item) => (
                  <li
                    key={`${item.kind}-${item.id}`}
                    className="hover:bg-brand-purple/[0.03] flex flex-wrap items-center justify-between gap-3 p-4 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <AdminBadge
                          tone={
                            item.kind === "RETRACT"
                              ? "rose"
                              : item.kind === "WARRANTY"
                                ? "amber"
                                : "blue"
                          }
                        >
                          {AFTERSALES_KIND_LABEL[item.kind]}
                        </AdminBadge>
                        <Link
                          href={item.href}
                          className="text-brand-purple-dark hover:text-brand-purple text-sm font-semibold hover:underline"
                        >
                          {item.title}
                        </Link>
                      </div>
                      <div className="text-brand-muted mt-1 text-xs">
                        {item.orderNumber ? `Pedido ${item.orderNumber} · ` : ""}
                        {formatDateTimeCO(toDate(item.createdAt))}
                      </div>
                    </div>
                    <AdminBadge tone="slate">{item.status}</AdminBadge>
                  </li>
                ))}
              </ul>
            </AdminCard>
          )}
        </div>
      )}

      {activeTab === "loyalty" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" role="tabpanel">
          <section className="space-y-3">
            <h3 className="text-brand-purple-dark font-display flex items-center gap-2 text-base font-bold">
              <Award className="h-4 w-4" />
              Puntos Lucams, referidos y cupones
            </h3>
            {!data.customer ? (
              <AdminCard className="p-4 text-xs text-slate-600">
                Este contacto aún no tiene cuenta autenticada verificada. Por política de seguridad
                (<code className="font-mono">ADR-193</code>), los Puntos Lucams y cupones personales
                se habilitan únicamente tras verificar posesión del correo en{" "}
                <span className="font-mono">/registro</span>.
              </AdminCard>
            ) : (
              <AdminCard className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-brand-muted text-xs">Saldo actual de Puntos Lucams</span>
                  <span className="text-brand-purple font-display text-lg font-bold tabular-nums">
                    {data.customer.loyaltyPoints.toLocaleString("es-CO")} pts
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-brand-muted text-xs">Código para compartir</span>
                  <code className="bg-brand-purple/10 text-brand-purple-dark rounded px-2 py-0.5 font-mono text-xs">
                    {data.customer.referralCode}
                  </code>
                </div>
                {data.personalCoupons.length > 0 && (
                  <div className="border-brand-purple/10 border-t pt-3">
                    <div className="text-brand-purple-dark mb-1.5 text-xs font-semibold">
                      Cupones personales ({data.personalCoupons.length})
                    </div>
                    <ul className="space-y-1.5">
                      {data.personalCoupons.map((cp) => (
                        <li key={cp.id} className="flex items-center justify-between text-xs">
                          <code className="font-mono font-semibold">{cp.code}</code>
                          <AdminBadge tone={cp.usedCount > 0 ? "slate" : "emerald"}>
                            {cp.usedCount > 0 ? "Usado" : "Disponible"}
                          </AdminBadge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {data.referrals.length > 0 && (
                  <div className="border-brand-purple/10 border-t pt-3">
                    <div className="text-brand-purple-dark mb-1.5 text-xs font-semibold">
                      Personas referidas ({data.referrals.length})
                    </div>
                    <ul className="space-y-1.5">
                      {data.referrals.map((ref) => (
                        <li key={ref.id} className="flex items-center justify-between text-xs">
                          <span className="truncate">{ref.referredEmail}</span>
                          <AdminBadge tone={ref.status === "REWARDED" ? "emerald" : "amber"}>
                            {ref.status}
                          </AdminBadge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </AdminCard>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-brand-purple-dark font-display flex items-center gap-2 text-base font-bold">
              <Star className="h-4 w-4" />
              Reseñas ({data.reviews.length})
            </h3>
            {data.reviews.length === 0 ? (
              <AdminEmpty
                icon={<Star className="h-5 w-5" />}
                title="Sin reseñas publicadas"
                description="Las reseñas verificadas dejadas por esta persona aparecerán aquí."
              />
            ) : (
              <AdminCard className="overflow-hidden p-0">
                <ul className="divide-brand-purple/10 divide-y">
                  {data.reviews.map((rev) => (
                    <li key={rev.id} className="p-4">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-brand-purple-dark text-sm font-medium">
                          {rev.productName}
                        </span>
                        <AdminBadge tone={rev.isApproved ? "emerald" : "amber"}>
                          {rev.isApproved ? "Aprobada" : "Pendiente"} · {rev.rating}★
                        </AdminBadge>
                      </div>
                      <p className="text-brand-purple-dark/80 text-xs">{rev.comment}</p>
                    </li>
                  ))}
                </ul>
              </AdminCard>
            )}
          </section>
        </div>
      )}

      {activeTab === "privacy" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" role="tabpanel">
          <section className="space-y-3">
            <h3 className="text-brand-purple-dark font-display flex items-center gap-2 text-base font-bold">
              <ShieldCheck className="h-4 w-4" />
              Evidencia de consentimientos Ley 1581 ({data.consents.length})
            </h3>
            {data.consents.length === 0 ? (
              <AdminEmpty
                icon={<ShieldCheck className="h-5 w-5" />}
                title="Sin eventos en ledger de consentimiento"
                description="Aquí se listan las aceptaciones y revocaciones de tratamiento y marketing."
              />
            ) : (
              <AdminCard className="overflow-hidden p-0">
                <ul className="divide-brand-purple/10 divide-y">
                  {data.consents.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-2 p-3.5 text-xs"
                    >
                      <div>
                        <div className="text-brand-purple-dark font-semibold">
                          {CONSENT_SCOPE_LABEL[c.scope] ?? c.scope}
                        </div>
                        <div className="text-brand-muted mt-0.5">
                          Versión {c.version} · {formatDateTimeCO(toDate(c.acceptedAt))}
                        </div>
                      </div>
                      <AdminBadge tone={!c.accepted || c.isRevoked ? "rose" : "emerald"}>
                        {!c.accepted ? "Baja / Rechazo" : c.isRevoked ? "Revocado" : "Vigente"}
                      </AdminBadge>
                    </li>
                  ))}
                </ul>
              </AdminCard>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-brand-purple-dark font-display flex items-center gap-2 text-base font-bold">
              <MapPin className="h-4 w-4" />
              Direcciones guardadas ({data.addresses.length})
            </h3>
            {data.addresses.length === 0 ? (
              <AdminEmpty
                icon={<MapPin className="h-5 w-5" />}
                title="Sin libreta de direcciones"
                description="Las direcciones guardadas en Mi Cuenta se listan acá."
              />
            ) : (
              <div className="space-y-2.5">
                {data.addresses.map((addr) => (
                  <AdminCard key={addr.id} className="p-3.5 text-xs">
                    <div className="text-brand-purple-dark font-semibold">{addr.name}</div>
                    <div className="text-brand-purple-dark/80 mt-0.5">
                      {addr.line1}
                      {addr.line2 ? `, ${addr.line2}` : ""}
                    </div>
                    <div className="text-brand-muted mt-0.5">
                      {addr.city}, {addr.department} · Tel: {addr.phone}
                    </div>
                  </AdminCard>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === "identities" && (
        <div className="space-y-4" role="tabpanel">
          {data.pendingMergesCount > 0 && canMerge && (
            <AdminCard className="border-amber-300 bg-amber-50/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-amber-950">
                  <strong>
                    Hay {data.pendingMergesCount} posible(s) duplicado(s) pendiente(s) de revisión
                    humana
                  </strong>{" "}
                  asociados a este contacto (teléfono comprador compartido, documento DIAN o email
                  alterno).
                </div>
                <Link
                  href="/admin/clientes/duplicados"
                  className="inline-flex min-h-10 items-center rounded-lg bg-amber-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
                >
                  Revisar en bandeja de fusión
                </Link>
              </div>
            </AdminCard>
          )}

          {data.identities.length === 0 ? (
            <AdminEmpty
              icon={<Fingerprint className="h-5 w-5" />}
              title="Sin llaves secundarias registradas"
              description="Aquí se listan los correos, teléfonos E.164 y sesiones verificadas vinculadas a este contacto."
            />
          ) : (
            <AdminCard className="overflow-hidden p-0">
              <ul className="divide-brand-purple/10 divide-y">
                {data.identities.map((ident) => (
                  <li
                    key={ident.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-3.5 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <AdminBadge tone="slate">{ident.type}</AdminBadge>
                        <span className="text-brand-purple-dark font-mono font-semibold">
                          {ident.valueDisplay}
                        </span>
                      </div>
                      <div className="text-brand-muted mt-1">
                        Fuente: {ident.verificationSource ?? "observado"} · Visto{" "}
                        {formatDateTimeCO(toDate(ident.lastSeenAt))}
                      </div>
                    </div>
                    {ident.verificationStatus === "VERIFIED" ? (
                      <AdminBadge tone="emerald">
                        <CheckCircle2 className="mr-1 inline h-3 w-3" />
                        Verificada
                      </AdminBadge>
                    ) : ident.verificationStatus === "REVOKED" ? (
                      <AdminBadge tone="rose">Revocada</AdminBadge>
                    ) : (
                      <AdminBadge tone="amber">Observada sin verificar</AdminBadge>
                    )}
                  </li>
                ))}
              </ul>
            </AdminCard>
          )}
        </div>
      )}
    </div>
  );
}

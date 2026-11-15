/*
 * Admin > Finanzas > Conciliación contra entrega (COD) · ADR-064.
 *
 * Lista las órdenes COD ENTREGADAS y su estado de remesa: "por remitir" (el courier cobró el efectivo
 * pero aún no llegó a la tienda), "remitido" (Lucy recibió el depósito) o "discrepancia" (no cuadra).
 * Antifraude: hace visible el efectivo que el courier debe y las diferencias. Hereda SUPERADMIN por
 * la matriz RBAC deny-by-default; igual lo exigimos explícito (dinero).
 *
 * Fase 3D: banner superior de estado de la contraentrega (setting CMS
 * COD_ENABLED, leído fail-closed igual que el checkout). Activa → esmeralda
 * con link a Ajustes; desactivada → ámbar + botón para activarla ahí mismo.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Wallet, ArrowLeft, ShieldBan, Search, Clock, Users } from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminComboBarLineChart,
  AdminNotice,
  AdminEmpty,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminSegmentedBar,
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
} from "@/components/admin-page";
import {
  ADMIN_ROLE_SETS,
  adminHomePath,
  canAccessAdminPath,
  hasCapability,
} from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import { maskEmail, maskEmailsInText } from "@/lib/pii-mask";
import { getSettingValue } from "@/lib/cms";
import { formatCOP } from "@/lib/format";
import {
  listCodReconciliation,
  getCodReconciliationTotals,
  getCodDailyPulse,
  type CodReconFilter,
  type CodReconStatus,
} from "@/features/orders/cod-reconciliation";
import { CodRowActions } from "./conciliacion-actions";
import { CodEnableButton } from "./cod-enable-button";
import { formatDateCO } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Conciliación contra entrega",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const SLA_AGING_DAYS = 7;

const FILTERS: { value: CodReconFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "pending", label: "Por remitir" },
  { value: "remitted", label: "Remitidas" },
  { value: "discrepancy", label: "Discrepancias" },
];

const STATUS_META: Record<CodReconStatus, { label: string; tone: "amber" | "emerald" | "rose" }> = {
  PENDING_REMIT: { label: "Por remitir", tone: "amber" },
  REMITTED: { label: "Remitido", tone: "emerald" },
  DISCREPANCY: { label: "Discrepancia", tone: "rose" },
};

type SearchParams = Promise<{ filter?: string; q?: string; page?: string }>;

export default async function ConciliacionCodPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireRole(ADMIN_ROLE_SETS.FINANCE_COD);
  const role = session.admin.role;
  const isSuperadmin = role === "SUPERADMIN";
  const canReadPii = hasCapability(role, "orders:read_pii");
  const canViewContacts = canAccessAdminPath(role, "/admin/clientes");
  const homeHref = adminHomePath(role);

  const sp = await searchParams;
  const filter: CodReconFilter = (["all", "pending", "remitted", "discrepancy"] as const).includes(
    sp.filter as CodReconFilter,
  )
    ? (sp.filter as CodReconFilter)
    : "all";
  const qRaw = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  // Estado del setting COD_ENABLED — mismo criterio fail-closed del checkout
  // (features/checkout/service.ts): solo el valor exacto "true" la habilita.
  const [totals, list, pulse, codEnabledRaw] = await Promise.all([
    getCodReconciliationTotals(),
    listCodReconciliation({ filter, q: qRaw, allowEmailSearch: canReadPii, page }),
    getCodDailyPulse(14),
    getSettingValue("COD_ENABLED", "false"),
  ]);
  const codEnabled = codEnabledRaw === "true";
  const { items, total, totalPages } = list;
  const nowMs = new Date().getTime();
  const maxPulseCop = Math.max(0, ...pulse.map((b) => Math.max(b.deliveredCop, b.remittedCop)));
  const totalOrdersAll = totals.pendingCount + totals.remittedCount + totals.discrepancyCount;

  const filterCounts: Record<CodReconFilter, number> = {
    all: totalOrdersAll,
    pending: totals.pendingCount,
    remitted: totals.remittedCount,
    discrepancy: totals.discrepancyCount,
  };

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Wallet className="h-5 w-5" />}
        title="Conciliación contra entrega"
        subtitle="Efectivo de los pedidos contra entrega ya entregados: qué remesó el mensajero y qué falta"
        breadcrumbs={[
          { label: "Admin", href: homeHref },
          { label: "Finanzas", href: "/admin/finanzas" },
          { label: "Conciliación" },
        ]}
        actions={
          <Link
            href="/admin/finanzas/bloqueos"
            className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex min-h-9 items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold transition-colors"
          >
            <ShieldBan className="h-3.5 w-3.5" />
            Bloqueos COD
          </Link>
        }
      />

      <AdminPageBody>
        {/* Banner de estado COD (Fase 3D): sin este aviso el módulo quedaba
            vacío "en silencio" cuando la contraentrega está apagada y Lucy no
            sabía si era un bug o una decisión. */}
        {codEnabled ? (
          <AdminNotice tone="success">
            <strong>Contraentrega activa:</strong> los clientes pueden elegir «pago contra entrega»
            en el checkout.
            {isSuperadmin && (
              <>
                {" "}
                Se apaga en{" "}
                <Link
                  href="/admin/contenido/paginas/global"
                  className="font-semibold underline hover:text-emerald-900"
                >
                  Contenido › Ajustes del sitio › Comercio
                </Link>{" "}
                (ajuste COD_ENABLED).
              </>
            )}
          </AdminNotice>
        ) : (
          <AdminNotice tone="warning">
            <strong>Contraentrega DESACTIVADA:</strong> este módulo no tendrá movimientos nuevos —
            la tabla de abajo es solo el histórico. El checkout no ofrece «pago contra entrega» (el
            ajuste COD_ENABLED está apagado o no existe).
            {isSuperadmin && (
              <>
                {" "}
                <Link
                  href="/admin/contenido/paginas/global"
                  className="font-semibold underline hover:text-amber-900"
                >
                  Editar en Ajustes del sitio › Comercio
                </Link>
                <CodEnableButton />
              </>
            )}
          </AdminNotice>
        )}

        <AdminNotice tone="info">
          El efectivo de un pedido contra entrega lo cobra el mensajero al entregar y luego lo{" "}
          <strong>remite</strong> a tu cuenta. Aquí marcas cuándo recibiste cada remesa (requiere
          confirmación MFA). Lo que sigue <strong>por remitir</strong> es plata que el mensajero ya
          cobró y aún te debe.
          {!canReadPii && (
            <>
              {" "}
              <strong>Modo analítico:</strong> los correos de compradores se muestran enmascarados
              por mínimo privilegio.
            </>
          )}
        </AdminNotice>

        {/* KPIs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AdminCard className="p-4">
            <div className="text-brand-muted mb-1 text-xs font-semibold tracking-wide uppercase">
              Por remitir
            </div>
            <div className="font-display text-2xl font-bold text-amber-700 tabular-nums">
              {formatCOP(totals.pendingCop)}
            </div>
            <p className="text-brand-muted mt-1 text-xs">
              {totals.pendingCount} pedido{totals.pendingCount === 1 ? "" : "s"} entregado
              {totals.pendingCount === 1 ? "" : "s"} · el mensajero te debe este efectivo
            </p>
          </AdminCard>
          <AdminCard className="p-4">
            <div className="text-brand-muted mb-1 text-xs font-semibold tracking-wide uppercase">
              Recibido
            </div>
            <div className="text-brand-purple-dark font-display text-2xl font-bold tabular-nums">
              {formatCOP(totals.receivedCop)}
            </div>
            <p className="text-brand-muted mt-1 text-xs">
              {totals.remittedCount} remesa{totals.remittedCount === 1 ? "" : "s"} ya en tu cuenta
              {totals.shortfallCop > 0 ? " (incluye parciales de discrepancias)" : ""}
            </p>
          </AdminCard>
          <AdminCard className="p-4">
            <div className="text-brand-muted mb-1 text-xs font-semibold tracking-wide uppercase">
              Discrepancias
            </div>
            <div
              className={`font-display text-2xl font-bold tabular-nums ${
                totals.discrepancyCount > 0 ? "text-rose-700" : "text-brand-purple-dark/85"
              }`}
            >
              {totals.discrepancyCount > 0 ? formatCOP(totals.shortfallCop) : "0"}
            </div>
            <p className="text-brand-muted mt-1 text-xs">
              {totals.discrepancyCount > 0
                ? `${totals.discrepancyCount} pedido${totals.discrepancyCount === 1 ? "" : "s"} · faltante que no llegó`
                : "Sin efectivo que no cuadre"}
            </p>
          </AdminCard>
        </div>

        {/* Pulso 14 días + salud de cartera COD */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <AdminCard className="p-5 lg:col-span-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-brand-purple-dark font-display text-sm font-bold">
                Pulso 14 días: entregas COD vs remesas recibidas
              </h2>
              <span className="text-brand-muted text-xs">Hora Colombia (COT)</span>
            </div>
            <AdminComboBarLineChart
              ariaLabel="Pulso de 14 días de efectivo contra entrega entregado vs remesado"
              barLegend="Entregado al cliente (COP)"
              lineLegend="Remesado a caja (COP)"
              maxAxisFormatted={maxPulseCop > 0 ? formatCOP(maxPulseCop) : "$0"}
              midAxisFormatted={
                maxPulseCop > 0 ? formatCOP(Math.round(maxPulseCop / 2)) : undefined
              }
              data={pulse.map((b) => ({
                key: b.key,
                label: b.label,
                tickLabel: b.tickLabel,
                barValue: b.deliveredCop,
                barFormatted: `${formatCOP(b.deliveredCop)} (${b.deliveredCount} ent.)`,
                lineValue: b.remittedCop,
                lineFormatted: `${formatCOP(b.remittedCop)} remesados`,
              }))}
            />
          </AdminCard>

          <AdminCard className="flex flex-col justify-between p-5 lg:col-span-2">
            <div>
              <h2 className="text-brand-purple-dark font-display mb-1 text-sm font-bold">
                Balance acumulado de recaudo COD
              </h2>
              <p className="text-brand-muted mb-4 text-xs">
                Distribución en pesos entre efectivo ya depositado, pendiente en calle y faltantes.
              </p>
              <AdminSegmentedBar
                ariaLabel="Distribución acumulada del recaudo contra entrega"
                items={[
                  {
                    key: "received",
                    label: "Recibido",
                    count: Math.round(totals.receivedCop / 100),
                    tone: "emerald",
                    href: "/admin/finanzas/conciliacion?filter=remitted",
                    sublabel: formatCOP(totals.receivedCop),
                  },
                  {
                    key: "pending",
                    label: "Por remitir",
                    count: Math.round(totals.pendingCop / 100),
                    tone: "amber",
                    href: "/admin/finanzas/conciliacion?filter=pending",
                    sublabel: formatCOP(totals.pendingCop),
                  },
                  {
                    key: "shortfall",
                    label: "Faltante",
                    count: Math.round(totals.shortfallCop / 100),
                    tone: "rose",
                    href: "/admin/finanzas/conciliacion?filter=discrepancy",
                    sublabel: formatCOP(totals.shortfallCop),
                  },
                ]}
              />
            </div>
            <div className="border-brand-purple/10 mt-4 rounded-lg border bg-slate-50/70 p-3 text-xs text-slate-600">
              <strong className="text-brand-purple-dark">Regla SLA antifraude:</strong> toda entrega
              que supere <strong>{SLA_AGING_DAYS} días</strong> sin remesa se resalta en rojo para
              reclamar de inmediato a la transportadora o mensajero.
            </div>
          </AdminCard>
        </div>

        {/* Filtros por estado + buscador */}
        <form
          method="GET"
          className="border-brand-purple/10 flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const params = new URLSearchParams();
              if (f.value !== "all") params.set("filter", f.value);
              if (qRaw) params.set("q", qRaw);
              const href = params.size
                ? `/admin/finanzas/conciliacion?${params.toString()}`
                : "/admin/finanzas/conciliacion";
              const active = filter === f.value;
              return (
                <Link
                  key={f.value}
                  href={href}
                  aria-current={active ? "true" : undefined}
                  className={
                    active
                      ? "bg-brand-purple inline-flex min-h-9 items-center rounded-full px-3 py-1 text-xs font-semibold text-white"
                      : "border-brand-purple/20 text-brand-purple-dark hover:border-brand-purple/50 inline-flex min-h-9 items-center rounded-full border bg-white px-3 py-1 text-xs font-semibold transition-colors"
                  }
                >
                  {f.label} ({filterCounts[f.value]})
                </Link>
              );
            })}
          </div>

          <div className="flex min-w-56 flex-1 items-center gap-2 sm:max-w-xs">
            {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
            <div className="relative flex-1">
              <Search className="text-brand-muted pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
              <input
                type="search"
                name="q"
                defaultValue={qRaw}
                placeholder={
                  canReadPii
                    ? "Pedido, guía, transportadora o email…"
                    : "Pedido, guía o transportadora…"
                }
                className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white pr-3 pl-8 text-xs focus:ring-2 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="bg-gradient-brand h-9 rounded-md px-3 text-xs font-semibold text-white hover:brightness-110"
            >
              Buscar
            </button>
          </div>

          {(filter !== "all" || qRaw) && (
            <Link
              href="/admin/finanzas/conciliacion"
              className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold"
            >
              Limpiar filtro
            </Link>
          )}
          <Link
            href="/admin/finanzas"
            className="text-brand-muted hover:text-brand-purple-dark ml-auto inline-flex items-center gap-1 text-xs font-semibold"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Volver a Finanzas
          </Link>
        </form>

        {items.length === 0 ? (
          <AdminEmpty
            icon={<Wallet className="h-5 w-5" />}
            title={
              filter === "all" && !qRaw ? "Sin pedidos contra entrega entregados" : "Sin resultados"
            }
            description={
              filter === "all" && !qRaw
                ? "Cuando entregues un pedido pagado contra entrega, aparecerá aquí para conciliar el efectivo."
                : "Prueba limpiando el filtro de estado o ajustando tu búsqueda."
            }
          />
        ) : (
          <AdminTable minWidth={760}>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Pedido</th>
                <th className="px-4 py-3 text-left font-semibold">Entregado</th>
                <th className="px-4 py-3 text-right font-semibold">Esperado</th>
                <th className="px-4 py-3 text-left font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Remitido</th>
                <th className="px-4 py-3 text-left font-semibold">Acciones</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((r) => {
                const meta = STATUS_META[r.status];
                const displayEmail = canReadPii ? r.email : maskEmail(r.email);
                const displayReason =
                  r.discrepancyReason != null
                    ? canReadPii
                      ? r.discrepancyReason
                      : maskEmailsInText(r.discrepancyReason)
                    : null;
                const displayNote =
                  r.note != null ? (canReadPii ? r.note : maskEmailsInText(r.note)) : null;
                const ageDays =
                  r.status === "PENDING_REMIT" && r.deliveredAt
                    ? Math.floor((nowMs - r.deliveredAt.getTime()) / 86_400_000)
                    : 0;
                const isOverdueRemit = r.status === "PENDING_REMIT" && ageDays >= SLA_AGING_DAYS;

                return (
                  <AdminTableRow key={r.orderId}>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/pedidos/${encodeURIComponent(r.number)}`}
                          className="text-brand-purple-dark hover:text-brand-purple font-mono text-sm font-semibold underline"
                        >
                          {r.number}
                        </Link>
                        {canViewContacts && r.contactId && (
                          <Link
                            href={`/admin/clientes/${encodeURIComponent(r.contactId)}`}
                            className="bg-brand-purple/10 text-brand-purple-dark hover:bg-brand-purple/20 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors"
                          >
                            <Users className="h-2.5 w-2.5" />
                            360°
                          </Link>
                        )}
                      </div>
                      <div className="text-brand-muted text-xs">{displayEmail}</div>
                      {r.trackingNumber && (
                        <div className="text-brand-muted font-mono text-[10px]">
                          {r.shippingCarrier ?? "guía"} · {r.trackingNumber}
                        </div>
                      )}
                    </td>
                    <td className="text-brand-muted px-4 py-3 align-top text-xs">
                      <div>{r.deliveredAt ? formatDateCO(r.deliveredAt) : "—"}</div>
                      {isOverdueRemit && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-rose-200">
                          <Clock className="h-2.5 w-2.5" />
                          Hace {ageDays} días sin remesa
                        </span>
                      )}
                    </td>
                    <td className="text-brand-purple-dark px-4 py-3 text-right align-top text-sm font-semibold tabular-nums">
                      {formatCOP(r.expectedAmount)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <AdminBadge tone={meta.tone}>{meta.label}</AdminBadge>
                      {r.carrierRef && (
                        <div className="text-brand-muted mt-1 font-mono text-[10px]">
                          Ref: {r.carrierRef}
                        </div>
                      )}
                      {r.status === "DISCREPANCY" && displayReason && (
                        <div className="mt-1 max-w-44 text-[11px] text-rose-700">
                          {displayReason}
                        </div>
                      )}
                      {displayNote && (
                        <div className="text-brand-muted mt-0.5 max-w-44 text-[11px]">
                          Nota: {displayNote}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right align-top text-sm tabular-nums">
                      {r.remittedAmount != null ? (
                        <span
                          className={
                            r.remittedAmount === r.expectedAmount
                              ? "text-emerald-700"
                              : "font-semibold text-amber-700"
                          }
                        >
                          {formatCOP(r.remittedAmount)}
                        </span>
                      ) : (
                        <span className="text-brand-muted">—</span>
                      )}
                      {r.remittedAt && (
                        <div className="text-brand-muted text-[10px]">
                          {formatDateCO(r.remittedAt)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <CodRowActions
                        orderId={r.orderId}
                        expectedAmount={r.expectedAmount}
                        status={r.status}
                      />
                    </td>
                  </AdminTableRow>
                );
              })}
            </AdminTableBody>
          </AdminTable>
        )}

        {totalPages > 1 && (
          <div className="text-brand-purple-dark/70 flex items-center justify-between text-sm">
            <span>
              {total} pedido{total === 1 ? "" : "s"} · página {Math.min(page, totalPages)} de{" "}
              {totalPages}
            </span>
            <div className="flex gap-1">
              {page > 1 && (
                <PageLink filter={filter} q={qRaw} page={Math.min(page, totalPages + 1) - 1}>
                  ← Anterior
                </PageLink>
              )}
              {page < totalPages && (
                <PageLink filter={filter} q={qRaw} page={page + 1}>
                  Siguiente →
                </PageLink>
              )}
            </div>
          </div>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}

function PageLink({
  filter,
  q,
  page,
  children,
}: {
  filter: CodReconFilter;
  q?: string;
  page: number;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (filter !== "all") params.set("filter", filter);
  if (q) params.set("q", q);
  return (
    <Link
      href={`/admin/finanzas/conciliacion?${params.toString()}`}
      className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 rounded-md border px-3 py-1.5 text-xs font-semibold"
    >
      {children}
    </Link>
  );
}

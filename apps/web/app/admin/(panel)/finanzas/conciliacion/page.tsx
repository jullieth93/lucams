/*
 * Admin > Finanzas > Conciliación contra entrega (COD) · ADR-064.
 *
 * Lista las órdenes COD ENTREGADAS y su estado de remesa: "por remitir" (el courier cobró el efectivo
 * pero aún no llegó a la tienda), "remitido" (Lucy recibió el depósito) o "discrepancia" (no cuadra).
 * Antifraude: hace visible el efectivo que el courier debe y las diferencias. Hereda SUPERADMIN por
 * la matriz RBAC deny-by-default; igual lo exigimos explícito (dinero).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Wallet, ArrowLeft } from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminNotice,
  AdminEmpty,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
} from "@/components/admin-page";
import { requireRole } from "@/lib/admin-rbac-guard";
import { formatCOP } from "@/lib/format";
import {
  listCodReconciliation,
  getCodReconciliationTotals,
  type CodReconFilter,
  type CodReconStatus,
} from "@/features/orders/cod-reconciliation";
import { CodRowActions } from "./conciliacion-actions";

export const metadata: Metadata = {
  title: "Conciliación contra entrega",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

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

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

type SearchParams = Promise<{ filter?: string; page?: string }>;

export default async function ConciliacionCodPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole(["SUPERADMIN"]);
  const sp = await searchParams;
  const filter: CodReconFilter = (["all", "pending", "remitted", "discrepancy"] as const).includes(
    sp.filter as CodReconFilter,
  )
    ? (sp.filter as CodReconFilter)
    : "all";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [totals, list] = await Promise.all([
    getCodReconciliationTotals(),
    listCodReconciliation({ filter, page }),
  ]);
  const { items, total, totalPages } = list;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Wallet className="h-5 w-5" />}
        title="Conciliación contra entrega"
        subtitle="Efectivo de los pedidos contra entrega ya entregados: qué remesó el mensajero y qué falta"
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Finanzas", href: "/admin/finanzas" },
          { label: "Conciliación" },
        ]}
      />

      <AdminPageBody>
        <AdminNotice tone="info">
          El efectivo de un pedido contra entrega lo cobra el mensajero al entregar y luego lo{" "}
          <strong>remite</strong> a tu cuenta. Aquí marcas cuándo recibiste cada remesa. Lo que
          sigue <strong>por remitir</strong> es plata que el mensajero ya cobró y aún te debe.
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
              Remitido
            </div>
            <div className="text-brand-purple-dark font-display text-2xl font-bold tabular-nums">
              {formatCOP(totals.remittedCop)}
            </div>
            <p className="text-brand-muted mt-1 text-xs">
              {totals.remittedCount} pedido{totals.remittedCount === 1 ? "" : "s"} ya en tu cuenta
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
              {totals.discrepancyCount}
            </div>
            <p className="text-brand-muted mt-1 text-xs">Pedidos con efectivo que no cuadra</p>
          </AdminCard>
        </div>

        {/* Filtro */}
        <form
          method="GET"
          className="border-brand-purple/10 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 shadow-sm"
        >
          <div>
            <label
              htmlFor="f-filter"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Ver
            </label>
            <select
              id="f-filter"
              name="filter"
              defaultValue={filter}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="bg-gradient-brand h-9 rounded-md px-4 text-sm font-semibold text-white hover:brightness-110"
          >
            Aplicar
          </button>
          {filter !== "all" && (
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
            title={filter === "all" ? "Sin pedidos contra entrega entregados" : "Sin resultados"}
            description={
              filter === "all"
                ? "Cuando entregues un pedido pagado contra entrega, aparecerá aquí para conciliar el efectivo."
                : "Prueba con otro filtro."
            }
          />
        ) : (
          <AdminTable>
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
                return (
                  <AdminTableRow key={r.orderId}>
                    <td className="px-4 py-3 align-top">
                      <Link
                        href={`/admin/pedidos/${encodeURIComponent(r.number)}`}
                        className="text-brand-purple-dark hover:text-brand-purple font-mono text-sm font-semibold underline"
                      >
                        {r.number}
                      </Link>
                      <div className="text-brand-muted text-xs">{r.email}</div>
                      {r.trackingNumber && (
                        <div className="text-brand-muted font-mono text-[10px]">
                          {r.shippingCarrier ?? "guía"} · {r.trackingNumber}
                        </div>
                      )}
                    </td>
                    <td className="text-brand-muted px-4 py-3 align-top text-xs">
                      {r.deliveredAt ? dateFmt.format(r.deliveredAt) : "—"}
                    </td>
                    <td className="text-brand-purple-dark px-4 py-3 text-right align-top text-sm font-semibold tabular-nums">
                      {formatCOP(r.expectedAmount)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <AdminBadge tone={meta.tone}>{meta.label}</AdminBadge>
                      {r.status === "DISCREPANCY" && r.discrepancyReason && (
                        <div className="mt-1 max-w-40 text-[11px] text-rose-700">
                          {r.discrepancyReason}
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
                          {dateFmt.format(r.remittedAt)}
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
              {total} pedido{total === 1 ? "" : "s"} · página {page} de {totalPages}
            </span>
            <div className="flex gap-1">
              {page > 1 && (
                <PageLink filter={filter} page={page - 1}>
                  ← Anterior
                </PageLink>
              )}
              {page < totalPages && (
                <PageLink filter={filter} page={page + 1}>
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
  page,
  children,
}: {
  filter: CodReconFilter;
  page: number;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (filter !== "all") params.set("filter", filter);
  return (
    <Link
      href={`/admin/finanzas/conciliacion?${params.toString()}`}
      className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 rounded-md border px-3 py-1.5 text-xs font-semibold"
    >
      {children}
    </Link>
  );
}

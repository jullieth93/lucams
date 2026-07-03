/*
 * Admin > Pedidos — Listado con búsqueda + filtros + paginación.
 *
 * Reusa listOrders() de features/orders/service.ts. Una fila por Order;
 * click → /admin/pedidos/[id] con detalle + items + tracking + botones
 * (descargar label PDF, reintentar shipment si falló, cambiar estado).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Box, ChevronRight } from "lucide-react";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
  AdminEmpty,
  AdminBadge,
  AdminNotice,
} from "@/components/admin-page";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getCurrentAdmin } from "@/lib/auth";
import {
  listOrders,
  countOrdersNeedingReconciliation,
  type OrderListOpts,
} from "@/features/orders/service";
import { formatCOP } from "@/lib/format";

export const metadata: Metadata = { title: "Pedidos" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const ALLOWED_STATUS: OrderListOpts["status"][] = [
  "all",
  "PENDING_PAYMENT",
  "PAID",
  "FULFILLING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
];

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

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

export default async function AdminPedidosPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const q = pickString(sp, "q");
  const statusRaw = pickString(sp, "status") as OrderListOpts["status"] | undefined;
  const status = (
    ALLOWED_STATUS.includes(statusRaw ?? "all") ? (statusRaw ?? "all") : "all"
  ) as OrderListOpts["status"];
  const sortRaw = pickString(sp, "sort");
  const sort = (
    ["oldest", "total-desc"].includes(sortRaw ?? "") ? sortRaw : "recent"
  ) as OrderListOpts["sort"];
  const page = Number(sp.page) || 1;
  // #6 (certificación Bloque A) — filtro "necesitan atención": órdenes donde
  // Wompi cobró pero el stock se agotó (reconciliación admin pendiente).
  const needsReconFilter = pickString(sp, "atencion") === "1";

  const { items, total, totalPages } = await listOrders({
    q,
    status,
    sort,
    page,
    needsReconciliation: needsReconFilter || undefined,
  });
  const hasActiveFilters = !!q || status !== "all" || sort !== "recent" || needsReconFilter;

  // Contador global de órdenes que necesitan reconciliación (para el banner).
  const reconCount = await countOrdersNeedingReconciliation();

  const dateFmt = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Box className="h-5 w-5" />}
        title="Pedidos"
        subtitle={
          <>
            {total} {total === 1 ? "pedido" : "pedidos"}
            {hasActiveFilters && " · con filtros aplicados"}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Ventas" },
          { label: "Pedidos" },
        ]}
      />

      <AdminPageBody>
        {/*
         * #6 (certificación Bloque A) — Banner de alerta: órdenes donde Wompi
         * cobró pero el stock se agotó al confirmar. Necesitan que Lucy decida
         * reembolso o producir stock. VISIBLE (no muere en un log).
         */}
        {reconCount > 0 && !needsReconFilter && (
          <AdminNotice tone="error">
            <strong>
              🔴 {reconCount} pedido{reconCount === 1 ? "" : "s"} necesita
              {reconCount === 1 ? "" : "n"} tu atención
            </strong>{" "}
            — el pago se cobró pero no había stock suficiente al confirmar.{" "}
            <Link href="/admin/pedidos?atencion=1" className="font-semibold underline">
              Ver pedidos a reconciliar →
            </Link>
          </AdminNotice>
        )}
        {needsReconFilter && (
          <AdminNotice tone="warning">
            Mostrando solo pedidos que necesitan reconciliación (pago cobrado sin stock).{" "}
            <Link href="/admin/pedidos" className="font-semibold underline">
              Ver todos los pedidos
            </Link>
          </AdminNotice>
        )}
        <form
          method="GET"
          className="border-brand-purple/10 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-12"
        >
          <div className="sm:col-span-5">
            <label
              htmlFor="f-q"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Buscar
            </label>
            <Input
              id="f-q"
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder="Número (LCM-2026-0001), email, teléfono o nombre…"
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
          </div>
          <div className="sm:col-span-3">
            <label
              htmlFor="f-status"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Estado
            </label>
            <select
              id="f-status"
              name="status"
              defaultValue={status}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="all">Todos</option>
              <option value="PENDING_PAYMENT">Esperando pago</option>
              <option value="PAID">Pagado</option>
              <option value="FULFILLING">En preparación</option>
              <option value="SHIPPED">Enviado</option>
              <option value="DELIVERED">Entregado</option>
              <option value="CANCELLED">Cancelado</option>
              <option value="REFUNDED">Reembolsado</option>
            </select>
          </div>
          <div className="sm:col-span-3">
            <label
              htmlFor="f-sort"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Ordenar por
            </label>
            <select
              id="f-sort"
              name="sort"
              defaultValue={sort}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="recent">Más recientes primero</option>
              <option value="oldest">Más antiguos primero</option>
              <option value="total-desc">Mayor monto</option>
            </select>
          </div>
          <div className="flex items-end gap-2 sm:col-span-1">
            <Button
              type="submit"
              size="sm"
              className="bg-gradient-brand h-9 w-full text-white hover:brightness-110"
            >
              Aplicar
            </Button>
          </div>
          {hasActiveFilters && (
            <div className="sm:col-span-12">
              <Link
                href="/admin/pedidos"
                className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold"
              >
                Limpiar filtros
              </Link>
            </div>
          )}
        </form>

        {items.length === 0 ? (
          <AdminEmpty
            icon={<Box className="h-5 w-5" />}
            title={hasActiveFilters ? "Sin resultados" : "Aún no hay pedidos"}
            description={
              hasActiveFilters
                ? "Prueba quitar algún filtro o cambiar el texto de búsqueda."
                : "Cuando el primer cliente complete checkout, aparecerá acá."
            }
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Número</th>
                <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                <th className="px-4 py-3 text-center font-semibold">Items</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 text-left font-semibold">Estado</th>
                <th className="px-4 py-3 text-left font-semibold">Envío</th>
                <th className="px-4 py-3 text-left font-semibold">Creado</th>
                <th className="px-4 py-3" />
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((o) => {
                const fullName =
                  o.customer?.firstName || o.customer?.lastName
                    ? [o.customer.firstName, o.customer.lastName].filter(Boolean).join(" ")
                    : "—";
                return (
                  <AdminTableRow key={o.id}>
                    <td className="px-4 py-3">
                      <div className="text-brand-purple-dark font-mono text-sm font-semibold">
                        {o.number}
                      </div>
                      {o.wompiTransactionId && (
                        <div className="text-brand-muted font-mono text-[10px]">
                          wompi · {o.wompiTransactionId.slice(0, 14)}…
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-brand-purple-dark text-sm font-medium">{fullName}</div>
                      <div className="text-brand-muted text-xs">{o.email}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-brand-purple-dark/85 text-xs tabular-nums">
                        {o._count.items}
                      </span>
                    </td>
                    <td className="text-brand-purple-dark px-4 py-3 text-right text-sm font-semibold tabular-nums">
                      {formatCOP(o.total)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <AdminBadge tone={STATUS_TONE[o.status] ?? "slate"}>
                          {STATUS_LABEL[o.status] ?? o.status}
                        </AdminBadge>
                        {/* #6 — flag visible de reconciliación pendiente. */}
                        {o.needsReconciliation && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-800"
                            title={o.reconciliationReason ?? "Pago cobrado sin stock — requiere atención"}
                          >
                            🔴 Reconciliar
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {o.trackingNumber ? (
                        <div>
                          <div className="text-brand-purple-dark/85 text-xs">
                            {o.shippingCarrier ?? "—"}
                          </div>
                          <div className="text-brand-muted font-mono text-[10px]">
                            {o.trackingNumber}
                          </div>
                        </div>
                      ) : (
                        <span className="text-brand-muted text-xs">
                          {o.shippingCarrier ?? "—"}
                        </span>
                      )}
                    </td>
                    <td className="text-brand-muted px-4 py-3 text-xs">
                      {dateFmt.format(o.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/pedidos/${o.number}`}
                        className="text-brand-purple-dark hover:text-brand-purple inline-flex items-center gap-1 text-xs font-medium"
                      >
                        Ver detalle
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
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
              {total} pedidos · página {page} de {totalPages}
            </span>
            <div className="flex gap-1">
              {page > 1 && (
                <PaginationLink page={page - 1} q={q} status={status} sort={sort}>
                  ← Anterior
                </PaginationLink>
              )}
              {page < totalPages && (
                <PaginationLink page={page + 1} q={q} status={status} sort={sort}>
                  Siguiente →
                </PaginationLink>
              )}
            </div>
          </div>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}

function PaginationLink({
  page,
  q,
  status,
  sort,
  children,
}: {
  page: number;
  q?: string;
  status?: string;
  sort?: string;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (q) params.set("q", q);
  if (status && status !== "all") params.set("status", status);
  if (sort && sort !== "recent") params.set("sort", sort);
  return (
    <Link
      href={`/admin/pedidos?${params.toString()}`}
      className="border-brand-purple/20 hover:bg-brand-purple/5 text-brand-purple-dark rounded-md border bg-white px-3 py-1.5 text-xs font-medium"
    >
      {children}
    </Link>
  );
}

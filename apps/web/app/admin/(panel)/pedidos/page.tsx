/*
 * Admin > Pedidos — Hub operativo y comercial con KPIs ejecutivos, pulso diario (14d Bogotá),
 * distribución del pipeline, filtros combinables, encabezados ordenables y redacción server-side
 * de PII y montos comerciales según las capacidades reales del rol (Bloque 5).
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Box,
  ChevronRight,
  Clock,
  Hammer,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Truck,
} from "lucide-react";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminCard,
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
  AdminEmpty,
  AdminBadge,
  AdminNotice,
  AdminComboBarLineChart,
  AdminSegmentedBar,
  OpsCard,
  SortableHeader,
  type ComboChartDatum,
  type SegmentedBarItem,
} from "@/components/admin-page";
import { Input } from "@/components/ui/input";
import { Hint } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  ADMIN_ROLE_SETS,
  canAccessAdminPath,
  canSeeOrderCodCollectionAmount,
  canSeeOrderCommercialBreakdown,
  hasCapability,
} from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import {
  getOrdersOperationalSummaryForActor,
  listOrdersForActor,
  type OrderListOpts,
  type OrderListSort,
} from "@/features/orders/service";
import { carrierDisplayName } from "@/features/shipping/lucams-shipping";
import { formatCOP } from "@/lib/format";
import { formatDateTimeCO } from "@/lib/datetime";

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

const ALLOWED_SORTS: OrderListSort[] = [
  "recent",
  "oldest",
  "total-desc",
  "total-asc",
  "number-desc",
  "number-asc",
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

const STATUS_TONE: Record<string, "emerald" | "amber" | "purple" | "rose" | "slate" | "turquoise"> =
  {
    PENDING_PAYMENT: "amber",
    PAID: "purple",
    FULFILLING: "turquoise",
    SHIPPED: "purple",
    DELIVERED: "emerald",
    CANCELLED: "rose",
    REFUNDED: "rose",
    DRAFT: "slate",
  };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

export default async function AdminPedidosPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireRole(ADMIN_ROLE_SETS.ALL);
  const role = session.admin.role;
  const canReadPii = hasCapability(role, "orders:read_pii");
  const canReconcile = hasCapability(role, "orders:reconcile");
  const canSeeMoney = canSeeOrderCommercialBreakdown(role);
  const canSeeCodTotal = canSeeOrderCodCollectionAmount(role);
  const canAccessModeration = canAccessAdminPath(role, "/admin/moderacion");

  const sp = await searchParams;
  const q = pickString(sp, "q");
  const statusRaw = pickString(sp, "status") as OrderListOpts["status"] | undefined;
  const status = (
    ALLOWED_STATUS.includes(statusRaw ?? "all") ? (statusRaw ?? "all") : "all"
  ) as OrderListOpts["status"];

  const pagoRaw = pickString(sp, "pago");
  const paymentMethod: OrderListOpts["paymentMethod"] =
    pagoRaw === "WOMPI" || pagoRaw === "COD" ? pagoRaw : "all";

  const desdeRaw = pickString(sp, "desde");
  const fromDate = desdeRaw && ISO_DATE_RE.test(desdeRaw) ? desdeRaw : undefined;
  const hastaRaw = pickString(sp, "hasta");
  const toDate = hastaRaw && ISO_DATE_RE.test(hastaRaw) ? hastaRaw : undefined;

  const sortRaw = pickString(sp, "sort") as OrderListSort | undefined;
  const rawSort: OrderListSort = sortRaw && ALLOWED_SORTS.includes(sortRaw) ? sortRaw : "recent";
  const sort: OrderListSort =
    !canSeeMoney && (rawSort === "total-desc" || rawSort === "total-asc") ? "recent" : rawSort;

  const page = Math.max(1, Number(pickString(sp, "page")) || 1);
  const needsReconFilter = pickString(sp, "atencion") === "1";
  const workshopFilter = pickString(sp, "taller") === "1";

  const [{ items, total, totalPages }, summary] = await Promise.all([
    listOrdersForActor(
      {
        q,
        status,
        paymentMethod,
        fromDate,
        toDate,
        sort,
        page,
        needsReconciliation: needsReconFilter || undefined,
        workshopPending: workshopFilter || undefined,
      },
      role,
    ),
    getOrdersOperationalSummaryForActor(role),
  ]);

  const hasActiveFilters =
    Boolean(q) ||
    status !== "all" ||
    paymentMethod !== "all" ||
    Boolean(fromDate) ||
    Boolean(toDate) ||
    sort !== "recent" ||
    needsReconFilter ||
    workshopFilter;

  const reconCount = canReconcile ? summary.attentionReconciliation : 0;
  const toPrepareCount =
    (summary.countsByStatus.PAID ?? 0) + (summary.countsByStatus.FULFILLING ?? 0);
  const inTransitCount = summary.countsByStatus.SHIPPED ?? 0;
  const pendingPaymentCount = summary.countsByStatus.PENDING_PAYMENT ?? 0;
  const alertCount = canReconcile
    ? summary.attentionReconciliation + summary.renderFailedActive
    : summary.moderationBlocked + summary.renderFailedActive;

  // Serie gráfica de 14 días adaptada al privilegio comercial del rol (0 COP en Taller/Despachos)
  const maxRevenue14d = canSeeMoney
    ? Math.max(0, ...summary.dailySeries.map((d) => d.revenueCents ?? 0))
    : 0;
  const comboData: ComboChartDatum[] = summary.dailySeries.map((d) =>
    canSeeMoney
      ? {
          key: d.key,
          label: d.label,
          tickLabel: d.tickLabel,
          barValue: d.revenueCents ?? 0,
          barFormatted: formatCOP(d.revenueCents ?? 0),
          lineValue: d.activeOrders,
          lineFormatted: `${d.activeOrders} ${d.activeOrders === 1 ? "pedido" : "pedidos"}`,
        }
      : {
          key: d.key,
          label: d.label,
          tickLabel: d.tickLabel,
          barValue: d.activeOrders,
          barFormatted: `${d.activeOrders} en flujo`,
          lineValue: d.dispatchedOrders,
          lineFormatted: `${d.dispatchedOrders} despachado${d.dispatchedOrders === 1 ? "" : "s"}`,
        },
  );

  const pipelineSegments: SegmentedBarItem[] = [
    {
      key: "PAID",
      label: "Pagados",
      count: summary.countsByStatus.PAID ?? 0,
      tone: "purple",
      href: "/admin/pedidos?status=PAID",
    },
    {
      key: "FULFILLING",
      label: "En preparación",
      count: summary.countsByStatus.FULFILLING ?? 0,
      tone: "turquoise",
      href: "/admin/pedidos?status=FULFILLING",
    },
    {
      key: "SHIPPED",
      label: "Enviados",
      count: summary.countsByStatus.SHIPPED ?? 0,
      tone: "pink",
      href: "/admin/pedidos?status=SHIPPED",
    },
    {
      key: "PENDING_PAYMENT",
      label: "Esperando pago",
      count: summary.countsByStatus.PENDING_PAYMENT ?? 0,
      tone: "amber",
      href: "/admin/pedidos?status=PENDING_PAYMENT",
    },
    {
      key: "DELIVERED",
      label: "Entregados",
      count: summary.countsByStatus.DELIVERED ?? 0,
      tone: "emerald",
      href: "/admin/pedidos?status=DELIVERED",
    },
    {
      key: "CLOSED",
      label: "Cancelados / reembolsados",
      count: (summary.countsByStatus.CANCELLED ?? 0) + (summary.countsByStatus.REFUNDED ?? 0),
      tone: "rose",
      href: "/admin/pedidos?status=CANCELLED",
    },
  ];

  const preserveSortParams: Record<string, string | undefined> = {
    q: q || undefined,
    status: status !== "all" ? status : undefined,
    pago: paymentMethod !== "all" ? paymentMethod : undefined,
    desde: fromDate,
    hasta: toDate,
    atencion: needsReconFilter ? "1" : undefined,
    taller: workshopFilter ? "1" : undefined,
  };

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Box className="h-5 w-5" />}
        title="Pedidos"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>
              {total.toLocaleString("es-CO")} {total === 1 ? "pedido" : "pedidos"}
              {hasActiveFilters && " · con filtros aplicados"}
            </span>
            {!canReadPii && (
              <Hint content="Por privacidad (Ley 1581), tu rol operativo visualiza datos personales protegidos desde el servidor.">
                <span className="border-brand-purple/20 bg-brand-cream text-brand-purple-dark inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Privacidad activa
                </span>
              </Hint>
            )}
          </span>
        }
        breadcrumbs={[
          { label: "Inicio", href: "/admin/dashboard" },
          { label: "Ventas" },
          { label: "Pedidos" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canAccessModeration && summary.moderationBlocked > 0 && (
              <Link
                href="/admin/moderacion"
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-700" />
                Moderación pendiente ({summary.moderationBlocked})
              </Link>
            )}
          </div>
        }
      />

      <AdminPageBody>
        {/* Alertas críticas accionables */}
        {reconCount > 0 && !needsReconFilter && (
          <AdminNotice tone="error">
            <strong>
              🔴 {reconCount} pedido{reconCount === 1 ? "" : "s"} necesita
              {reconCount === 1 ? "" : "n"} reconciliación manual
            </strong>{" "}
            — el pago se aprobó pero el stock se agotó al confirmar.{" "}
            <Link href="/admin/pedidos?atencion=1" className="font-semibold underline">
              Filtrar pedidos a reconciliar →
            </Link>
          </AdminNotice>
        )}
        {needsReconFilter && (
          <AdminNotice tone="warning">
            Mostrando únicamente pedidos con reconciliación pendiente (pago cobrado sin stock).{" "}
            <Link href="/admin/pedidos" className="font-semibold underline">
              Ver todos los pedidos
            </Link>
          </AdminNotice>
        )}
        {workshopFilter && (
          <AdminNotice tone="info">
            Mostrando pedidos activos en taller con piezas personalizadas (Pagados + En
            preparación).{" "}
            <Link href="/admin/pedidos" className="font-semibold underline">
              Quitar filtro de taller
            </Link>
          </AdminNotice>
        )}

        {/* 4 KPIs ejecutivos animados */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OpsCard
            href="/admin/pedidos?status=PAID"
            label="Por alistar o producir"
            value={toPrepareCount}
            icon={Hammer}
            tone="purple"
            urgent={toPrepareCount > 0}
            description={`${summary.countsByStatus.PAID ?? 0} pagados · ${summary.countsByStatus.FULFILLING ?? 0} en preparación`}
          />
          <OpsCard
            href="/admin/pedidos?status=SHIPPED"
            label="En tránsito"
            value={inTransitCount}
            icon={Truck}
            tone="turquoise"
            description={`${(summary.countsByStatus.DELIVERED ?? 0).toLocaleString("es-CO")} entregados acumulados`}
          />
          <OpsCard
            href="/admin/pedidos?status=PENDING_PAYMENT"
            label="Esperando pago"
            value={pendingPaymentCount}
            icon={Clock}
            tone="amber"
            description={
              canSeeMoney && summary.revenue14dCents !== null
                ? `14 días: ${formatCOP(summary.revenue14dCents)} (${summary.orders14dActive} efectivos)`
                : `${summary.orders14dActive} pedidos efectivos en los últimos 14 días`
            }
          />
          <OpsCard
            href={
              canReconcile && summary.attentionReconciliation > 0
                ? "/admin/pedidos?atencion=1"
                : canAccessModeration && summary.moderationBlocked > 0
                  ? "/admin/moderacion"
                  : "/admin/pedidos?taller=1"
            }
            label={canReconcile ? "Atención e incidencias" : "Cola de taller y moderación"}
            value={alertCount > 0 ? alertCount : summary.workshopCustomActive}
            icon={AlertTriangle}
            tone={alertCount > 0 ? "coral" : "pink"}
            urgent={alertCount > 0}
            description={
              alertCount > 0
                ? `${canReconcile ? `${summary.attentionReconciliation} por reconciliar · ` : ""}${summary.moderationBlocked} sin moderar · ${summary.renderFailedActive} render fallido`
                : `${summary.workshopCustomActive} pedido${summary.workshopCustomActive === 1 ? "" : "s"} activo${summary.workshopCustomActive === 1 ? "" : "s"} con diseño personalizado`
            }
          />
        </div>

        {/* Franja visual ejecutiva: Pulso 14 días (Bogotá) + Salud del pipeline */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <AdminCard className="p-4 sm:p-5 lg:col-span-7">
            <div className="mb-3 flex items-start gap-2.5">
              <span className="bg-brand-purple/10 text-brand-purple mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg">
                <TrendingUp className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <h2 className="text-brand-purple-dark font-display text-sm font-bold">
                  {canSeeMoney
                    ? "Pulso diario de ingresos y pedidos (14 días · Bogotá)"
                    : "Pulso operativo diario de pedidos (14 días · Bogotá)"}
                </h2>
                <p className="text-brand-muted text-xs">
                  {canSeeMoney
                    ? "Facturación efectiva (Pagado → Entregado) frente a volumen diario confirmado."
                    : "Pedidos entrantes a operación frente a pedidos despachados o entregados por día."}
                </p>
              </div>
            </div>
            <AdminComboBarLineChart
              data={comboData}
              ariaLabel="Actividad diaria de pedidos en los últimos 14 días"
              barLegend={canSeeMoney ? "Ingresos efectivos COP" : "Pedidos activos del día"}
              lineLegend={canSeeMoney ? "Pedidos confirmados" : "Despachados / entregados"}
              maxAxisFormatted={
                canSeeMoney && maxRevenue14d > 0 ? formatCOP(maxRevenue14d) : undefined
              }
              midAxisFormatted={
                canSeeMoney && maxRevenue14d > 0
                  ? formatCOP(Math.round(maxRevenue14d / 2))
                  : undefined
              }
            />
          </AdminCard>

          <AdminCard className="p-4 sm:p-5 lg:col-span-5">
            <div className="mb-3 flex items-start gap-2.5">
              <span className="bg-brand-purple/10 text-brand-purple mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg">
                <Box className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <h2 className="text-brand-purple-dark font-display text-sm font-bold">
                  Distribución del pipeline
                </h2>
                <p className="text-brand-muted text-xs">
                  Haz clic en cualquier tramo para filtrar la bandeja al instante.
                </p>
              </div>
            </div>
            <AdminSegmentedBar
              items={pipelineSegments}
              ariaLabel="Distribución de pedidos por estado"
            />
            <div className="border-brand-purple/10 mt-4 flex flex-wrap gap-1.5 border-t pt-3">
              <Link
                href="/admin/pedidos"
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  !hasActiveFilters
                    ? "border-brand-purple bg-brand-purple text-white"
                    : "border-brand-purple/15 text-brand-purple-dark hover:bg-brand-purple/5 bg-white"
                }`}
              >
                Todos
              </Link>
              <Link
                href="/admin/pedidos?taller=1"
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  workshopFilter
                    ? "border-brand-purple bg-brand-purple text-white"
                    : "border-brand-purple/15 text-brand-purple-dark hover:bg-brand-purple/5 bg-white"
                }`}
              >
                🎨 Taller personalizado ({summary.workshopCustomActive})
              </Link>
              {canSeeCodTotal && (
                <Link
                  href="/admin/pedidos?pago=COD"
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    paymentMethod === "COD"
                      ? "border-brand-purple bg-brand-purple text-white"
                      : "border-brand-purple/15 text-brand-purple-dark hover:bg-brand-purple/5 bg-white"
                  }`}
                >
                  💵 Contraentrega
                </Link>
              )}
              {canReconcile && summary.attentionReconciliation > 0 && (
                <Link
                  href="/admin/pedidos?atencion=1"
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    needsReconFilter
                      ? "border-rose-600 bg-rose-600 text-white"
                      : "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                  }`}
                >
                  🔴 Por reconciliar ({summary.attentionReconciliation})
                </Link>
              )}
            </div>
          </AdminCard>
        </div>

        {/* Barra de filtros combinables */}
        <form
          method="GET"
          className="border-brand-purple/10 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-12"
        >
          {needsReconFilter && <input type="hidden" name="atencion" value="1" />}
          {workshopFilter && <input type="hidden" name="taller" value="1" />}
          <div className="sm:col-span-4">
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
              placeholder={
                canReadPii
                  ? "Número (LCM-…), guía, correo, teléfono o cliente…"
                  : "Número de pedido (LCM-…) o número de guía…"
              }
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
          </div>
          <div className="sm:col-span-2">
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
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2 text-xs focus:ring-2 focus:outline-none"
            >
              <option value="all">Todos los estados</option>
              <option value="PENDING_PAYMENT">Esperando pago</option>
              <option value="PAID">Pagado</option>
              <option value="FULFILLING">En preparación</option>
              <option value="SHIPPED">Enviado</option>
              <option value="DELIVERED">Entregado</option>
              <option value="CANCELLED">Cancelado</option>
              <option value="REFUNDED">Reembolsado</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="f-pago"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Método de pago
            </label>
            <select
              id="f-pago"
              name="pago"
              defaultValue={paymentMethod}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2 text-xs focus:ring-2 focus:outline-none"
            >
              <option value="all">Todos</option>
              <option value="WOMPI">Pago en línea (Wompi)</option>
              <option value="COD">Contraentrega</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="f-desde"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Desde (Bogotá)
            </label>
            <Input
              id="f-desde"
              name="desde"
              type="date"
              defaultValue={fromDate ?? ""}
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-9 text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="f-hasta"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Hasta (Bogotá)
            </label>
            <div className="flex items-center gap-1.5">
              <Input
                id="f-hasta"
                name="hasta"
                type="date"
                defaultValue={toDate ?? ""}
                className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-9 text-xs"
              />
              <Button
                type="submit"
                size="sm"
                className="bg-gradient-brand h-9 flex-shrink-0 px-3 text-white hover:brightness-110"
              >
                Filtrar
              </Button>
            </div>
          </div>
          {hasActiveFilters && (
            <div className="flex items-center justify-between sm:col-span-12">
              <Link
                href="/admin/pedidos"
                className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold underline"
              >
                Limpiar todos los filtros
              </Link>
              <span className="text-brand-muted text-[11px]">
                Orden actual:{" "}
                {sort === "oldest"
                  ? "Más antiguos primero"
                  : sort === "total-desc"
                    ? "Mayor monto"
                    : sort === "total-asc"
                      ? "Menor monto"
                      : sort === "number-asc"
                        ? "Número ascendente"
                        : "Más recientes primero"}
              </span>
            </div>
          )}
        </form>

        {items.length === 0 ? (
          <AdminEmpty
            icon={<Box className="h-5 w-5" />}
            title={hasActiveFilters ? "Sin resultados" : "Aún no hay pedidos"}
            description={
              hasActiveFilters
                ? "Prueba quitar algún filtro o ajustar el rango de fechas."
                : "Cuando el primer cliente complete su compra, aparecerá aquí."
            }
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <SortableHeader
                  label="Pedido"
                  ascValue="number-asc"
                  descValue="number-desc"
                  currentSort={sort}
                  basePath="/admin/pedidos"
                  preserve={preserveSortParams}
                />
                <th className="px-4 py-3 text-left font-semibold">Cliente / Destino</th>
                <th className="px-4 py-3 text-center font-semibold">Ítems</th>
                {canSeeMoney ? (
                  <SortableHeader
                    label="Total"
                    ascValue="total-desc"
                    descValue="total-asc"
                    currentSort={sort}
                    basePath="/admin/pedidos"
                    preserve={preserveSortParams}
                    align="right"
                  />
                ) : canSeeCodTotal ? (
                  <th className="px-4 py-3 text-right font-semibold">Recaudo</th>
                ) : (
                  <th className="px-4 py-3 text-left font-semibold">Taller 300 DPI</th>
                )}
                <th className="px-4 py-3 text-left font-semibold">Estado</th>
                <th className="px-4 py-3 text-left font-semibold">Envío</th>
                <SortableHeader
                  label="Fecha"
                  ascValue="recent"
                  descValue="oldest"
                  currentSort={sort}
                  basePath="/admin/pedidos"
                  preserve={preserveSortParams}
                />
                <th className="px-4 py-3" />
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((o) => {
                const shipObj =
                  o.shippingAddress &&
                  typeof o.shippingAddress === "object" &&
                  !Array.isArray(o.shippingAddress)
                    ? (o.shippingAddress as Record<string, unknown>)
                    : null;
                const shipName = shipObj ? String(shipObj.fullName ?? "").trim() : "";
                const shipCity = shipObj ? String(shipObj.city ?? "").trim() : "";
                const fullName =
                  o.customer?.firstName || o.customer?.lastName
                    ? [o.customer.firstName, o.customer.lastName].filter(Boolean).join(" ")
                    : shipName || "—";

                const customItems = o.items.filter((it) => Boolean(it.designId));
                const hasUnapprovedDesign = customItems.some(
                  (it) => it.design && it.design.moderationStatus !== "APPROVED",
                );
                const hasFailedRender = customItems.some(
                  (it) => it.design?.renderJob?.status === "FAILED",
                );
                const hasPendingRender = customItems.some(
                  (it) =>
                    it.design?.renderJob?.status === "PENDING" ||
                    it.design?.renderJob?.status === "PROCESSING",
                );

                return (
                  <AdminTableRow key={o.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/pedidos/${encodeURIComponent(o.number)}`}
                        className="text-brand-purple-dark hover:text-brand-purple font-mono text-sm font-semibold hover:underline"
                      >
                        {o.number}
                      </Link>
                      {customItems.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                          <span className="bg-brand-purple/8 text-brand-purple-dark rounded px-1.5 py-0.5 text-[10px] font-medium">
                            🎨 {customItems.length} pers.
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-brand-purple-dark text-sm font-medium">{fullName}</div>
                      <div className="text-brand-muted flex flex-wrap items-center gap-1 text-xs">
                        <span>{o.email}</span>
                        {shipCity && <span>· {shipCity}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-brand-purple-dark/85 text-xs font-medium tabular-nums">
                        {o._count.items}
                      </span>
                    </td>

                    {canSeeMoney ? (
                      <td className="px-4 py-3 text-right">
                        <div className="text-brand-purple-dark text-sm font-semibold tabular-nums">
                          {formatCOP(o.total)}
                        </div>
                        <div className="text-brand-muted text-[10px]">
                          {o.paymentMethod === "COD" ? "Contraentrega" : "Wompi"}
                        </div>
                      </td>
                    ) : canSeeCodTotal ? (
                      <td className="px-4 py-3 text-right">
                        {o.paymentMethod === "COD" ? (
                          <div>
                            <AdminBadge tone="amber">Cobrar al entregar</AdminBadge>
                            <div className="text-brand-purple-dark mt-0.5 text-xs font-bold tabular-nums">
                              {formatCOP(o.total)}
                            </div>
                          </div>
                        ) : (
                          <AdminBadge tone="emerald">Pagado en línea</AdminBadge>
                        )}
                      </td>
                    ) : (
                      <td className="px-4 py-3">
                        {customItems.length === 0 ? (
                          <span className="text-brand-muted text-xs">Catálogo estándar</span>
                        ) : hasFailedRender ? (
                          <AdminBadge tone="rose">Render fallido</AdminBadge>
                        ) : hasUnapprovedDesign ? (
                          <AdminBadge tone="amber">Por moderar</AdminBadge>
                        ) : hasPendingRender ? (
                          <AdminBadge tone="blue">Generando 300 DPI</AdminBadge>
                        ) : (
                          <AdminBadge tone="emerald">300 DPI listo</AdminBadge>
                        )}
                      </td>
                    )}

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <AdminBadge tone={STATUS_TONE[o.status] ?? "slate"}>
                          {STATUS_LABEL[o.status] ?? o.status}
                        </AdminBadge>
                        {o.needsReconciliation && (
                          <Hint
                            content={
                              o.reconciliationReason ??
                              "Pago cobrado sin stock — requiere gestión manual desde el detalle del pedido."
                            }
                            contentClassName="max-w-sm"
                          >
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-800">
                              🔴 Reconciliar
                            </span>
                          </Hint>
                        )}
                        {o.isGift && (
                          <Hint content="Es regalo: lo recibe otra persona. Empacar sin factura ni precios visibles.">
                            <span className="border-brand-purple/30 bg-brand-purple/10 text-brand-purple-dark inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold">
                              🎁 Regalo
                            </span>
                          </Hint>
                        )}
                        {hasUnapprovedDesign && canSeeMoney && (
                          <Hint content="Contiene diseños personalizados pendientes de aprobar en Moderación.">
                            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                              Por moderar
                            </span>
                          </Hint>
                        )}
                        {hasFailedRender && canSeeMoney && (
                          <Hint content="Un diseño personalizado tiene su trabajo de render 300 DPI en estado fallido.">
                            <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
                              Render 300 DPI
                            </span>
                          </Hint>
                        )}
                      </div>
                      {o.needsReconciliation && o.reconciliationReason && (
                        <p className="mt-1 line-clamp-2 max-w-xs text-[10px] leading-snug text-red-800/90">
                          {o.reconciliationReason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {o.trackingNumber ? (
                        <div>
                          <div className="text-brand-purple-dark/85 text-xs font-medium">
                            {carrierDisplayName(o.shippingCarrier)}
                          </div>
                          <div className="text-brand-muted font-mono text-[10px]">
                            {o.trackingNumber}
                          </div>
                        </div>
                      ) : (
                        <span className="text-brand-muted text-xs">
                          {o.shippingCarrier ? carrierDisplayName(o.shippingCarrier) : "—"}
                        </span>
                      )}
                    </td>
                    <td className="text-brand-muted px-4 py-3 text-xs whitespace-nowrap">
                      {formatDateTimeCO(o.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/pedidos/${encodeURIComponent(o.number)}`}
                        className="text-brand-purple-dark hover:text-brand-purple inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap"
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
          <div className="text-brand-purple-dark/70 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {total.toLocaleString("es-CO")} pedidos · página {page} de {totalPages}
            </span>
            <div className="flex gap-1.5">
              {page > 1 && (
                <PaginationLink
                  page={page - 1}
                  q={q}
                  status={status}
                  paymentMethod={paymentMethod}
                  fromDate={fromDate}
                  toDate={toDate}
                  sort={sort}
                  atencion={needsReconFilter}
                  taller={workshopFilter}
                >
                  ← Anterior
                </PaginationLink>
              )}
              {page < totalPages && (
                <PaginationLink
                  page={page + 1}
                  q={q}
                  status={status}
                  paymentMethod={paymentMethod}
                  fromDate={fromDate}
                  toDate={toDate}
                  sort={sort}
                  atencion={needsReconFilter}
                  taller={workshopFilter}
                >
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
  paymentMethod,
  fromDate,
  toDate,
  sort,
  atencion,
  taller,
  children,
}: {
  page: number;
  q?: string;
  status?: string;
  paymentMethod?: string;
  fromDate?: string;
  toDate?: string;
  sort?: string;
  atencion?: boolean;
  taller?: boolean;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (q) params.set("q", q);
  if (status && status !== "all") params.set("status", status);
  if (paymentMethod && paymentMethod !== "all") params.set("pago", paymentMethod);
  if (fromDate) params.set("desde", fromDate);
  if (toDate) params.set("hasta", toDate);
  if (sort && sort !== "recent") params.set("sort", sort);
  if (atencion) params.set("atencion", "1");
  if (taller) params.set("taller", "1");
  return (
    <Link
      href={`/admin/pedidos?${params.toString()}`}
      className="border-brand-purple/20 hover:bg-brand-purple/5 text-brand-purple-dark rounded-md border bg-white px-3 py-1.5 text-xs font-medium"
    >
      {children}
    </Link>
  );
}

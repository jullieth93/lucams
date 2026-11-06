/*
 * Admin > Métricas de ventas — dashboard de solo lectura sobre Order/Quote.
 *
 * No hay modelo nuevo: todo se agrega en vuelo con groupBy/count/aggregate
 * (volumen bajo de pedidos, no justifica tabla de analytics ni cron de
 * materialización). La página NO tiene actions.ts porque no muta nada.
 *
 * Convención de "pagado": PAID + FULFILLING + SHIPPED + DELIVERED son los
 * estados donde la plata YA entró (Wompi confirmó o COD se marcó pago).
 * REFUNDED queda fuera de ingresos porque la plata se devolvió; CANCELLED y
 * DRAFT nunca representaron venta. Esto replica el criterio de /admin/pedidos.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { TrendingUp, Trophy } from "lucide-react";
import type { OrderStatus, QuoteStatus } from "@lucams/db";
import { prisma } from "@/lib/db";
import { ADMIN_ROLE_SETS, canAccessAdminPath } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import { formatCOP } from "@/lib/format";
import { isCatalogMode } from "@/lib/store-mode";
import { COLLECTED_REVENUE_ORDER_WHERE, getPeriodAggregates } from "@/features/finanzas/service";
import {
  getFunnelDashboardReport,
  type FunnelReportFilters,
} from "@/features/analytics/funnel-service";
import { getCrmBehavioralIntelligence } from "@/features/crm/intelligence-service";
import { PRODUCT_SLUG_OR_ALL_REGEX } from "@/features/analytics/funnel-schema";
import { ORDER_STATUS_LABEL } from "@/features/orders/order-status-display";
import { FunnelPanel } from "./funnel-panel";
import { CrmIntelligencePanel } from "./crm-intelligence-panel";
import { FiscalWatchPanel } from "./fiscal-watch-panel";
import {
  AdminCard,
  AdminComboBarLineChart,
  AdminDeltaPill,
  AdminDonutChart,
  AdminEmpty,
  AdminHorizontalBars,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  KpiCard,
  type ChartTone,
} from "@/components/admin-page";
import { formatMonthYearCO } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Métricas de ventas",
  robots: { index: false, follow: false },
};

// Estados de Order que implican dinero recibido (ver nota del header).
const PAID_STATUSES: OrderStatus[] = ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"];

const ORDER_STATUS_CHART_TONE: Record<OrderStatus, ChartTone> = {
  DRAFT: "slate",
  PENDING_PAYMENT: "amber",
  PAID: "purple",
  FULFILLING: "pink",
  SHIPPED: "turquoise",
  DELIVERED: "emerald",
  CANCELLED: "rose",
  REFUNDED: "coral",
};

const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  PENDING: "Pendiente",
  CONTACTED: "Contactada",
  CLOSED: "Cerrada (vendida)",
  DISCARDED: "Descartada",
};
const QUOTE_STATUS_CHART_TONE: Record<QuoteStatus, ChartTone> = {
  PENDING: "amber",
  CONTACTED: "purple",
  CLOSED: "emerald",
  DISCARDED: "slate",
};
const QUOTE_STATUSES: QuoteStatus[] = ["PENDING", "CONTACTED", "CLOSED", "DISCARDED"];

type RawSearchParams = Record<string, string | string[] | undefined>;

function firstParam(raw: RawSearchParams, key: string): string | undefined {
  const val = raw[key];
  return Array.isArray(val) ? val[0] : val;
}

export default async function AdminMetricasPage({
  searchParams,
}: {
  searchParams?: Promise<RawSearchParams>;
}) {
  const session = await requireRole(ADMIN_ROLE_SETS.METRICS);
  const role = session.admin.role;
  const sp = (await searchParams) ?? {};

  const rawWindow = firstParam(sp, "ventana");
  const rawDevice = firstParam(sp, "dispositivo");
  const rawEditor = firstParam(sp, "editor");
  const rawProduct = firstParam(sp, "producto");

  const funnelFilters: Required<FunnelReportFilters> = {
    days: rawWindow === "7" || rawWindow === "7d" ? 7 : 30,
    deviceCategory:
      rawDevice === "mobile" || rawDevice === "tablet" || rawDevice === "desktop"
        ? rawDevice
        : "all",
    editorKind:
      rawEditor === "photo" ||
      rawEditor === "name" ||
      rawEditor === "letterset" ||
      rawEditor === "catalog"
        ? rawEditor
        : "all",
    productSlug:
      rawProduct && rawProduct !== "_all" && PRODUCT_SLUG_OR_ALL_REGEX.test(rawProduct)
        ? rawProduct
        : "all",
  };

  // Modo catálogo (Etapa 1): sin pagos en línea NO se generan Orders — los KPIs
  // basados en Order (pedidos pagados, ingresos, top productos) serían ceros
  // permanentes y puro ruido. Solo se consulta/muestra lo de cotizaciones (el
  // canal real de venta en Etapa 1); las métricas de Order vuelven en Etapa 2.
  const catalog = isCatalogMode();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const monthLabel = formatMonthYearCO(now);

  // Consultas independientes → Promise.all para no serializar round-trips a DB.
  // En modo catálogo las queries de Order ni siquiera se disparan (orderData=null).
  // [FIN-01] — todas las consultas de Order/OrderItem filtran `deletedAt: null` y los
  // ingresos del mes usan el mismo criterio de caja real que `/admin/finanzas`
  // (Wompi confirmado + COD entregado − retractos reembolsados en el mes).
  const [quotesByStatus, orderData, funnelReport, crmReport, periodTrend] = await Promise.all([
    prisma.quote.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    catalog
      ? Promise.resolve(null)
      : Promise.all([
          prisma.order.groupBy({
            by: ["status"],
            where: { deletedAt: null },
            _count: { _all: true },
          }),
          // Se excluyen los DRAFT: son carritos abandonados, no pedidos reales, e
          // inflarían el conteo que Lucy usa como pulso del negocio.
          prisma.order.count({
            where: {
              deletedAt: null,
              createdAt: { gte: thirtyDaysAgo },
              status: { not: "DRAFT" },
            },
          }),
          prisma.order.aggregate({
            where: {
              ...COLLECTED_REVENUE_ORDER_WHERE,
              createdAt: { gte: startOfMonth },
            },
            _sum: { total: true },
          }),
          prisma.retractRequest.aggregate({
            where: {
              status: "REFUNDED",
              refundedAt: { gte: startOfMonth },
              orderItem: { order: COLLECTED_REVENUE_ORDER_WHERE },
            },
            _sum: { refundAmount: true },
          }),
          // Top 10 variantes por unidades vendidas en pedidos confirmados activos.
          prisma.orderItem.groupBy({
            by: ["variantId"],
            where: { order: { deletedAt: null, status: { in: PAID_STATUSES } } },
            _sum: { qty: true },
            orderBy: { _sum: { qty: "desc" } },
            take: 10,
          }),
        ]),
    getFunnelDashboardReport(funnelFilters, now),
    catalog ? Promise.resolve(null) : getCrmBehavioralIntelligence(funnelFilters.days),
    catalog ? Promise.resolve(null) : getPeriodAggregates(funnelFilters.days === 7 ? "7d" : "30d"),
  ]);
  const ordersByStatus = orderData?.[0] ?? [];
  const ordersLast30 = orderData?.[1] ?? 0;
  const grossMonthRevenueCents = orderData?.[2]._sum.total ?? 0;
  const monthRetractRefundCents = orderData?.[3]._sum.refundAmount ?? 0;
  const revenueCents = Math.max(0, grossMonthRevenueCents - monthRetractRefundCents);
  const topByVariant = orderData?.[4] ?? [];

  const orderCount = new Map<OrderStatus, number>(
    ordersByStatus.map((g) => [g.status, g._count._all]),
  );
  const quoteCount = new Map<QuoteStatus, number>(
    quotesByStatus.map((g) => [g.status, g._count._all]),
  );

  const paidCount = PAID_STATUSES.reduce((acc, s) => acc + (orderCount.get(s) ?? 0), 0);
  const pendingCount = orderCount.get("PENDING_PAYMENT") ?? 0;
  const totalQuotes = QUOTE_STATUSES.reduce((acc, s) => acc + (quoteCount.get(s) ?? 0), 0);

  // Segundo round-trip chico: nombres de las variantes del top (el groupBy no
  // puede traer relaciones). Son máximo 10 ids. En modo catálogo no hay top.
  const variants = topByVariant.length
    ? await prisma.productVariant.findMany({
        where: { id: { in: topByVariant.map((t) => t.variantId) } },
        select: { id: true, name: true, sku: true, product: { select: { name: true } } },
      })
    : [];
  const variantById = new Map(variants.map((v) => [v.id, v]));
  const topProducts = topByVariant
    .map((t) => ({ ...t, variant: variantById.get(t.variantId) }))
    .filter((t) => t.variant !== undefined);

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<TrendingUp className="h-5 w-5" />}
        title="Métricas de ventas"
        subtitle="Resumen de pedidos, cotizaciones e ingresos. Se calcula en vivo sobre los datos reales."
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Comercial" },
          { label: "Métricas de ventas" },
        ]}
      />

      <AdminPageBody>
        {catalog && (
          <AdminNotice tone="info">
            <strong>Modo catálogo (Etapa 1):</strong> aún no hay pagos en línea, así que las
            métricas de pedidos e ingresos no aplican — llegan con la Etapa 2. Mientras tanto, el
            pulso del negocio son las cotizaciones.
          </AdminNotice>
        )}

        {/* KPIs principales (basados en Order — ocultos en modo catálogo) */}
        {!catalog && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Pedidos pagados"
              value={paidCount}
              trendLabel="Acumulado histórico (pagado, preparación, enviado, entregado)"
            />
            <KpiCard
              label="Esperando pago"
              value={pendingCount}
              trend={pendingCount > 0 ? "down" : "neutral"}
              trendLabel="Pedidos creados que aún no confirman el pago"
            />
            <KpiCard
              label="Pedidos últimos 30 días"
              value={ordersLast30}
              trendLabel="Sin contar borradores (carritos abandonados)"
            />
            <KpiCard
              label="Ingresos netos del mes"
              value={formatCOP(revenueCents)}
              trend="up"
              trendLabel={`Caja cobrada en ${monthLabel} (Wompi + COD entregado − retractos)`}
            />
          </div>
        )}

        {/* Vigilancia fiscal (ADR-196): umbrales DIAN del año en vivo */}
        {!catalog && <FiscalWatchPanel />}

        {/* Evolución diaria de ingresos y pedidos (7d / 30d) */}
        {!catalog && periodTrend && (
          <AdminCard className="p-5">
            {(() => {
              const maxTrendCents = Math.max(0, ...periodTrend.buckets.map((b) => b.totalCents));
              return (
                <>
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-brand-purple-dark font-display text-base font-bold">
                        Evolución diaria de ingresos y pedidos ({funnelFilters.days} días)
                      </h2>
                      <p className="text-brand-muted text-xs">
                        <strong className="text-brand-purple-dark">
                          {formatCOP(periodTrend.netTotalCents)}
                        </strong>{" "}
                        netos ·{" "}
                        <strong className="text-brand-purple-dark">{periodTrend.orderCount}</strong>{" "}
                        pedido{periodTrend.orderCount === 1 ? "" : "s"} cobrado
                        {periodTrend.orderCount === 1 ? "" : "s"} · Ticket promedio{" "}
                        <strong className="text-brand-purple-dark">
                          {periodTrend.orderCount > 0 ? formatCOP(periodTrend.aovCents) : "—"}
                        </strong>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <AdminDeltaPill
                        deltaPct={periodTrend.netRevenueDeltaPct}
                        comparisonLabel={periodTrend.range.previousLabel}
                      />
                      <Link
                        href={`/admin/finanzas?periodo=${funnelFilters.days === 7 ? "7d" : "30d"}`}
                        className="text-brand-purple text-xs font-semibold hover:underline"
                      >
                        Abrir Finanzas →
                      </Link>
                    </div>
                  </div>

                  <AdminComboBarLineChart
                    ariaLabel={`Tendencia diaria de ingresos y pedidos en los últimos ${funnelFilters.days} días`}
                    barLegend="Ingresos cobrados (COP)"
                    lineLegend="Pedidos confirmados"
                    maxAxisFormatted={maxTrendCents > 0 ? formatCOP(maxTrendCents) : "$0"}
                    midAxisFormatted={
                      maxTrendCents > 0 ? formatCOP(Math.round(maxTrendCents / 2)) : undefined
                    }
                    data={periodTrend.buckets.map((b) => ({
                      key: b.start.toISOString(),
                      label: b.label,
                      tickLabel: b.tickLabel,
                      barValue: b.totalCents,
                      barFormatted: formatCOP(b.totalCents),
                      lineValue: b.count,
                      lineFormatted: `${b.count} pedido${b.count === 1 ? "" : "s"}`,
                    }))}
                  />
                </>
              );
            })()}
          </AdminCard>
        )}

        {/* Detalle visual por estado (Donut + Leyenda interactiva) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {!catalog && (
            <AdminCard className="p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-brand-purple-dark font-display text-base font-bold">
                  Pedidos por estado
                </h2>
                <Link
                  href="/admin/pedidos"
                  className="text-brand-purple text-xs font-semibold hover:underline"
                >
                  Ver todos →
                </Link>
              </div>
              {(() => {
                const statusKeys = (Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).filter(
                  (s) => s !== "DRAFT" || (orderCount.get("DRAFT") ?? 0) > 0,
                );
                const totalOrdersAll = statusKeys.reduce(
                  (acc, s) => acc + (orderCount.get(s) ?? 0),
                  0,
                );
                return (
                  <AdminDonutChart
                    ariaLabel="Distribución de pedidos por estado"
                    centerValue={totalOrdersAll.toLocaleString("es-CO")}
                    centerLabel="Pedidos"
                    slices={statusKeys.map((s) => ({
                      key: s,
                      label: ORDER_STATUS_LABEL[s],
                      count: orderCount.get(s) ?? 0,
                      tone: ORDER_STATUS_CHART_TONE[s],
                      href: s === "DRAFT" ? undefined : `/admin/pedidos?status=${s}`,
                    }))}
                  />
                );
              })()}
            </AdminCard>
          )}

          <AdminCard className="p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-brand-purple-dark font-display text-base font-bold">
                Cotizaciones por estado
              </h2>
              <Link
                href="/admin/cotizaciones"
                className="text-brand-purple text-xs font-semibold hover:underline"
              >
                Ver todas →
              </Link>
            </div>
            <AdminDonutChart
              ariaLabel="Distribución de cotizaciones por estado"
              centerValue={totalQuotes.toLocaleString("es-CO")}
              centerLabel="Cotizaciones"
              slices={QUOTE_STATUSES.map((s) => ({
                key: s,
                label: QUOTE_STATUS_LABEL[s],
                count: quoteCount.get(s) ?? 0,
                tone: QUOTE_STATUS_CHART_TONE[s],
                href: `/admin/cotizaciones?status=${s}`,
              }))}
            />
            <p className="text-brand-muted border-brand-purple/10 mt-4 border-t pt-3 text-xs">
              Total: <strong>{totalQuotes.toLocaleString("es-CO")}</strong> cotizaciones activas (no
              incluye eliminadas).
            </p>
          </AdminCard>
        </div>

        {/* Top productos (basado en Order — oculto en modo catálogo) */}
        {!catalog && (
          <section>
            <h2 className="text-brand-purple-dark font-display mb-3 flex items-center gap-2 text-base font-bold">
              <Trophy className="h-5 w-5" />
              Top productos por unidades vendidas
            </h2>
            {topProducts.length === 0 ? (
              <AdminEmpty
                icon={<Trophy className="h-5 w-5" />}
                title="Todavía no hay ventas"
                description="Cuando entren los primeros pedidos pagados, acá vas a ver el ranking visual de productos más vendidos."
              />
            ) : (
              <AdminCard className="p-5">
                <AdminHorizontalBars
                  items={topProducts.map((t, idx) => {
                    const units = t._sum.qty ?? 0;
                    return {
                      key: t.variantId,
                      label: t.variant!.product.name,
                      sublabel: t.variant!.name,
                      badgeText: t.variant!.sku,
                      value: units,
                      formattedValue: `${units.toLocaleString("es-CO")} uds.`,
                      tone: idx === 0 ? "purple" : idx < 3 ? "pink" : "turquoise",
                    };
                  })}
                />
              </AdminCard>
            )}
          </section>
        )}

        {/* Embudo vivo tienda + Estudio ([ANA-01], Fase 2): interactivo por ventana,
            dispositivo, superficie y producto. Sin PII ni cookies. */}
        <FunnelPanel report={funnelReport} filters={funnelFilters} />

        {/* Inteligencia conductual CRM, RFM, margen neto y atribución (Fase 12 · S27) */}
        {!catalog && crmReport && (
          <CrmIntelligencePanel
            report={crmReport}
            canAccessSegments={canAccessAdminPath(role, "/admin/marketing/segmentos")}
            canAccessCarts={canAccessAdminPath(role, "/admin/carritos")}
            canAccessOpportunities={canAccessAdminPath(role, "/admin/oportunidades")}
          />
        )}

        {!catalog && (
          <AdminNotice tone="info">
            <strong>¿Cómo se calcula?</strong> Los ingresos netos del mes usan el mismo criterio de{" "}
            <Link href="/admin/finanzas" className="font-semibold underline">
              Finanzas
            </Link>
            : suman pagos en línea confirmados (Wompi) y contra entrega ya entregados, y restan las
            devoluciones reembolsadas por retracto. Nunca se cuentan borradores ni pedidos
            eliminados.{" "}
            <span className="text-brand-purple-dark/80">
              Para gestionar textos y borradores del sitio ir a{" "}
              <Link href="/admin/contenido" className="font-semibold underline">
                Páginas del sitio
              </Link>
              .
            </span>
          </AdminNotice>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}

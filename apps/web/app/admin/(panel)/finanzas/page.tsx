/*
 * Admin > Finanzas — dashboard financiero.
 *
 * Lee datos REALES de Order: KPIs (queries de abajo), ingresos por período,
 * breakdown por método de pago y ticket promedio (features/finanzas/service).
 * Lo que sigue pendiente depende de integraciones EXTERNAS futuras: proveedor
 * de facturación electrónica DIAN (IVA desagregado + estado de facturas) y
 * API de movimientos de Wompi (conciliación automática) — por eso esas
 * tarjetas se muestran al final con la dependencia explícita.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  Receipt,
  CreditCard,
  FileText,
  ArrowRight,
  Wallet,
  ShieldBan,
  Calculator,
  BarChart2,
  Undo2,
  BadgeCheck,
  Award,
} from "lucide-react";
import type { PaymentMethod } from "@lucams/db";
import {
  AdminBadge,
  AdminCard,
  AdminComboBarLineChart,
  AdminDeltaPill,
  AdminDonutChart,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminSegmentedBar,
  QuickLink,
} from "@/components/admin-page";
import { CountUp } from "@/components/admin/count-up";
import {
  ADMIN_ROLE_SETS,
  adminHomePath,
  canAccessAdminPath,
  hasCapability,
} from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import { prisma } from "@/lib/db";
import { formatCOP } from "@/lib/format";
import { getCodReconciliationTotals } from "@/features/orders/cod-reconciliation";
import {
  COLLECTED_REVENUE_ORDER_WHERE,
  computeNetCollectedRevenue,
  DEFAULT_PERIOD,
  FINANZAS_PERIODS,
  getPeriodAggregates,
  isFinanzasPeriod,
  startOfMonthCO,
} from "@/features/finanzas/service";
import { ExportFinanzasCsvButton } from "./export-csv-button";

export const metadata: Metadata = {
  title: "Finanzas",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  WOMPI: "Wompi (pago en línea)",
  DIRECT_TRANSFER: "Bre-B / Transferencia directa",
  COD: "Contra entrega",
};

const PAYMENT_METHOD_HINT: Record<PaymentMethod, string> = {
  WOMPI: "Tarjeta, PSE o Nequi — se reconoce al confirmar el pago",
  DIRECT_TRANSFER: "Llave Bre-B o transferencia B2B — se reconoce al confirmar abono con MFA",
  COD: "Efectivo — se reconoce solo cuando el pedido queda entregado",
};

export default async function AdminFinanzasPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireRole(ADMIN_ROLE_SETS.FINANCE);

  const sp = await searchParams;
  const periodoRaw = typeof sp.periodo === "string" ? sp.periodo : undefined;
  const periodo = isFinanzasPeriod(periodoRaw) ? periodoRaw : DEFAULT_PERIOD;
  const canExportCsv = hasCapability(session.admin.role, "finance:export_csv");

  // Probar contadores reales: si hay alguna orden pagada en DB ya, los
  // mostramos; si no, mantenemos los placeholders educativos.
  const [
    totalPaidOrders,
    wompiRevenue,
    directTransferAgg,
    codDeliveredRevenue,
    codToCollect,
    totalRefunded,
    retractRefundSummary,
    warrantyRefundResolvedCount,
    ordersThisMonth,
    dianPending,
  ] = await Promise.all([
    prisma.order.count({
      where: { deletedAt: null, status: { in: ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"] } },
    }),
    // Ingresos = efectivo REALMENTE cobrado: Wompi capturado online + Pago Directo B2B verificado + COD ENTREGADO
    // (el efectivo del contraentrega solo entra al entregar). Revisión adversarial COD + ADR-210.
    prisma.order
      .aggregate({
        where: {
          deletedAt: null,
          paymentMethod: "WOMPI",
          status: { in: ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"] },
        },
        _sum: { total: true },
      })
      .then((r) => r._sum?.total ?? 0),
    prisma.order
      .aggregate({
        where: {
          deletedAt: null,
          paymentMethod: "DIRECT_TRANSFER",
          status: { in: ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"] },
        },
        _sum: { total: true, withholdingCents: true },
      })
      .then((r) => ({
        grossCents: r._sum?.total ?? 0,
        withholdingCents: r._sum?.withholdingCents ?? 0,
      })),
    prisma.order
      .aggregate({
        where: { deletedAt: null, paymentMethod: "COD", status: "DELIVERED" },
        _sum: { total: true },
      })
      .then((r) => r._sum?.total ?? 0),
    // COD confirmado pero NO entregado → efectivo por cobrar (no es ingreso todavía).
    prisma.order
      .aggregate({
        where: {
          deletedAt: null,
          paymentMethod: "COD",
          status: { in: ["PAID", "FULFILLING", "SHIPPED"] },
        },
        _sum: { total: true },
      })
      .then((r) => r._sum?.total ?? 0),
    prisma.order.count({ where: { deletedAt: null, status: "REFUNDED" } }),
    // [FIN-01] — retractos reembolsados sobre órdenes que siguen en estado cobrado (DELIVERED):
    // se restan una sola vez sin doble conteo si la orden completa pasara a REFUNDED.
    prisma.retractRequest
      .aggregate({
        where: {
          status: "REFUNDED",
          orderItem: { order: COLLECTED_REVENUE_ORDER_WHERE },
        },
        _sum: { refundAmount: true },
        _count: { _all: true },
      })
      .then((r) => ({
        totalCents: r._sum?.refundAmount ?? 0,
        count: r._count?._all ?? 0,
      })),
    prisma.warrantyClaim.count({
      where: {
        status: "RESOLVED",
        resolutionType: "REFUND",
        orderItem: { order: COLLECTED_REVENUE_ORDER_WHERE },
      },
    }),
    prisma.order.count({
      where: {
        deletedAt: null,
        status: { in: ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"] },
        createdAt: { gte: startOfMonthCO(new Date()) },
      },
    }),
    prisma.order.count({
      where: { deletedAt: null, dianStatus: "PENDING" },
    }),
  ]);

  // ADR-064 — efectivo COD entregado pendiente de remesa del mensajero + discrepancias.
  const codRecon = await getCodReconciliationTotals();

  // Serie del período seleccionado + comparativa.
  const periodoData = await getPeriodAggregates(periodo);

  // [FIN-01] — ingreso neto real = cobrado bruto (Wompi + COD entregado)
  // menos discrepancias COD confirmadas y retractos reembolsados en efectivo.
  const netBreakdown = computeNetCollectedRevenue({
    wompiCollectedCents: wompiRevenue,
    directTransferCollectedCents: directTransferAgg.grossCents,
    codDeliveredCents: codDeliveredRevenue,
    codShortfallCents: codRecon.shortfallCop,
    retractRefundedCents: retractRefundSummary.totalCents,
    withholdingCents: directTransferAgg.withholdingCents,
  });
  const totalRevenue = netBreakdown.netCollectedCents;
  const hasRealData = totalPaidOrders > 0;
  const role = session.admin.role;
  const homeHref = adminHomePath(role);

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<DollarSign className="h-5 w-5" />}
        title="Finanzas"
        subtitle={
          hasRealData
            ? `${totalPaidOrders} pedido${totalPaidOrders === 1 ? "" : "s"} confirmado${totalPaidOrders === 1 ? "" : "s"}`
            : "Aún sin ventas registradas"
        }
        breadcrumbs={[{ label: "Admin", href: homeHref }, { label: "Finanzas" }]}
        actions={canExportCsv ? <ExportFinanzasCsvButton periodo={periodo} /> : undefined}
      />

      <AdminPageBody>
        {!hasRealData && (
          <AdminNotice tone="info">
            <strong>Este panel está esperando ventas.</strong> Las métricas reales se llenan solas
            apenas empieces a vender. Mientras tanto, te muestro cómo se verá para que sepas qué vas
            a encontrar aquí.
          </AdminNotice>
        )}

        {/* KPIs principales */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            icon={<TrendingUp className="h-5 w-5" />}
            label="Ingresos netos"
            value={hasRealData ? formatCOP(totalRevenue) : "—"}
            hint={
              hasRealData
                ? "Caja real: Wompi + contra entrega entregado − devoluciones y faltantes"
                : "Disponible cuando haya ventas"
            }
            highlight={hasRealData}
          />
          <Kpi
            icon={<Receipt className="h-5 w-5" />}
            label="Pedidos confirmados"
            value={hasRealData ? totalPaidOrders : 0}
            hint={
              hasRealData ? "Pagados + en producción + enviados + entregados" : "Pendiente checkout"
            }
          />
          <Kpi
            icon={<CreditCard className="h-5 w-5" />}
            label="Este mes"
            value={hasRealData ? ordersThisMonth : 0}
            hint={
              hasRealData
                ? "Pedidos confirmados del mes corriente (hora Colombia)"
                : "Disponible cuando haya ventas"
            }
          />
          <Kpi
            icon={<FileText className="h-5 w-5" />}
            label="DIAN pendientes"
            value={dianPending}
            hint="Facturas electrónicas por emitir"
          />
        </div>

        {codToCollect > 0 && (
          <AdminNotice tone="info">
            💵 <strong>{formatCOP(codToCollect)}</strong> en pedidos contra entrega{" "}
            <strong>por cobrar</strong> — el efectivo entra cuando el mensajero los entregue.{" "}
            <em>No está incluido en Ingresos totales</em> (se cuenta al entregar).
          </AdminNotice>
        )}

        {/* ADR-064 — conciliación del efectivo contra entrega ya cobrado por el mensajero */}
        {(codRecon.pendingCop > 0 || codRecon.discrepancyCount > 0) && (
          <AdminNotice tone={codRecon.discrepancyCount > 0 ? "warning" : "info"}>
            🚚{" "}
            {codRecon.pendingCop > 0 && (
              <>
                <strong>{formatCOP(codRecon.pendingCop)}</strong> de pedidos entregados están{" "}
                <strong>por remitir</strong> (el mensajero ya cobró y aún no te deposita).{" "}
              </>
            )}
            {codRecon.discrepancyCount > 0 && (
              <>
                Hay <strong>{codRecon.discrepancyCount}</strong> con discrepancia
                {codRecon.shortfallCop > 0 ? (
                  <>
                    {" "}
                    (<strong>{formatCOP(codRecon.shortfallCop)}</strong> que no llegó)
                  </>
                ) : null}
                .{" "}
              </>
            )}
            <Link href="/admin/finanzas/conciliacion" className="font-semibold underline">
              Conciliar contra entrega
            </Link>
          </AdminNotice>
        )}

        {hasRealData && netBreakdown.totalDeductionsCents > 0 && (
          <AdminCard className="border-brand-purple/15 bg-gradient-to-r from-white to-purple-50/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-brand-purple-dark text-xs font-bold tracking-wide uppercase">
                Puente de caja real (acumulado)
              </h2>
              <span className="text-brand-muted text-xs">
                Cómo se calcula tu ingreso neto después de posventa y remesas
              </span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="border-brand-purple/10 rounded-lg border bg-white p-3">
                <span className="text-brand-muted block text-[11px] font-medium">
                  Cobrado bruto (Wompi + COD entregado)
                </span>
                <span className="text-brand-purple-dark mt-0.5 block text-base font-bold tabular-nums">
                  {formatCOP(netBreakdown.grossCollectedCents)}
                </span>
              </div>
              <div className="border-brand-purple/10 rounded-lg border bg-white p-3">
                <span className="text-brand-muted block text-[11px] font-medium">
                  Deducciones en efectivo
                </span>
                <span className="mt-0.5 block text-base font-bold text-rose-700 tabular-nums">
                  −{formatCOP(netBreakdown.totalDeductionsCents)}
                </span>
                <div className="text-brand-muted mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
                  {retractRefundSummary.count > 0 && (
                    <Link
                      href="/admin/retractos?status=REFUNDED"
                      className="hover:text-brand-purple underline"
                    >
                      {retractRefundSummary.count} retracto
                      {retractRefundSummary.count === 1 ? "" : "s"} (
                      {formatCOP(retractRefundSummary.totalCents)})
                    </Link>
                  )}
                  {codRecon.shortfallCop > 0 && (
                    <Link
                      href="/admin/finanzas/conciliacion"
                      className="hover:text-brand-purple underline"
                    >
                      Faltante COD ({formatCOP(codRecon.shortfallCop)})
                    </Link>
                  )}
                </div>
              </div>
              <div className="border-brand-purple/20 bg-brand-purple/5 rounded-lg border p-3">
                <span className="text-brand-purple-dark/80 block text-[11px] font-semibold">
                  Ingreso neto en caja
                </span>
                <span className="text-brand-purple-dark mt-0.5 block text-base font-bold tabular-nums">
                  {formatCOP(netBreakdown.netCollectedCents)}
                </span>
              </div>
            </div>
            <div className="mt-3 pt-1">
              <AdminSegmentedBar
                ariaLabel="Composición del cobro bruto entre caja neta, retractos y faltante contra entrega"
                items={[
                  {
                    key: "net",
                    label: "Caja neta",
                    count: Math.round(netBreakdown.netCollectedCents / 100),
                    tone: "emerald",
                    sublabel: formatCOP(netBreakdown.netCollectedCents),
                  },
                  {
                    key: "retracts",
                    label: "Retractos reembolsados",
                    count: Math.round(retractRefundSummary.totalCents / 100),
                    tone: "amber",
                    href: "/admin/retractos?status=REFUNDED",
                    sublabel: formatCOP(retractRefundSummary.totalCents),
                  },
                  {
                    key: "cod_shortfall",
                    label: "Faltante COD",
                    count: Math.round(codRecon.shortfallCop / 100),
                    tone: "rose",
                    href: "/admin/finanzas/conciliacion?filter=discrepancy",
                    sublabel: formatCOP(codRecon.shortfallCop),
                  },
                ]}
              />
            </div>
          </AdminCard>
        )}

        {warrantyRefundResolvedCount > 0 && (
          <AdminNotice tone="warning">
            Hay <strong>{warrantyRefundResolvedCount}</strong> garantía
            {warrantyRefundResolvedCount === 1 ? "" : "s"} resuelta
            {warrantyRefundResolvedCount === 1 ? "" : "s"} con devolución de dinero cuyo pedido aún
            figura como entregado. Si devolviste el total del pedido, márcalo como{" "}
            <strong>Reembolsada</strong> en{" "}
            <Link href="/admin/garantias?status=RESOLVED" className="font-semibold underline">
              /admin/garantias
            </Link>{" "}
            para mantener la caja al día.
          </AdminNotice>
        )}

        {totalRefunded > 0 && (
          <AdminNotice tone="warning">
            Hay {totalRefunded} pedido{totalRefunded === 1 ? "" : "s"} reembolsado
            {totalRefunded === 1 ? "" : "s"}. Revísalo
            {totalRefunded === 1 ? "" : "s"} en{" "}
            <Link href="/admin/pedidos" className="underline">
              /admin/pedidos
            </Link>{" "}
            con filtro estado = Reembolsada.
          </AdminNotice>
        )}

        {/* Ingresos por período — datos reales (features/finanzas/service) */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-brand-purple-dark font-display flex items-center gap-2 text-base font-bold">
              <TrendingUp className="h-5 w-5" />
              Ingresos por período
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {FINANZAS_PERIODS.map((p) => (
                <Link
                  key={p.key}
                  href={
                    p.key === DEFAULT_PERIOD
                      ? "/admin/finanzas"
                      : `/admin/finanzas?periodo=${p.key}`
                  }
                  aria-current={p.key === periodo ? "true" : undefined}
                  className={
                    p.key === periodo
                      ? "bg-brand-purple inline-flex min-h-9 items-center rounded-full px-3.5 py-1 text-xs font-semibold text-white"
                      : "border-brand-purple/20 text-brand-purple-dark hover:border-brand-purple/50 inline-flex min-h-9 items-center rounded-full border bg-white px-3.5 py-1 text-xs font-semibold transition-colors"
                  }
                >
                  {p.label}
                </Link>
              ))}
            </div>
          </div>
          <AdminCard className="p-5">
            {(() => {
              const maxBucketCents = Math.max(0, ...periodoData.buckets.map((x) => x.totalCents));
              return (
                <>
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-brand-muted text-xs">
                      <strong className="text-brand-purple-dark text-sm">
                        {formatCOP(periodoData.netTotalCents)}
                      </strong>{" "}
                      netos en{" "}
                      <strong className="text-brand-purple-dark">{periodoData.orderCount}</strong>{" "}
                      pedido{periodoData.orderCount === 1 ? "" : "s"}
                      {periodoData.retractRefundedCents > 0 ? (
                        <>
                          {" "}
                          ({formatCOP(periodoData.totalCents)} brutos −{" "}
                          {formatCOP(periodoData.retractRefundedCents)} en retractos)
                        </>
                      ) : null}{" "}
                      ·{" "}
                      {periodoData.range.bucket === "day"
                        ? "evolución diaria"
                        : "evolución semanal"}
                      .
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <AdminDeltaPill
                        deltaPct={periodoData.netRevenueDeltaPct}
                        comparisonLabel={periodoData.range.previousLabel}
                      />
                    </div>
                  </div>

                  <AdminComboBarLineChart
                    ariaLabel="Gráfico de ingresos cobrados y pedidos por período"
                    barLegend="Ingresos cobrados (COP)"
                    lineLegend="Pedidos confirmados"
                    maxAxisFormatted={maxBucketCents > 0 ? formatCOP(maxBucketCents) : "$0"}
                    midAxisFormatted={
                      maxBucketCents > 0 ? formatCOP(Math.round(maxBucketCents / 2)) : undefined
                    }
                    data={periodoData.buckets.map((b) => ({
                      key: b.start.toISOString(),
                      label: b.label,
                      tickLabel: b.tickLabel,
                      barValue: b.totalCents,
                      barFormatted: formatCOP(b.totalCents),
                      lineValue: b.count,
                      lineFormatted: `${b.count} pedido${b.count === 1 ? "" : "s"}`,
                    }))}
                  />

                  {periodoData.orderCount === 0 ? (
                    <p className="text-brand-muted mt-2 text-xs">
                      Sin ventas cobradas en esta ventana. Las barras y la curva de pedidos se
                      activan automáticamente apenas se confirme un pago en línea (Wompi) o se
                      entregue un contra entrega.
                    </p>
                  ) : null}
                </>
              );
            })()}
          </AdminCard>
        </section>

        {/* Breakdown por método de pago + ticket promedio (misma ventana) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AdminCard className="p-5">
            <h2 className="text-brand-purple-dark font-display mb-4 flex items-center gap-2 text-base font-bold">
              <CreditCard className="h-5 w-5" />
              Por método de pago
            </h2>
            <AdminDonutChart
              ariaLabel="Participación de ingresos por método de pago"
              centerValue={periodoData.orderCount > 0 ? formatCOP(periodoData.totalCents) : "$0"}
              centerLabel={`${periodoData.orderCount} ped.`}
              slices={(["WOMPI", "COD"] as const).map((method) => {
                const agg = periodoData.byMethod.find((x) => x.method === method);
                return {
                  key: method,
                  label: PAYMENT_METHOD_LABEL[method],
                  count: agg?.totalCents ?? 0,
                  formattedValue: formatCOP(agg?.totalCents ?? 0),
                  tone: method === "WOMPI" ? "purple" : "turquoise",
                  hint: `${agg?.count ?? 0} pedido${(agg?.count ?? 0) === 1 ? "" : "s"} · ${PAYMENT_METHOD_HINT[method]}`,
                };
              })}
            />
          </AdminCard>

          <AdminCard className="p-5">
            <h2 className="text-brand-purple-dark font-display mb-4 flex items-center gap-2 text-base font-bold">
              <Receipt className="h-5 w-5" />
              Ticket promedio (AOV) y ritmo de pedidos
            </h2>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="text-brand-purple-dark font-display text-3xl font-bold tabular-nums">
                {periodoData.orderCount > 0 ? formatCOP(periodoData.aovCents) : "—"}
              </div>
              <AdminDeltaPill
                deltaPct={periodoData.aovDeltaPct}
                comparisonLabel={periodoData.range.previousLabel}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50/80 p-3 text-xs">
              <div>
                <span className="text-brand-muted block text-[11px]">Pedidos en ventana</span>
                <span className="text-brand-purple-dark text-base font-bold tabular-nums">
                  {periodoData.orderCount.toLocaleString("es-CO")}
                </span>
              </div>
              <div>
                <span className="text-brand-muted block text-[11px]">
                  Ventana previa ({periodoData.range.previousLabel})
                </span>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-brand-purple-dark text-base font-bold tabular-nums">
                    {periodoData.previousOrderCount.toLocaleString("es-CO")}
                  </span>
                  <AdminDeltaPill deltaPct={periodoData.ordersDeltaPct} />
                </div>
              </div>
            </div>

            <p className="text-brand-muted border-brand-purple/10 mt-3 border-t pt-3 text-xs">
              Promedio del total de cada pedido cobrado en la ventana seleccionada (incluye envío y
              descuentos, como sale del checkout).
            </p>
          </AdminCard>
        </div>

        {/* Ecosistema financiero 360° — accesos cruzados según permisos del rol */}
        <section>
          <h2 className="text-brand-purple-dark font-display mb-3 text-base font-bold">
            Ecosistema financiero y control de riesgo
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {canAccessAdminPath(role, "/admin/finanzas/conciliacion") && (
              <QuickLink
                href="/admin/finanzas/conciliacion"
                label="Conciliación contra entrega"
                description="Remesas de mensajería, efectivo pendiente en calle y discrepancias."
                icon={Wallet}
                badge={
                  codRecon.discrepancyCount > 0
                    ? {
                        text: `${codRecon.discrepancyCount} discrepancia${codRecon.discrepancyCount === 1 ? "" : "s"}`,
                        tone: "rose",
                      }
                    : codRecon.pendingCount > 0
                      ? { text: `${codRecon.pendingCount} por remitir`, tone: "amber" }
                      : undefined
                }
              />
            )}
            {canAccessAdminPath(role, "/admin/finanzas/bloqueos") && (
              <QuickLink
                href="/admin/finanzas/bloqueos"
                label="Bloqueos contra entrega"
                description="Lista de identidades vetadas para pago COD (pueden pagar en línea)."
                icon={ShieldBan}
              />
            )}
            {canAccessAdminPath(role, "/admin/costos") && (
              <QuickLink
                href="/admin/costos"
                label="Costos y márgenes BOM"
                description="Costo unitario de fabricación, recetas de materiales y margen bruto."
                icon={Calculator}
              />
            )}
            {canAccessAdminPath(role, "/admin/metricas") && (
              <QuickLink
                href="/admin/metricas"
                label="Métricas comerciales"
                description="Embudo comercial, top productos, canales y cohortes de recompra."
                icon={BarChart2}
              />
            )}
            {canAccessAdminPath(role, "/admin/retractos") && (
              <QuickLink
                href="/admin/retractos"
                label="Retractos Ley 1480"
                description="Devoluciones legales y reembolsos que impactan el puente de caja."
                icon={Undo2}
              />
            )}
            {canAccessAdminPath(role, "/admin/garantias") && (
              <QuickLink
                href="/admin/garantias"
                label="Garantías posventa"
                description="Reclamos de calidad, reposiciones y devoluciones de dinero."
                icon={BadgeCheck}
              />
            )}
            {canAccessAdminPath(role, "/admin/fidelizacion") && (
              <QuickLink
                href="/admin/fidelizacion"
                label="Fidelización y referidos"
                description="Pasivo de Puntos Lucams y descuentos de «Invita y gana»."
                icon={Award}
              />
            )}
          </div>
        </section>

        {/* Lo que falta depende de integraciones externas — copy honesto, sin promesas */}
        <section>
          <h2 className="text-brand-purple-dark font-display mb-3 text-base font-bold">
            Pendiente de integraciones externas
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <BlocoFuturo
              icon={<Receipt className="h-5 w-5" />}
              title="IVA cobrado vs pagado"
              description="El desglose fiscal confiable llega con el proveedor de facturación electrónica: él calcula el IVA por ítem según la norma DIAN vigente. Sin esa integración, derivarlo desde acá sería un número aproximado, no declarable."
              phase="Requiere integración DIAN"
            />
            <BlocoFuturo
              icon={<FileText className="h-5 w-5" />}
              title="Facturación electrónica DIAN"
              description="Estado por orden, descarga XML/PDF y reintentos. El schema de Order ya tiene los campos (dianStatus, CUFE, XML); falta contratar e integrar un proveedor de facturación electrónica que emita ante la DIAN."
              phase="Requiere integración DIAN"
            />
            <BlocoFuturo
              icon={<DollarSign className="h-5 w-5" />}
              title="Conciliación Wompi"
              description="Comparar transacciones Wompi vs Orders en DB y reportar discrepancias. Hoy la conciliación es manual desde el dashboard de Wompi: automatizarla requiere la API de movimientos de Wompi (pendiente de habilitar en la cuenta)."
              phase="Requiere API de Wompi"
            />
          </div>
        </section>

        {!hasRealData && (
          <AdminCard className="p-5">
            <h3 className="text-brand-purple-dark font-display mb-2 text-base font-bold">
              ¿Mientras tanto, qué puedo hacer?
            </h3>
            <p className="text-brand-purple-dark/75 mb-3 text-sm">
              Mientras tanto, puedes ir dejando todo listo:
            </p>
            <ul className="text-brand-purple-dark/75 list-inside list-disc space-y-1.5 text-sm">
              {canAccessAdminPath(role, "/admin/cupones") && (
                <li>
                  Revisar cupones promocionales en{" "}
                  <Link href="/admin/cupones" className="text-brand-purple underline">
                    /admin/cupones
                  </Link>
                  .
                </li>
              )}
              <li>
                Revisar pedidos por WhatsApp manual (los clientes pueden hacer wa.me directos hoy).
              </li>
              {canAccessAdminPath(role, "/admin/productos") && (
                <li>
                  Tener listo el catálogo en{" "}
                  <Link href="/admin/productos" className="text-brand-purple underline">
                    /admin/productos
                  </Link>{" "}
                  con fotos reales y precios definitivos.
                </li>
              )}
            </ul>
          </AdminCard>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <AdminCard className="p-4">
      <div className="text-brand-muted mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
        {icon}
        {label}
      </div>
      <div
        className={
          highlight
            ? "text-brand-purple-dark font-display text-2xl font-bold tabular-nums"
            : "text-brand-purple-dark/85 font-display text-2xl font-bold tabular-nums"
        }
      >
        {typeof value === "number" ? <CountUp value={value} /> : value}
      </div>
      <p className="text-brand-muted mt-1 text-xs">{hint}</p>
    </AdminCard>
  );
}

function BlocoFuturo({
  icon,
  title,
  description,
  phase,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <AdminCard className="p-4">
      <div className="flex items-start gap-3">
        <div className="bg-brand-purple/10 text-brand-purple-dark flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-brand-purple-dark text-sm font-semibold">{title}</h4>
            <AdminBadge tone="blue">{phase}</AdminBadge>
          </div>
          <p className="text-brand-muted mt-1 text-xs">{description}</p>
        </div>
        <ArrowRight className="text-brand-purple-dark/30 mt-1 h-4 w-4 flex-shrink-0" />
      </div>
    </AdminCard>
  );
}

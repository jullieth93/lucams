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
import { redirect } from "next/navigation";
import { DollarSign, TrendingUp, Receipt, CreditCard, FileText, ArrowRight } from "lucide-react";
import type { PaymentMethod } from "@lucams/db";
import {
  AdminBadge,
  AdminCard,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
} from "@/components/admin-page";
import { requireRole } from "@/lib/admin-rbac-guard";
import { prisma } from "@/lib/db";
import { formatCOP } from "@/lib/format";
import { isCatalogMode } from "@/lib/store-mode";
import { getCodReconciliationTotals } from "@/features/orders/cod-reconciliation";
import {
  DEFAULT_PERIOD,
  FINANZAS_PERIODS,
  getPeriodAggregates,
  isFinanzasPeriod,
} from "@/features/finanzas/service";

export const metadata: Metadata = {
  title: "Finanzas",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  WOMPI: "Wompi (pago en línea)",
  COD: "Contra entrega",
};

const PAYMENT_METHOD_HINT: Record<PaymentMethod, string> = {
  WOMPI: "Tarjeta, PSE o Nequi — se reconoce al confirmar el pago",
  COD: "Efectivo — se reconoce solo cuando el pedido queda entregado",
};

export default async function AdminFinanzasPage({ searchParams }: { searchParams: SearchParams }) {
  const _session = await requireRole(["SUPERADMIN"]);
  // Modo catálogo (Etapa 1): sin pagos en línea no hay finanzas que mostrar.
  // El nav ya oculta el módulo; esto cierra también el acceso por URL directa.
  if (isCatalogMode()) redirect("/admin/dashboard");

  const sp = await searchParams;
  const periodoRaw = typeof sp.periodo === "string" ? sp.periodo : undefined;
  const periodo = isFinanzasPeriod(periodoRaw) ? periodoRaw : DEFAULT_PERIOD;

  // Probar contadores reales: si hay alguna orden pagada en DB ya, los
  // mostramos; si no, mantenemos los placeholders educativos.
  const [
    totalPaidOrders,
    wompiRevenue,
    codDeliveredRevenue,
    codToCollect,
    totalRefunded,
    ordersThisMonth,
    dianPending,
  ] = await Promise.all([
    prisma.order.count({
      where: { deletedAt: null, status: { in: ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"] } },
    }),
    // Ingresos = efectivo REALMENTE cobrado: Wompi capturado online + COD ENTREGADO
    // (el efectivo del contraentrega solo entra al entregar). Revisión adversarial COD.
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
    prisma.order.count({
      where: {
        deletedAt: null,
        status: { in: ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"] },
        createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
    }),
    prisma.order.count({
      where: { deletedAt: null, dianStatus: "PENDING" },
    }),
  ]);

  // ADR-064 — efectivo COD entregado pendiente de remesa del mensajero + discrepancias.
  const codRecon = await getCodReconciliationTotals();

  // Serie del período seleccionado + comparativa (mismo criterio de ingreso
  // que los KPIs, menos el faltante COD que no tiene fecha para repartir).
  const periodoData = await getPeriodAggregates(periodo);

  // El COD entregado se reconoce como cobrado, PERO el faltante confirmado por discrepancias (efectivo
  // que el mensajero no remitió / se perdió) NO es caja real → se resta de "Ingresos" (review ADR-064).
  const totalRevenue = wompiRevenue + codDeliveredRevenue - codRecon.shortfallCop;
  const hasRealData = totalPaidOrders > 0;

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
        breadcrumbs={[{ label: "Admin", href: "/admin/dashboard" }, { label: "Finanzas" }]}
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
            label="Ingresos totales"
            value={hasRealData ? formatCOP(totalRevenue) : "—"}
            hint={
              hasRealData
                ? "Efectivo cobrado: Wompi + contra entrega ya entregado"
                : "Disponible cuando haya ventas"
            }
            highlight={hasRealData}
          />
          <Kpi
            icon={<Receipt className="h-5 w-5" />}
            label="Pedidos confirmados"
            value={hasRealData ? totalPaidOrders.toLocaleString("es-CO") : "0"}
            hint={
              hasRealData ? "Pagados + en producción + enviados + entregados" : "Pendiente checkout"
            }
          />
          <Kpi
            icon={<CreditCard className="h-5 w-5" />}
            label="Este mes"
            value={hasRealData ? ordersThisMonth.toLocaleString("es-CO") : "0"}
            hint={
              hasRealData
                ? "Pedidos confirmados del mes corriente"
                : "Disponible cuando haya ventas"
            }
          />
          <Kpi
            icon={<FileText className="h-5 w-5" />}
            label="DIAN pendientes"
            value={dianPending.toLocaleString("es-CO")}
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
                      ? "bg-brand-purple rounded-full px-3 py-1 text-xs font-semibold text-white"
                      : "border-brand-purple/20 text-brand-purple-dark hover:border-brand-purple/50 rounded-full border bg-white px-3 py-1 text-xs font-semibold transition-colors"
                  }
                >
                  {p.label}
                </Link>
              ))}
            </div>
          </div>
          <AdminCard className="p-5">
            {periodoData.orderCount === 0 ? (
              <p className="text-brand-muted text-sm">
                Sin ventas cobradas en este período. Las barras aparecen solas apenas entre un
                pedido pagado (Wompi) o entregado (contra entrega).
              </p>
            ) : (
              <>
                <p className="text-brand-muted mb-4 text-xs">
                  <strong className="text-brand-purple-dark">
                    {formatCOP(periodoData.totalCents)}
                  </strong>{" "}
                  cobrados en {periodoData.orderCount} pedido
                  {periodoData.orderCount === 1 ? "" : "s"} ·{" "}
                  {periodoData.range.bucket === "day"
                    ? "una barra por día"
                    : "una barra por semana"}
                  .
                </p>
                <div
                  className="flex h-40 items-end gap-1"
                  role="img"
                  aria-label="Gráfico de ingresos por período"
                >
                  {(() => {
                    const max = Math.max(...periodoData.buckets.map((x) => x.totalCents));
                    return periodoData.buckets.map((b) => {
                      const heightPct =
                        max > 0 ? Math.max(2, Math.round((b.totalCents / max) * 100)) : 2;
                      return (
                        <div
                          key={b.start.toISOString()}
                          className="flex min-w-0 flex-1 flex-col items-center justify-end self-stretch"
                        >
                          <div
                            className={
                              b.totalCents > 0
                                ? "bg-brand-purple/80 w-full rounded-t"
                                : "bg-brand-purple/15 w-full rounded-t"
                            }
                            style={{ height: `${heightPct}%` }}
                            title={`${b.label}: ${formatCOP(b.totalCents)} (${b.count} pedido${b.count === 1 ? "" : "s"})`}
                          />
                        </div>
                      );
                    });
                  })()}
                </div>
                <div className="mt-1 flex gap-1">
                  {periodoData.buckets.map((b) => (
                    <span
                      key={b.start.toISOString()}
                      className="text-brand-muted min-w-0 flex-1 truncate text-center text-[10px] tabular-nums"
                    >
                      {b.tickLabel}
                    </span>
                  ))}
                </div>
              </>
            )}
          </AdminCard>
        </section>

        {/* Breakdown por método de pago + ticket promedio (misma ventana) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AdminCard className="p-5">
            <h2 className="text-brand-purple-dark font-display mb-4 flex items-center gap-2 text-base font-bold">
              <CreditCard className="h-5 w-5" />
              Por método de pago
            </h2>
            {periodoData.byMethod.length === 0 ? (
              <p className="text-brand-muted text-sm">Sin ventas cobradas en este período.</p>
            ) : (
              <ul className="space-y-3">
                {periodoData.byMethod.map((m) => (
                  <li key={m.method}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-brand-purple-dark text-sm font-semibold">
                        {PAYMENT_METHOD_LABEL[m.method]}
                      </span>
                      <span className="text-brand-purple-dark text-sm font-bold tabular-nums">
                        {formatCOP(m.totalCents)}
                      </span>
                    </div>
                    <div className="bg-brand-purple/10 mt-1.5 h-2 overflow-hidden rounded-full">
                      <div
                        className="bg-brand-purple h-full rounded-full"
                        style={{ width: `${m.pct}%` }}
                      />
                    </div>
                    <p className="text-brand-muted mt-1 text-xs">
                      {m.pct}% del período · {m.count} pedido{m.count === 1 ? "" : "s"} ·{" "}
                      {PAYMENT_METHOD_HINT[m.method]}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </AdminCard>

          <AdminCard className="p-5">
            <h2 className="text-brand-purple-dark font-display mb-4 flex items-center gap-2 text-base font-bold">
              <Receipt className="h-5 w-5" />
              Ticket promedio (AOV)
            </h2>
            <div className="text-brand-purple-dark font-display text-3xl font-bold tabular-nums">
              {periodoData.orderCount > 0 ? formatCOP(periodoData.aovCents) : "—"}
            </div>
            <p className="text-brand-muted mt-2 text-xs">
              {periodoData.aovDeltaPct === null
                ? `Sin comparativa: no hubo ventas en ${periodoData.range.previousLabel}.`
                : `${periodoData.aovDeltaPct >= 0 ? "+" : ""}${periodoData.aovDeltaPct}% vs ${periodoData.range.previousLabel}.`}
            </p>
            <p className="text-brand-muted border-brand-purple/10 mt-3 border-t pt-3 text-xs">
              Promedio del total de cada pedido cobrado en la ventana seleccionada (incluye envío y
              descuentos, como sale del checkout).
            </p>
          </AdminCard>
        </div>

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

        <AdminCard className="p-5">
          <h3 className="text-brand-purple-dark font-display mb-2 text-base font-bold">
            ¿Mientras tanto, qué puedo hacer?
          </h3>
          <p className="text-brand-purple-dark/75 mb-3 text-sm">
            Mientras tanto, puedes ir dejando todo listo:
          </p>
          <ul className="text-brand-purple-dark/75 list-inside list-disc space-y-1.5 text-sm">
            <li>
              Crear cupones promocionales en{" "}
              <Link href="/admin/cupones" className="text-brand-purple underline">
                /admin/cupones
              </Link>
              .
            </li>
            <li>
              Revisar pedidos por WhatsApp manual (los clientes pueden hacer wa.me directos hoy).
            </li>
            <li>
              Tener listo el catálogo en{" "}
              <Link href="/admin/productos" className="text-brand-purple underline">
                /admin/productos
              </Link>{" "}
              con fotos reales y precios definitivos.
            </li>
          </ul>
        </AdminCard>
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
  value: string;
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
        {value}
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

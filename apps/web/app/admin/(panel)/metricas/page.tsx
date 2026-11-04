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
import { requireRole } from "@/lib/admin-rbac-guard";
import { formatCOP } from "@/lib/format";
import { isCatalogMode } from "@/lib/store-mode";
import { COLLECTED_REVENUE_ORDER_WHERE } from "@/features/finanzas/service";
import {
  getFunnelDashboardReport,
  type FunnelReportFilters,
} from "@/features/analytics/funnel-service";
import { PRODUCT_SLUG_OR_ALL_REGEX } from "@/features/analytics/funnel-schema";
import { ORDER_STATUS_LABEL } from "@/features/orders/order-status-display";
import { FunnelPanel } from "./funnel-panel";
import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
  KpiCard,
} from "@/components/admin-page";

export const metadata: Metadata = {
  title: "Métricas de ventas",
  robots: { index: false, follow: false },
};

// Estados de Order que implican dinero recibido (ver nota del header).
const PAID_STATUSES: OrderStatus[] = ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"];

const ORDER_STATUS_TONE: Record<
  OrderStatus,
  "slate" | "amber" | "purple" | "turquoise" | "emerald" | "rose"
> = {
  DRAFT: "slate",
  PENDING_PAYMENT: "amber",
  PAID: "purple",
  FULFILLING: "purple",
  SHIPPED: "turquoise",
  DELIVERED: "emerald",
  CANCELLED: "rose",
  REFUNDED: "rose",
};

const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  PENDING: "Pendiente",
  CONTACTED: "Contactada",
  CLOSED: "Cerrada (vendida)",
  DISCARDED: "Descartada",
};
const QUOTE_STATUS_TONE: Record<QuoteStatus, "amber" | "purple" | "emerald" | "slate"> = {
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
  await requireRole(["SUPERADMIN"]);
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
  const monthLabel = new Intl.DateTimeFormat("es-CO", {
    month: "long",
    year: "numeric",
  }).format(now);

  // Consultas independientes → Promise.all para no serializar round-trips a DB.
  // En modo catálogo las queries de Order ni siquiera se disparan (orderData=null).
  // [FIN-01] — todas las consultas de Order/OrderItem filtran `deletedAt: null` y los
  // ingresos del mes usan el mismo criterio de caja real que `/admin/finanzas`
  // (Wompi confirmado + COD entregado − retractos reembolsados en el mes).
  const [quotesByStatus, orderData, funnelReport] = await Promise.all([
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

        {/* Detalle por estado */}
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
              <ul className="space-y-3">
                {(() => {
                  const statusKeys = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];
                  const totalOrdersAll = statusKeys.reduce(
                    (acc, s) => acc + (orderCount.get(s) ?? 0),
                    0,
                  );
                  return statusKeys.map((s) => {
                    const count = orderCount.get(s) ?? 0;
                    const pct = totalOrdersAll > 0 ? Math.round((count / totalOrdersAll) * 100) : 0;
                    const rowContent = (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <AdminBadge tone={ORDER_STATUS_TONE[s]}>
                            {ORDER_STATUS_LABEL[s]}
                          </AdminBadge>
                          <span className="text-brand-purple-dark text-sm font-semibold tabular-nums">
                            {count.toLocaleString("es-CO")}
                            {totalOrdersAll > 0 && (
                              <span className="text-brand-muted ml-1.5 text-xs font-normal">
                                ({pct}%)
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="bg-brand-purple/10 mt-1.5 h-1.5 overflow-hidden rounded-full">
                          <div
                            className="bg-brand-purple/75 h-full rounded-full transition-all"
                            style={{ width: `${count > 0 ? Math.max(3, pct) : 0}%` }}
                          />
                        </div>
                      </>
                    );
                    return (
                      <li key={s}>
                        {s === "DRAFT" ? (
                          <div>{rowContent}</div>
                        ) : (
                          <Link
                            href={`/admin/pedidos?status=${s}`}
                            className="hover:bg-brand-purple/5 -mx-2 block rounded-lg px-2 py-1 transition-colors"
                          >
                            {rowContent}
                          </Link>
                        )}
                      </li>
                    );
                  });
                })()}
              </ul>
            </AdminCard>
          )}

          <AdminCard className="p-5">
            <h2 className="text-brand-purple-dark font-display mb-4 text-base font-bold">
              Cotizaciones por estado
            </h2>
            <ul className="space-y-3">
              {QUOTE_STATUSES.map((s) => {
                const count = quoteCount.get(s) ?? 0;
                const pct = totalQuotes > 0 ? Math.round((count / totalQuotes) * 100) : 0;
                return (
                  <li key={s}>
                    <div className="flex items-center justify-between gap-3">
                      <AdminBadge tone={QUOTE_STATUS_TONE[s]}>{QUOTE_STATUS_LABEL[s]}</AdminBadge>
                      <span className="text-brand-purple-dark text-sm font-semibold tabular-nums">
                        {count.toLocaleString("es-CO")}
                        {totalQuotes > 0 && (
                          <span className="text-brand-muted ml-1.5 text-xs font-normal">
                            ({pct}%)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="bg-brand-purple/10 mt-1.5 h-1.5 overflow-hidden rounded-full">
                      <div
                        className="bg-brand-purple/75 h-full rounded-full transition-all"
                        style={{ width: `${count > 0 ? Math.max(3, pct) : 0}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
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
                description="Cuando entren los primeros pedidos pagados, acá vas a ver qué productos se venden más."
              />
            ) : (
              <AdminTable minWidth={520}>
                <AdminTableHead>
                  <tr>
                    <th className="w-12 px-4 py-3 text-center font-semibold">#</th>
                    <th className="px-4 py-3 text-left font-semibold">Producto</th>
                    <th className="px-4 py-3 text-left font-semibold">Opción</th>
                    <th className="px-4 py-3 text-left font-semibold">Código</th>
                    <th className="px-4 py-3 text-right font-semibold">Unidades vendidas</th>
                  </tr>
                </AdminTableHead>
                <AdminTableBody>
                  {topProducts.map((t, i) => (
                    <AdminTableRow key={t.variantId}>
                      <td className="text-brand-muted px-4 py-3 text-center text-xs tabular-nums">
                        {i + 1}
                      </td>
                      <td className="text-brand-purple-dark px-4 py-3 font-medium">
                        {t.variant!.product.name}
                      </td>
                      <td className="text-brand-purple-dark/85 px-4 py-3 text-sm">
                        {t.variant!.name}
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-brand-purple-dark/85 bg-brand-purple/5 rounded px-1.5 py-0.5 font-mono text-[11px]">
                          {t.variant!.sku}
                        </code>
                      </td>
                      <td className="text-brand-purple-dark px-4 py-3 text-right font-semibold tabular-nums">
                        {(t._sum.qty ?? 0).toLocaleString("es-CO")}
                      </td>
                    </AdminTableRow>
                  ))}
                </AdminTableBody>
              </AdminTable>
            )}
          </section>
        )}

        {/* Embudo vivo tienda + Estudio ([ANA-01], Fase 2): interactivo por ventana,
            dispositivo, superficie y producto. Sin PII ni cookies. */}
        <FunnelPanel report={funnelReport} filters={funnelFilters} />

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

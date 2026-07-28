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
import { redirect } from "next/navigation";
import { BarChart3, Trophy } from "lucide-react";
import type { OrderStatus, QuoteStatus } from "@lucams/db";
import { prisma } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/auth";
import { formatCOP } from "@/lib/format";
import { isCatalogMode } from "@/lib/store-mode";
import { ORDER_STATUS_LABEL } from "@/features/orders/order-status-display";
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

export default async function AdminMetricasPage() {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

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
  const [quotesByStatus, orderData] = await Promise.all([
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
            _count: { _all: true },
          }),
          // Se excluyen los DRAFT: son carritos abandonados, no pedidos reales, e
          // inflarían el conteo que Lucy usa como pulso del negocio.
          prisma.order.count({
            where: { createdAt: { gte: thirtyDaysAgo }, status: { not: "DRAFT" } },
          }),
          prisma.order.aggregate({
            where: { status: { in: PAID_STATUSES }, createdAt: { gte: startOfMonth } },
            _sum: { total: true },
          }),
          // Top 10 variantes por unidades vendidas en pedidos pagados.
          prisma.orderItem.groupBy({
            by: ["variantId"],
            where: { order: { status: { in: PAID_STATUSES } } },
            _sum: { qty: true },
            orderBy: { _sum: { qty: "desc" } },
            take: 10,
          }),
        ]),
  ]);
  const ordersByStatus = orderData?.[0] ?? [];
  const ordersLast30 = orderData?.[1] ?? 0;
  const revenueCents = orderData?.[2]._sum.total ?? 0;
  const topByVariant = orderData?.[3] ?? [];

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
        icon={<BarChart3 className="h-5 w-5" />}
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
              value={paidCount.toLocaleString("es-CO")}
              trendLabel="Acumulado histórico (pagado, preparación, enviado, entregado)"
            />
            <KpiCard
              label="Esperando pago"
              value={pendingCount.toLocaleString("es-CO")}
              trend={pendingCount > 0 ? "down" : "neutral"}
              trendLabel="Pedidos creados que aún no confirman el pago"
            />
            <KpiCard
              label="Pedidos últimos 30 días"
              value={ordersLast30.toLocaleString("es-CO")}
              trendLabel="Sin contar borradores (carritos abandonados)"
            />
            <KpiCard
              label="Ingresos del mes"
              value={formatCOP(revenueCents)}
              trend="up"
              trendLabel={`Pedidos pagados en ${monthLabel}`}
            />
          </div>
        )}

        {/* Detalle por estado */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {!catalog && (
            <AdminCard className="p-5">
              <h2 className="text-brand-purple-dark font-display mb-4 text-base font-bold">
                Pedidos por estado
              </h2>
              <ul className="space-y-2.5">
                {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => (
                  <li key={s} className="flex items-center justify-between gap-3">
                    <AdminBadge tone={ORDER_STATUS_TONE[s]}>{ORDER_STATUS_LABEL[s]}</AdminBadge>
                    <span className="text-brand-purple-dark text-sm font-semibold tabular-nums">
                      {(orderCount.get(s) ?? 0).toLocaleString("es-CO")}
                    </span>
                  </li>
                ))}
              </ul>
            </AdminCard>
          )}

          <AdminCard className="p-5">
            <h2 className="text-brand-purple-dark font-display mb-4 text-base font-bold">
              Cotizaciones por estado
            </h2>
            <ul className="space-y-2.5">
              {QUOTE_STATUSES.map((s) => (
                <li key={s} className="flex items-center justify-between gap-3">
                  <AdminBadge tone={QUOTE_STATUS_TONE[s]}>{QUOTE_STATUS_LABEL[s]}</AdminBadge>
                  <span className="text-brand-purple-dark text-sm font-semibold tabular-nums">
                    {(quoteCount.get(s) ?? 0).toLocaleString("es-CO")}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-brand-muted mt-4 border-t border-brand-purple/10 pt-3 text-xs">
              Total: <strong>{totalQuotes.toLocaleString("es-CO")}</strong> cotizaciones activas
              (no incluye eliminadas).
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
                    <th className="px-4 py-3 text-left font-semibold">SKU</th>
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

        {!catalog && (
          <AdminNotice tone="info">
            <strong>¿Cómo se calcula?</strong> “Pagados” incluye pedidos pagados, en preparación,
            enviados y entregados (la plata ya entró). No suma cancelados ni reembolsados. El top
            de productos cuenta solo unidades de pedidos pagados.
          </AdminNotice>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}

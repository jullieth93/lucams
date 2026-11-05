import Link from "next/link";
import {
  AlertTriangle,
  CalendarHeart,
  Crown,
  HeartHandshake,
  Layers,
  Megaphone,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { formatCOP } from "@/lib/format";
import {
  AdminBadge,
  AdminCard,
  AdminHorizontalBars,
  AdminSegmentedBar,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
  KpiCard,
  type ChartTone,
} from "@/components/admin-page";
import type {
  CrmBehavioralIntelligenceReport,
  ProductIntentSignal,
  RfmTierKey,
} from "@/features/crm/intelligence-service";

const RFM_BADGE_TONE: Record<RfmTierKey, "emerald" | "purple" | "turquoise" | "amber" | "slate"> = {
  champions: "emerald",
  loyal: "purple",
  promising_new: "turquoise",
  at_risk: "amber",
  hibernating: "slate",
};

const RFM_CHART_TONE: Record<RfmTierKey, ChartTone> = {
  champions: "emerald",
  loyal: "purple",
  promising_new: "turquoise",
  at_risk: "amber",
  hibernating: "slate",
};

function stockAlertBadge(alert: ProductIntentSignal["stockAlert"]) {
  switch (alert) {
    case "OUT_OF_STOCK_DEMAND":
      return <AdminBadge tone="rose">Agotado con demanda</AdminBadge>;
    case "RESTOCK_READY_TO_NOTIFY":
      return <AdminBadge tone="turquoise">Con stock · notificar espera</AdminBadge>;
    case "LOW_STOCK_HIGH_INTENT":
      return <AdminBadge tone="amber">Stock bajo (≤ 3)</AdminBadge>;
    default:
      return <AdminBadge tone="emerald">Stock sano</AdminBadge>;
  }
}

export function CrmIntelligencePanel({
  report,
  canAccessSegments,
  canAccessCarts,
  canAccessOpportunities,
}: {
  report: CrmBehavioralIntelligenceReport;
  canAccessSegments: boolean;
  canAccessCarts: boolean;
  canAccessOpportunities: boolean;
}) {
  const { dropOffs, intentSignals, rfm, channelAttribution, assistedRecovery } = report;
  const costPct = Math.round(rfm.productsWithCostConfiguredRatio * 100);

  return (
    <section className="space-y-6">
      {/* Encabezado de sección */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-brand-purple-dark font-display flex items-center gap-2 text-lg font-bold">
            <Sparkles className="text-brand-pink h-5 w-5" />
            Inteligencia conductual, retención RFM y atribución CRM ({report.windowDays}d)
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Dónde se detienen los clientes identificables, qué productos desean, salud de recompra
            RFM y retorno asistido por tu operación comercial.
          </p>
        </div>

        {canAccessSegments && (
          <Link
            href="/admin/marketing/segmentos"
            className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-9 items-center gap-1.5 self-start rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold transition-colors"
          >
            <Megaphone className="h-3.5 w-3.5" />
            Activar audiencias Ley 1581
          </Link>
        )}
      </div>

      {/* 1. Puntos de abandono identificables + Recuperación asistida */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={`Diseños en borrador (${report.windowDays}d)`}
          value={dropOffs.draftDesignsCount}
          trend="neutral"
          trendLabel="Abrieron el Estudio y guardaron avance sin pedir"
        />
        <KpiCard
          label={`Carritos sin recuperar (${report.windowDays}d)`}
          value={dropOffs.unrecoveredCartsCount}
          trend={dropOffs.unrecoveredCartsCount > 0 ? "down" : "neutral"}
          trendLabel={`Valor latente aprox. ${formatCOP(dropOffs.unrecoveredCartsValueCents)}`}
        />
        <KpiCard
          label={`Venta recuperada / B2B (${report.windowDays}d)`}
          value={formatCOP(
            assistedRecovery.recoveredCartsRevenueCents +
              assistedRecovery.wonOpportunitiesRevenueCents,
          )}
          trend={
            assistedRecovery.recoveredCartsCount + assistedRecovery.wonOpportunitiesCount > 0
              ? "up"
              : "neutral"
          }
          trendLabel={`${assistedRecovery.recoveredCartsCount} carritos · ${assistedRecovery.wonOpportunitiesCount} B2B ganadas`}
        />
        <KpiCard
          label={`Pedidos asistidos por CRM (${report.windowDays}d)`}
          value={formatCOP(assistedRecovery.crmTouchedRevenueCents)}
          trend={assistedRecovery.crmTouchedOrdersCount > 0 ? "up" : "neutral"}
          trendLabel={`${assistedRecovery.crmTouchedOrdersCount} pedidos pagados tras gestión ≤ 14d`}
        />
      </div>

      {/* Banner de ocasión anual si existen contactos listos */}
      {assistedRecovery.consentedAnnualOccasionsCount > 0 && (
        <AdminCard className="border-teal-200 bg-teal-50/60 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CalendarHeart className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
              <div>
                <p className="text-sm font-semibold text-teal-950">
                  {assistedRecovery.consentedAnnualOccasionsCount}{" "}
                  {assistedRecovery.consentedAnnualOccasionsCount === 1
                    ? "cliente cumple"
                    : "clientes cumplen"}{" "}
                  1 año desde su compra especial (con opt-in comercial vigente)
                </p>
                <p className="text-xs text-teal-900/80">
                  Ideal para recordatorio cálido de cumpleaños, aniversario o temporada.
                </p>
              </div>
            </div>
            {canAccessSegments && (
              <Link
                href="/admin/marketing/segmentos?segment=annual_occasion"
                className="inline-flex min-h-9 shrink-0 items-center rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
              >
                Ver segmento anual
              </Link>
            )}
          </div>
        </AdminCard>
      )}

      {/* 2. Fricción de pago Wompi + Atribución por canal UTM */}
      <div className="grid gap-6 lg:grid-cols-2">
        <AdminCard className="p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-brand-purple-dark flex items-center gap-2 text-sm font-bold">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Rechazos de pago Wompi por medio ({report.windowDays}d)
            </h3>
            <span className="text-xs text-slate-500">
              {dropOffs.unpaidPendingOrdersCount} órdenes en espera de pago
            </span>
          </div>

          {dropOffs.declinedPaymentsByMethod.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              Sin transacciones rechazadas o fallidas registradas en los últimos {report.windowDays}{" "}
              días.
            </p>
          ) : (
            <AdminHorizontalBars
              items={dropOffs.declinedPaymentsByMethod.map((m) => ({
                key: m.paymentMethodType,
                label: m.paymentMethodType,
                sublabel: `${m.failedTransactionsCount} fallo${m.failedTransactionsCount === 1 ? "" : "s"} en ${m.affectedOrdersCount} pedido${m.affectedOrdersCount === 1 ? "" : "s"}`,
                value: m.failedAmountCents,
                formattedValue: formatCOP(m.failedAmountCents),
                tone: "rose",
              }))}
            />
          )}

          {(canAccessCarts || canAccessOpportunities) && (
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              {canAccessCarts && (
                <Link
                  href="/admin/carritos?status=all"
                  className="text-brand-purple hover:text-brand-purple-dark font-semibold underline"
                >
                  Gestionar carritos abandonados →
                </Link>
              )}
              {canAccessOpportunities && (
                <Link
                  href="/admin/oportunidades"
                  className="text-brand-purple hover:text-brand-purple-dark font-semibold underline"
                >
                  Ver pipeline B2B →
                </Link>
              )}
            </div>
          )}
        </AdminCard>

        <AdminCard className="p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-brand-purple-dark flex items-center gap-2 text-sm font-bold">
              <HeartHandshake className="text-brand-purple h-4 w-4" />
              Ingresos y margen por canal UTM ({report.windowDays}d)
            </h3>
            <span className="text-xs text-slate-500">First-party sin PII</span>
          </div>

          {channelAttribution.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              Aún no hay pedidos pagados en los últimos {report.windowDays} días para desglosar por
              canal.
            </p>
          ) : (
            <AdminHorizontalBars
              items={channelAttribution.map((ch, idx) => ({
                key: ch.channel,
                label: ch.channel,
                sublabel: `${ch.ordersCount} pedido${ch.ordersCount === 1 ? "" : "s"} · ${ch.uniqueContactsCount} cliente${ch.uniqueContactsCount === 1 ? "" : "s"}`,
                value: ch.grossRevenueCents,
                formattedValue: formatCOP(ch.grossRevenueCents),
                secondaryText: `Margen est. ${formatCOP(ch.estimatedMarginCents)}`,
                tone: idx === 0 ? "purple" : idx === 1 ? "turquoise" : "pink",
              }))}
            />
          )}
        </AdminCard>
      </div>

      {/* 3. Matriz RFM histórica + Margen Neto */}
      <AdminCard className="p-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-brand-purple-dark flex items-center gap-2 text-sm font-bold">
              <Crown className="h-4 w-4 text-amber-500" />
              Salud de clientes RFM y LTV de margen neto (histórico acumulado)
            </h3>
            <p className="text-xs text-slate-500">
              Partición exhaustiva sobre {rfm.totalPaidContacts.toLocaleString("es-CO")} contactos
              compradores activos (excluye equipo interno) · Cobertura de costos configurados:{" "}
              {costPct}%.
            </p>
          </div>
          <div className="text-xs text-slate-600 tabular-nums sm:text-right">
            Margen acumulado est.:{" "}
            <strong className="text-emerald-700">{formatCOP(rfm.totalEstimatedMarginCents)}</strong>
          </div>
        </div>

        <div className="mb-5 rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
          <p className="text-brand-purple-dark mb-2 text-xs font-semibold">
            Composición visual de la base compradora por nivel RFM
          </p>
          <AdminSegmentedBar
            ariaLabel="Distribución porcentual de clientes por nivel RFM"
            items={rfm.tiers.map((tier) => ({
              key: tier.key,
              label: tier.label,
              count: tier.contactsCount,
              tone: RFM_CHART_TONE[tier.key],
              sublabel: tier.contactsCount > 0 ? `LTV ${formatCOP(tier.avgLtvCents)}` : undefined,
            }))}
          />
        </div>

        <AdminTable minWidth={560}>
          <AdminTableHead>
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold">Nivel RFM</th>
              <th className="px-3 py-2.5 text-left font-semibold">Criterio</th>
              <th className="px-3 py-2.5 text-right font-semibold">Contactos</th>
              <th className="px-3 py-2.5 text-right font-semibold">LTV prom.</th>
              <th className="px-3 py-2.5 text-right font-semibold">Ingresos brutos</th>
              <th className="px-3 py-2.5 text-right font-semibold">Margen neto est.</th>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rfm.tiers.map((tier) => (
              <AdminTableRow key={tier.key}>
                <td className="px-3 py-2.5">
                  <AdminBadge tone={RFM_BADGE_TONE[tier.key]}>{tier.label}</AdminBadge>
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-600">{tier.description}</td>
                <td className="px-3 py-2.5 text-right text-xs font-semibold text-slate-900 tabular-nums">
                  {tier.contactsCount.toLocaleString("es-CO")}
                </td>
                <td className="px-3 py-2.5 text-right text-xs text-slate-700 tabular-nums">
                  {formatCOP(tier.avgLtvCents)}
                </td>
                <td className="px-3 py-2.5 text-right text-xs font-semibold text-slate-900 tabular-nums">
                  {formatCOP(tier.grossRevenueCents)}
                </td>
                <td className="px-3 py-2.5 text-right text-xs font-medium text-emerald-700 tabular-nums">
                  {formatCOP(tier.estimatedMarginCents)}
                </td>
              </AdminTableRow>
            ))}
          </AdminTableBody>
        </AdminTable>
      </AdminCard>

      {/* 4. Señales de intención vs. Stock disponible */}
      <AdminCard className="p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-brand-purple-dark flex items-center gap-2 text-sm font-bold">
              <Layers className="text-brand-purple h-4 w-4" />
              Intención comercial latente vs. inventario vivo
            </h3>
            <p className="text-xs text-slate-500">
              Cruza favoritos guardados (`WishlistItem`) y alertas «Avísame cuando vuelva»
              pendientes contra el stock activo real.
            </p>
          </div>
          <ShoppingCart className="h-4 w-4 text-slate-400" />
        </div>

        {intentSignals.length === 0 ? (
          <p className="py-5 text-center text-xs text-slate-500">
            Todavía no hay productos en listas de favoritos ni alertas de reposición pendientes.
          </p>
        ) : (
          <AdminTable minWidth={520}>
            <AdminTableHead>
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold">Producto</th>
                <th className="px-3 py-2.5 text-right font-semibold">Favoritos</th>
                <th className="px-3 py-2.5 text-right font-semibold">Lista de espera</th>
                <th className="px-3 py-2.5 text-right font-semibold">Stock vivo</th>
                <th className="px-3 py-2.5 text-left font-semibold">Estado operativo</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {intentSignals.map((sig) => (
                <AdminTableRow key={sig.productId}>
                  <td className="px-3 py-2.5 text-xs font-semibold text-slate-900">
                    {sig.productName}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-slate-700 tabular-nums">
                    {sig.wishlistCount}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-semibold text-purple-800 tabular-nums">
                    {sig.pendingBackInStockCount}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-semibold text-slate-900 tabular-nums">
                    {sig.availableStock}
                  </td>
                  <td className="px-3 py-2.5">{stockAlertBadge(sig.stockAlert)}</td>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        )}
      </AdminCard>
    </section>
  );
}

/*
 * Admin > Fidelización — Gobierno ejecutivo y telemetría de:
 *   1. Puntos Lucams: acumulación al confirmarse el pago, redención en checkout
 *      con tope duro anti-abuso (retorno efectivo ≤ 25%) y pasivo contable vivo.
 *   2. Invita y gana (referidos): % OFF y vigencia de cupones personales no
 *      transferibles (bienvenida del referido + premio del referente).
 *
 * Seguridad y RBAC (Bloque 3 — N-21 estricto):
 *   - Lectura: `ADMIN_ROLE_SETS.FIDELIZACION_READ` (`SUPERADMIN`, `FINANCE_ANALYST`).
 *   - Mutación: exclusivo `SUPERADMIN` + Step-up MFA (`requireRecentMfa`, ≤ 10 min).
 *   - Enmascaramiento server-side de PII (`maskEmail`, `maskPersonName`) para
 *     `FINANCE_ANALYST` (carece de `orders:read_pii`).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Award,
  BarChart3,
  Coins,
  Eye,
  Gift,
  History,
  ShieldCheck,
  Sparkles,
  Ticket,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminComboBarLineChart,
  AdminDonutChart,
  AdminEmpty,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
  type ComboChartDatum,
  type DonutSlice,
} from "@/components/admin-page";
import { CountUp } from "@/components/admin/count-up";
import { Button } from "@/components/ui/button";
import { isCatalogMode } from "@/lib/store-mode";
import { requireRole } from "@/lib/admin-rbac-guard";
import {
  ADMIN_ROLE_SETS,
  adminHomePath,
  canAccessAdminPath,
  hasCapability,
} from "@/lib/admin-rbac";
import { prisma } from "@/lib/db";
import { formatDateTimeNoYearCO, formatDayMonthCO, formatIsoDateCO } from "@/lib/datetime";
import { formatCOP } from "@/lib/format";
import { maskEmail, maskPersonName } from "@/lib/pii-mask";
import { getLoyaltySettings, getReferralSettings } from "@/features/loyalty/settings";
import { pointValueCents } from "@/features/loyalty/service";
import { LoyaltySection } from "./loyalty-section";
import { ReferralsSection } from "./referrals-section";

export const metadata: Metadata = {
  title: "Fidelización",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function FidelizacionAdminPage() {
  const session = await requireRole(ADMIN_ROLE_SETS.FIDELIZACION_READ);
  const role = session.admin.role;
  if (isCatalogMode()) redirect(adminHomePath(role));

  const canEdit = role === "SUPERADMIN";
  const canReadPii = hasCapability(role, "orders:read_pii");
  const canViewOrders = canAccessAdminPath(role, "/admin/pedidos");
  const canViewContacts = canAccessAdminPath(role, "/admin/clientes");
  const canViewCoupons = canAccessAdminPath(role, "/admin/cupones");
  const canViewMetrics = canAccessAdminPath(role, "/admin/metricas");
  const canViewAudit = canAccessAdminPath(role, "/admin/auditoria");

  const now = new Date();
  // Ventana de 15 días UTC garantiza cubrir los 14 días calendario de Bogotá (UTC-5)
  const windowStart = new Date(now.getTime() - 15 * DAY_MS);

  const [
    loyalty,
    referral,
    customerPointsAgg,
    txnReasonGroups,
    recentWindowTxns,
    referralStatusGroups,
    referralCouponsCount,
    referralCouponsUsedCount,
    latestLoyaltyTxns,
    latestReferrals,
  ] = await Promise.all([
    getLoyaltySettings(),
    getReferralSettings(),
    prisma.customer.aggregate({
      where: { deletedAt: null, loyaltyPoints: { gt: 0 } },
      _sum: { loyaltyPoints: true },
      _count: { id: true },
    }),
    prisma.loyaltyTxn.groupBy({
      by: ["reason"],
      _sum: { delta: true },
      _count: { id: true },
    }),
    prisma.loyaltyTxn.findMany({
      where: { createdAt: { gte: windowStart } },
      select: { delta: true, reason: true, createdAt: true },
    }),
    prisma.referral.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.coupon.count({
      where: { createdBy: "referrals-v1", deletedAt: null },
    }),
    prisma.coupon.count({
      where: { createdBy: "referrals-v1", deletedAt: null, usedCount: { gt: 0 } },
    }),
    prisma.loyaltyTxn.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: {
        customer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            contactId: true,
          },
        },
      },
    }),
    prisma.referral.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Enriquecimiento en lote para relaciones escalares (Order en LoyaltyTxn, Customer en Referral)
  const orderIds = Array.from(
    new Set(
      latestLoyaltyTxns
        .map((t) => t.orderId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const referrerIds = Array.from(new Set(latestReferrals.map((r) => r.referrerId).filter(Boolean)));

  const [relatedOrders, relatedReferrers] = await Promise.all([
    orderIds.length > 0
      ? prisma.order.findMany({
          where: { id: { in: orderIds } },
          select: { id: true, number: true, contactId: true },
        })
      : Promise.resolve([]),
    referrerIds.length > 0
      ? prisma.customer.findMany({
          where: { id: { in: referrerIds } },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            contactId: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const orderMap = new Map(relatedOrders.map((o) => [o.id, o]));
  const referrerMap = new Map(relatedReferrers.map((c) => [c.id, c]));

  // KPIs financieros y operativos
  const activePointsBalance = customerPointsAgg._sum.loyaltyPoints ?? 0;
  const customersWithPointsCount = customerPointsAgg._count.id;
  const currentPointValCents = pointValueCents(loyalty);
  const liabilityCents = activePointsBalance * currentPointValCents;

  let totalEarnedPoints = 0;
  let totalRedeemedPoints = 0;
  let redeemTxnsCount = 0;
  for (const g of txnReasonGroups) {
    const sum = g._sum.delta ?? 0;
    if (g.reason === "EARN") {
      totalEarnedPoints += Math.max(0, sum);
    } else if (g.reason === "REDEEM") {
      totalRedeemedPoints += Math.abs(sum);
      redeemTxnsCount += g._count.id;
    }
  }
  const redemptionRatePct =
    totalEarnedPoints > 0
      ? Math.min(100, Math.round((totalRedeemedPoints / totalEarnedPoints) * 100))
      : 0;

  let pendingReferralsCount = 0;
  let rewardedReferralsCount = 0;
  let otherReferralsCount = 0;
  for (const g of referralStatusGroups) {
    if (g.status === "REWARDED") rewardedReferralsCount += g._count.id;
    else if (g.status === "PENDING") pendingReferralsCount += g._count.id;
    else otherReferralsCount += g._count.id;
  }
  const totalReferralsCount = pendingReferralsCount + rewardedReferralsCount + otherReferralsCount;
  const referralConversionPct =
    totalReferralsCount > 0 ? Math.round((rewardedReferralsCount / totalReferralsCount) * 100) : 0;

  // Serie diaria de 14 días en hora Colombia (America/Bogota)
  const dayBuckets = new Map<string, { earned: number; redeemed: number; date: Date }>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS);
    const iso = formatIsoDateCO(d);
    if (!dayBuckets.has(iso)) {
      dayBuckets.set(iso, { earned: 0, redeemed: 0, date: d });
    }
  }
  for (const txn of recentWindowTxns) {
    const iso = formatIsoDateCO(txn.createdAt);
    const bucket = dayBuckets.get(iso);
    if (!bucket) continue;
    if (txn.reason === "EARN" && txn.delta > 0) {
      bucket.earned += txn.delta;
    } else if (txn.reason === "REDEEM" && txn.delta < 0) {
      bucket.redeemed += Math.abs(txn.delta);
    }
  }

  const pointsSeries: ComboChartDatum[] = Array.from(dayBuckets.entries()).map(([iso, b]) => {
    const label = formatDayMonthCO(b.date);
    const [, mm, dd] = iso.split("-");
    return {
      key: iso,
      label,
      tickLabel: `${dd}/${mm}`,
      barValue: b.earned,
      barFormatted: `+${b.earned.toLocaleString("es-CO")} pts emitidos`,
      lineValue: b.redeemed,
      lineFormatted: `${b.redeemed.toLocaleString("es-CO")} pts canjeados`,
    };
  });

  const referralSlices: DonutSlice[] = [
    {
      key: "rewarded",
      label: "Convertidos (1ª compra pagada)",
      count: rewardedReferralsCount,
      tone: "emerald",
      href: canViewCoupons ? "/admin/cupones?origin=referral" : undefined,
      hint: "Premio emitido al referente",
    },
    {
      key: "pending",
      label: "Pendientes de 1ª compra",
      count: pendingReferralsCount,
      tone: "amber",
      hint: "Registrados con cupón de bienvenida",
    },
    ...(otherReferralsCount > 0
      ? [
          {
            key: "other",
            label: "Expirados o cerrados",
            count: otherReferralsCount,
            tone: "slate" as const,
          },
        ]
      : []),
  ];

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Award className="h-5 w-5" />}
        title="Fidelización"
        subtitle="Gobierno económico, pasivo de puntos y conversión del programa «Invita y gana»"
        breadcrumbs={[
          { label: "Admin", href: adminHomePath(role) },
          { label: "Promociones" },
          { label: "Fidelización" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canViewCoupons && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/cupones?origin=referral">
                  <Ticket className="mr-1.5 h-4 w-4" />
                  Cupones de referidos ({referralCouponsCount})
                </Link>
              </Button>
            )}
            {canViewMetrics && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/metricas">
                  <BarChart3 className="mr-1.5 h-4 w-4" />
                  Métricas
                </Link>
              </Button>
            )}
            {canViewAudit && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/auditoria?action=loyalty.">
                  <ShieldCheck className="mr-1.5 h-4 w-4" />
                  Auditoría
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <AdminPageBody>
        {!canEdit && (
          <AdminNotice tone="info">
            <Eye className="mr-1.5 inline h-4 w-4 align-text-bottom" />
            <strong>Modo lectura analítica:</strong> puedes auditar el pasivo contable de puntos,
            las tasas vigentes y el embudo de referidos con datos personales protegidos. La
            modificación de parámetros económicos es exclusiva de <strong>Superadmin</strong>.
          </AdminNotice>
        )}

        {/* KPIs ejecutivos */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AdminCard className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-brand-muted text-xs font-medium">Puntos en circulación</p>
                <p className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
                  <CountUp value={activePointsBalance} /> pts
                </p>
                <p className="text-brand-muted mt-1 text-[11px]">
                  en {customersWithPointsCount.toLocaleString("es-CO")} cuentas activas con saldo
                </p>
              </div>
              <span className="bg-brand-purple/10 text-brand-purple rounded-lg p-2">
                <Sparkles className="h-4 w-4" />
              </span>
            </div>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-brand-muted text-xs font-medium">Pasivo equivalente vigente</p>
                <p className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
                  $<CountUp value={Math.round(liabilityCents / 100)} />
                </p>
                <p className="text-brand-muted mt-1 text-[11px]">
                  valorado a {formatCOP(currentPointValCents)} por punto
                </p>
              </div>
              <span className="rounded-lg bg-amber-50 p-2 text-amber-700">
                <Coins className="h-4 w-4" />
              </span>
            </div>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-brand-muted text-xs font-medium">Puntos canjeados (histórico)</p>
                <p className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
                  <CountUp value={totalRedeemedPoints} /> pts
                </p>
                <p className="text-brand-muted mt-1 text-[11px]">
                  {redeemTxnsCount.toLocaleString("es-CO")} canjes · {redemptionRatePct}% de lo
                  emitido
                </p>
              </div>
              <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                <TrendingUp className="h-4 w-4" />
              </span>
            </div>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-brand-muted text-xs font-medium">Referidos convertidos</p>
                <p className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
                  <CountUp value={rewardedReferralsCount} />
                </p>
                <p className="text-brand-muted mt-1 text-[11px]">
                  de {totalReferralsCount.toLocaleString("es-CO")} invitados ·{" "}
                  {referralCouponsUsedCount}/{referralCouponsCount} cupones usados
                </p>
              </div>
              <span className="bg-brand-pink/12 text-brand-pink-ink rounded-lg p-2">
                <Users className="h-4 w-4" />
              </span>
            </div>
          </AdminCard>
        </section>

        {/* Analítica visual: Flujo 14d + Embudo de referidos */}
        <section className="grid gap-4 lg:grid-cols-5">
          <AdminCard className="p-5 lg:col-span-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-brand-purple-dark font-display text-sm font-bold">
                  Pulso de emisión vs. canje de puntos (14 días)
                </h2>
                <p className="text-brand-muted text-xs">
                  Puntos acreditados al pagar pedidos frente a puntos redimidos en el checkout (hora
                  Colombia).
                </p>
              </div>
              <AdminBadge tone={loyalty.enabled ? "emerald" : "slate"}>
                {loyalty.enabled ? "Programa activo" : "Programa pausado"}
              </AdminBadge>
            </div>
            <AdminComboBarLineChart
              data={pointsSeries}
              ariaLabel="Emisión y canje diario de Puntos Lucams en los últimos 14 días"
              barLegend="Puntos emitidos (EARN)"
              lineLegend="Puntos canjeados (REDEEM)"
            />
          </AdminCard>

          <AdminCard className="flex flex-col justify-between p-5 lg:col-span-2">
            <div>
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-brand-purple-dark font-display text-sm font-bold">
                    Embudo «Invita y gana»
                  </h2>
                  <p className="text-brand-muted text-xs">
                    Conversión desde registro con código hasta primera compra pagada.
                  </p>
                </div>
                <AdminBadge tone={referral.enabled ? "emerald" : "slate"}>
                  {referral.enabled ? `${referral.rewardPercent}% OFF` : "Pausado"}
                </AdminBadge>
              </div>

              <AdminDonutChart
                slices={referralSlices}
                centerValue={`${referralConversionPct}%`}
                centerLabel="conversión"
                ariaLabel="Distribución de estados del programa de referidos Invita y gana"
              />
            </div>

            {canViewCoupons && (
              <div className="border-brand-purple/10 mt-4 flex items-center justify-between border-t pt-3 text-xs">
                <span className="text-brand-muted">
                  Cupones personales <code>REF-*</code> activos:
                </span>
                <Link
                  href="/admin/cupones?origin=referral"
                  className="text-brand-purple font-semibold hover:underline"
                >
                  Auditar {referralCouponsCount} cupones →
                </Link>
              </div>
            )}
          </AdminCard>
        </section>

        {/* Configuración Puntos Lucams */}
        <AdminCard className="p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="text-brand-purple h-4 w-4" />
              <h2 className="text-brand-purple-dark font-display text-base font-bold">
                Parámetros de Puntos Lucams
              </h2>
            </div>
            <AdminBadge tone={loyalty.enabled ? "emerald" : "amber"}>
              {loyalty.enabled ? "Activo en tienda" : "Apagado"}
            </AdminBadge>
          </div>
          <p className="text-brand-muted mb-4 text-xs">
            El comprador acumula puntos al confirmarse el pago de su pedido y los redime como
            descuento en el checkout (después del cupón, si aplica, sobre el subtotal restante de
            productos; el envío nunca se cubre con puntos). Si un pedido se cancela o reembolsa, los
            puntos reservados regresan automáticamente al saldo del cliente. Cambiar las tasas no
            altera los puntos ya acumulados: rige para compras y redenciones futuras.
          </p>
          <LoyaltySection initial={loyalty} readOnly={!canEdit} />
        </AdminCard>

        {/* Configuración Invita y gana */}
        <AdminCard className="p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Gift className="text-brand-purple h-4 w-4" />
              <h2 className="text-brand-purple-dark font-display text-base font-bold">
                Parámetros de «Invita y gana» (referidos)
              </h2>
            </div>
            <AdminBadge tone={referral.enabled ? "emerald" : "amber"}>
              {referral.enabled ? "Activo en tienda" : "Apagado"}
            </AdminBadge>
          </div>
          <p className="text-brand-muted mb-4 text-xs">
            Define el porcentaje de descuento y los días de vigencia de los cupones personales no
            transferibles: bienvenida para el invitado (al registrarse) y premio para el referente
            (cuando el invitado paga su primera compra). Los cupones{" "}
            <strong>ya emitidos conservan sus condiciones originales</strong>; el nuevo porcentaje
            aplica únicamente a emisiones posteriores al guardado.
          </p>
          <ReferralsSection initial={referral} readOnly={!canEdit} />
        </AdminCard>

        {/* Libros mayores recientes (Puntos + Referidos) */}
        <section className="grid gap-4 xl:grid-cols-2">
          {/* Movimientos recientes de puntos */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <History className="text-brand-purple h-4 w-4" />
                <h2 className="text-brand-purple-dark font-display text-sm font-bold">
                  Últimos movimientos de puntos
                </h2>
              </div>
              <span className="text-brand-muted text-xs">Últimos 8 registros</span>
            </div>

            {latestLoyaltyTxns.length === 0 ? (
              <AdminEmpty
                icon={<Sparkles className="h-5 w-5" />}
                title="Sin movimientos de puntos todavía"
                description="Aquí verás las acreditaciones, canjes y reversiones asociadas a cada pedido."
              />
            ) : (
              <AdminTable>
                <AdminTableHead>
                  <tr>
                    <th className="px-3.5 py-2.5 text-left font-semibold">Fecha</th>
                    <th className="px-3.5 py-2.5 text-left font-semibold">Cliente</th>
                    <th className="px-3.5 py-2.5 text-left font-semibold">Evento / Pedido</th>
                    <th className="px-3.5 py-2.5 text-right font-semibold">Puntos</th>
                  </tr>
                </AdminTableHead>
                <AdminTableBody>
                  {latestLoyaltyTxns.map((txn) => {
                    const order = txn.orderId ? orderMap.get(txn.orderId) : undefined;
                    const rawName = txn.customer
                      ? [txn.customer.firstName, txn.customer.lastName]
                          .filter(Boolean)
                          .join(" ")
                          .trim()
                      : "";
                    const safeName = rawName
                      ? canReadPii
                        ? rawName
                        : maskPersonName(rawName)
                      : null;
                    const safeEmail = txn.customer?.email
                      ? canReadPii
                        ? txn.customer.email
                        : maskEmail(txn.customer.email)
                      : "Cuenta eliminada";
                    const contactHrefId =
                      txn.customer?.contactId ?? order?.contactId ?? txn.customer?.id ?? null;

                    const reasonBadge = (() => {
                      if (txn.reason === "EARN")
                        return { label: "Acumula", tone: "emerald" as const };
                      if (txn.reason === "REDEEM")
                        return { label: "Canjea", tone: "pink" as const };
                      if (txn.reason === "REFUND")
                        return { label: "Reversión", tone: "amber" as const };
                      return { label: txn.reason, tone: "slate" as const };
                    })();

                    return (
                      <AdminTableRow key={txn.id}>
                        <td className="text-brand-muted px-3.5 py-2.5 text-xs whitespace-nowrap tabular-nums">
                          {formatDateTimeNoYearCO(txn.createdAt)}
                        </td>
                        <td className="px-3.5 py-2.5 text-xs">
                          {contactHrefId && canViewContacts ? (
                            <Link
                              href={`/admin/clientes/${encodeURIComponent(contactHrefId)}`}
                              className="text-brand-purple-dark hover:text-brand-purple font-semibold hover:underline"
                            >
                              {safeName ?? safeEmail}
                            </Link>
                          ) : (
                            <span className="text-brand-purple-dark font-medium">
                              {safeName ?? safeEmail}
                            </span>
                          )}
                          {safeName && (
                            <span className="text-brand-muted block truncate text-[11px]">
                              {safeEmail}
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <AdminBadge tone={reasonBadge.tone}>{reasonBadge.label}</AdminBadge>
                            {order &&
                              (canViewOrders ? (
                                <Link
                                  href={`/admin/pedidos/${encodeURIComponent(order.number)}`}
                                  className="text-brand-purple font-mono text-[11px] font-semibold hover:underline"
                                >
                                  {order.number}
                                </Link>
                              ) : (
                                <span className="text-brand-muted font-mono text-[11px]">
                                  {order.number}
                                </span>
                              ))}
                          </div>
                        </td>
                        <td
                          className={`px-3.5 py-2.5 text-right font-mono text-xs font-bold tabular-nums ${
                            txn.delta >= 0 ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          {txn.delta > 0
                            ? `+${txn.delta.toLocaleString("es-CO")}`
                            : txn.delta.toLocaleString("es-CO")}
                        </td>
                      </AdminTableRow>
                    );
                  })}
                </AdminTableBody>
              </AdminTable>
            )}
          </div>

          {/* Invitaciones recientes de referidos */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="text-brand-purple h-4 w-4" />
                <h2 className="text-brand-purple-dark font-display text-sm font-bold">
                  Últimas invitaciones «Invita y gana»
                </h2>
              </div>
              {canViewCoupons && (
                <Link
                  href="/admin/cupones?origin=referral"
                  className="text-brand-purple text-xs font-semibold hover:underline"
                >
                  Ver cupones REF-* →
                </Link>
              )}
            </div>

            {latestReferrals.length === 0 ? (
              <AdminEmpty
                icon={<Gift className="h-5 w-5" />}
                title="Sin referidos registrados todavía"
                description="Cuando un comprador se registre usando el código de un amigo, aparecerá acá el estado de su conversión."
              />
            ) : (
              <AdminTable>
                <AdminTableHead>
                  <tr>
                    <th className="px-3.5 py-2.5 text-left font-semibold">Fecha</th>
                    <th className="px-3.5 py-2.5 text-left font-semibold">Referente</th>
                    <th className="px-3.5 py-2.5 text-left font-semibold">Invitado</th>
                    <th className="px-3.5 py-2.5 text-right font-semibold">Estado</th>
                  </tr>
                </AdminTableHead>
                <AdminTableBody>
                  {latestReferrals.map((ref) => {
                    const referrer = referrerMap.get(ref.referrerId);
                    const rawRefName = referrer
                      ? [referrer.firstName, referrer.lastName].filter(Boolean).join(" ").trim()
                      : "";
                    const safeRefName = rawRefName
                      ? canReadPii
                        ? rawRefName
                        : maskPersonName(rawRefName)
                      : null;
                    const safeRefEmail = referrer?.email
                      ? canReadPii
                        ? referrer.email
                        : maskEmail(referrer.email)
                      : "Referente";
                    const safeInvitedEmail = canReadPii
                      ? ref.referredEmail
                      : maskEmail(ref.referredEmail);
                    const referrerContactHref = referrer?.contactId ?? referrer?.id ?? null;

                    const statusBadge =
                      ref.status === "REWARDED"
                        ? { label: "Convertido", tone: "emerald" as const }
                        : ref.status === "PENDING"
                          ? { label: "Pendiente 1ª compra", tone: "amber" as const }
                          : { label: ref.status, tone: "slate" as const };

                    return (
                      <AdminTableRow key={ref.id}>
                        <td className="text-brand-muted px-3.5 py-2.5 text-xs whitespace-nowrap tabular-nums">
                          {formatDateTimeNoYearCO(ref.createdAt)}
                        </td>
                        <td className="px-3.5 py-2.5 text-xs">
                          {referrerContactHref && canViewContacts ? (
                            <Link
                              href={`/admin/clientes/${encodeURIComponent(referrerContactHref)}`}
                              className="text-brand-purple-dark hover:text-brand-purple font-semibold hover:underline"
                            >
                              {safeRefName ?? safeRefEmail}
                            </Link>
                          ) : (
                            <span className="text-brand-purple-dark font-medium">
                              {safeRefName ?? safeRefEmail}
                            </span>
                          )}
                        </td>
                        <td className="text-brand-muted px-3.5 py-2.5 text-xs">
                          {safeInvitedEmail}
                        </td>
                        <td className="px-3.5 py-2.5 text-right">
                          <AdminBadge tone={statusBadge.tone}>{statusBadge.label}</AdminBadge>
                        </td>
                      </AdminTableRow>
                    );
                  })}
                </AdminTableBody>
              </AdminTable>
            )}
          </div>
        </section>
      </AdminPageBody>
    </AdminPage>
  );
}

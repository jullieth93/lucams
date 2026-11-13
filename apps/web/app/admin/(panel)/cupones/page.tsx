/*
 * Admin > Cupones — Tablero ejecutivo de campañas y cupones personales.
 *
 * Seguridad y RBAC (Bloque 3 — N-21 estricto):
 *   - Lectura: `ADMIN_ROLE_SETS.CUPONES_READ` (`SUPERADMIN`, `OPERATIONS_MANAGER`,
 *     `MANAGER`, `FINANCE_ANALYST`).
 *   - Mutación (crear, editar, pausar, reactivar, archivar): exclusivo `SUPERADMIN`.
 *   - `archiveCouponAction` exige Step-up MFA (`requireRecentMfa`, ≤ 10 min).
 *   - Enmascaramiento server-side de PII en descripciones de cupones personales
 *     cuando el rol carece de `orders:read_pii` (`FINANCE_ANALYST`).
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Award,
  Building2,
  ChevronRight,
  DollarSign,
  Eye,
  Plus,
  Receipt,
  Ticket,
} from "lucide-react";
import { listCoupons } from "@/features/coupons/service";
import { ADMIN_ROLE_SETS, canAccessAdminPath, hasCapability } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import { formatCOP } from "@/lib/format";
import { isCatalogMode } from "@/lib/store-mode";
import { prisma } from "@/lib/db";
import { maskEmailsInText } from "@/lib/pii-mask";
import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminHorizontalBars,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminSegmentedBar,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
  SortableHeader,
} from "@/components/admin-page";
import { CountUp } from "@/components/admin/count-up";
import { ReauthForm } from "@/components/admin/mfa-reauth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import { CreateCouponForm } from "./create-coupon-form";
import { archiveCouponAction, pauseCouponAction, resumeCouponAction } from "./actions";
import { formatDateCO } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Cupones",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

export default async function AdminCuponesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireRole(ADMIN_ROLE_SETS.CUPONES_READ);
  const role = session.admin.role;
  const canManage = role === "SUPERADMIN";
  const canReadPii = hasCapability(role, "orders:read_pii");
  const canViewFidelizacion = canAccessAdminPath(role, "/admin/fidelizacion");
  const canViewMayorista = canAccessAdminPath(role, "/admin/mayorista");

  const sp = await searchParams;
  const q = pickString(sp, "q");
  const statusRaw = pickString(sp, "status");
  const status = (
    ["active", "inactive", "archived"].includes(statusRaw ?? "") ? statusRaw : "all"
  ) as "all" | "active" | "inactive" | "archived";
  const originRaw = pickString(sp, "origin");
  const origin = (["campaign", "referral"].includes(originRaw ?? "") ? originRaw : "all") as
    "all" | "campaign" | "referral";
  const sortRaw = pickString(sp, "sort");
  const sort = (["expiry-asc", "code", "uses"].includes(sortRaw ?? "") ? sortRaw : "recent") as
    "recent" | "expiry-asc" | "code" | "uses";

  const [coupons, allActivePool, usageAggregate, topUsageGroups, categories, products] =
    await Promise.all([
      listCoupons({ q, status, origin, sort, allowDescriptionSearch: canReadPii }),
      prisma.coupon.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          code: true,
          isActive: true,
          validFrom: true,
          validTo: true,
          maxUses: true,
          usedCount: true,
          customerId: true,
        },
      }),
      prisma.couponUsage.aggregate({
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.couponUsage.groupBy({
        by: ["couponId"],
        _sum: { amount: true },
        _count: { id: true },
        orderBy: { _sum: { amount: "desc" } },
        take: 5,
      }),
      canManage
        ? prisma.category.findMany({
            where: { deletedAt: null },
            select: { slug: true, name: true },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]),
      canManage
        ? prisma.product.findMany({
            where: { isActive: true, deletedAt: null },
            select: { slug: true, name: true },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]),
    ]);

  const topCouponMeta =
    topUsageGroups.length > 0
      ? await prisma.coupon.findMany({
          where: { id: { in: topUsageGroups.map((g) => g.couponId) } },
          select: { id: true, code: true, type: true, value: true, customerId: true },
        })
      : [];
  const topMetaById = new Map(topCouponMeta.map((c) => [c.id, c]));

  const now = new Date();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  let activeValidCount = 0;
  let activeCampaignCount = 0;
  let activeReferralCount = 0;
  let scheduledCount = 0;
  let pausedCount = 0;
  let exhaustedCount = 0;
  let expiredCount = 0;
  let expiringSoonCount = 0;

  for (const c of allActivePool) {
    if (!c.isActive) {
      pausedCount += 1;
    } else if (c.validTo < now) {
      expiredCount += 1;
    } else if (c.validFrom > now) {
      scheduledCount += 1;
    } else if (c.maxUses !== null && c.usedCount >= c.maxUses) {
      exhaustedCount += 1;
    } else {
      activeValidCount += 1;
      if (c.customerId === null) activeCampaignCount += 1;
      else activeReferralCount += 1;
      if (c.validTo.getTime() - now.getTime() <= sevenDaysMs) {
        expiringSoonCount += 1;
      }
    }
  }

  const totalRedemptions = usageAggregate._count.id;
  const totalDiscountCents = usageAggregate._sum.amount ?? 0;
  const hasActiveFilters = !!q || status !== "all" || origin !== "all" || sort !== "recent";

  type CouponBadgeStyle = {
    label: string;
    tone: "emerald" | "amber" | "slate" | "blue" | "rose";
  };

  function couponStatus(c: (typeof coupons)[number]): CouponBadgeStyle {
    if (c.deletedAt) return { label: "Archivado", tone: "slate" };
    if (!c.isActive) return { label: "Pausado", tone: "amber" };
    if (c.validTo < now) return { label: "Expirado", tone: "slate" };
    if (c.validFrom > now) return { label: "Programado", tone: "blue" };
    if (c.maxUses && c.usedCount >= c.maxUses) return { label: "Agotado", tone: "rose" };
    return { label: "Activo", tone: "emerald" };
  }

  function formatValue(c: { type: string; value: number }) {
    if (c.type === "PERCENT") return `${c.value}%`;
    if (c.type === "FREE_SHIPPING") return "Envío gratis";
    return formatCOP(c.value);
  }

  function typeLabel(t: string) {
    if (t === "PERCENT") return "Porcentaje";
    if (t === "FIXED") return "Monto fijo";
    if (t === "FREE_SHIPPING") return "Envío gratis";
    return t;
  }

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Ticket className="h-5 w-5" />}
        title="Cupones"
        subtitle={
          <>
            {coupons.length} {coupons.length === 1 ? "cupón" : "cupones"} en vista
            {hasActiveFilters && " · con filtros aplicados"}
            {!canManage && " · vista analítica de solo lectura"}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Promociones" },
          { label: "Cupones" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canViewMayorista && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/mayorista">
                  <Building2 className="mr-1.5 h-4 w-4" />
                  Precios mayoristas
                </Link>
              </Button>
            )}
            {canViewFidelizacion && !isCatalogMode() && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/fidelizacion">
                  <Award className="mr-1.5 h-4 w-4" />
                  Fidelización y referidos
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <AdminPageBody>
        {!canManage && (
          <AdminNotice tone="info">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Eye className="h-4 w-4" />
              Modo solo lectura:
            </span>{" "}
            Puedes consultar vigencias, restricciones y redenciones confirmadas de todos los
            cupones. La creación, edición y archivo están reservados a Superadmin.
          </AdminNotice>
        )}

        {isCatalogMode() && (
          <AdminNotice tone="info">
            <strong>Modo catálogo:</strong> los cupones creados acá entrarán en vigor cuando el
            checkout en línea esté habilitado.
          </AdminNotice>
        )}

        {sp.created === "1" && <AdminNotice tone="success">Cupón creado.</AdminNotice>}
        {sp.updated === "1" && <AdminNotice tone="success">Cupón actualizado.</AdminNotice>}
        {sp.paused === "1" && (
          <AdminNotice tone="warning">Cupón pausado (no aplicable en checkout).</AdminNotice>
        )}
        {sp.resumed === "1" && <AdminNotice tone="success">Cupón reactivado.</AdminNotice>}
        {sp.archived === "1" && <AdminNotice tone="warning">Cupón archivado.</AdminNotice>}
        {typeof sp.error === "string" && <AdminNotice tone="error">{sp.error}</AdminNotice>}

        {/* KPIs ejecutivos */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AdminCard className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-brand-muted text-xs font-medium">Cupones vigentes hoy</p>
                <p className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
                  <CountUp value={activeValidCount} />
                </p>
                <p className="text-brand-muted mt-1 text-[11px]">
                  {activeCampaignCount} campañas · {activeReferralCount} personales
                </p>
              </div>
              <span className="bg-brand-purple/10 text-brand-purple rounded-lg p-2">
                <Ticket className="h-4 w-4" />
              </span>
            </div>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-brand-muted text-xs font-medium">Redenciones confirmadas</p>
                <p className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
                  <CountUp value={totalRedemptions} />
                </p>
                <p className="text-brand-muted mt-1 text-[11px]">
                  contabilizadas al aprobarse el pago
                </p>
              </div>
              <span className="rounded-lg bg-teal-50 p-2 text-teal-700">
                <Receipt className="h-4 w-4" />
              </span>
            </div>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-brand-muted text-xs font-medium">Descuento total otorgado</p>
                <p className="font-display mt-1 text-2xl font-bold text-emerald-700 tabular-nums">
                  $<CountUp value={Math.round(totalDiscountCents / 100)} />
                </p>
                <p className="text-brand-muted mt-1 text-[11px]">
                  acumulado histórico ({formatCOP(totalDiscountCents)})
                </p>
              </div>
              <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                <DollarSign className="h-4 w-4" />
              </span>
            </div>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-brand-muted text-xs font-medium">Por vencer (≤ 7d) / Agotados</p>
                <p
                  className={`font-display mt-1 text-2xl font-bold tabular-nums ${
                    expiringSoonCount + exhaustedCount > 0
                      ? "text-amber-700"
                      : "text-brand-purple-dark"
                  }`}
                >
                  <CountUp value={expiringSoonCount + exhaustedCount} />
                </p>
                <p className="text-brand-muted mt-1 text-[11px]">
                  {expiringSoonCount} por vencer · {exhaustedCount} agotados
                </p>
              </div>
              <span className="rounded-lg bg-amber-50 p-2 text-amber-700">
                <AlertTriangle className="h-4 w-4" />
              </span>
            </div>
          </AdminCard>
        </section>

        {/* Analítica visual: ciclo de vida + Top 5 por inversión promocional */}
        {allActivePool.length > 0 && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AdminCard className="p-5">
              <div className="mb-3">
                <h2 className="text-brand-purple-dark font-display text-sm font-bold">
                  Estado del portafolio de cupones
                </h2>
                <p className="text-brand-muted text-xs">
                  Distribución actual entre cupones vigentes, programados, pausados, agotados y
                  vencidos.
                </p>
              </div>
              <AdminSegmentedBar
                ariaLabel="Distribución de cupones por estado operativo"
                items={[
                  {
                    key: "active",
                    label: "Activos vigentes",
                    count: activeValidCount,
                    tone: "emerald",
                    href: "/admin/cupones?status=active",
                  },
                  {
                    key: "scheduled",
                    label: "Programados",
                    count: scheduledCount,
                    tone: "blue",
                    href: "/admin/cupones?status=inactive",
                  },
                  {
                    key: "paused",
                    label: "Pausados",
                    count: pausedCount,
                    tone: "amber",
                    href: "/admin/cupones?status=inactive",
                  },
                  {
                    key: "exhausted",
                    label: "Agotados",
                    count: exhaustedCount,
                    tone: "rose",
                  },
                  {
                    key: "expired",
                    label: "Expirados",
                    count: expiredCount,
                    tone: "slate",
                    href: "/admin/cupones?status=inactive",
                  },
                ]}
              />
            </AdminCard>

            <AdminCard className="p-5">
              <div className="mb-3">
                <h2 className="text-brand-purple-dark font-display text-sm font-bold">
                  Top cupones por descuento otorgado
                </h2>
                <p className="text-brand-muted text-xs">
                  Códigos con mayor impacto económico en pedidos pagados.
                </p>
              </div>
              {topUsageGroups.length === 0 ? (
                <p className="text-brand-muted py-6 text-center text-xs">
                  Aún no hay redenciones confirmadas para graficar el ranking.
                </p>
              ) : (
                <AdminHorizontalBars
                  items={topUsageGroups.map((g) => {
                    const meta = topMetaById.get(g.couponId);
                    const sumCents = g._sum.amount ?? 0;
                    const uses = g._count.id;
                    return {
                      key: g.couponId,
                      label: meta?.code ?? g.couponId,
                      sublabel: meta
                        ? `${formatValue(meta)} · ${meta.customerId ? "Personal" : "Campaña"}`
                        : undefined,
                      value: sumCents,
                      formattedValue: formatCOP(sumCents),
                      secondaryText: `${uses} ${uses === 1 ? "redención" : "redenciones"}`,
                      tone: meta?.customerId ? "turquoise" : "purple",
                      href: `/admin/cupones/${g.couponId}`,
                    };
                  })}
                />
              )}
            </AdminCard>
          </div>
        )}

        {/* Toolbar de búsqueda y filtros */}
        <form
          method="GET"
          className="border-brand-purple/10 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-12"
        >
          <div className="sm:col-span-4">
            <label
              htmlFor="f-q"
              className="text-brand-purple-dark/80 mb-1 block text-xs font-semibold"
            >
              Buscar
            </label>
            <Input
              id="f-q"
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder="Código o descripción…"
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
          </div>
          <div className="sm:col-span-3">
            <label
              htmlFor="f-status"
              className="text-brand-purple-dark/80 mb-1 block text-xs font-semibold"
            >
              Estado
            </label>
            <select
              id="f-status"
              name="status"
              defaultValue={status}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2.5 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="all">Todos (sin archivados)</option>
              <option value="active">Solo activos vigentes</option>
              <option value="inactive">Pausados / expirados / programados</option>
              <option value="archived">Archivados</option>
            </select>
          </div>
          <div className="sm:col-span-3">
            <label
              htmlFor="f-origin"
              className="text-brand-purple-dark/80 mb-1 block text-xs font-semibold"
            >
              Origen
            </label>
            <select
              id="f-origin"
              name="origin"
              defaultValue={origin}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2.5 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="all">Todos los orígenes</option>
              <option value="campaign">Campañas de tienda</option>
              <option value="referral">Personales (Invita y gana)</option>
            </select>
          </div>
          <div className="sm:hidden">
            <label
              htmlFor="f-sort"
              className="text-brand-purple-dark/80 mb-1 block text-xs font-semibold"
            >
              Ordenar por
            </label>
            <select
              id="f-sort"
              name="sort"
              defaultValue={sort}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2.5 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="recent">Vigencia más reciente</option>
              <option value="expiry-asc">Próximos a vencer</option>
              <option value="code">Código A-Z</option>
              <option value="uses">Más usados</option>
            </select>
          </div>
          <div className="flex items-end gap-2 sm:col-span-2">
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
                href="/admin/cupones"
                className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold"
              >
                Limpiar filtros
              </Link>
            </div>
          )}
        </form>

        {coupons.length === 0 ? (
          <AdminEmpty
            icon={<Ticket className="h-5 w-5" />}
            title={hasActiveFilters ? "Sin resultados" : "Todavía no hay cupones"}
            description={
              hasActiveFilters
                ? "Prueba con otros criterios o limpia los filtros aplicados."
                : canManage
                  ? "Despliega el formulario inferior para crear tu primera campaña promocional."
                  : "No hay cupones registrados en este momento."
            }
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <SortableHeader
                  label="Código"
                  ascValue="code"
                  currentSort={sort}
                  basePath="/admin/cupones"
                  preserve={{
                    q,
                    status: status !== "all" ? status : undefined,
                    origin: origin !== "all" ? origin : undefined,
                  }}
                />
                <th className="px-4 py-3 text-left font-semibold">Beneficio</th>
                <th className="px-4 py-3 text-center font-semibold">Estado</th>
                <SortableHeader
                  label="Vigencia"
                  ascValue="expiry-asc"
                  descValue="recent"
                  currentSort={sort}
                  basePath="/admin/cupones"
                  preserve={{
                    q,
                    status: status !== "all" ? status : undefined,
                    origin: origin !== "all" ? origin : undefined,
                  }}
                />
                <SortableHeader
                  label="Usos / Cupo"
                  ascValue="uses"
                  currentSort={sort}
                  basePath="/admin/cupones"
                  preserve={{
                    q,
                    status: status !== "all" ? status : undefined,
                    origin: origin !== "all" ? origin : undefined,
                  }}
                  align="center"
                />
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {coupons.map((c) => {
                const st = couponStatus(c);
                const canToggle =
                  canManage && !c.deletedAt && (c.isActive || st.label === "Pausado");
                const isPersonal = c.customerId !== null;
                const safeDesc = c.description
                  ? canReadPii
                    ? c.description
                    : maskEmailsInText(c.description)
                  : null;
                const quotaPct =
                  c.maxUses && c.maxUses > 0
                    ? Math.min(100, Math.round((c.usedCount / c.maxUses) * 100))
                    : null;

                return (
                  <AdminTableRow key={c.id}>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link
                          href={`/admin/cupones/${c.id}`}
                          className="bg-brand-purple/10 text-brand-purple-dark hover:bg-brand-purple/20 rounded px-2 py-0.5 font-mono text-xs font-bold transition-colors"
                        >
                          {c.code}
                        </Link>
                        {isPersonal ? (
                          <AdminBadge tone="purple">Personal</AdminBadge>
                        ) : c.isPublic ? (
                          <AdminBadge tone="blue">Público</AdminBadge>
                        ) : null}
                      </div>
                      {safeDesc && (
                        <p className="text-brand-muted mt-1 line-clamp-1 max-w-xs text-xs">
                          {safeDesc}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm">
                      <span className="text-brand-purple-dark block font-semibold tabular-nums">
                        {formatValue(c)}
                      </span>
                      <span className="text-brand-muted text-[11px]">{typeLabel(c.type)}</span>
                    </td>

                    <td className="px-4 py-3 text-center text-sm">
                      {canToggle ? (
                        <form
                          action={c.isActive ? pauseCouponAction : resumeCouponAction}
                          className="inline"
                        >
                          <input type="hidden" name="id" value={c.id} />
                          <Hint content={c.isActive ? "Clic para pausar" : "Clic para reactivar"}>
                            <button
                              type="submit"
                              className={`-my-2 inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all hover:shadow-sm ${
                                c.isActive
                                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                                  : "bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${c.isActive ? "bg-emerald-500" : "bg-amber-500"}`}
                                aria-hidden
                              />
                              {st.label}
                            </button>
                          </Hint>
                        </form>
                      ) : (
                        <AdminBadge tone={st.tone}>{st.label}</AdminBadge>
                      )}
                    </td>

                    <td className="text-brand-muted px-4 py-3 text-xs tabular-nums">
                      {formatDateCO(c.validFrom)} → {formatDateCO(c.validTo)}
                    </td>

                    <td className="px-4 py-3 text-center text-sm tabular-nums">
                      <span className="text-brand-purple-dark font-semibold">
                        {c.usedCount.toLocaleString("es-CO")}
                      </span>
                      {c.maxUses ? (
                        <span className="text-brand-muted text-xs">
                          {" "}
                          / {c.maxUses.toLocaleString("es-CO")}
                        </span>
                      ) : null}
                      {quotaPct !== null && (
                        <div className="mx-auto mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`admin-bar-grow-x h-full rounded-full ${
                              quotaPct >= 100
                                ? "bg-rose-500"
                                : quotaPct >= 80
                                  ? "bg-amber-500"
                                  : "bg-brand-purple"
                            }`}
                            style={{ width: `${Math.max(5, quotaPct)}%` }}
                          />
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right text-sm">
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        <Link
                          href={`/admin/cupones/${c.id}`}
                          className="text-brand-purple-dark hover:text-brand-purple -my-2 inline-flex min-h-9 items-center text-xs font-semibold"
                        >
                          {canManage && !c.deletedAt ? "Editar" : "Ver detalle"}
                        </Link>
                        {canManage && !c.deletedAt && (
                          <ReauthForm
                            action={archiveCouponAction}
                            confirmMessage={`¿Archivar el cupón ${c.code}? Dejará de funcionar de inmediato y pasará a la vista de archivados.`}
                          >
                            <input type="hidden" name="id" value={c.id} />
                            <button
                              type="submit"
                              className="text-brand-muted -my-2 inline-flex min-h-9 items-center text-xs font-semibold hover:text-rose-600"
                            >
                              Archivar
                            </button>
                          </ReauthForm>
                        )}
                      </div>
                    </td>
                  </AdminTableRow>
                );
              })}
            </AdminTableBody>
          </AdminTable>
        )}

        {canManage && (
          <details className="border-brand-purple/15 group rounded-xl border bg-white shadow-xs">
            <summary className="text-brand-purple-dark hover:bg-brand-purple/5 font-display flex cursor-pointer list-none items-center justify-between rounded-xl px-5 py-4 text-base font-bold select-none">
              <span className="inline-flex items-center gap-2">
                <Plus className="text-brand-purple h-4 w-4" />
                Crear un cupón nuevo
              </span>
              <ChevronRight className="text-brand-muted h-4 w-4 transition-transform group-open:rotate-90" />
            </summary>
            <div className="border-brand-purple/10 border-t px-5 pt-4 pb-5">
              <CreateCouponForm categories={categories} products={products} />
            </div>
          </details>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}

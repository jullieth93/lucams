/*
 * Admin > Carritos abandonados.
 *
 * Bandeja diagnóstica y operativa del módulo de recuperación:
 *   - Estado real de cada registro (`pending`, `reminded`, `recovered`, `closed`).
 *   - Si no hay carritos pendientes y el usuario entra sin filtro explícito,
 *     abre automáticamente en «Todos» con aviso contextual para que ningún enlace
 *     del CRM aterrice en una pantalla vacía engañosa.
 *   - Muestra cliente (`Contacto 360`), etapa de checkout alcanzada, valor y pedido recuperado.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Filter, MailCheck, Repeat, Settings, ShoppingCart, Users } from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminComboBarLineChart,
  AdminEmpty,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminSegmentedBar,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
  KpiCard,
} from "@/components/admin-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ADMIN_ROLE_SETS,
  adminHomePath,
  canAccessAdminPath,
  hasCapability,
} from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import { maskEmail, maskPersonName } from "@/lib/pii-mask";
import { formatCOP, formatRelativeTime } from "@/lib/format";
import {
  ABANDONED_STATUS_LABEL,
  CHECKOUT_STEP_LABEL,
  CLOSED_REASON_LABEL,
  getCartRecoveryDailyPulse,
  getCartRecoveryMetrics,
  listAbandonedCartsAdmin,
  type AbandonedCartStatus,
} from "@/features/cart/admin-service";
import { getCartRecoverySettings } from "@/features/cart/recovery-settings";
import { BulkCartBar, BulkSelectAllCartsCheckbox } from "./bulk-cart-bar";
import { formatDateTimeNoYearCO } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Carritos abandonados",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

const STATUS_OPTIONS = ["pending", "reminded", "recovered", "closed", "all"] as const;
type StatusOption = (typeof STATUS_OPTIONS)[number];

const STATUS_FILTER_LABEL: Record<StatusOption, string> = {
  pending: "Pendientes",
  reminded: "Recordados",
  recovered: "Recuperados",
  closed: "Cotizados / Vaciados",
  all: "Todos",
};

export default async function AdminCarritosPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireRole(ADMIN_ROLE_SETS.CARTS_READ);
  const role = session.admin.role;
  const homeHref = adminHomePath(role);
  const canRecover = hasCapability(role, "carts:recover");
  const canConfigure = hasCapability(role, "carts:configure");
  const canReadPii =
    hasCapability(role, "orders:read_pii") || hasCapability(role, "contacts:read_pii");
  const canRead360 =
    hasCapability(role, "contacts:read_360") && canAccessAdminPath(role, "/admin/clientes");

  const sp = await searchParams;
  const q = pickString(sp, "q");
  const statusRaw = pickString(sp, "status");
  const page = Number(sp.page) || 1;

  const [metrics, settings, pulse] = await Promise.all([
    getCartRecoveryMetrics(),
    getCartRecoverySettings(),
    getCartRecoveryDailyPulse(14),
  ]);

  const hasExplicitStatus = (STATUS_OPTIONS as readonly string[]).includes(statusRaw ?? "");
  const autoFallbackToAll =
    !hasExplicitStatus && !q && metrics.pendingCount === 0 && metrics.totalCount > 0;
  const status: StatusOption = hasExplicitStatus
    ? (statusRaw as StatusOption)
    : autoFallbackToAll
      ? "all"
      : "pending";

  const { items, total, totalPages } = await listAbandonedCartsAdmin({
    q,
    status: status as AbandonedCartStatus | "all",
    page,
    allowPiiSearch: canReadPii,
  });

  const hasActiveFilters = !!q || (hasExplicitStatus && status !== "pending");

  const tabCounts: Record<StatusOption, number> = {
    pending: metrics.pendingCount,
    reminded: metrics.remindedCount,
    recovered: metrics.recoveredCount,
    closed: metrics.closedCount,
    all: metrics.totalCount,
  };

  const sentDisplay =
    typeof sp.sent === "string" ? (canReadPii ? sp.sent : maskEmail(sp.sent)) : null;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<ShoppingCart className="h-5 w-5" />}
        title="Carritos abandonados"
        subtitle={
          <>
            {total} {total === 1 ? "registro" : "registros"} en vista
            {metrics.pendingCount > 0 && (
              <>
                {" · "}
                <strong className="text-brand-purple-dark">
                  {metrics.pendingCount} pendiente{metrics.pendingCount === 1 ? "" : "s"} de
                  contacto
                </strong>
              </>
            )}
            {hasActiveFilters && " · con filtros aplicados"}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: homeHref },
          { label: "Marketing" },
          { label: "Carritos abandonados" },
        ]}
        actions={
          canConfigure ? (
            <Link
              href="/admin/carritos/configuracion"
              className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex min-h-10 items-center gap-1.5 rounded-md border bg-white px-3.5 py-2 text-sm font-semibold"
            >
              <Settings className="h-4 w-4" />
              Configuración
            </Link>
          ) : undefined
        }
      />

      <AdminPageBody>
        {/* Tira de navegación del ecosistema Marketing */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="border-brand-purple bg-brand-purple/10 text-brand-purple-dark inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold">
            <ShoppingCart className="h-3.5 w-3.5" />
            Carritos abandonados
          </span>
          {canAccessAdminPath(role, "/admin/lifecycle") && (
            <Link
              href="/admin/lifecycle"
              className="border-brand-purple/15 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex min-h-9 items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              <Repeat className="h-3.5 w-3.5" />
              Lifecycle Journeys
            </Link>
          )}
          {canAccessAdminPath(role, "/admin/marketing/suscriptores") && (
            <Link
              href="/admin/marketing/suscriptores"
              className="border-brand-purple/15 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex min-h-9 items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              <MailCheck className="h-3.5 w-3.5" />
              Suscriptores
            </Link>
          )}
          {canAccessAdminPath(role, "/admin/marketing/segmentos") && (
            <Link
              href="/admin/marketing/segmentos"
              className="border-brand-purple/15 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex min-h-9 items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              <Filter className="h-3.5 w-3.5" />
              Segmentos RFM
            </Link>
          )}
        </div>

        {!canRecover && (
          <AdminNotice tone="info">
            <strong>Modo analítico 0-PII:</strong> visualizas el embudo, atribución de ingresos y
            diagnóstico de carritos sin datos personales en claro ni controles de envío comercial.
          </AdminNotice>
        )}

        {!settings.enabled ? (
          <AdminNotice tone="warning">
            <strong>Módulo apagado:</strong> no se envía ningún recordatorio (ni automático ni
            manual).{canConfigure ? " Se reactiva desde Configuración." : ""}
          </AdminNotice>
        ) : settings.mode === "manual" ? (
          <AdminNotice tone="info">
            <strong>Modo manual:</strong> el cron no envía nada — los recordatorios salen solo
            cuando se envían manualmente desde el panel.
          </AdminNotice>
        ) : (
          <AdminNotice tone="info">
            <strong>Modo automático:</strong> el cron envía hasta {settings.maxReminders}{" "}
            recordatorio{settings.maxReminders === 1 ? "" : "s"} a cada carrito con más de{" "}
            {settings.idleHours} h de inactividad
            {settings.maxReminders > 1 && `, con ${settings.intervalHours} h entre envíos`}.
          </AdminNotice>
        )}

        {autoFallbackToAll && (
          <AdminNotice tone="info">
            No hay carritos pendientes de primer recordatorio en este momento; se muestra el{" "}
            <strong>historial completo ({metrics.totalCount})</strong> para que puedas auditar
            recordados, recuperados y cotizados.
          </AdminNotice>
        )}

        {sentDisplay && (
          <AdminNotice tone="success">Recordatorio enviado a {sentDisplay}.</AdminNotice>
        )}
        {typeof sp.bulkOk === "string" && <AdminNotice tone="success">{sp.bulkOk}</AdminNotice>}
        {typeof sp.error === "string" && <AdminNotice tone="error">{sp.error}</AdminNotice>}

        {/* Métricas del módulo */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Pendientes de contacto"
            value={metrics.pendingCount}
            trendLabel={`${formatCOP(metrics.pendingValueCents)} en carritos sin recordatorio`}
          />
          <KpiCard
            label="Con recordatorio enviado"
            value={metrics.remindedCount}
            trendLabel="Esperando que el cliente retome"
          />
          <KpiCard
            label="Tasa de recuperación"
            value={metrics.recoveryRatePct === null ? "—" : `${metrics.recoveryRatePct}%`}
            trendLabel={
              metrics.recoveredCount === 0
                ? "Aún sin recuperaciones pagadas"
                : `${metrics.recoveredCount.toLocaleString("es-CO")} pedidos pagados`
            }
          />
          <KpiCard
            label="Valor recuperado"
            value={formatCOP(metrics.recoveredValueCents)}
            trendLabel="Pedidos pagados tras abandono"
          />
        </div>

        {/* Pulso 14 días + mezcla de estados */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <AdminCard className="p-5 lg:col-span-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-brand-purple-dark font-display text-sm font-bold">
                Pulso 14 días: abandonos detectados vs recuperados
              </h2>
              <span className="text-brand-muted text-xs">Hora Colombia (COT)</span>
            </div>
            <AdminComboBarLineChart
              ariaLabel="Pulso de 14 días de carritos abandonados detectados vs recuperados pagados"
              barLegend="Detectados (carritos)"
              lineLegend="Recuperados pagados"
              data={pulse.map((b) => ({
                key: b.key,
                label: b.label,
                tickLabel: b.tickLabel,
                barValue: b.detectedCount,
                barFormatted: `${b.detectedCount} detectado${b.detectedCount === 1 ? "" : "s"}`,
                lineValue: b.recoveredCount,
                lineFormatted: `${b.recoveredCount} recuperado${b.recoveredCount === 1 ? "" : "s"} (${formatCOP(b.recoveredValueCents)})`,
              }))}
            />
          </AdminCard>

          <AdminCard className="flex flex-col justify-between p-5 lg:col-span-2">
            <div>
              <h2 className="text-brand-purple-dark font-display mb-1 text-sm font-bold">
                Composición del embudo de carritos
              </h2>
              <p className="text-brand-muted mb-4 text-xs">
                Distribución histórica entre cola activa, seguimientos en curso, cierres pagados y
                cotizaciones/vaciados.
              </p>
              <AdminSegmentedBar
                ariaLabel="Composición histórica de carritos abandonados por estado"
                items={[
                  {
                    key: "pending",
                    label: "Pendientes",
                    count: metrics.pendingCount,
                    tone: "amber",
                    href: "/admin/carritos?status=pending",
                    sublabel: formatCOP(metrics.pendingValueCents),
                  },
                  {
                    key: "reminded",
                    label: "Recordados",
                    count: metrics.remindedCount,
                    tone: "blue",
                    href: "/admin/carritos?status=reminded",
                  },
                  {
                    key: "recovered",
                    label: "Recuperados",
                    count: metrics.recoveredCount,
                    tone: "emerald",
                    href: "/admin/carritos?status=recovered",
                    sublabel: formatCOP(metrics.recoveredValueCents),
                  },
                  {
                    key: "closed",
                    label: "Cotizados / Vaciados",
                    count: metrics.closedCount,
                    tone: "slate",
                    href: "/admin/carritos?status=closed",
                  },
                ]}
              />
            </div>
          </AdminCard>
        </div>

        {/* Pestañas rápidas por estado con conteos reales */}
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_OPTIONS.map((s) => {
            const active = status === s;
            const params = new URLSearchParams();
            params.set("status", s);
            if (q) params.set("q", q);
            return (
              <Link
                key={s}
                href={`/admin/carritos?${params.toString()}`}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "border-brand-purple bg-brand-purple text-white"
                    : "border-brand-purple/15 text-brand-purple-dark hover:bg-brand-purple/10 bg-white"
                }`}
              >
                <span>{STATUS_FILTER_LABEL[s]}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                    active ? "bg-white/20 text-white" : "bg-brand-purple/10 text-brand-purple-dark"
                  }`}
                >
                  {tabCounts[s]}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Toolbar de búsqueda */}
        <form
          method="GET"
          className="border-brand-purple/10 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-12"
        >
          <input type="hidden" name="status" value={status} />
          <div className="sm:col-span-9">
            <label
              htmlFor="f-q"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              {canReadPii
                ? "Buscar por correo, nombre del cliente o pedido recuperado"
                : "Buscar por número de pedido recuperado"}
            </label>
            <Input
              id="f-q"
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder={
                canReadPii ? "cliente@correo.com, nombre o LCM-2026-..." : "LCM-2026-..."
              }
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
          </div>
          <div className="flex items-end gap-2 sm:col-span-3">
            <Button
              type="submit"
              size="sm"
              className="bg-gradient-brand h-9 w-full text-white hover:brightness-110"
            >
              Buscar
            </Button>
          </div>
          {hasActiveFilters && (
            <div className="sm:col-span-12">
              <Link
                href="/admin/carritos"
                className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold"
              >
                Limpiar filtros
              </Link>
            </div>
          )}
        </form>

        {items.length === 0 ? (
          <AdminEmpty
            icon={<Users className="h-5 w-5" />}
            title={
              hasActiveFilters
                ? "Sin resultados"
                : status === "pending"
                  ? "No hay carritos pendientes ✨"
                  : "Aún no hay carritos en este estado"
            }
            description={
              hasActiveFilters
                ? "Prueba quitar algún filtro o cambiar la búsqueda."
                : status === "pending"
                  ? "Cuando un cliente deje su correo en el checkout sin completar el pago, aparecerá acá con el detalle de productos y etapa alcanzada."
                  : "Los registros con este estado aparecerán en este listado."
            }
          />
        ) : (
          <AdminTable minWidth={860}>
            <AdminTableHead>
              <tr>
                {canRecover && (
                  <th className="w-10 px-3 py-3 text-left">
                    <BulkSelectAllCartsCheckbox />
                  </th>
                )}
                <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                <th className="px-4 py-3 text-left font-semibold">Productos y etapa</th>
                <th className="px-4 py-3 text-right font-semibold">Valor</th>
                <th className="px-4 py-3 text-left font-semibold">Actividad</th>
                <th className="px-4 py-3 text-left font-semibold">Diagnóstico / Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((c) => {
                const canRemindRow =
                  canRecover &&
                  !c.bouncedOrComplained &&
                  (c.status === "pending" || c.status === "reminded");
                const displayEmail = canReadPii ? c.email : maskEmail(c.email);
                const displayName = c.contactName
                  ? canReadPii
                    ? c.contactName
                    : maskPersonName(c.contactName)
                  : null;
                return (
                  <AdminTableRow key={c.id}>
                    {canRecover && (
                      <td className="w-10 px-3 py-3 align-middle">
                        {canRemindRow && (
                          <input
                            type="checkbox"
                            name="cartIds"
                            value={c.id}
                            aria-label={`Seleccionar carrito de ${displayEmail}`}
                            className="text-brand-purple focus:ring-brand-purple/40 border-brand-purple/30 h-4 w-4 cursor-pointer rounded"
                          />
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {displayName && (
                        <p className="text-brand-purple-dark text-xs font-bold">{displayName}</p>
                      )}
                      <p className="text-brand-purple-dark/85 text-xs font-medium">
                        {displayEmail}
                      </p>
                      {canRead360 && c.contactId && (
                        <Link
                          href={`/admin/clientes/${encodeURIComponent(c.contactId)}`}
                          className="text-brand-purple text-[11px] font-semibold hover:underline"
                        >
                          Ver Contacto 360 →
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-brand-purple-dark/90 text-xs font-medium">
                        {c.itemCount > 0
                          ? `${c.itemCount} ${c.itemCount === 1 ? "ítem" : "ítems"}`
                          : "Snapshot histórico"}
                      </p>
                      <p className="text-brand-muted line-clamp-1 max-w-[240px] text-[11px]">
                        {c.productNames.join(" · ") || "Ver detalle del carrito"}
                      </p>
                      {c.checkoutStep && (
                        <span className="text-brand-purple-dark/70 mt-0.5 inline-block text-[10px] font-semibold">
                          {CHECKOUT_STEP_LABEL[c.checkoutStep] ?? c.checkoutStep}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-brand-purple-dark text-xs font-semibold tabular-nums">
                        {formatCOP(c.totalCents)}
                      </span>
                    </td>
                    <td className="text-brand-muted px-4 py-3 text-xs">
                      <span title={formatDateTimeNoYearCO(c.lastActivityAt)}>
                        {formatRelativeTime(c.lastActivityAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <div className="flex flex-wrap items-center gap-1">
                          {c.status === "recovered" ? (
                            <AdminBadge tone="emerald">
                              {ABANDONED_STATUS_LABEL.recovered}
                            </AdminBadge>
                          ) : c.status === "closed" ? (
                            <AdminBadge tone="slate">{ABANDONED_STATUS_LABEL.closed}</AdminBadge>
                          ) : c.status === "reminded" ? (
                            <AdminBadge tone="blue">
                              {ABANDONED_STATUS_LABEL.reminded}
                              {c.reminderCount > 1 ? ` ×${c.reminderCount}` : ""}
                            </AdminBadge>
                          ) : (
                            <AdminBadge tone="amber">{ABANDONED_STATUS_LABEL.pending}</AdminBadge>
                          )}
                          {c.bouncedOrComplained && (
                            <AdminBadge tone="rose">Rebote / Queja</AdminBadge>
                          )}
                        </div>
                        {c.recoveredOrderNumber && (
                          <Link
                            href={`/admin/pedidos/${encodeURIComponent(c.recoveredOrderNumber)}`}
                            className="font-mono text-[11px] font-bold text-emerald-700 hover:underline"
                          >
                            Pedido {c.recoveredOrderNumber}
                          </Link>
                        )}
                        {c.closedReason && c.closedReason !== "ORDER_PAID" && (
                          <span className="text-brand-muted text-[10px]">
                            {CLOSED_REASON_LABEL[c.closedReason] ?? c.closedReason}
                          </span>
                        )}
                        {c.lastReminderSentAt && (
                          <span className="text-brand-muted text-[10px]">
                            Último correo: {formatDateTimeNoYearCO(c.lastReminderSentAt)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {canRemindRow && (
                          <Link
                            href={`/admin/carritos/${c.id}`}
                            className="-my-2 inline-flex min-h-10 items-center rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                          >
                            Recordar
                          </Link>
                        )}
                        <Link
                          href={`/admin/carritos/${c.id}`}
                          className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex min-h-10 items-center rounded-md border bg-white px-2.5 py-1 text-xs font-semibold"
                        >
                          Ver qué pasó
                        </Link>
                      </div>
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
              {total} registros · página {page} de {totalPages}
            </span>
            <div className="flex gap-1">
              {page > 1 && (
                <PaginationLink page={page - 1} q={q} status={status}>
                  ← Anterior
                </PaginationLink>
              )}
              {page < totalPages && (
                <PaginationLink page={page + 1} q={q} status={status}>
                  Siguiente →
                </PaginationLink>
              )}
            </div>
          </div>
        )}
      </AdminPageBody>

      {canRecover && <BulkCartBar />}
    </AdminPage>
  );
}

function PaginationLink({
  page,
  q,
  status,
  children,
}: {
  page: number;
  q?: string;
  status?: string;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  return (
    <Link
      href={`/admin/carritos?${params.toString()}`}
      className="border-brand-purple/20 hover:bg-brand-purple/5 text-brand-purple-dark rounded-md border bg-white px-3 py-1.5 text-xs font-medium"
    >
      {children}
    </Link>
  );
}

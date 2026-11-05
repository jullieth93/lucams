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
import { redirect } from "next/navigation";
import { Settings, ShoppingCart, Users } from "lucide-react";
import {
  AdminBadge,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrentAdmin } from "@/lib/auth";
import { hasCapability } from "@/lib/admin-rbac";
import { formatCOP, formatRelativeTime } from "@/lib/format";
import {
  ABANDONED_STATUS_LABEL,
  CHECKOUT_STEP_LABEL,
  CLOSED_REASON_LABEL,
  getCartRecoveryMetrics,
  listAbandonedCartsAdmin,
  type AbandonedCartStatus,
} from "@/features/cart/admin-service";
import { getCartRecoverySettings } from "@/features/cart/recovery-settings";
import { BulkCartBar, BulkSelectAllCartsCheckbox } from "./bulk-cart-bar";

export const metadata: Metadata = { title: "Carritos abandonados" };

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

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminCarritosPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");
  const canRead360 = hasCapability(session.admin.role, "contacts:read_360");

  const sp = await searchParams;
  const q = pickString(sp, "q");
  const statusRaw = pickString(sp, "status");
  const page = Number(sp.page) || 1;

  const [metrics, settings] = await Promise.all([
    getCartRecoveryMetrics(),
    getCartRecoverySettings(),
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
  });

  const hasActiveFilters = !!q || (hasExplicitStatus && status !== "pending");

  const tabCounts: Record<StatusOption, number> = {
    pending: metrics.pendingCount,
    reminded: metrics.remindedCount,
    recovered: metrics.recoveredCount,
    closed: metrics.closedCount,
    all: metrics.totalCount,
  };

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
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Marketing" },
          { label: "Carritos abandonados" },
        ]}
        actions={
          session.admin.role === "SUPERADMIN" ? (
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
        {!settings.enabled ? (
          <AdminNotice tone="warning">
            <strong>Módulo apagado:</strong> no se envía ningún recordatorio (ni automático ni
            manual). Se reactiva desde Configuración.
          </AdminNotice>
        ) : settings.mode === "manual" ? (
          <AdminNotice tone="info">
            <strong>Modo manual:</strong> el cron no envía nada — los recordatorios salen solo
            cuando los envías desde acá (botón «Recordar» de cada fila o la selección múltiple).
          </AdminNotice>
        ) : (
          <AdminNotice tone="info">
            <strong>Modo automático:</strong> el cron envía hasta {settings.maxReminders}{" "}
            recordatorio{settings.maxReminders === 1 ? "" : "s"} a cada carrito con más de{" "}
            {settings.idleHours} h de inactividad
            {settings.maxReminders > 1 && `, con ${settings.intervalHours} h entre envíos`}. También
            puedes inspeccionar qué sucedió o enviar a voluntad desde cada fila.
          </AdminNotice>
        )}

        {autoFallbackToAll && (
          <AdminNotice tone="info">
            No hay carritos pendientes de primer recordatorio en este momento; se muestra el{" "}
            <strong>historial completo ({metrics.totalCount})</strong> para que puedas auditar
            recordados, recuperados y cotizados.
          </AdminNotice>
        )}

        {typeof sp.sent === "string" && (
          <AdminNotice tone="success">Recordatorio enviado a {sp.sent}.</AdminNotice>
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
              Buscar por correo o nombre del cliente
            </label>
            <Input
              id="f-q"
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder="cliente@correo.com o nombre..."
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
                <th className="w-10 px-3 py-3 text-left">
                  <BulkSelectAllCartsCheckbox />
                </th>
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
                const canRemindRow = c.status === "pending" || c.status === "reminded";
                return (
                  <AdminTableRow key={c.id}>
                    <td className="w-10 px-3 py-3 align-middle">
                      {canRemindRow && (
                        <input
                          type="checkbox"
                          name="cartIds"
                          value={c.id}
                          aria-label={`Seleccionar carrito de ${c.email}`}
                          className="text-brand-purple focus:ring-brand-purple/40 border-brand-purple/30 h-4 w-4 cursor-pointer rounded"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.contactName && (
                        <p className="text-brand-purple-dark text-xs font-bold">{c.contactName}</p>
                      )}
                      <p className="text-brand-purple-dark/85 text-xs font-medium">{c.email}</p>
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
                      <span title={dateFmt.format(c.lastActivityAt)}>
                        {formatRelativeTime(c.lastActivityAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        {c.status === "recovered" ? (
                          <AdminBadge tone="emerald">{ABANDONED_STATUS_LABEL.recovered}</AdminBadge>
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
                            Último correo: {dateFmt.format(c.lastReminderSentAt)}
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

      <BulkCartBar />
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

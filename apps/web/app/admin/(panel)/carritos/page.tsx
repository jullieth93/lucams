/*
 * Admin > Carritos abandonados (Fase 4, 2026-10-13).
 *
 * Bandeja del módulo de recuperación: listado de registros AbandonedCart con
 * estado (pendiente / recordatorio enviado / recuperado), resumen del carrito
 * (items, valor, productos), filtros por estado y búsqueda por email, métricas
 * del módulo y envío manual a voluntad (por fila → /admin/carritos/[id] con
 * preview del correo; por selección → /admin/carritos/enviar).
 *
 * La configuración del módulo (habilitar, modo manual/automático, horas de
 * inactividad, máximo de recordatorios, intervalo) vive en
 * /admin/carritos/configuracion (SUPERADMIN) y la leen el cron
 * (/api/cron/cart-recovery) y el envío manual.
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
import { formatCOP } from "@/lib/format";
import {
  ABANDONED_STATUS_LABEL,
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

const STATUS_OPTIONS = ["pending", "reminded", "recovered", "all"] as const;
const STATUS_FILTER_LABEL: Record<(typeof STATUS_OPTIONS)[number], string> = {
  pending: "Pendientes",
  reminded: "Con recordatorio enviado",
  recovered: "Recuperados",
  all: "Todos",
};

/** "hace 5 h" / "hace 3 d" — antigüedad legible del abandono. */
function ageLabel(from: Date, now: Date): string {
  const hours = Math.max(0, Math.round((now.getTime() - from.getTime()) / 3_600_000));
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminCarritosPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const q = pickString(sp, "q");
  const statusRaw = pickString(sp, "status");
  const status = (STATUS_OPTIONS as readonly string[]).includes(statusRaw ?? "")
    ? (statusRaw as (typeof STATUS_OPTIONS)[number])
    : "pending";
  const page = Number(sp.page) || 1;

  const [{ items, total, totalPages }, metrics, settings] = await Promise.all([
    listAbandonedCartsAdmin({ q, status: status as AbandonedCartStatus | "all", page }),
    getCartRecoveryMetrics(),
    getCartRecoverySettings(),
  ]);
  const hasActiveFilters = !!q || status !== "pending";
  const now = new Date();

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<ShoppingCart className="h-5 w-5" />}
        title="Carritos abandonados"
        subtitle={
          <>
            {total} {total === 1 ? "carrito" : "carritos"}
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
              className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex items-center gap-1.5 rounded-md border bg-white px-3.5 py-2 text-sm font-semibold"
            >
              <Settings className="h-4 w-4" />
              Configuración
            </Link>
          ) : undefined
        }
      />

      <AdminPageBody>
        {/* Estado del módulo (de la config) — visible para todos los roles con acceso. */}
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
            puedes enviar a voluntad desde cada fila.
          </AdminNotice>
        )}

        {typeof sp.sent === "string" && (
          <AdminNotice tone="success">Recordatorio enviado a {sp.sent}.</AdminNotice>
        )}
        {typeof sp.bulkOk === "string" && <AdminNotice tone="success">{sp.bulkOk}</AdminNotice>}
        {typeof sp.error === "string" && <AdminNotice tone="error">{sp.error}</AdminNotice>}

        {/* Métricas del módulo */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            label="Pendientes de contacto"
            value={metrics.pendingCount.toLocaleString("es-CO")}
            trendLabel={`${formatCOP(metrics.pendingValueCents)} en carritos sin recordatorio`}
          />
          <KpiCard
            label="Con recordatorio enviado"
            value={metrics.remindedCount.toLocaleString("es-CO")}
            trendLabel="Esperando que el cliente retome"
          />
          <KpiCard
            label="Tasa de recuperación"
            value={metrics.recoveryRatePct === null ? "—" : `${metrics.recoveryRatePct}%`}
            trendLabel={
              metrics.recoveredCount === 0
                ? "Aún sin recuperaciones"
                : `${metrics.recoveredCount.toLocaleString("es-CO")} carritos recuperados`
            }
          />
          <KpiCard
            label="Valor recuperado"
            value={formatCOP(metrics.recoveredValueCents)}
            trendLabel="Aprox. — valor del carrito al recuperarse"
          />
        </div>

        {/* Toolbar de filtros */}
        <form
          method="GET"
          className="border-brand-purple/10 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-12"
        >
          <div className="sm:col-span-7">
            <label
              htmlFor="f-q"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Buscar por email
            </label>
            <Input
              id="f-q"
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder="cliente@correo.com"
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
          </div>
          <div className="sm:col-span-3">
            <label
              htmlFor="f-status"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Estado
            </label>
            <select
              id="f-status"
              name="status"
              defaultValue={status}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_FILTER_LABEL[s]}
                </option>
              ))}
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
                  : "Aún no hay carritos"
            }
            description={
              hasActiveFilters
                ? "Prueba quitar algún filtro o cambiar el email buscado."
                : status === "pending"
                  ? "Cuando un cliente deje su email en el checkout sin pagar, su carrito aparecerá acá."
                  : "Los carritos con este estado aparecerán en este listado."
            }
          />
        ) : (
          <AdminTable minWidth={800}>
            <AdminTableHead>
              <tr>
                <th className="w-10 px-3 py-3 text-left">
                  <BulkSelectAllCartsCheckbox />
                </th>
                <th className="px-4 py-3 text-left font-semibold">Email</th>
                <th className="px-4 py-3 text-left font-semibold">Carrito</th>
                <th className="px-4 py-3 text-right font-semibold">Valor</th>
                <th className="px-4 py-3 text-left font-semibold">Antigüedad</th>
                <th className="px-4 py-3 text-left font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((c) => (
                <AdminTableRow key={c.id}>
                  <td className="w-10 px-3 py-3 align-middle">
                    {/* Bulk: los recuperados no se pueden seleccionar (nada que recordar). */}
                    {c.status !== "recovered" && (
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
                    <span className="text-brand-purple-dark text-xs font-medium">{c.email}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-brand-purple-dark/85 text-xs">
                      {c.itemCount} {c.itemCount === 1 ? "ítem" : "ítems"}
                    </p>
                    <p className="text-brand-muted line-clamp-1 max-w-[220px] text-[10px]">
                      {c.productNames.join(" · ") || "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-brand-purple-dark text-xs font-semibold tabular-nums">
                      {formatCOP(c.totalCents)}
                    </span>
                  </td>
                  <td className="text-brand-muted px-4 py-3 text-xs">
                    {ageLabel(c.lastActivityAt, now)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {c.status === "recovered" ? (
                        <AdminBadge tone="emerald">{ABANDONED_STATUS_LABEL.recovered}</AdminBadge>
                      ) : c.status === "reminded" ? (
                        <AdminBadge tone="blue">
                          {ABANDONED_STATUS_LABEL.reminded}
                          {c.reminderCount > 1 ? ` ×${c.reminderCount}` : ""}
                        </AdminBadge>
                      ) : (
                        <AdminBadge tone="amber">{ABANDONED_STATUS_LABEL.pending}</AdminBadge>
                      )}
                      {c.lastReminderSentAt && (
                        <span className="text-brand-muted text-[10px]">
                          Último: {dateFmt.format(c.lastReminderSentAt)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {c.status !== "recovered" && (
                        <Link
                          href={`/admin/carritos/${c.id}`}
                          className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                        >
                          Recordar
                        </Link>
                      )}
                      <Link
                        href={`/admin/carritos/${c.id}`}
                        className="text-brand-purple-dark hover:text-brand-purple text-xs font-medium"
                      >
                        Ver
                      </Link>
                    </div>
                  </td>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        )}

        {totalPages > 1 && (
          <div className="text-brand-purple-dark/70 flex items-center justify-between text-sm">
            <span>
              {total} carritos · página {page} de {totalPages}
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

      {/* Bar flotante de envío masivo (checkboxes de la tabla). */}
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
  if (status && status !== "pending") params.set("status", status);
  return (
    <Link
      href={`/admin/carritos?${params.toString()}`}
      className="border-brand-purple/20 hover:bg-brand-purple/5 text-brand-purple-dark rounded-md border bg-white px-3 py-1.5 text-xs font-medium"
    >
      {children}
    </Link>
  );
}

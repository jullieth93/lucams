/*
 * Admin > Cupones — Listado + filtros + búsqueda + orden.
 *
 * Estado tiene varios sub-estados (Activo/Pausado/Expirado/Programado/
 * Agotado/Archivado). Como pause/resume son acciones explícitas
 * auditadas, el badge ES el toggle solo entre Activo ↔ Pausado.
 * Estados derivados (expirado, etc.) no son clickeables — son resultado
 * del tiempo.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Ticket } from "lucide-react";
import { listCoupons } from "@/features/coupons/service";
import { requireRole } from "@/lib/admin-rbac-guard";
import { formatCOP } from "@/lib/format";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminNotice,
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
  AdminBadge,
  AdminEmpty,
  SortableHeader,
} from "@/components/admin-page";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CreateCouponForm } from "./create-coupon-form";
import { pauseCouponAction, resumeCouponAction } from "./actions";

export const metadata: Metadata = {
  title: "Cupones",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

export default async function AdminCuponesPage({ searchParams }: { searchParams: SearchParams }) {
  const _session = await requireRole(["SUPERADMIN"]);

  const sp = await searchParams;
  const q = pickString(sp, "q");
  const statusRaw = pickString(sp, "status");
  const status = (["active", "inactive"].includes(statusRaw ?? "") ? statusRaw : "all") as
    | "all"
    | "active"
    | "inactive";
  const sortRaw = pickString(sp, "sort");
  const sort = (["expiry-asc", "code", "uses"].includes(sortRaw ?? "") ? sortRaw : "recent") as
    | "recent"
    | "expiry-asc"
    | "code"
    | "uses";

  const coupons = await listCoupons({ q, status, sort });
  const now = new Date();
  const hasActiveFilters = !!q || status !== "all" || sort !== "recent";

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

  function formatValue(c: (typeof coupons)[number]) {
    if (c.type === "PERCENT") return `${c.value}%`;
    if (c.type === "FREE_SHIPPING") return "Envío gratis";
    return formatCOP(c.value);
  }

  // Tipo en español llano (Lucy 2026-06-27) — antes mostraba el enum crudo.
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
            {coupons.length} {coupons.length === 1 ? "cupón" : "cupones"}
            {hasActiveFilters && " · con filtros aplicados"}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Comercial" },
          { label: "Cupones" },
        ]}
      />

      <AdminPageBody>
        <AdminNotice tone="info">
          <strong>¿Cómo funcionan?</strong> Crea códigos de descuento que el cliente escribe en el
          carrito (o se aplican con un enlace especial). Los marcados como <strong>Públicos</strong>{" "}
          se pueden mostrar abiertamente (ej. en una promoción o, más adelante, en el bot de
          WhatsApp); los no públicos solo funcionan si el cliente sabe el código.
        </AdminNotice>

        {sp.created === "1" && <AdminNotice tone="success">Cupón creado.</AdminNotice>}
        {sp.updated === "1" && <AdminNotice tone="success">Cupón actualizado.</AdminNotice>}
        {sp.paused === "1" && (
          <AdminNotice tone="warning">Cupón pausado (no visible al cliente).</AdminNotice>
        )}
        {sp.resumed === "1" && <AdminNotice tone="success">Cupón reactivado.</AdminNotice>}
        {sp.archived === "1" && <AdminNotice tone="warning">Cupón archivado.</AdminNotice>}

        {/* Toolbar */}
        <form
          method="GET"
          className="border-brand-purple/10 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-12"
        >
          <div className="sm:col-span-5">
            <label
              htmlFor="f-q"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Buscar
            </label>
            <Input
              id="f-q"
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder="Por código o descripción…"
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
              <option value="all">Todos</option>
              <option value="active">Solo activos vigentes</option>
              <option value="inactive">Pausados/expirados/programados</option>
            </select>
          </div>
          {/* Desktop: clic en encabezados. Dropdown solo mobile. Lucy #1. */}
          <div className="sm:hidden">
            <label
              htmlFor="f-sort"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Ordenar por
            </label>
            <select
              id="f-sort"
              name="sort"
              defaultValue={sort}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="recent">Vigencia más reciente</option>
              <option value="expiry-asc">Próximos a vencer</option>
              <option value="code">Código A-Z</option>
              <option value="uses">Más usados</option>
            </select>
          </div>
          <div className="flex items-end gap-2 sm:col-span-1">
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
                ? "Prueba con otros filtros o crea un cupón nuevo."
                : "Crea el primero abajo para empezar a otorgar descuentos."
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
                  preserve={{ q, status: status !== "all" ? status : undefined }}
                />
                <th className="px-4 py-3 text-left font-semibold">Tipo</th>
                <th className="px-4 py-3 text-left font-semibold">Valor</th>
                <th className="px-4 py-3 text-center font-semibold">Estado</th>
                <SortableHeader
                  label="Vigencia"
                  ascValue="expiry-asc"
                  descValue="recent"
                  currentSort={sort}
                  basePath="/admin/cupones"
                  preserve={{ q, status: status !== "all" ? status : undefined }}
                />
                <SortableHeader
                  label="Usos"
                  ascValue="uses"
                  currentSort={sort}
                  basePath="/admin/cupones"
                  preserve={{ q, status: status !== "all" ? status : undefined }}
                  align="center"
                />
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {coupons.map((c) => {
                const status = couponStatus(c);
                // Solo Activo/Pausado son toggleables. Los demás son
                // estados derivados (Expirado por fecha, Agotado por uso).
                const canToggle = !c.deletedAt && (c.isActive || status.label === "Pausado");
                return (
                  <AdminTableRow key={c.id}>
                    <td className="px-4 py-3 text-sm">
                      <code className="bg-brand-purple/10 text-brand-purple-dark rounded px-2 py-1 font-mono text-xs font-bold">
                        {c.code}
                      </code>
                      {c.isPublic && (
                        <span className="ml-2 inline-block">
                          <AdminBadge tone="blue">Público</AdminBadge>
                        </span>
                      )}
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 text-sm">
                      {typeLabel(c.type)}
                    </td>
                    <td className="text-brand-purple-dark px-4 py-3 text-sm font-semibold">
                      {formatValue(c)}
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      {canToggle ? (
                        <form
                          action={c.isActive ? pauseCouponAction : resumeCouponAction}
                          className="inline"
                        >
                          <input type="hidden" name="id" value={c.id} />
                          <button
                            type="submit"
                            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all hover:shadow-sm ${
                              c.isActive
                                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                                : "bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
                            }`}
                            title={c.isActive ? "Click para pausar" : "Click para reactivar"}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${c.isActive ? "bg-emerald-500" : "bg-amber-500"}`}
                              aria-hidden
                            />
                            {status.label}
                          </button>
                        </form>
                      ) : (
                        <AdminBadge tone={status.tone}>{status.label}</AdminBadge>
                      )}
                    </td>
                    <td className="text-brand-muted px-4 py-3 text-xs">
                      {c.validFrom.toLocaleDateString("es-CO", { timeZone: "America/Bogota" })} →{" "}
                      {c.validTo.toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 text-center text-sm tabular-nums">
                      {c.usedCount}
                      {c.maxUses ? ` / ${c.maxUses}` : ""}
                    </td>
                  </AdminTableRow>
                );
              })}
            </AdminTableBody>
          </AdminTable>
        )}

        {/*
         * Lucy 2026-06-27 (6b): antes el form de crear estaba SIEMPRE abierto al
         * fondo y Lucy "no veía cómo volver/cancelar". Ahora es colapsable: la
         * lista es lo principal, el form se abre a propósito y se cierra con el
         * mismo título o con "Cancelar". Arranca cerrado.
         */}
        <details className="border-brand-purple/15 group rounded-xl border bg-white">
          <summary className="text-brand-purple-dark hover:bg-brand-purple/5 font-display flex cursor-pointer list-none items-center justify-between rounded-xl px-5 py-4 text-base font-bold select-none">
            <span>➕ Crear un cupón nuevo</span>
            <span className="text-brand-muted text-xs transition-transform group-open:rotate-90">
              ▶
            </span>
          </summary>
          <div className="border-brand-purple/10 border-t px-5 pt-4 pb-5">
            <CreateCouponForm />
          </div>
        </details>
      </AdminPageBody>
    </AdminPage>
  );
}

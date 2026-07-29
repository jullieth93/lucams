/*
 * Admin > Ocasiones — Listado + filtros + búsqueda + orden.
 *
 * Toggle Estado clickeable directamente (badge = toggle, sin botón
 * separado). Mismo patrón que /admin/categorias.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Tag, ChevronRight } from "lucide-react";
import { listOcasionTags } from "@/features/ocasiones/service";
import { getCurrentAdmin } from "@/lib/auth";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminNotice,
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
  AdminEmpty,
  AdminCard,
} from "@/components/admin-page";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CreateOcasionForm } from "./create-ocasion-form";
import { toggleOcasionActiveAction } from "./actions";

export const metadata: Metadata = {
  title: "Ocasiones",
};

const MONTH_NAMES: Record<number, string> = {
  1: "Enero",
  2: "Febrero",
  3: "Marzo",
  4: "Abril",
  5: "Mayo",
  6: "Junio",
  7: "Julio",
  8: "Agosto",
  9: "Septiembre",
  10: "Octubre",
  11: "Noviembre",
  12: "Diciembre",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

export default async function AdminOcasionesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const q = pickString(sp, "q");
  const statusRaw = pickString(sp, "status");
  const status = (["active", "inactive"].includes(statusRaw ?? "") ? statusRaw : "all") as
    "all" | "active" | "inactive";
  const sortRaw = pickString(sp, "sort");
  const sort = (["name", "recent"].includes(sortRaw ?? "") ? sortRaw : "order") as
    "order" | "name" | "recent";

  const ocasiones = await listOcasionTags({ q, status, sort });
  const created = sp.created === "1";
  const updated = sp.updated === "1";
  const deleted = sp.deleted === "1";
  const errorMsg = typeof sp.error === "string" ? sp.error : null;
  const hasActiveFilters = !!q || status !== "all" || sort !== "order";

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Tag className="h-5 w-5" />}
        title="Ocasiones"
        subtitle={
          <>
            {ocasiones.length} {ocasiones.length === 1 ? "ocasión" : "ocasiones"}
            {hasActiveFilters && " · con filtros aplicados"} · Tags transversales que cruzan
            categorías.
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Catálogo" },
          { label: "Ocasiones" },
        ]}
      />

      <AdminPageBody>
        <AdminNotice tone="info">
          <strong>¿Para qué sirven?</strong> Permiten que el cliente filtre productos por momento o
          celebración (Matrimonio, Día de la Madre, Cumpleaños…). Cada ocasión tiene una descripción
          semántica que el bot futuro usa para responder preguntas como &quot;¿qué le regalo a mi
          mamá?&quot;.
        </AdminNotice>

        {created && <AdminNotice tone="success">Ocasión creada.</AdminNotice>}
        {updated && <AdminNotice tone="success">Ocasión actualizada.</AdminNotice>}
        {deleted && <AdminNotice tone="warning">Ocasión archivada.</AdminNotice>}
        {errorMsg && <AdminNotice tone="error">{errorMsg}</AdminNotice>}

        {/* Toolbar: búsqueda + filtros + ordenamiento (form GET) */}
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
              placeholder="Por nombre o slug…"
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
              <option value="all">Todas</option>
              <option value="active">Solo activas</option>
              <option value="inactive">Solo inactivas</option>
            </select>
          </div>
          <div className="sm:col-span-3">
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
              <option value="order">Orden manual</option>
              <option value="name">Nombre A-Z</option>
              <option value="recent">Más recientes</option>
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
                href="/admin/ocasiones"
                className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold"
              >
                Limpiar filtros
              </Link>
            </div>
          )}
        </form>

        {ocasiones.length === 0 ? (
          <AdminEmpty
            icon={<Tag className="h-5 w-5" />}
            title={hasActiveFilters ? "Sin resultados" : "Todavía no hay ocasiones"}
            description={
              hasActiveFilters
                ? "Prueba quitar algún filtro o cambiar el texto."
                : "Crea tu primera ocasión con el formulario de abajo."
            }
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Nombre</th>
                <th className="px-4 py-3 text-left font-semibold">Slug</th>
                <th className="px-4 py-3 text-left font-semibold">Mes destacado</th>
                <th className="px-4 py-3 text-left font-semibold">Cantidad sugerida</th>
                <th className="px-4 py-3 text-center font-semibold">Productos</th>
                <th className="px-4 py-3 text-center font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Acción</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {ocasiones.map((o) => {
                const range = o.suggestedQuantityRange as {
                  min: number;
                  ideal: number;
                  max: number;
                } | null;
                return (
                  <AdminTableRow key={o.id}>
                    <td className="px-4 py-3">
                      <div className="text-brand-purple-dark font-medium">{o.name}</div>
                    </td>
                    <td className="text-brand-purple-dark/75 px-4 py-3 font-mono text-xs">
                      {o.slug}
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 text-sm">
                      {o.monthHint ? MONTH_NAMES[o.monthHint] : "—"}
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 text-sm">
                      {range ? `${range.min} / ${range.ideal} / ${range.max}` : "—"}
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 text-center text-sm tabular-nums">
                      {o._count.products}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {/* Badge = Toggle (mismo patrón que categorías) */}
                      <form action={toggleOcasionActiveAction} className="inline">
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="next" value={o.isActive ? "false" : "true"} />
                        <button
                          type="submit"
                          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all hover:shadow-sm ${
                            o.isActive
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                              : "bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200"
                          }`}
                          title={o.isActive ? "Click para desactivar" : "Click para activar"}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${o.isActive ? "bg-emerald-500" : "bg-slate-400"}`}
                            aria-hidden
                          />
                          {o.isActive ? "Activa" : "Inactiva"}
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/ocasiones/${o.id}`}
                        className="text-brand-purple-dark hover:text-brand-purple inline-flex items-center gap-1 text-xs font-medium"
                      >
                        Editar
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </AdminTableRow>
                );
              })}
            </AdminTableBody>
          </AdminTable>
        )}

        <AdminCard className="p-5">
          <h3 className="text-brand-purple-dark font-display mb-3 text-base font-bold">
            Crear ocasión nueva
          </h3>
          <CreateOcasionForm />
        </AdminCard>
      </AdminPageBody>
    </AdminPage>
  );
}

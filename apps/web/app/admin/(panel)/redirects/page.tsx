/*
 * Admin > Redirects — URLs legacy 301/302 admin-managed.
 *
 * Complementa a lib/product-redirects.ts (slugs consolidados, generado por
 * code al hacer make consolidate-product-families). Acá Lucy administra
 * cualquier otro mapping: categorías renombradas, blog posts movidos,
 * typos comunes, links de Instagram bio que cambiaron, etc.
 *
 * El lookup activo se hace en proxy.ts (middleware Node runtime) con cache
 * in-memory 60s para no martillear DB en cada request.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRightLeft, Plus } from "lucide-react";
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
} from "@/components/admin-page";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrentAdmin } from "@/lib/auth";
import { listRedirects } from "@/features/redirects/service";
import {
  archiveRedirectAction,
  restoreRedirectAction,
  toggleRedirectActiveAction,
} from "./actions";
import { CreateRedirectForm } from "./create-redirect-form";

export const metadata: Metadata = {
  title: "Redirects",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

const STATUS_OPTIONS = ["active", "inactive", "archived", "all"] as const;
const SORT_OPTIONS = ["recent", "from", "hits"] as const;
const STATUS_LABEL: Record<(typeof STATUS_OPTIONS)[number], string> = {
  active: "Activos",
  inactive: "Desactivados",
  archived: "Archivados",
  all: "Todos",
};
const SORT_LABEL: Record<(typeof SORT_OPTIONS)[number], string> = {
  recent: "Más recientes",
  from: "Ruta origen A-Z",
  hits: "Más usados",
};

export default async function AdminRedirectsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const q = pickString(sp, "q");
  const statusRaw = pickString(sp, "status");
  const status = (STATUS_OPTIONS as readonly string[]).includes(statusRaw ?? "")
    ? (statusRaw as (typeof STATUS_OPTIONS)[number])
    : "active";
  const sortRaw = pickString(sp, "sort");
  const sort = (SORT_OPTIONS as readonly string[]).includes(sortRaw ?? "")
    ? (sortRaw as (typeof SORT_OPTIONS)[number])
    : "recent";
  const page = Number(sp.page) || 1;

  const { items, total, totalPages } = await listRedirects({ q, status, sort, page });
  const hasActiveFilters = !!q || status !== "active" || sort !== "recent";

  const dateFmt = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<ArrowRightLeft className="h-5 w-5" />}
        title="Redirects 301"
        subtitle={
          <>
            {total} {total === 1 ? "redirect" : "redirects"}
            {hasActiveFilters && " · con filtros aplicados"}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Comercial" },
          { label: "Redirects" },
        ]}
      />

      <AdminPageBody>
        <AdminNotice tone="info">
          <strong>¿Para qué sirve?</strong> Si renombrás una URL (categoría, blog, página legal),
          crea un redirect <strong>301 permanente</strong> para no perder visitas ni SEO de Google.
          Los redirects 301 transfieren la autoridad de la URL vieja a la nueva. Usa 302 solo si el
          cambio es temporal (ej. mantenimiento).
        </AdminNotice>

        <AdminNotice tone="info">
          <strong>Importante:</strong> los redirects de slugs de productos consolidados (ej.{" "}
          <code>set-6-fotoimanes-polaroid-grande</code>) se administran desde código (
          <code>lib/product-redirects.ts</code>) — los regenera{" "}
          <code>make consolidate-product-families</code> tras un re-seed.
        </AdminNotice>

        {sp.created === "1" && <AdminNotice tone="success">Redirect creado.</AdminNotice>}
        {sp.updated === "1" && <AdminNotice tone="success">Redirect actualizado.</AdminNotice>}
        {sp.activated === "1" && <AdminNotice tone="success">Redirect activado.</AdminNotice>}
        {sp.deactivated === "1" && (
          <AdminNotice tone="warning">Redirect desactivado (no se aplica).</AdminNotice>
        )}
        {sp.archived === "1" && <AdminNotice tone="warning">Redirect archivado.</AdminNotice>}
        {sp.restored === "1" && <AdminNotice tone="success">Redirect restaurado.</AdminNotice>}
        {typeof sp.error === "string" && <AdminNotice tone="error">{sp.error}</AdminNotice>}

        <AdminCard className="p-5">
          <h2 className="text-brand-purple-dark font-display mb-4 flex items-center gap-2 text-base font-bold">
            <Plus className="h-5 w-5" />
            Crear redirect
          </h2>
          <CreateRedirectForm />
        </AdminCard>

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
              placeholder="Origen, destino o descripción…"
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
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <label
              htmlFor="f-sort"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Ordenar
            </label>
            <select
              id="f-sort"
              name="sort"
              defaultValue={sort}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
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
                href="/admin/redirects"
                className="text-brand-purple/70 hover:text-brand-purple-dark text-xs font-semibold"
              >
                Limpiar filtros
              </Link>
            </div>
          )}
        </form>

        {items.length === 0 ? (
          <AdminEmpty
            icon={<ArrowRightLeft className="h-5 w-5" />}
            title={hasActiveFilters ? "Sin resultados" : "No hay redirects todavía"}
            description={
              hasActiveFilters
                ? "Probá quitar algún filtro."
                : "Usá el form de arriba para crear el primero."
            }
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Origen</th>
                <th className="px-4 py-3 text-left font-semibold">Destino</th>
                <th className="px-4 py-3 text-center font-semibold">Tipo</th>
                <th className="px-4 py-3 text-center font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Hits</th>
                <th className="px-4 py-3 text-left font-semibold">Creado</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((r) => (
                <AdminTableRow key={r.id}>
                  <td className="px-4 py-3 align-top">
                    <code className="text-brand-purple-dark bg-brand-purple/5 rounded px-1.5 py-0.5 font-mono text-[11px]">
                      {r.fromPath}
                    </code>
                    {r.description && (
                      <p className="text-brand-purple-dark/55 mt-1 text-xs">{r.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <code className="text-brand-purple-dark/85 bg-brand-purple/5 rounded px-1.5 py-0.5 font-mono text-[11px]">
                      {r.toPath}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-center align-top">
                    <AdminBadge tone={r.statusCode === 301 ? "emerald" : "amber"}>
                      {r.statusCode}
                    </AdminBadge>
                  </td>
                  <td className="px-4 py-3 text-center align-top">
                    {r.isArchived ? (
                      <AdminBadge tone="slate">Archivado</AdminBadge>
                    ) : r.isActive ? (
                      <AdminBadge tone="emerald">Activo</AdminBadge>
                    ) : (
                      <AdminBadge tone="amber">Desactivado</AdminBadge>
                    )}
                  </td>
                  <td className="text-brand-purple-dark/85 px-4 py-3 text-right align-top text-xs tabular-nums">
                    {r.hitCount.toLocaleString("es-CO")}
                    {r.lastHitAt && (
                      <div className="text-brand-purple-dark/55 text-[10px]">
                        último {dateFmt.format(r.lastHitAt)}
                      </div>
                    )}
                  </td>
                  <td className="text-brand-purple-dark/65 px-4 py-3 align-top text-xs">
                    {dateFmt.format(r.createdAt)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {r.isArchived ? (
                        <form action={restoreRedirectAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button
                            type="submit"
                            className="text-brand-purple hover:text-brand-purple-dark text-[11px] font-medium"
                          >
                            Restaurar
                          </button>
                        </form>
                      ) : (
                        <>
                          <form action={toggleRedirectActiveAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <button
                              type="submit"
                              className={
                                r.isActive
                                  ? "text-[11px] font-medium text-amber-700 hover:text-amber-900"
                                  : "text-[11px] font-medium text-emerald-700 hover:text-emerald-900"
                              }
                            >
                              {r.isActive ? "Desactivar" : "Activar"}
                            </button>
                          </form>
                          <ConfirmAction
                            action={archiveRedirectAction}
                            message="¿Archivar este redirect? Dejará de aplicar. Podés restaurarlo después."
                          >
                            <input type="hidden" name="id" value={r.id} />
                            <button
                              type="submit"
                              className="text-brand-purple-dark/55 text-[11px] font-medium hover:text-rose-600"
                            >
                              Archivar
                            </button>
                          </ConfirmAction>
                        </>
                      )}
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
              {total} redirects · página {page} de {totalPages}
            </span>
            <div className="flex gap-1">
              {page > 1 && (
                <PaginationLink page={page - 1} q={q} status={status} sort={sort}>
                  ← Anterior
                </PaginationLink>
              )}
              {page < totalPages && (
                <PaginationLink page={page + 1} q={q} status={status} sort={sort}>
                  Siguiente →
                </PaginationLink>
              )}
            </div>
          </div>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}

function PaginationLink({
  page,
  q,
  status,
  sort,
  children,
}: {
  page: number;
  q?: string;
  status?: string;
  sort?: string;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (q) params.set("q", q);
  if (status && status !== "active") params.set("status", status);
  if (sort && sort !== "recent") params.set("sort", sort);
  return (
    <Link
      href={`/admin/redirects?${params.toString()}`}
      className="border-brand-purple/20 hover:bg-brand-purple/5 text-brand-purple-dark rounded-md border bg-white px-3 py-1.5 text-xs font-medium"
    >
      {children}
    </Link>
  );
}

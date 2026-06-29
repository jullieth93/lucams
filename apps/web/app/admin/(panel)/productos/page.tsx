/*
 * Admin > Productos — Listado paginado + filtros + búsqueda + orden.
 *
 * Filtros (query params, GET):
 *   - q: búsqueda en name/sku/slug
 *   - status: all | active | inactive | featured
 *   - sort: recent | name | price-asc | price-desc
 *   - page: paginación
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Package, Plus, Edit3, ShoppingBag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
// Note: las acciones de eliminar/archivar de productos están en el page
// de edición /admin/productos/[id], no en este listado. Aquí solo edit.
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
  AdminBadge,
  AdminEmpty,
  AdminButton,
  AdminNotice,
  SortableHeader,
} from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import { formatCOP } from "@/lib/format";
import { listProducts } from "@/features/products/service";
import { ProductQuickActions } from "./quick-actions";
import { BulkActionBar, BulkSelectAllCheckbox } from "./bulk-action-bar";

export const metadata: Metadata = {
  title: "Productos",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

export default async function AdminProductosPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const q = pickString(sp, "q");
  const statusRaw = pickString(sp, "status");
  const status = (
    ["active", "inactive", "archived", "featured"].includes(statusRaw ?? "") ? statusRaw : "all"
  ) as "all" | "active" | "inactive" | "archived" | "featured";
  const sortRaw = pickString(sp, "sort");
  const sort = (
    ["name", "price-asc", "price-desc"].includes(sortRaw ?? "") ? sortRaw : "recent"
  ) as "recent" | "name" | "price-asc" | "price-desc";

  const justCreated = sp.created === "1";
  const justDeleted = sp.deleted === "1";

  const { items, total, pageSize } = await listProducts({
    page,
    search: q,
    status,
    sort,
  });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasActiveFilters = !!q || status !== "all" || sort !== "recent";

  // Hotfix P1-15: si el filtro es "archivados", los checkboxes de bulk no
  // tienen sentido (no puedes bulk-modificar archivados). Ocultamos la columna
  // entera para evitar el margen fantasma.
  const showBulkColumn = status !== "archived";

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Package className="h-5 w-5" />}
        title="Productos"
        subtitle={
          <>
            {total} {total === 1 ? "producto" : "productos"} en el catálogo
            {hasActiveFilters && " · con filtros aplicados"}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Catálogo" },
          { label: "Productos" },
        ]}
        actions={
          <AdminButton href="/admin/productos/nuevo" variant="primary">
            <Plus className="h-4 w-4" />
            Nuevo producto
          </AdminButton>
        }
      />

      <AdminPageBody>
        {justCreated && <AdminNotice tone="success">Producto creado correctamente.</AdminNotice>}
        {/* Hotfix P1-16: archivar es acción reversible deliberada — success, no warning. */}
        {justDeleted && (
          <AdminNotice tone="success">
            Producto archivado. Puedes restaurarlo cuando quieras desde el filtro
            &quot;Archivados&quot;.
          </AdminNotice>
        )}
        {sp.bulkOk && <AdminNotice tone="success">{String(sp.bulkOk)}</AdminNotice>}
        {sp.bulkError && <AdminNotice tone="error">{String(sp.bulkError)}</AdminNotice>}
        {sp.restored === "1" && (
          <AdminNotice tone="success">
            Producto restaurado. Queda pausado — usa el botón &quot;Activar&quot; para mostrarlo en
            tu tienda.
          </AdminNotice>
        )}

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
              placeholder="Por nombre, código o URL…"
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
              <option value="all">Todos (activos + inactivos + archivados)</option>
              <option value="active">Solo activos (visibles en tienda)</option>
              <option value="inactive">Solo inactivos (ocultos pero recuperables)</option>
              <option value="archived">Solo archivados (papelera)</option>
              <option value="featured">Solo destacados</option>
            </select>
          </div>
          {/* En desktop se ordena con clic en los encabezados de la tabla
              (SortableHeader). El dropdown queda solo para mobile, donde los
              headers son difíciles de tocar. Lucy 2026-06-27 #1. */}
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
              <option value="recent">Más recientes</option>
              <option value="name">Nombre A-Z</option>
              <option value="price-asc">Precio menor a mayor</option>
              <option value="price-desc">Precio mayor a menor</option>
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
                href="/admin/productos"
                className="text-brand-purple/70 hover:text-brand-purple-dark text-xs font-semibold"
              >
                Limpiar filtros
              </Link>
            </div>
          )}
        </form>

        {items.length === 0 ? (
          <AdminEmpty
            icon={<ShoppingBag className="h-5 w-5" />}
            title={hasActiveFilters ? "Sin resultados" : "Todavía no hay productos"}
            description={
              hasActiveFilters
                ? "Prueba con otro término o cambia los filtros."
                : "Crea tu primer producto con el botón de arriba."
            }
            action={
              !hasActiveFilters && (
                <AdminButton href="/admin/productos/nuevo" variant="primary">
                  <Plus className="h-4 w-4" />
                  Crear primer producto
                </AdminButton>
              )
            }
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                {showBulkColumn && (
                  <th className="w-10 px-3 py-3 text-left">
                    <BulkSelectAllCheckbox />
                  </th>
                )}
                <SortableHeader
                  label="Producto"
                  ascValue="name"
                  currentSort={sort}
                  basePath="/admin/productos"
                  preserve={{ q, status: status !== "all" ? status : undefined }}
                />
                <th className="px-4 py-3 text-left font-semibold">Código</th>
                <th className="px-4 py-3 text-left font-semibold">Categoría</th>
                <SortableHeader
                  label="Precio"
                  ascValue="price-asc"
                  descValue="price-desc"
                  currentSort={sort}
                  basePath="/admin/productos"
                  preserve={{ q, status: status !== "all" ? status : undefined }}
                  align="right"
                />
                <th className="px-4 py-3 text-center font-semibold">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((p) => (
                <AdminTableRow key={p.id}>
                  {showBulkColumn && (
                    <td className="w-10 px-3 py-3 align-middle">
                      {p.deletedAt === null && (
                        <input
                          type="checkbox"
                          name="productIds"
                          value={p.id}
                          aria-label={`Seleccionar ${p.name}`}
                          className="text-brand-purple focus:ring-brand-purple/40 h-4 w-4 cursor-pointer rounded border-brand-purple/30"
                        />
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="text-brand-purple-dark font-medium">{p.name}</div>
                    <div className="text-brand-purple-dark/50 text-xs">/{p.slug}</div>
                  </td>
                  <td className="text-brand-purple-dark/75 px-4 py-3 font-mono text-xs">{p.sku}</td>
                  <td className="text-brand-purple-dark/85 px-4 py-3">{p.category.name}</td>
                  <td className="text-brand-purple-dark px-4 py-3 text-right font-semibold tabular-nums">
                    {/* "desde $X" cuando hay varias opciones con precios distintos */}
                    {p.variantsCount > 1 && (
                      <span className="text-brand-purple-dark/45 mr-1 text-[10px] font-normal">
                        desde
                      </span>
                    )}
                    {formatCOP(p.priceFrom)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ProductStatus
                      isActive={p.isActive}
                      isFeatured={p.isFeatured}
                      isArchived={p.deletedAt !== null}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {/*
                     * Hotfix P0-10: ambas acciones ahora con mismo tratamiento
                     * (borde + h-9 + font-semibold + text-xs) — antes "Editar"
                     * era link plano sin chrome al lado del button QuickActions
                     * con borde, inconsistencia visual.
                     */}
                    <div className="flex items-center justify-end gap-2">
                      <ProductQuickActions
                        productId={p.id}
                        isActive={p.isActive}
                        isArchived={p.deletedAt !== null}
                      />
                      <Link
                        href={`/admin/productos/${p.id}`}
                        className="border-brand-purple/25 text-brand-purple hover:bg-brand-purple/10 inline-flex h-9 items-center gap-1.5 rounded-md border bg-white px-3 text-xs font-semibold"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Editar
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
              {total} productos · página {page} de {totalPages}
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

      {/*
       * Sprint 3 — Bulk action bar (client component, sticky bottom).
       * Por default oculta. Aparece cuando hay al menos 1 producto checked.
       * Lee los checkboxes con name="productIds" del documento.
       */}
      <BulkActionBar />
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
  if (status && status !== "all") params.set("status", status);
  if (sort && sort !== "recent") params.set("sort", sort);
  return (
    <Link
      href={`/admin/productos?${params.toString()}`}
      className="border-brand-purple/20 hover:bg-brand-purple/5 text-brand-purple-dark rounded-md border bg-white px-3 py-1.5 text-xs font-medium"
    >
      {children}
    </Link>
  );
}

function ProductStatus({
  isActive,
  isFeatured,
  isArchived,
}: {
  isActive: boolean;
  isFeatured: boolean;
  isArchived: boolean;
}) {
  // 3 estados visuales claros para no confundir admin Lucy:
  //   Archivado (deletedAt!=null) = papelera, requiere restaurar primero
  //   Inactivo (isActive=false, no archivado) = oculto del storefront, recuperable
  //   Activo (isActive=true) = visible en storefront
  //   Destacado = activo + featured (aparece en home)
  if (isArchived) return <AdminBadge tone="rose">Archivado</AdminBadge>;
  if (!isActive) return <AdminBadge tone="slate">Inactivo</AdminBadge>;
  if (isFeatured) return <AdminBadge tone="amber">Destacado</AdminBadge>;
  return <AdminBadge tone="emerald">Activo</AdminBadge>;
}

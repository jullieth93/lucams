/*
 * Admin > Productos — Listado paginado + filtros + búsqueda + orden.
 *
 * Filtros (query params, GET):
 *   - q: búsqueda en name/sku/slug
 *   - categoria: id de categoría (cross-link desde /admin/categorias)
 *   - status: all | active | inactive | archived | featured
 *   - sort: recent | name | price-asc | price-desc | sku-asc | sku-desc | category-asc | category-desc
 *   - page: paginación
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Boxes, Calculator, Edit3, ExternalLink, Layers, Plus, ShoppingBag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminCard,
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
  AdminBadge,
  AdminEmpty,
  AdminButton,
  AdminNotice,
  AdminSegmentedBar,
  SortableHeader,
} from "@/components/admin-page";
import { CountUp } from "@/components/admin/count-up";
import { requireCapability } from "@/lib/admin-rbac-guard";
import { prisma } from "@/lib/db";
import { formatCOP } from "@/lib/format";
import { listCategoriesForSelect, listProducts } from "@/features/products/service";
import { getStorefrontVisibility } from "@/features/products/storefront-visibility";
import { StorefrontVisibilityChip } from "@/components/admin/storefront-visibility-chip";
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
  await requireCapability("catalog:write");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = pickString(sp, "q");
  const categoryId = pickString(sp, "categoria") || undefined;
  const statusRaw = pickString(sp, "status");
  const status = (
    ["active", "inactive", "archived", "featured"].includes(statusRaw ?? "") ? statusRaw : "all"
  ) as "all" | "active" | "inactive" | "archived" | "featured";
  const sortRaw = pickString(sp, "sort");
  const sort = (
    [
      "name",
      "price-asc",
      "price-desc",
      "sku-asc",
      "sku-desc",
      "category-asc",
      "category-desc",
    ].includes(sortRaw ?? "")
      ? sortRaw
      : "recent"
  ) as
    | "recent"
    | "name"
    | "price-asc"
    | "price-desc"
    | "sku-asc"
    | "sku-desc"
    | "category-asc"
    | "category-desc";

  const justCreated = sp.created === "1";
  const justDeleted = sp.deleted === "1";

  const [{ items, total, pageSize }, categories, allStatuses] = await Promise.all([
    listProducts({
      page,
      search: q,
      categoryId,
      status,
      sort,
    }),
    listCategoriesForSelect(),
    prisma.product.findMany({
      select: { isActive: true, isFeatured: true, deletedAt: true },
    }),
  ]);

  let activeRegularCount = 0;
  let featuredCount = 0;
  let inactiveCount = 0;
  let archivedCount = 0;
  for (const row of allStatuses) {
    if (row.deletedAt) {
      archivedCount += 1;
    } else if (!row.isActive) {
      inactiveCount += 1;
    } else if (row.isFeatured) {
      featuredCount += 1;
    } else {
      activeRegularCount += 1;
    }
  }
  const activeTotalCount = activeRegularCount + featuredCount;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasActiveFilters = !!q || !!categoryId || status !== "all" || sort !== "recent";

  // Clamp: si piden una página fuera de rango (URL manipulada o salto inválido),
  // redirigir a la última válida preservando filtros — evita el empty-state engañoso.
  if (page > totalPages && total > 0) {
    const params = new URLSearchParams();
    params.set("page", String(totalPages));
    if (q) params.set("q", q);
    if (categoryId) params.set("categoria", categoryId);
    if (status !== "all") params.set("status", status);
    if (sort !== "recent") params.set("sort", sort);
    redirect(`/admin/productos?${params.toString()}`);
  }

  const preserveParams = {
    q,
    categoria: categoryId,
    status: status !== "all" ? status : undefined,
  };

  // Hotfix P1-15: si el filtro es "archivados", los checkboxes de bulk no
  // tienen sentido (no puedes bulk-modificar archivados). Ocultamos la columna
  // entera para evitar el margen fantasma.
  const showBulkColumn = status !== "archived";

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<ShoppingBag className="h-5 w-5" />}
        title="Productos"
        subtitle={
          <>
            {total} {total === 1 ? "producto" : "productos"} en esta vista
            {hasActiveFilters && " · con filtros aplicados"}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Catálogo" },
          { label: "Productos" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/inventario">
                <Boxes className="mr-1.5 h-4 w-4" />
                Inventario
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/categorias">
                <Layers className="mr-1.5 h-4 w-4" />
                Categorías
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/costos">
                <Calculator className="mr-1.5 h-4 w-4" />
                Costos
              </Link>
            </Button>
            <AdminButton href="/admin/productos/nuevo" variant="primary">
              <Plus className="h-4 w-4" />
              Nuevo producto
            </AdminButton>
          </div>
        }
      />

      <AdminPageBody>
        {/* Resumen ejecutivo del catálogo */}
        <AdminCard className="p-5">
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Link
              href="/admin/productos?status=active"
              className="rounded-xl bg-emerald-50/70 p-3 ring-1 ring-emerald-200/70 transition-all hover:bg-emerald-50"
            >
              <p className="text-[11px] font-semibold tracking-wide text-emerald-800 uppercase">
                Activos en tienda
              </p>
              <p className="font-display mt-0.5 text-2xl font-bold text-emerald-900 tabular-nums">
                <CountUp value={activeTotalCount} />
              </p>
            </Link>
            <Link
              href="/admin/productos?status=featured"
              className="rounded-xl bg-amber-50/70 p-3 ring-1 ring-amber-200/70 transition-all hover:bg-amber-50"
            >
              <p className="text-[11px] font-semibold tracking-wide text-amber-800 uppercase">
                Destacados Home
              </p>
              <p className="font-display mt-0.5 text-2xl font-bold text-amber-900 tabular-nums">
                <CountUp value={featuredCount} />
              </p>
            </Link>
            <Link
              href="/admin/productos?status=inactive"
              className="bg-brand-purple/5 ring-brand-purple/15 hover:bg-brand-purple/10 rounded-xl p-3 ring-1 transition-all"
            >
              <p className="text-brand-purple-dark/80 text-[11px] font-semibold tracking-wide uppercase">
                Pausados
              </p>
              <p className="text-brand-purple-dark font-display mt-0.5 text-2xl font-bold tabular-nums">
                <CountUp value={inactiveCount} />
              </p>
            </Link>
            <Link
              href="/admin/productos?status=archived"
              className="rounded-xl bg-slate-100/80 p-3 ring-1 ring-slate-200/80 transition-all hover:bg-slate-200/70"
            >
              <p className="text-[11px] font-semibold tracking-wide text-slate-600 uppercase">
                En papelera
              </p>
              <p className="font-display mt-0.5 text-2xl font-bold text-slate-800 tabular-nums">
                <CountUp value={archivedCount} />
              </p>
            </Link>
          </div>

          <AdminSegmentedBar
            ariaLabel="Distribución global del catálogo de productos"
            items={[
              {
                key: "active",
                label: "Activos estándar",
                count: activeRegularCount,
                tone: "emerald",
                href: "/admin/productos?status=active",
              },
              {
                key: "featured",
                label: "Destacados",
                count: featuredCount,
                tone: "amber",
                href: "/admin/productos?status=featured",
              },
              {
                key: "inactive",
                label: "Pausados",
                count: inactiveCount,
                tone: "purple",
                href: "/admin/productos?status=inactive",
              },
              {
                key: "archived",
                label: "Archivados",
                count: archivedCount,
                tone: "slate",
                href: "/admin/productos?status=archived",
              },
            ]}
          />
        </AdminCard>

        {justCreated && <AdminNotice tone="success">Producto creado correctamente.</AdminNotice>}
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

        {/* Toolbar: búsqueda + categoría + estado + ordenamiento (form GET) */}
        <form
          method="GET"
          className="border-brand-purple/10 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-12"
        >
          <div className="sm:col-span-4">
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
          <div className="sm:col-span-4">
            <label
              htmlFor="f-categoria"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Categoría
            </label>
            <select
              id="f-categoria"
              name="categoria"
              defaultValue={categoryId ?? ""}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2.5 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.isSub ? `↳ ${c.name}` : c.name}
                </option>
              ))}
            </select>
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
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2.5 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="all">Todos los vivos (activos + pausados)</option>
              <option value="active">Solo activos (visibles en tienda)</option>
              <option value="inactive">Solo pausados (ocultos)</option>
              <option value="featured">Solo destacados</option>
              <option value="archived">Solo archivados (papelera)</option>
            </select>
          </div>
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
              <option value="sku-asc">Código A-Z</option>
              <option value="sku-desc">Código Z-A</option>
              <option value="category-asc">Categoría A-Z</option>
              <option value="category-desc">Categoría Z-A</option>
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
                className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold"
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
                  preserve={preserveParams}
                />
                <SortableHeader
                  label="Código"
                  ascValue="sku-asc"
                  descValue="sku-desc"
                  currentSort={sort}
                  basePath="/admin/productos"
                  preserve={preserveParams}
                />
                <SortableHeader
                  label="Categoría"
                  ascValue="category-asc"
                  descValue="category-desc"
                  currentSort={sort}
                  basePath="/admin/productos"
                  preserve={preserveParams}
                />
                <SortableHeader
                  label="Precio"
                  ascValue="price-asc"
                  descValue="price-desc"
                  currentSort={sort}
                  basePath="/admin/productos"
                  preserve={preserveParams}
                  align="right"
                />
                <th className="px-4 py-3 text-center font-semibold">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((p) => {
                const visibility = getStorefrontVisibility({
                  productIsActive: p.isActive,
                  productDeletedAt: p.deletedAt,
                  categoryIsActive: p.categoryIsActive,
                  categoryDeletedAt: p.categoryDeletedAt,
                  activeVariantCount: p.activeVariantCount,
                  inStockAny: p.inStockAny,
                });
                return (
                  <AdminTableRow key={p.id}>
                    {showBulkColumn && (
                      <td className="w-10 px-3 py-3 align-middle">
                        {p.deletedAt === null && (
                          <input
                            type="checkbox"
                            name="productIds"
                            value={p.id}
                            aria-label={`Seleccionar ${p.name}`}
                            className="text-brand-purple focus:ring-brand-purple/40 border-brand-purple/30 h-4 w-4 cursor-pointer rounded"
                          />
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/admin/productos/${p.id}`}
                          className="text-brand-purple-dark hover:text-brand-purple font-medium hover:underline"
                        >
                          {p.name}
                        </Link>
                        {visibility.status !== "no-visible" && (
                          <Hint content={`Ver /producto/${p.slug} en tienda`}>
                            <Link
                              href={`/producto/${p.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand-muted hover:text-brand-purple inline-flex"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </Hint>
                        )}
                      </div>
                      <div className="text-brand-muted text-xs">/producto/{p.slug}</div>
                    </td>
                    <td className="text-brand-purple-dark/75 px-4 py-3 font-mono text-xs">
                      {p.sku}
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3">
                      <Link
                        href={`/admin/productos?categoria=${p.category.id}`}
                        className="hover:text-brand-purple hover:underline"
                      >
                        {p.category.name}
                      </Link>
                    </td>
                    <td className="text-brand-purple-dark px-4 py-3 text-right font-semibold tabular-nums">
                      {p.variantsCount > 1 && (
                        <span className="text-brand-muted mr-1 text-[10px] font-normal">desde</span>
                      )}
                      {formatCOP(p.priceFrom)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <ProductStatus
                          isActive={p.isActive}
                          isFeatured={p.isFeatured}
                          isArchived={p.deletedAt !== null}
                        />
                        <StorefrontVisibilityChip
                          visibility={visibility}
                          showReason={visibility.status === "no-visible"}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <ProductQuickActions
                          productId={p.id}
                          productName={p.name}
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
                );
              })}
            </AdminTableBody>
          </AdminTable>
        )}

        {totalPages > 1 && (
          <nav
            aria-label="Paginación"
            className="text-brand-purple-dark/70 flex flex-wrap items-center justify-between gap-3 text-sm"
          >
            <span>
              {total} productos · página {page} de {totalPages}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <PaginationLink
                page={1}
                q={q}
                categoryId={categoryId}
                status={status}
                sort={sort}
                disabled={page === 1}
                title="Primera página"
              >
                « Primera
              </PaginationLink>
              <PaginationLink
                page={page - 1}
                q={q}
                categoryId={categoryId}
                status={status}
                sort={sort}
                disabled={page === 1}
              >
                ← Anterior
              </PaginationLink>

              <form method="GET" action="/admin/productos" className="flex items-center gap-1">
                {q && <input type="hidden" name="q" value={q} />}
                {categoryId && <input type="hidden" name="categoria" value={categoryId} />}
                {status !== "all" && <input type="hidden" name="status" value={status} />}
                {sort !== "recent" && <input type="hidden" name="sort" value={sort} />}
                <label htmlFor="goto-page" className="text-xs">
                  Ir a
                </label>
                <input
                  id="goto-page"
                  type="number"
                  name="page"
                  min={1}
                  max={totalPages}
                  defaultValue={page}
                  aria-label="Número de página"
                  className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 h-8 w-14 rounded-md border bg-white px-2 text-center text-xs tabular-nums focus:ring-2 focus:outline-none"
                />
                <button
                  type="submit"
                  className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 h-8 rounded-md border bg-white px-2.5 text-xs font-semibold"
                >
                  Ir
                </button>
              </form>

              <PaginationLink
                page={page + 1}
                q={q}
                categoryId={categoryId}
                status={status}
                sort={sort}
                disabled={page === totalPages}
              >
                Siguiente →
              </PaginationLink>
              <PaginationLink
                page={totalPages}
                q={q}
                categoryId={categoryId}
                status={status}
                sort={sort}
                disabled={page === totalPages}
                title="Última página"
              >
                Última »
              </PaginationLink>
            </div>
          </nav>
        )}
      </AdminPageBody>

      <BulkActionBar />
    </AdminPage>
  );
}

function PaginationLink({
  page,
  q,
  categoryId,
  status,
  sort,
  disabled,
  title,
  children,
}: {
  page: number;
  q?: string;
  categoryId?: string;
  status?: string;
  sort?: string;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className="border-brand-purple/10 text-brand-purple-dark/30 cursor-not-allowed rounded-md border bg-white px-3 py-1.5 text-xs font-medium"
      >
        {children}
      </span>
    );
  }
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (q) params.set("q", q);
  if (categoryId) params.set("categoria", categoryId);
  if (status && status !== "all") params.set("status", status);
  if (sort && sort !== "recent") params.set("sort", sort);
  return (
    <Hint content={title}>
      <Link
        href={`/admin/productos?${params.toString()}`}
        className="border-brand-purple/20 hover:bg-brand-purple/5 text-brand-purple-dark rounded-md border bg-white px-3 py-1.5 text-xs font-medium"
      >
        {children}
      </Link>
    </Hint>
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
  if (isArchived) return <AdminBadge tone="rose">Archivado</AdminBadge>;
  if (!isActive) return <AdminBadge tone="slate">Inactivo</AdminBadge>;
  if (isFeatured) return <AdminBadge tone="amber">Destacado</AdminBadge>;
  return <AdminBadge tone="emerald">Activo</AdminBadge>;
}

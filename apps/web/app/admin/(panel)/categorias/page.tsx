/*
 * Admin > Categorías — Listado + búsqueda + filtros + crear inline.
 *
 * Filtros (query params, server-side):
 *   - q: búsqueda en name/slug
 *   - status: all | active | inactive
 *   - sort: order | name | recent
 *
 * Estado/Toggle: el badge "Activa/Inactiva" ES el toggle (clickeable
 * directamente). Sin botón Eye/EyeOff separado — UX más clara.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  CornerDownRight,
  Edit3,
  Layers,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
  AdminEmpty,
  AdminCard,
  AdminNotice,
  SortableHeader,
} from "@/components/admin-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import { listCategories, listParentCategoryOptions } from "@/features/categories/service";
import { getCurrentAdmin } from "@/lib/auth";
import { CategoryForm } from "./category-form";
import {
  deleteCategoryAction,
  moveCategoryAction,
  restoreCategoryAction,
  toggleCategoryActiveAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Categorías",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

export default async function AdminCategoriasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const q = pickString(sp, "q");
  const statusRaw = pickString(sp, "status");
  // Ola 3 (Lucy 2026-07-27): default "active" para no desbordar al admin con categorías de
  // prueba/inactivas al abrir el listado. Los tests crean muchas categorías basura; el admin las
  // puede ver cambiando el filtro.
  const status: "all" | "active" | "inactive" | "archived" = (
    ["active", "inactive", "archived"].includes(statusRaw ?? "") ? statusRaw : "active"
  ) as "all" | "active" | "inactive" | "archived";
  const sortRaw = pickString(sp, "sort");
  const sort = (["name", "recent"].includes(sortRaw ?? "") ? sortRaw : "order") as
    | "order"
    | "name"
    | "recent";

  const [categories, parentOptions] = await Promise.all([
    listCategories({ q, status, sort }),
    listParentCategoryOptions(),
  ]);

  // D2/D3: organizamos en árbol (madre → sub-categorías indentadas). Las flechas
  // ↑/↓ solo tienen sentido en "orden manual" sin búsqueda; en otros modos
  // mostramos plano. orphan = sub-categoría cuya madre quedó fuera del filtro.
  const isManualOrder = sort === "order" && !q;
  const childrenByParent = new Map<string, typeof categories>();
  for (const c of categories) {
    if (c.parentId) {
      const arr = childrenByParent.get(c.parentId) ?? [];
      arr.push(c);
      childrenByParent.set(c.parentId, arr);
    }
  }
  type Row = { cat: (typeof categories)[number]; depth: number; first: boolean; last: boolean };
  const displayRows: Row[] = [];
  const pushGroup = (group: typeof categories, depth: number) => {
    group.forEach((cat, i) => {
      displayRows.push({ cat, depth, first: i === 0, last: i === group.length - 1 });
      const kids = childrenByParent.get(cat.id);
      if (kids && kids.length > 0) pushGroup(kids, depth + 1);
    });
  };
  const topLevel = categories.filter((c) => !c.parentId);
  pushGroup(topLevel, 0);
  // Sub-categorías huérfanas (madre filtrada): las agregamos planas al final.
  const shownIds = new Set(displayRows.map((r) => r.cat.id));
  const orphans = categories.filter((c) => !shownIds.has(c.id));
  orphans.forEach((cat, i) =>
    displayRows.push({ cat, depth: 0, first: i === 0, last: i === orphans.length - 1 }),
  );

  const justCreated = sp.created === "1";
  const justDeleted = sp.deleted === "1";
  const errorMsg = typeof sp.error === "string" ? sp.error : null;
  const hasActiveFilters = !!q || status !== "active" || sort !== "order";

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Layers className="h-5 w-5" />}
        title="Categorías"
        subtitle={
          <>
            {categories.length} {categories.length === 1 ? "categoría" : "categorías"}
            {hasActiveFilters && " · con filtros aplicados"}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Catálogo" },
          { label: "Categorías" },
        ]}
      />

      <AdminPageBody>
        {justCreated && <AdminNotice tone="success">Categoría creada correctamente.</AdminNotice>}
        {justDeleted && <AdminNotice tone="warning">Categoría archivada.</AdminNotice>}
        {sp.restored === "1" && (
          <AdminNotice tone="success">
            Categoría restaurada. Queda pausada — clic en el chip de estado para mostrarla en tu
            tienda.
          </AdminNotice>
        )}
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
              <option value="all">Todas (activas + inactivas + archivadas)</option>
              <option value="active">Solo activas (visibles en tienda)</option>
              <option value="inactive">Solo inactivas (ocultas, recuperables)</option>
              <option value="archived">Solo archivadas (papelera)</option>
            </select>
          </div>
          {/* Desktop: clic en "Orden" (vuelve al manual con flechas) o "Nombre".
              Dropdown solo mobile. Lucy 2026-06-27 #1. */}
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
                href="/admin/categorias"
                className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold"
              >
                Limpiar filtros
              </Link>
            </div>
          )}
        </form>

        {categories.length === 0 ? (
          <AdminEmpty
            icon={<Layers className="h-5 w-5" />}
            title={hasActiveFilters ? "Sin resultados" : "Todavía no hay categorías"}
            description={
              hasActiveFilters
                ? "Prueba quitar algún filtro o cambiar el texto de búsqueda."
                : "Crea la primera abajo para empezar a categorizar productos."
            }
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <SortableHeader
                  label="Orden"
                  ascValue="order"
                  currentSort={sort}
                  basePath="/admin/categorias"
                  preserve={{ q, status: status !== "all" ? status : undefined }}
                />
                <SortableHeader
                  label="Nombre"
                  ascValue="name"
                  currentSort={sort}
                  basePath="/admin/categorias"
                  preserve={{ q, status: status !== "all" ? status : undefined }}
                />
                <th className="px-4 py-3 text-left font-semibold">Slug</th>
                <th className="px-4 py-3 text-center font-semibold">Productos</th>
                <th className="px-4 py-3 text-center font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {displayRows.map(({ cat: c, depth, first, last }) => (
                <AdminTableRow key={c.id}>
                  <td className="px-4 py-3">
                    {/* D3: flechas ↑/↓ en lugar del número de orden manual.
                        Solo activas en "orden manual" sin búsqueda. */}
                    {isManualOrder && !c.deletedAt ? (
                      <div className="flex items-center gap-0.5">
                        <ReorderButton id={c.id} direction="up" disabled={first} />
                        <ReorderButton id={c.id} direction="down" disabled={last} />
                      </div>
                    ) : (
                      <span className="text-brand-purple-dark/35 text-xs tabular-nums">
                        {c.order}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div
                      className="text-brand-purple-dark flex items-center gap-1.5 font-medium"
                      style={depth > 0 ? { paddingLeft: `${depth * 1.25}rem` } : undefined}
                    >
                      {depth > 0 && (
                        <CornerDownRight className="text-brand-purple-dark/35 h-3.5 w-3.5 shrink-0" />
                      )}
                      {c.name}
                      {c._count.children > 0 && (
                        <span className="bg-brand-purple/10 text-brand-purple-dark/70 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                          {c._count.children} sub
                        </span>
                      )}
                    </div>
                    {c.description && (
                      <div
                        className="text-brand-muted line-clamp-1 text-xs"
                        style={depth > 0 ? { paddingLeft: `${depth * 1.25 + 1.25}rem` } : undefined}
                      >
                        {c.description}
                      </div>
                    )}
                  </td>
                  <td className="text-brand-purple-dark/75 px-4 py-3 font-mono text-xs">
                    /{c.slug}
                  </td>
                  <td className="text-brand-purple-dark/85 px-4 py-3 text-center tabular-nums">
                    {c._count.products}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {/* 3 estados: archivada / inactiva / activa. Si archivada,
                        el badge muestra rose y NO permite toggle (primero restaurar). */}
                    {c.deletedAt ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />
                        Archivada
                      </span>
                    ) : (
                      <form action={toggleCategoryActiveAction} className="inline">
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="next" value={c.isActive ? "false" : "true"} />
                        <PendingSubmitButton
                          spinnerClass="h-3 w-3"
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all hover:shadow-sm ${
                            c.isActive
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                              : "bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200"
                          }`}
                          title={
                            c.isActive
                              ? "Clic para pausar (ocultar de tu tienda)"
                              : "Clic para activar (mostrar en tu tienda)"
                          }
                          idleIcon={
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${c.isActive ? "bg-emerald-500" : "bg-slate-400"}`}
                              aria-hidden
                            />
                          }
                        >
                          {c.isActive ? "Activa" : "Inactiva"}
                        </PendingSubmitButton>
                      </form>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {c.deletedAt ? (
                        <form action={restoreCategoryAction} className="inline">
                          <input type="hidden" name="id" value={c.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-2 text-amber-700 hover:bg-amber-50"
                            title="Restaurar de papelera (quedará inactiva)"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Restaurar
                          </Button>
                        </form>
                      ) : (
                        <>
                          <Link
                            href={`/admin/categorias/${c.id}`}
                            className="text-brand-purple hover:bg-brand-purple/10 inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium"
                            title="Editar"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            Editar
                          </Link>
                          <ConfirmAction
                            action={deleteCategoryAction}
                            message={`¿Archivar la categoría "${c.name}"? Quedará oculta de tu tienda.`}
                            className="inline"
                          >
                            <input type="hidden" name="id" value={c.id} />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-rose-600 hover:bg-rose-50"
                              aria-label={`Archivar ${c.name}`}
                              disabled={c._count.products > 0}
                              title={
                                c._count.products > 0
                                  ? "Tiene productos asociados — moverlos primero"
                                  : "Archivar"
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
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

        <AdminCard className="p-5">
          <div className="mb-3">
            <h3 className="text-brand-purple-dark font-display text-base font-bold">
              Crear nueva categoría
            </h3>
            <p className="text-brand-muted mt-0.5 text-sm">
              Las categorías agrupan productos por tipo (ej. Magnéticos foto, Personalizados marca,
              Decorativos, Pack).
            </p>
          </div>
          <CategoryForm parentOptions={parentOptions} />
        </AdminCard>
      </AdminPageBody>
    </AdminPage>
  );
}

/** Botón ↑/↓ que reordena una categoría dentro de su grupo (D3). */
function ReorderButton({
  id,
  direction,
  disabled,
}: {
  id: string;
  direction: "up" | "down";
  disabled: boolean;
}) {
  const Icon = direction === "up" ? ArrowUp : ArrowDown;
  const cls =
    "text-brand-muted hover:bg-brand-purple/10 hover:text-brand-purple-dark inline-flex h-7 w-7 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-25";
  // En el borde (no se puede mover más), botón inerte deshabilitado.
  if (disabled) {
    return (
      <button
        type="button"
        disabled
        aria-label={direction === "up" ? "Subir" : "Bajar"}
        className={cls}
      >
        <Icon className="h-3.5 w-3.5" />
      </button>
    );
  }
  return (
    <form action={moveCategoryAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="direction" value={direction} />
      <PendingSubmitButton
        ariaLabel={direction === "up" ? "Subir" : "Bajar"}
        title={direction === "up" ? "Subir en el orden" : "Bajar en el orden"}
        className={cls}
        idleIcon={<Icon className="h-3.5 w-3.5" />}
      />
    </form>
  );
}

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
import {
  ArrowRightLeft,
  BookOpen,
  ExternalLink,
  FolderTree,
  Lock,
  Package,
  Plus,
} from "lucide-react";
import {
  AdminBadge,
  AdminCard,
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
  QuickLink,
} from "@/components/admin-page";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canAccessAdminPath } from "@/lib/admin-rbac";
import { requireCapability } from "@/lib/admin-rbac-guard";
import { getRedirectsSummary, listRedirects } from "@/features/redirects/service";
import {
  archiveRedirectAction,
  restoreRedirectAction,
  toggleRedirectActiveAction,
} from "./actions";
import { CreateRedirectForm } from "./create-redirect-form";
import { EditRedirectForm } from "./edit-redirect-form";
import { formatDateCO } from "@/lib/datetime";

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
  const session = await requireCapability("cms:write");
  const role = session.admin.role;
  const canUseExternalUrls = role === "SUPERADMIN";

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

  const [{ items, total, totalPages }, summary] = await Promise.all([
    listRedirects({ q, status, sort, page }),
    getRedirectsSummary(),
  ]);
  const hasActiveFilters = !!q || status !== "active" || sort !== "recent";
  const maxPageHits = Math.max(1, ...items.map((r) => r.hitCount));

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<ArrowRightLeft className="h-5 w-5" />}
        title="Redirecciones SEO (301 / 302)"
        subtitle={
          <>
            {total} {total === 1 ? "redirección" : "redirecciones"} en la vista actual
            {hasActiveFilters && " · con filtros aplicados"}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Configuración" },
          { label: "Redirects" },
        ]}
      />

      <AdminPageBody>
        <AdminNotice tone="info">
          <strong>¿Para qué sirve?</strong> Si renombras una URL (categoría, página editorial o link
          compartido en redes), crea un redirect <strong>301 permanente</strong> para conservar
          visitas y posicionamiento en Google. Usa <strong>302</strong> únicamente en campañas o
          desvíos temporales. El sistema bloquea automáticamente cadenas dobles y rutas críticas de
          la tienda.
        </AdminNotice>

        <AdminNotice tone="info">
          <strong>Importante:</strong> los redirects de slugs de productos consolidados (ej.{" "}
          <code>set-6-fotoimanes-polaroid-grande</code>) se administran desde código (
          <code>lib/product-redirects.ts</code>) y se regeneran con{" "}
          <code>make consolidate-product-families</code>. Al renombrar el slug de un producto,
          categoría u ocasión desde el admin, el 301 se crea automáticamente.
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

        {/* KPIs ejecutivos y barra de composición SEO */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Redirects activos"
            value={summary.activeCount}
            trend="up"
            trendLabel={`${summary.permanent301Count} permanentes (301) · ${summary.temporary302Count} temp. (302)`}
          />
          <KpiCard
            label="Impactos acumulados"
            value={summary.totalHits}
            trend={summary.totalHits > 0 ? "up" : "neutral"}
            trendLabel={`${summary.withTrafficCount} rutas activas han desviado tráfico`}
          />
          <KpiCard
            label="Activos sin tráfico"
            value={summary.zeroHitsActiveCount}
            trend="neutral"
            trendLabel="Rutas con 0 visitas registradas aún"
          />
          <KpiCard
            label="Pausados / Archivados"
            value={summary.inactiveCount + summary.archivedCount}
            trend="neutral"
            trendLabel={`${summary.inactiveCount} desactivados · ${summary.archivedCount} archivados`}
          />
        </div>

        <AdminCard className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-brand-purple-dark font-display text-base font-bold">
                Composición de redirecciones y uso real
              </h2>
              <p className="text-brand-muted text-xs">
                Proporción entre redirecciones activas con tráfico, preventivas sin impactos y
                registros históricos.
              </p>
            </div>
            {summary.externalActiveCount > 0 && (
              <AdminBadge tone="purple">
                {summary.externalActiveCount} destino
                {summary.externalActiveCount === 1 ? "" : "s"} externo
                {summary.externalActiveCount === 1 ? "" : "s"} activo
                {summary.externalActiveCount === 1 ? "" : "s"}
              </AdminBadge>
            )}
          </div>
          <AdminSegmentedBar
            ariaLabel="Composición de redirecciones URL"
            items={[
              {
                key: "with-traffic",
                label: "Activos con tráfico",
                count: summary.withTrafficCount,
                tone: "emerald",
                href: "/admin/redirects?status=active&sort=hits",
              },
              {
                key: "zero-hits",
                label: "Activos sin impactos",
                count: summary.zeroHitsActiveCount,
                tone: "purple",
                href: "/admin/redirects?status=active",
              },
              {
                key: "inactive",
                label: "Desactivados",
                count: summary.inactiveCount,
                tone: "amber",
                href: "/admin/redirects?status=inactive",
              },
              {
                key: "archived",
                label: "Archivados",
                count: summary.archivedCount,
                tone: "slate",
                href: "/admin/redirects?status=archived",
              },
            ]}
          />
        </AdminCard>

        <AdminCard className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-brand-purple-dark font-display flex items-center gap-2 text-base font-bold">
              <Plus className="h-5 w-5" />
              Crear redirect
            </h2>
            {!canUseExternalUrls && (
              <AdminBadge tone="slate">
                <Lock className="mr-1 h-3 w-3" />
                Modo rutas internas (CMS Editor)
              </AdminBadge>
            )}
          </div>
          <CreateRedirectForm canUseExternalUrls={canUseExternalUrls} />
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
                className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold"
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
                ? "Prueba quitar algún filtro."
                : "Usa el formulario de arriba para crear el primero."
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
              {items.map((r) => {
                const isExternal = /^https?:\/\//i.test(r.toPath);
                const lockedForEditor = isExternal && !canUseExternalUrls;
                const hitPct =
                  r.hitCount > 0 ? Math.max(6, Math.round((r.hitCount / maxPageHits) * 100)) : 0;

                return (
                  <AdminTableRow key={r.id}>
                    <td className="px-4 py-3 align-top">
                      <code className="text-brand-purple-dark bg-brand-purple/5 rounded px-1.5 py-0.5 font-mono text-[11px]">
                        {r.fromPath}
                      </code>
                      {r.description && (
                        <p className="text-brand-muted mt-1 text-xs">{r.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <code className="text-brand-purple-dark/85 bg-brand-purple/5 rounded px-1.5 py-0.5 font-mono text-[11px] break-all">
                          {r.toPath}
                        </code>
                        {isExternal && (
                          <AdminBadge tone="blue">
                            Externo
                            <ExternalLink className="ml-1 h-2.5 w-2.5" />
                          </AdminBadge>
                        )}
                      </div>
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
                    <td className="text-brand-purple-dark/85 min-w-[120px] px-4 py-3 text-right align-top text-xs tabular-nums">
                      <div className="font-semibold">{r.hitCount.toLocaleString("es-CO")}</div>
                      <div className="mt-1 ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                        {hitPct > 0 && (
                          <div
                            className="admin-bar-grow-x bg-brand-purple h-full rounded-full"
                            style={{ width: `${hitPct}%` }}
                          />
                        )}
                      </div>
                      {r.lastHitAt && (
                        <div className="text-brand-muted mt-1 text-[10px]">
                          último {formatDateCO(r.lastHitAt)}
                        </div>
                      )}
                    </td>
                    <td className="text-brand-muted px-4 py-3 align-top text-xs">
                      {formatDateCO(r.createdAt)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {lockedForEditor ? (
                          <AdminBadge tone="slate">
                            <Lock className="mr-1 h-3 w-3" />
                            Solo Superadmin
                          </AdminBadge>
                        ) : r.isArchived ? (
                          <form action={restoreRedirectAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <button
                              type="submit"
                              className="text-brand-purple-dark hover:text-brand-purple text-[11px] font-medium"
                            >
                              Restaurar
                            </button>
                          </form>
                        ) : (
                          <>
                            {/* Edición inline: destino/tipo/descripción/activo.
                                El fromPath es inmutable (archivar + crear para eso). */}
                            <details className="w-full">
                              <summary className="text-brand-purple-dark hover:text-brand-purple cursor-pointer text-right text-[11px] font-medium select-none">
                                Editar
                              </summary>
                              <EditRedirectForm
                                id={r.id}
                                toPath={r.toPath}
                                statusCode={r.statusCode}
                                description={r.description}
                                isActive={r.isActive}
                                canUseExternalUrls={canUseExternalUrls}
                              />
                            </details>
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
                              message="¿Archivar este redirect? Dejará de aplicar. Puedes restaurarlo después."
                            >
                              <input type="hidden" name="id" value={r.id} />
                              <button
                                type="submit"
                                className="text-brand-muted text-[11px] font-medium hover:text-rose-600"
                              >
                                Archivar
                              </button>
                            </ConfirmAction>
                          </>
                        )}
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

        {/* Conexiones 360° respetando el rol del usuario */}
        <section>
          <h2 className="text-brand-purple-dark/70 mb-2.5 text-xs font-bold tracking-wider uppercase">
            Módulos relacionados
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <QuickLink
              href="/admin/contenido"
              icon={BookOpen}
              label="Páginas del sitio (CMS)"
              description="Edita textos, preguntas frecuentes y páginas legales hacia las que apuntan tus redirects."
            />
            {canAccessAdminPath(role, "/admin/productos") && (
              <QuickLink
                href="/admin/productos"
                icon={Package}
                label="Productos y slugs"
                description="Al renombrar el slug de un producto, su redirección 301 se genera sola."
              />
            )}
            {canAccessAdminPath(role, "/admin/categorias") && (
              <QuickLink
                href="/admin/categorias"
                icon={FolderTree}
                label="Categorías del catálogo"
                description="Gestiona las rutas de categorías que indexa Google en el sitemap."
              />
            )}
          </div>
        </section>
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

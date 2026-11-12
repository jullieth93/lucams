/*
 * Admin > Reseñas — reputación de tienda y moderación (Bloque 6).
 *
 * - Moderación (`catalog:write`: `SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`):
 *   aprueba para PDP, destaca en portada, archiva o restaura ( individual y por lotes).
 * - Lectura de reputación (`CUSTOMER_SUPPORT` · `support:manage` sin `catalog:write`):
 *   inspecciona calificaciones 1★–5★ y comentarios para seguimiento 360° en Pedidos,
 *   Contactos o Soporte, sin controles mutantes de publicación.
 * - Ley 1480: jamás se edita el contenido textual de la opinión del consumidor.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Award,
  Clock,
  ExternalLink,
  ImageIcon,
  LifeBuoy,
  Sparkles,
  Star,
  Users,
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
  OpsCard,
  SortableHeader,
} from "@/components/admin-page";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { BulkReviewBar, BulkSelectAllReviewsCheckbox } from "./bulk-review-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Hint } from "@/components/ui/tooltip";
import {
  ADMIN_ROLE_SETS,
  adminHomePath,
  canAccessAdminPath,
  hasCapability,
} from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import {
  getReviewFeaturedFlag,
  getReviewsExecutiveAnalytics,
  listReviewProductOptions,
  listReviewsAdmin,
} from "@/features/reviews/admin-service";
import {
  approveReviewAction,
  archiveReviewAction,
  rejectReviewAction,
  restoreReviewAction,
  toggleFeaturedReviewAction,
} from "./actions";
import { formatDateCO } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Reseñas",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

const STATUS_OPTIONS = ["pending", "approved", "featured", "archived", "all"] as const;
const SORT_OPTIONS = ["recent", "oldest", "rating-high", "rating-low"] as const;
const STATUS_LABEL: Record<(typeof STATUS_OPTIONS)[number], string> = {
  pending: "Pendientes",
  approved: "Aprobadas",
  featured: "Destacadas",
  archived: "Archivadas",
  all: "Todas",
};
const SORT_LABEL: Record<(typeof SORT_OPTIONS)[number], string> = {
  recent: "Más recientes",
  oldest: "Más antiguas",
  "rating-high": "Mejor calificadas",
  "rating-low": "Peor calificadas",
};

function buildResenasHref(opts: {
  status?: string;
  rating?: number;
  sort?: string;
  productId?: string;
  q?: string;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (opts.status && opts.status !== "pending") params.set("status", opts.status);
  if (opts.rating !== undefined) params.set("rating", String(opts.rating));
  if (opts.sort && opts.sort !== "recent") params.set("sort", opts.sort);
  if (opts.productId) params.set("productId", opts.productId);
  if (opts.q && opts.q.trim()) params.set("q", opts.q.trim());
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  const qs = params.toString();
  return qs ? `/admin/resenas?${qs}` : "/admin/resenas";
}

export default async function AdminResenasPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireRole(ADMIN_ROLE_SETS.RESENAS_READ);
  const role = session.admin.role;
  const canModerate = hasCapability(role, "catalog:write");

  const sp = await searchParams;
  const q = pickString(sp, "q");
  const statusRaw = pickString(sp, "status");
  const defaultStatus: (typeof STATUS_OPTIONS)[number] = canModerate ? "pending" : "all";
  const status = (STATUS_OPTIONS as readonly string[]).includes(statusRaw ?? "")
    ? (statusRaw as (typeof STATUS_OPTIONS)[number])
    : defaultStatus;
  const sortRaw = pickString(sp, "sort");
  const sort = (SORT_OPTIONS as readonly string[]).includes(sortRaw ?? "")
    ? (sortRaw as (typeof SORT_OPTIONS)[number])
    : "recent";
  const ratingRaw = pickString(sp, "rating");
  const rating = ratingRaw && /^[1-5]$/.test(ratingRaw) ? Number(ratingRaw) : undefined;
  const productIdRaw = pickString(sp, "productId");
  const productId = productIdRaw && /^c[a-z0-9]{24}$/.test(productIdRaw) ? productIdRaw : undefined;
  const page = Math.max(1, Number(pickString(sp, "page")) || 1);

  const approvedIdRaw = pickString(sp, "approvedId");
  const approvedId =
    approvedIdRaw && /^c[a-z0-9]{24}$/.test(approvedIdRaw) ? approvedIdRaw : undefined;
  const approvedSlug = pickString(sp, "slug");
  const approvedFeatured =
    canModerate && sp.approved === "1" && approvedId
      ? await getReviewFeaturedFlag(approvedId)
      : null;

  const [{ items, total, totalPages, pendingCount }, productOptions, analytics] = await Promise.all(
    [
      listReviewsAdmin({
        q,
        status,
        sort,
        rating,
        page,
        productId,
      }),
      listReviewProductOptions(),
      getReviewsExecutiveAnalytics(productId),
    ],
  );

  const canOpenProducts = canAccessAdminPath(role, "/admin/productos");
  const canOpenOrders = canAccessAdminPath(role, "/admin/pedidos");
  const canOpenContacts = canAccessAdminPath(role, "/admin/clientes");
  const canOpenSupport = canAccessAdminPath(role, "/admin/soporte");

  const hasActiveFilters =
    !!q ||
    status !== defaultStatus ||
    sort !== "recent" ||
    rating !== undefined ||
    productId !== undefined;

  const totalNonArchivedRatings = analytics.ratingDistribution.reduce((acc, r) => acc + r.count, 0);
  const maxStarBucket = Math.max(1, ...analytics.ratingDistribution.map((r) => r.count));
  const selectedProductName = productId
    ? (productOptions.find((p) => p.id === productId)?.name ?? items[0]?.productName ?? null)
    : null;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Star className="h-5 w-5" />}
        title="Reseñas y Reputación"
        subtitle={
          <>
            {total.toLocaleString("es-CO")} {total === 1 ? "reseña" : "reseñas"} en vista
            {pendingCount > 0 && (
              <>
                {" · "}
                <strong className="text-brand-purple-dark">
                  {pendingCount} pendiente{pendingCount === 1 ? "" : "s"} de moderar
                </strong>
              </>
            )}
            {selectedProductName && ` · filtrando «${selectedProductName}»`}
          </>
        }
        breadcrumbs={[{ label: "Admin", href: adminHomePath(role) }, { label: "Reseñas" }]}
      />

      <AdminPageBody>
        {canModerate ? (
          <AdminNotice tone="info">
            <strong>Moderación en dos pasos:</strong> al <strong>Aprobar</strong> publicas la reseña
            en la ficha del producto; si además quieres que rote en el carrusel de portada, pulsa{" "}
            <strong>★ Destacar</strong>. Nunca se edita el texto del cliente (Ley 1480); si no
            procede, usa <strong>Archivar</strong>.
          </AdminNotice>
        ) : (
          <AdminNotice tone="info">
            <strong>Vista de reputación para atención al cliente:</strong> consulta calificaciones
            1★–5★ y comentarios para dar seguimiento desde el pedido, Contacto 360 o Soporte. La
            publicación y destacado en tienda están reservados a gerencia y catálogo.
          </AdminNotice>
        )}

        {canModerate && sp.approved === "1" && (
          <AdminNotice tone="success">
            Reseña aprobada — ya aparece en la página del producto.{" "}
            {approvedId && approvedFeatured === false && (
              <>
                ¿Mostrarla también en la página principal?{" "}
                <form action={toggleFeaturedReviewAction} className="ml-1 inline">
                  <input type="hidden" name="id" value={approvedId} />
                  {approvedSlug && <input type="hidden" name="productSlug" value={approvedSlug} />}
                  <button type="submit" className="font-bold underline">
                    ★ Destacar en portada
                  </button>
                </form>
              </>
            )}
            {approvedFeatured === true && "Además ya está destacada en la portada."}
          </AdminNotice>
        )}
        {sp.rejected === "1" && (
          <AdminNotice tone="warning">Reseña devuelta a estado pendiente.</AdminNotice>
        )}
        {sp.bulkOk && <AdminNotice tone="success">{String(sp.bulkOk)}</AdminNotice>}
        {sp.bulkError && <AdminNotice tone="error">{String(sp.bulkError)}</AdminNotice>}
        {sp.featured === "1" && (
          <AdminNotice tone="success">
            Reseña destacada: además de la página del producto, ahora rota en la portada.
          </AdminNotice>
        )}
        {sp.unfeatured === "1" && (
          <AdminNotice tone="warning">Reseña retirada del carrusel de portada.</AdminNotice>
        )}
        {sp.archived === "1" && <AdminNotice tone="warning">Reseña archivada.</AdminNotice>}
        {sp.restored === "1" && <AdminNotice tone="success">Reseña restaurada.</AdminNotice>}
        {typeof sp.error === "string" && sp.error && (
          <AdminNotice tone="error">{sp.error}</AdminNotice>
        )}

        {/* KPIs ejecutivos */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <OpsCard
            href={buildResenasHref({ status: "pending", productId })}
            label="Pendientes de moderar"
            value={analytics.pendingCount}
            icon={Clock}
            tone="amber"
            urgent={canModerate && analytics.pendingCount > 0}
            description="Esperando visto bueno para publicar"
          />
          <OpsCard
            href={buildResenasHref({ status: "approved", productId })}
            label="Promedio publicado"
            value={
              analytics.approvedAverageRating !== null
                ? `${analytics.approvedAverageRating.toFixed(1)} ★`
                : "—"
            }
            icon={Award}
            tone="turquoise"
            description={`${analytics.approvedCount.toLocaleString("es-CO")} aprobadas en páginas de producto`}
          />
          <OpsCard
            href={buildResenasHref({ status: "featured", productId })}
            label="Destacadas en portada"
            value={analytics.featuredCount}
            icon={Sparkles}
            tone="purple"
            description="Visibles en el carrusel principal"
          />
          <OpsCard
            href={buildResenasHref({ status: "all", sort: "rating-low", productId })}
            label="Calificaciones 1★–2★"
            value={analytics.lowRatingActiveCount}
            icon={AlertTriangle}
            tone="coral"
            urgent={analytics.lowRatingActiveCount > 0}
            description="Clientes para seguimiento de soporte"
          />
        </div>

        {/* Analítica visual: Distribución 5★..1★ + Estado del moderador */}
        <div className="grid gap-4 lg:grid-cols-12">
          <AdminCard className="p-5 lg:col-span-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-brand-purple-dark font-display text-base font-semibold">
                  Distribución por estrellas
                </h2>
                <p className="text-brand-muted text-xs">
                  Sobre reseñas activas (no archivadas). Haz clic en una fila para filtrar.
                </p>
              </div>
              <span className="text-brand-muted text-xs tabular-nums">
                {totalNonArchivedRatings.toLocaleString("es-CO")} activas
              </span>
            </div>

            <ul className="space-y-2" aria-label="Distribución de reseñas de 5 a 1 estrellas">
              {analytics.ratingDistribution.map((bucket) => {
                const widthPct =
                  bucket.count > 0 ? Math.max(3, (bucket.count / maxStarBucket) * 100) : 0;
                const sharePct =
                  totalNonArchivedRatings > 0
                    ? Math.round((bucket.count / totalNonArchivedRatings) * 100)
                    : 0;
                const isSelected = rating === bucket.rating;
                const barColor =
                  bucket.rating >= 4 ? "#10B981" : bucket.rating === 3 ? "#F59E0B" : "#F43F5E";

                return (
                  <li key={bucket.rating}>
                    <Link
                      href={
                        isSelected
                          ? buildResenasHref({ status, sort, productId, q })
                          : buildResenasHref({
                              status: status === "archived" ? "all" : status,
                              rating: bucket.rating,
                              sort,
                              productId,
                              q,
                            })
                      }
                      className={`flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                        isSelected
                          ? "bg-brand-purple/10 ring-brand-purple/30 ring-1"
                          : "hover:bg-brand-purple/5"
                      }`}
                    >
                      <span className="inline-flex w-11 flex-shrink-0 items-center gap-1 font-bold text-amber-800 tabular-nums">
                        {bucket.rating}
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-hidden />
                      </span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200/75">
                        <div
                          className="admin-bar-grow-x h-full rounded-full"
                          style={{ width: `${widthPct}%`, backgroundColor: barColor }}
                        />
                      </div>
                      <span className="text-brand-purple-dark w-20 flex-shrink-0 text-right font-semibold tabular-nums">
                        {bucket.count.toLocaleString("es-CO")}{" "}
                        <span className="text-brand-muted font-normal">({sharePct}%)</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </AdminCard>

          <AdminCard className="p-5 lg:col-span-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-brand-purple-dark font-display text-base font-semibold">
                  Estado de publicación
                </h2>
                <p className="text-brand-muted text-xs">
                  Balance entre bandeja pendiente, reseñas visibles en tienda y archivo histórico.
                </p>
              </div>
              <span className="text-brand-muted text-xs tabular-nums">
                {analytics.allCount.toLocaleString("es-CO")} totales
              </span>
            </div>
            <AdminSegmentedBar
              ariaLabel="Distribución de reseñas por estado de moderación"
              items={[
                {
                  key: "pending",
                  label: "Pendientes",
                  count: analytics.pendingCount,
                  tone: "amber",
                  href: buildResenasHref({ status: "pending", productId }),
                },
                {
                  key: "approved-regular",
                  label: "Aprobadas (solo PDP)",
                  count: Math.max(0, analytics.approvedCount - analytics.featuredCount),
                  tone: "emerald",
                  href: buildResenasHref({ status: "approved", productId }),
                },
                {
                  key: "featured",
                  label: "Destacadas en portada",
                  count: analytics.featuredCount,
                  tone: "purple",
                  href: buildResenasHref({ status: "featured", productId }),
                },
                {
                  key: "archived",
                  label: "Archivadas",
                  count: analytics.archivedCount,
                  tone: "slate",
                  href: buildResenasHref({ status: "archived", productId }),
                },
              ]}
            />
            {productId && selectedProductName && (
              <div className="border-brand-purple/15 bg-brand-purple/5 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs">
                <span className="text-brand-purple-dark">
                  Métricas acotadas a <strong>{selectedProductName}</strong>
                </span>
                <div className="flex items-center gap-3">
                  {canOpenProducts && (
                    <Link
                      href={`/admin/productos/${productId}?section=resenas`}
                      className="text-brand-purple hover:text-brand-purple-dark font-semibold underline"
                    >
                      Abrir ficha de producto
                    </Link>
                  )}
                  <Link
                    href="/admin/resenas"
                    className="text-brand-muted hover:text-brand-purple-dark font-semibold underline"
                  >
                    Ver toda la tienda
                  </Link>
                </div>
              </div>
            )}
          </AdminCard>
        </div>

        {/* Barra de filtros */}
        <form
          method="GET"
          action="/admin/resenas"
          className="border-brand-purple/10 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-12"
        >
          <div className="sm:col-span-6">
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
              placeholder="Texto, ID (#…), nombre, correo, ciudad o producto…"
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
          </div>
          <div className="sm:col-span-6">
            <label
              htmlFor="f-product"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Producto
            </label>
            <select
              id="f-product"
              name="productId"
              defaultValue={productId ?? ""}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="">Todos los productos</option>
              {productOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-4">
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
              htmlFor="f-rating"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Estrellas
            </label>
            <select
              id="f-rating"
              name="rating"
              defaultValue={rating ? String(rating) : ""}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="">Todas</option>
              <option value="5">5 ★</option>
              <option value="4">4 ★</option>
              <option value="3">3 ★</option>
              <option value="2">2 ★</option>
              <option value="1">1 ★</option>
            </select>
          </div>
          <div className="sm:col-span-4">
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
                href="/admin/resenas"
                className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold underline"
              >
                Limpiar todos los filtros
              </Link>
            </div>
          )}
        </form>

        {items.length === 0 ? (
          <AdminEmpty
            icon={<Users className="h-5 w-5" />}
            title={
              hasActiveFilters
                ? "Sin resultados para este filtro"
                : status === "pending"
                  ? "No hay reseñas pendientes"
                  : "Aún no hay reseñas"
            }
            description={
              hasActiveFilters
                ? "Prueba limpiando los filtros o cambiando el término de búsqueda."
                : status === "pending"
                  ? "Cuando un cliente envíe una reseña aparecerá acá para moderar."
                  : "Las reseñas registradas aparecerán en este listado."
            }
          />
        ) : (
          <AdminTable minWidth={820}>
            <AdminTableHead>
              <tr>
                {canModerate && (
                  <th className="w-10 px-3 py-3 text-left">
                    <BulkSelectAllReviewsCheckbox />
                  </th>
                )}
                <th className="px-4 py-3 text-left font-semibold">Producto</th>
                <SortableHeader
                  label="Estrellas"
                  ascValue="rating-low"
                  descValue="rating-high"
                  currentSort={sort}
                  basePath="/admin/resenas"
                  align="center"
                  preserve={{
                    q,
                    status,
                    rating: rating ? String(rating) : undefined,
                    productId,
                  }}
                />
                <th className="px-4 py-3 text-left font-semibold">Opinión</th>
                <th className="px-4 py-3 text-left font-semibold">Cliente y contexto 360°</th>
                <th className="px-4 py-3 text-left font-semibold">Estado</th>
                <SortableHeader
                  label="Fecha"
                  ascValue="oldest"
                  descValue="recent"
                  currentSort={sort}
                  basePath="/admin/resenas"
                  preserve={{
                    q,
                    status,
                    rating: rating ? String(rating) : undefined,
                    productId,
                  }}
                />
                <th className="px-4 py-3 text-right font-semibold">
                  {canModerate ? "Moderación" : "Seguimiento"}
                </th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((r) => {
                const supportLookupQuery = r.orderNumber ?? r.customerEmail ?? r.authorName ?? "";
                return (
                  <AdminTableRow key={r.id}>
                    {canModerate && (
                      <td className="w-10 px-3 py-3 align-middle">
                        {!r.isArchived && (
                          <input
                            type="checkbox"
                            name="reviewIds"
                            value={r.id}
                            aria-label={`Seleccionar reseña de ${r.authorName ?? "cliente"}`}
                            className="text-brand-purple focus:ring-brand-purple/40 border-brand-purple/30 h-4 w-4 cursor-pointer rounded"
                          />
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-1">
                        <Link
                          href={`/producto/${r.productSlug}`}
                          className="text-brand-purple-dark hover:text-brand-purple inline-flex items-center gap-1 text-xs font-semibold"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {r.productName}
                          <ExternalLink className="h-3 w-3 flex-shrink-0" aria-hidden />
                        </Link>
                        {canOpenProducts && (
                          <Link
                            href={`/admin/productos/${r.productId}?section=resenas`}
                            className="text-brand-muted hover:text-brand-purple text-[11px] underline"
                          >
                            Ficha en catálogo
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center align-top">
                      <span
                        className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                          r.rating <= 2
                            ? "bg-rose-50 text-rose-800"
                            : r.rating === 3
                              ? "bg-amber-50 text-amber-800"
                              : "bg-amber-50/70 text-amber-900"
                        }`}
                      >
                        {r.rating}
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-hidden />
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-brand-purple-dark/90 max-w-sm text-xs leading-relaxed">
                        {r.comment}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <code className="bg-brand-purple/5 text-brand-purple-dark rounded px-1.5 py-0.5 font-mono text-[10px]">
                          #{r.id.slice(-8)}
                        </code>
                        {r.imagesCount > 0 && (
                          <span className="text-brand-muted inline-flex items-center gap-1 text-[11px]">
                            <ImageIcon className="h-3 w-3" aria-hidden />
                            {r.imagesCount} {r.imagesCount === 1 ? "foto" : "fotos"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 align-top text-xs">
                      <div className="font-medium">
                        {r.authorName ?? r.customerFullName ?? "Cliente"}
                      </div>
                      {r.authorCity && (
                        <div className="text-brand-muted text-[11px]">{r.authorCity}</div>
                      )}
                      {r.customerEmail && (
                        <div className="text-brand-muted truncate text-[11px]">
                          {r.customerEmail}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                        {r.orderNumber && canOpenOrders && (
                          <Link
                            href={`/admin/pedidos/${encodeURIComponent(r.orderNumber)}`}
                            className="text-brand-purple hover:text-brand-purple-dark font-medium underline"
                          >
                            {r.orderNumber}
                          </Link>
                        )}
                        {r.contactId && canOpenContacts && (
                          <Link
                            href={`/admin/clientes/${r.contactId}`}
                            className="text-brand-purple hover:text-brand-purple-dark font-medium underline"
                          >
                            Contacto 360
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col items-start gap-1">
                        {r.isArchived ? (
                          <AdminBadge tone="slate">Archivada</AdminBadge>
                        ) : r.isApproved ? (
                          <AdminBadge tone="emerald">Aprobada</AdminBadge>
                        ) : (
                          <AdminBadge tone="amber">Pendiente</AdminBadge>
                        )}
                        {r.featured && <AdminBadge tone="purple">★ Portada</AdminBadge>}
                      </div>
                    </td>
                    <td className="text-brand-muted px-4 py-3 align-top text-xs tabular-nums">
                      {formatDateCO(r.createdAt)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {r.rating <= 3 && canOpenSupport && supportLookupQuery && (
                          <Hint content="Buscar tickets o casos de este cliente en Soporte">
                            <Link
                              href={`/admin/soporte?view=all&q=${encodeURIComponent(supportLookupQuery)}`}
                              className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-[11px] font-semibold"
                            >
                              <LifeBuoy className="h-3 w-3" aria-hidden />
                              Soporte
                            </Link>
                          </Hint>
                        )}

                        {canModerate ? (
                          r.isArchived ? (
                            <form action={restoreReviewAction}>
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="productSlug" value={r.productSlug} />
                              <button
                                type="submit"
                                className="text-brand-purple-dark hover:text-brand-purple text-xs font-semibold underline"
                              >
                                Restaurar
                              </button>
                            </form>
                          ) : (
                            <>
                              {!r.isApproved && (
                                <form action={approveReviewAction}>
                                  <input type="hidden" name="id" value={r.id} />
                                  <input type="hidden" name="productSlug" value={r.productSlug} />
                                  <button
                                    type="submit"
                                    className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                                  >
                                    Aprobar
                                  </button>
                                </form>
                              )}
                              {r.isApproved && (
                                <form action={rejectReviewAction}>
                                  <input type="hidden" name="id" value={r.id} />
                                  <input type="hidden" name="productSlug" value={r.productSlug} />
                                  <button
                                    type="submit"
                                    className="rounded-md border border-amber-300 bg-amber-50/60 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                                  >
                                    Volver a pendiente
                                  </button>
                                </form>
                              )}
                              {r.isApproved && (
                                <form action={toggleFeaturedReviewAction}>
                                  <input type="hidden" name="id" value={r.id} />
                                  <input type="hidden" name="productSlug" value={r.productSlug} />
                                  <Hint
                                    content={
                                      r.featured
                                        ? "Quitar del carrusel de portada"
                                        : "Mostrar en el carrusel de portada"
                                    }
                                  >
                                    <button
                                      type="submit"
                                      className={
                                        r.featured
                                          ? "bg-brand-purple/10 text-brand-purple-dark hover:bg-brand-purple/20 rounded-md border border-purple-300 px-2 py-1 text-[11px] font-semibold"
                                          : "text-brand-purple hover:bg-brand-purple/10 rounded-md border border-purple-300 px-2 py-1 text-[11px] font-semibold"
                                      }
                                    >
                                      {r.featured ? "★ Destacada" : "Destacar"}
                                    </button>
                                  </Hint>
                                </form>
                              )}
                              <ConfirmAction
                                action={archiveReviewAction}
                                message="¿Archivar esta reseña? Dejará de aparecer en la página del producto y en portada. Puedes restaurarla después."
                              >
                                <input type="hidden" name="id" value={r.id} />
                                <input type="hidden" name="productSlug" value={r.productSlug} />
                                <button
                                  type="submit"
                                  className="text-brand-muted text-[11px] font-medium hover:text-rose-700"
                                >
                                  Archivar
                                </button>
                              </ConfirmAction>
                            </>
                          )
                        ) : (
                          !supportLookupQuery && (
                            <span className="text-brand-muted text-[11px]">Solo lectura</span>
                          )
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
            <span className="tabular-nums">
              {total.toLocaleString("es-CO")} reseñas · página {page} de {totalPages}
            </span>
            <div className="flex gap-1.5">
              {page > 1 && (
                <Link
                  href={buildResenasHref({
                    page: page - 1,
                    q,
                    status,
                    sort,
                    rating,
                    productId,
                  })}
                  className="border-brand-purple/20 hover:bg-brand-purple/5 text-brand-purple-dark rounded-md border bg-white px-3 py-1.5 text-xs font-medium"
                >
                  ← Anterior
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={buildResenasHref({
                    page: page + 1,
                    q,
                    status,
                    sort,
                    rating,
                    productId,
                  })}
                  className="border-brand-purple/20 hover:bg-brand-purple/5 text-brand-purple-dark rounded-md border bg-white px-3 py-1.5 text-xs font-medium"
                >
                  Siguiente →
                </Link>
              )}
            </div>
          </div>
        )}
      </AdminPageBody>

      {canModerate && <BulkReviewBar />}
    </AdminPage>
  );
}

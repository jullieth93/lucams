/*
 * Admin > Reseñas — moderación.
 *
 * Inbox de moderación: por defecto muestra pendientes (las que el
 * customer envió y aún no fueron aprobadas). Admin aprueba, rechaza,
 * marca como destacada (carousel home) o archiva.
 *
 * Ley 1480: NO se edita el contenido de la reseña. Si está mal, se
 * archiva y se pide al cliente reenviar.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, ImageIcon, Star, Users } from "lucide-react";
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
} from "@/components/admin-page";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { BulkReviewBar, BulkSelectAllReviewsCheckbox } from "./bulk-review-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrentAdmin } from "@/lib/auth";
import { listReviewsAdmin } from "@/features/reviews/admin-service";
import {
  approveReviewAction,
  archiveReviewAction,
  rejectReviewAction,
  restoreReviewAction,
  toggleFeaturedReviewAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Reseñas",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

const STATUS_OPTIONS = ["pending", "approved", "archived", "all"] as const;
const SORT_OPTIONS = ["recent", "oldest", "rating-high", "rating-low"] as const;
const STATUS_LABEL: Record<(typeof STATUS_OPTIONS)[number], string> = {
  pending: "Pendientes",
  approved: "Aprobadas",
  archived: "Archivadas",
  all: "Todas",
};
const SORT_LABEL: Record<(typeof SORT_OPTIONS)[number], string> = {
  recent: "Más recientes",
  oldest: "Más antiguas",
  "rating-high": "Mejor calificadas",
  "rating-low": "Peor calificadas",
};

export default async function AdminResenasPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const q = pickString(sp, "q");
  const statusRaw = pickString(sp, "status");
  const status = (STATUS_OPTIONS as readonly string[]).includes(statusRaw ?? "")
    ? (statusRaw as (typeof STATUS_OPTIONS)[number])
    : "pending";
  const sortRaw = pickString(sp, "sort");
  const sort = (SORT_OPTIONS as readonly string[]).includes(sortRaw ?? "")
    ? (sortRaw as (typeof SORT_OPTIONS)[number])
    : "recent";
  const ratingRaw = pickString(sp, "rating");
  const rating = ratingRaw && /^[1-5]$/.test(ratingRaw) ? Number(ratingRaw) : undefined;
  // #13 — filtro por producto (los enlaces del panel de producto pasan ?productId=). Product.id
  // es @default(cuid()) (schema.prisma) → cuid v1 = "c" + 24 alfanuméricos; validamos el formato
  // para descartar valores malformados (degradan a la bandeja global, no rompen la query).
  const productIdRaw = pickString(sp, "productId");
  const productId = productIdRaw && /^c[a-z0-9]{24}$/.test(productIdRaw) ? productIdRaw : undefined;
  const page = Number(sp.page) || 1;

  const { items, total, totalPages, pendingCount } = await listReviewsAdmin({
    q,
    status,
    sort,
    rating,
    page,
    productId,
  });
  const hasActiveFilters =
    !!q ||
    status !== "pending" ||
    sort !== "recent" ||
    rating !== undefined ||
    productId !== undefined;

  const dateFmt = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Star className="h-5 w-5" />}
        title="Reseñas"
        subtitle={
          <>
            {total} {total === 1 ? "reseña" : "reseñas"}
            {pendingCount > 0 && (
              <>
                {" · "}
                <strong className="text-brand-purple-dark">
                  {pendingCount} pendiente{pendingCount === 1 ? "" : "s"}
                </strong>
              </>
            )}
            {hasActiveFilters && " · con filtros aplicados"}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Ventas" },
          { label: "Reseñas" },
        ]}
      />

      <AdminPageBody>
        <AdminNotice tone="info">
          <strong>¿Cómo modera?</strong> Las reseñas llegan pendientes. Si te gustan, las{" "}
          <strong>apruebas</strong> y aparecen en la PDP del producto. Las mejores las{" "}
          <strong>destacas</strong> y rotan en la home. Si el contenido no sirve, las{" "}
          <strong>archivas</strong> (no se edita texto ajeno — Ley 1480).
        </AdminNotice>

        {sp.approved === "1" && <AdminNotice tone="success">Reseña aprobada.</AdminNotice>}
        {sp.rejected === "1" && (
          <AdminNotice tone="warning">Reseña marcada como pendiente.</AdminNotice>
        )}
        {sp.bulkOk && <AdminNotice tone="success">{String(sp.bulkOk)}</AdminNotice>}
        {sp.bulkError && <AdminNotice tone="error">{String(sp.bulkError)}</AdminNotice>}
        {sp.featured === "1" && (
          <AdminNotice tone="success">Reseña destacada en la home.</AdminNotice>
        )}
        {sp.unfeatured === "1" && (
          <AdminNotice tone="warning">Reseña quitada de destacadas.</AdminNotice>
        )}
        {sp.archived === "1" && <AdminNotice tone="warning">Reseña archivada.</AdminNotice>}
        {sp.restored === "1" && <AdminNotice tone="success">Reseña restaurada.</AdminNotice>}
        {typeof sp.error === "string" && <AdminNotice tone="error">{sp.error}</AdminNotice>}

        {/* Toolbar */}
        <form
          method="GET"
          className="border-brand-purple/10 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-12"
        >
          {/* #13 — preserva el filtro por producto al reenviar el form (método GET). */}
          {productId && <input type="hidden" name="productId" value={productId} />}
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
              placeholder="Texto, nombre, ciudad, producto…"
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
          <div className="sm:col-span-2">
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
          <div className="sm:col-span-2">
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
                className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold"
              >
                Limpiar filtros
              </Link>
            </div>
          )}
        </form>

        {/* #13 — contexto visible cuando se filtra por un producto (desde el panel del producto). */}
        {productId && (
          <p className="text-brand-purple-dark/80 text-xs">
            Filtrando reseñas de <strong>{items[0]?.productName ?? "este producto"}</strong>.{" "}
            <Link href="/admin/resenas" className="text-brand-purple font-semibold underline">
              Quitar filtro
            </Link>
          </p>
        )}

        {items.length === 0 ? (
          <AdminEmpty
            icon={<Users className="h-5 w-5" />}
            title={
              hasActiveFilters
                ? "Sin resultados"
                : status === "pending"
                  ? "No hay reseñas pendientes ✨"
                  : "Aún no hay reseñas"
            }
            description={
              hasActiveFilters
                ? "Prueba quitar algún filtro o cambiar el texto de búsqueda."
                : status === "pending"
                  ? "Cuando un cliente envíe una reseña aparecerá acá para moderar."
                  : "Las reseñas que apruebes aparecerán en este listado."
            }
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <th className="w-10 px-3 py-3 text-left">
                  <BulkSelectAllReviewsCheckbox />
                </th>
                <th className="px-4 py-3 text-left font-semibold">Producto</th>
                <th className="px-4 py-3 text-center font-semibold">Estrellas</th>
                <th className="px-4 py-3 text-left font-semibold">Reseña</th>
                <th className="px-4 py-3 text-left font-semibold">Autor</th>
                <th className="px-4 py-3 text-left font-semibold">Estado</th>
                <th className="px-4 py-3 text-left font-semibold">Fecha</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((r) => (
                <AdminTableRow key={r.id}>
                  <td className="w-10 px-3 py-3 align-middle">
                    {/* Bulk: solo permite seleccionar reseñas no archivadas. */}
                    {!r.isArchived && (
                      <input
                        type="checkbox"
                        name="reviewIds"
                        value={r.id}
                        aria-label={`Seleccionar reseña de ${r.authorName ?? "anónimo"}`}
                        className="text-brand-purple focus:ring-brand-purple/40 border-brand-purple/30 h-4 w-4 cursor-pointer rounded"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/producto/${r.productSlug}`}
                      className="text-brand-purple-dark hover:text-brand-purple inline-flex items-center gap-1 text-xs font-medium"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {r.productName}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-brand-yellow inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums">
                      {r.rating}
                      <Star className="h-3.5 w-3.5 fill-current" />
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-brand-purple-dark/85 line-clamp-2 max-w-xs text-xs">
                      {r.comment}
                    </p>
                    {r.imagesCount > 0 && (
                      <span className="text-brand-muted mt-1 inline-flex items-center gap-1 text-[10px]">
                        <ImageIcon className="h-3 w-3" />
                        {r.imagesCount} {r.imagesCount === 1 ? "foto" : "fotos"}
                      </span>
                    )}
                  </td>
                  <td className="text-brand-purple-dark/85 px-4 py-3 text-xs">
                    <div>{r.authorName ?? r.customerFullName ?? "—"}</div>
                    {r.authorCity && (
                      <div className="text-brand-muted text-[10px]">{r.authorCity}</div>
                    )}
                    {r.customerEmail && (
                      <div className="text-brand-muted text-[10px]">{r.customerEmail}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {r.isArchived ? (
                        <AdminBadge tone="slate">Archivada</AdminBadge>
                      ) : r.isApproved ? (
                        <AdminBadge tone="emerald">Aprobada</AdminBadge>
                      ) : (
                        <AdminBadge tone="amber">Pendiente</AdminBadge>
                      )}
                      {r.featured && <AdminBadge tone="purple">Destacada</AdminBadge>}
                    </div>
                  </td>
                  <td className="text-brand-muted px-4 py-3 text-xs">
                    {dateFmt.format(r.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {r.isArchived ? (
                        <form action={restoreReviewAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="productSlug" value={r.productSlug} />
                          <button
                            type="submit"
                            className="text-brand-purple-dark hover:text-brand-purple text-xs font-medium"
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
                                className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
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
                                className="text-brand-purple-dark/70 hover:text-brand-purple-dark rounded-md border border-amber-400 px-2 py-1 text-[11px] font-semibold"
                              >
                                Volver a pendiente
                              </button>
                            </form>
                          )}
                          {r.isApproved && (
                            <form action={toggleFeaturedReviewAction}>
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="productSlug" value={r.productSlug} />
                              <button
                                type="submit"
                                className={
                                  r.featured
                                    ? "text-brand-purple-dark hover:text-brand-purple rounded-md border border-purple-300 px-2 py-1 text-[11px] font-semibold"
                                    : "text-brand-purple hover:bg-brand-purple/10 rounded-md border border-purple-300 px-2 py-1 text-[11px] font-semibold"
                                }
                                title={
                                  r.featured
                                    ? "Quitar de carousel destacadas"
                                    : "Mostrar en carousel home"
                                }
                              >
                                {r.featured ? "★ Destacada" : "Destacar"}
                              </button>
                            </form>
                          )}
                          <ConfirmAction
                            action={archiveReviewAction}
                            message="¿Archivar esta reseña? Dejará de aparecer en la PDP y en home. Puedes restaurarla después."
                          >
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="productSlug" value={r.productSlug} />
                            <button
                              type="submit"
                              className="text-brand-muted text-[11px] font-medium hover:text-red-600"
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
              {total} reseñas · página {page} de {totalPages}
            </span>
            <div className="flex gap-1">
              {page > 1 && (
                <PaginationLink
                  page={page - 1}
                  q={q}
                  status={status}
                  sort={sort}
                  rating={rating}
                  productId={productId}
                >
                  ← Anterior
                </PaginationLink>
              )}
              {page < totalPages && (
                <PaginationLink
                  page={page + 1}
                  q={q}
                  status={status}
                  sort={sort}
                  rating={rating}
                  productId={productId}
                >
                  Siguiente →
                </PaginationLink>
              )}
            </div>
          </div>
        )}
      </AdminPageBody>

      {/* Sprint backlog Opción C: bar flotante bulk approve/archive. */}
      <BulkReviewBar />
    </AdminPage>
  );
}

function PaginationLink({
  page,
  q,
  status,
  sort,
  rating,
  productId,
  children,
}: {
  page: number;
  q?: string;
  status?: string;
  sort?: string;
  rating?: number;
  productId?: string;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (q) params.set("q", q);
  if (status && status !== "pending") params.set("status", status);
  if (sort && sort !== "recent") params.set("sort", sort);
  if (rating !== undefined) params.set("rating", String(rating));
  if (productId) params.set("productId", productId);
  return (
    <Link
      href={`/admin/resenas?${params.toString()}`}
      className="border-brand-purple/20 hover:bg-brand-purple/5 text-brand-purple-dark rounded-md border bg-white px-3 py-1.5 text-xs font-medium"
    >
      {children}
    </Link>
  );
}

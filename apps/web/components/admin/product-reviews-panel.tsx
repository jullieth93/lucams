/*
 * <ProductReviewsPanel> — listado contextual de reseñas de un producto.
 *
 * Lucy 2026-06-26 — Opción C Sprint 2: si Lucy está editando un producto y
 * quiere ver/moderar sus reseñas, antes tenía que ir a /admin/resenas y
 * filtrar por nombre del producto a mano. Ahora aparece como tab contextual
 * en /admin/productos/[id]?section=resenas.
 *
 * El módulo global /admin/resenas SIGUE existiendo para moderación batch
 * cross-product (pattern Shopify/Etsy).
 *
 * Sub-tabs (segmentos):
 *  - Pendientes (default) — las que necesitan visto bueno de Lucy
 *  - Aprobadas — historial de las publicadas
 *  - Archivadas — soft-deleted
 *
 * Acciones inline por reseña: Aprobar / Destacar / Archivar. Reusa server
 * actions de /admin/resenas/actions.ts (sin duplicación).
 */

import Link from "next/link";
import {
  Star,
  CheckCircle2,
  Archive,
  StarOff,
  RotateCcw,
  XCircle,
  MessageSquare,
} from "lucide-react";
import {
  AdminCard,
  AdminEmpty,
  AdminBadge,
} from "@/components/admin-page";
import { listReviewsAdmin } from "@/features/reviews/admin-service";
import {
  approveReviewAction,
  rejectReviewAction,
  toggleFeaturedReviewAction,
  archiveReviewAction,
} from "@/app/admin/(panel)/resenas/actions";

type ReviewSubTab = "pending" | "approved" | "archived";

const VALID_SUBTABS: ReviewSubTab[] = ["pending", "approved", "archived"];

export async function ProductReviewsPanel({
  productId,
  productSlug,
  searchParams,
}: {
  productId: string;
  productSlug: string;
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const subRaw = typeof searchParams.estado === "string" ? searchParams.estado : "pending";
  const subTab: ReviewSubTab = VALID_SUBTABS.includes(subRaw as ReviewSubTab)
    ? (subRaw as ReviewSubTab)
    : "pending";

  // Cargamos paralelo: lista filtrada + counts por sub-estado para badges.
  const [filtered, pendingTotal, approvedTotal, archivedTotal] = await Promise.all([
    listReviewsAdmin({ productId, status: subTab, pageSize: 50 }),
    listReviewsAdmin({ productId, status: "pending", pageSize: 1 }).then((r) => r.total),
    listReviewsAdmin({ productId, status: "approved", pageSize: 1 }).then((r) => r.total),
    listReviewsAdmin({ productId, status: "archived", pageSize: 1 }).then((r) => r.total),
  ]);

  const totalAllStatuses = pendingTotal + approvedTotal + archivedTotal;

  return (
    <section className="space-y-5">
      {/* Resumen rápido */}
      <AdminCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-brand-purple-dark flex items-center gap-2 text-base font-semibold">
              <MessageSquare className="h-5 w-5" />
              Reseñas de este producto
            </h2>
            <p className="text-brand-purple-dark/65 mt-0.5 text-xs">
              {totalAllStatuses === 0
                ? "Aún no hay reseñas para este producto."
                : `${totalAllStatuses} reseña${totalAllStatuses === 1 ? "" : "s"} en total · ${pendingTotal} pendiente${pendingTotal === 1 ? "" : "s"} de moderar`}
            </p>
          </div>
          <Link
            href={`/admin/resenas?productId=${productId}`}
            className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex h-9 items-center gap-1.5 rounded-md border bg-white px-3 text-xs font-semibold"
          >
            Ver todas en el moderador →
          </Link>
        </div>
      </AdminCard>

      {/* Sub-tabs por estado */}
      {totalAllStatuses > 0 && (
        <div
          role="tablist"
          aria-label="Estado de reseñas"
          className="flex gap-1 overflow-x-auto"
        >
          <SubTab
            label="Pendientes"
            count={pendingTotal}
            active={subTab === "pending"}
            tone="amber"
            href={`/admin/productos/${productId}?section=resenas&estado=pending`}
          />
          <SubTab
            label="Aprobadas"
            count={approvedTotal}
            active={subTab === "approved"}
            tone="emerald"
            href={`/admin/productos/${productId}?section=resenas&estado=approved`}
          />
          <SubTab
            label="Archivadas"
            count={archivedTotal}
            active={subTab === "archived"}
            tone="muted"
            href={`/admin/productos/${productId}?section=resenas&estado=archived`}
          />
        </div>
      )}

      {/* Listado */}
      {filtered.items.length === 0 ? (
        <AdminEmpty
          icon={<MessageSquare className="h-5 w-5" />}
          title={
            subTab === "pending"
              ? "Sin reseñas pendientes ✨"
              : subTab === "approved"
                ? "Aún no hay reseñas aprobadas"
                : "Sin reseñas archivadas"
          }
          description={
            subTab === "pending"
              ? "Cuando un cliente deje una nueva reseña, aparecerá aquí para tu visto bueno."
              : subTab === "approved"
                ? "Las reseñas que apruebes aparecerán en la página del producto."
                : "Las reseñas archivadas vivirán acá por si necesitas restaurarlas."
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.items.map((r) => (
            <ReviewCard
              key={r.id}
              review={r}
              productId={productId}
              productSlug={productSlug}
              showApproveActions={subTab === "pending"}
              showFeatureToggle={subTab === "approved"}
              // Hotfix P0-5: Archivar disponible TAMBIÉN en Pendientes
              // (caso real: spam o reseña inapropiada que no merece moderación
              // formal — Lucy quiere mandarla al archivo directo).
              showArchiveAction={subTab === "pending" || subTab === "approved"}
              showRestoreAction={subTab === "archived"}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────── */

function SubTab({
  label,
  count,
  active,
  tone,
  href,
}: {
  label: string;
  count: number;
  active: boolean;
  tone: "amber" | "emerald" | "muted";
  href: string;
}) {
  const base =
    "focus-visible:ring-brand-purple/50 inline-flex h-10 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none";
  const activeClass = (() => {
    if (active) return "bg-brand-purple text-white shadow-sm";
    return "text-brand-purple-dark/70 hover:bg-brand-purple/8 hover:text-brand-purple-dark";
  })();
  const badgeClass = (() => {
    if (active) return "bg-white/25 text-white";
    if (tone === "amber" && count > 0) return "bg-amber-100 text-amber-900";
    if (tone === "emerald" && count > 0) return "bg-emerald-100 text-emerald-900";
    return "bg-brand-purple/15 text-brand-purple-dark";
  })();

  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`${base} ${activeClass}`}>
      <span>{label}</span>
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${badgeClass}`}>
        {count}
      </span>
    </Link>
  );
}

function ReviewCard({
  review,
  productId,
  productSlug,
  showApproveActions,
  showFeatureToggle,
  showArchiveAction,
  showRestoreAction,
}: {
  review: {
    id: string;
    rating: number;
    comment: string;
    authorName: string | null;
    authorCity: string | null;
    featured: boolean;
    imagesCount: number;
    createdAt: Date;
  };
  productId: string;
  productSlug: string;
  showApproveActions: boolean;
  showFeatureToggle: boolean;
  showArchiveAction: boolean;
  showRestoreAction: boolean;
}) {
  const dateFmt = new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const author =
    review.authorName ?? "Cliente anónimo";
  const city = review.authorCity ? ` · ${review.authorCity}` : "";

  return (
    <AdminCard className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Stars rating={review.rating} />
            <span className="text-brand-purple-dark text-sm font-semibold">{author}</span>
            <span className="text-brand-purple-dark/55 text-xs">
              {city} · {dateFmt.format(review.createdAt)}
            </span>
            {review.featured && (
              <AdminBadge tone="amber">
                <Star className="mr-0.5 inline h-3 w-3 fill-current" />
                Destacada
              </AdminBadge>
            )}
            {review.imagesCount > 0 && (
              <span className="text-brand-purple-dark/55 text-xs">
                📷 {review.imagesCount} foto{review.imagesCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <p className="text-brand-purple-dark/85 mt-2 text-sm leading-relaxed">
            {review.comment}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {showApproveActions && (
            <>
              <form action={approveReviewAction}>
                <input type="hidden" name="id" value={review.id} />
                <input type="hidden" name="productSlug" value={productSlug} />
                <button
                  type="submit"
                  className="inline-flex h-9 items-center gap-1 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
                  title="Aprobar y publicar"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Aprobar
                </button>
              </form>
              <form action={rejectReviewAction}>
                <input type="hidden" name="id" value={review.id} />
                <input type="hidden" name="productSlug" value={productSlug} />
                <button
                  type="submit"
                  className="inline-flex h-9 items-center gap-1 rounded-md border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  title="Rechazar (no se publica)"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Rechazar
                </button>
              </form>
            </>
          )}
          {showFeatureToggle && (
            <form action={toggleFeaturedReviewAction}>
              <input type="hidden" name="id" value={review.id} />
              <input type="hidden" name="productSlug" value={productSlug} />
              <button
                type="submit"
                className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex h-9 items-center gap-1 rounded-md border bg-white px-3 text-xs font-semibold"
                title={review.featured ? "Quitar destacado" : "Destacar en home"}
              >
                {review.featured ? (
                  <>
                    <StarOff className="h-3.5 w-3.5" />
                    Quitar destacado
                  </>
                ) : (
                  <>
                    <Star className="h-3.5 w-3.5" />
                    Destacar
                  </>
                )}
              </button>
            </form>
          )}
          {showArchiveAction && (
            <form action={archiveReviewAction}>
              <input type="hidden" name="id" value={review.id} />
              <input type="hidden" name="productSlug" value={productSlug} />
              <button
                type="submit"
                className="inline-flex h-9 items-center gap-1 rounded-md border border-amber-200 bg-white px-3 text-xs font-semibold text-amber-900 hover:bg-amber-50"
                title="Archivar (no aparece en la tienda)"
              >
                <Archive className="h-3.5 w-3.5" />
                Archivar
              </button>
            </form>
          )}
          {showRestoreAction && (
            // Hotfix P0-6: el href ANTES era ?productId=${review.id} (id de
            // la reseña — bug que llevaba a un filtro vacío). Ahora usa el
            // productId real del producto, abriendo el listado global filtrado
            // a este producto donde Lucy puede restaurar.
            <Link
              href={`/admin/resenas?productId=${productId}`}
              className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex h-9 items-center gap-1 rounded-md border bg-white px-3 text-xs font-semibold"
              title="Ir al moderador global para restaurar"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar
            </Link>
          )}
        </div>
      </div>
    </AdminCard>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span
      aria-label={`${rating} de 5 estrellas`}
      className="inline-flex items-center gap-0.5"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-brand-purple-dark/25"}`}
        />
      ))}
    </span>
  );
}

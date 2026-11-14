/*
 * Service layer Reviews — admin moderación.
 *
 * Admin puede:
 *   - listar todas las reseñas (pendientes, aprobadas, archivadas)
 *   - aprobar / rechazar reseñas
 *   - marcar/desmarcar featured (las que van al carousel home)
 *   - archivar (soft-delete)
 *
 * No expone mutaciones del contenido de la reseña: si está mal el texto,
 * se archiva y se pide al cliente reenviar (Ley 1480: admin no edita
 * opiniones de consumidores).
 */

import "server-only";
import { prisma } from "@/lib/db";

const PAGE_SIZE = 20;

export type ReviewListOpts = {
  q?: string;
  /** "pending" (default) | "approved" | "featured" | "archived" | "all" */
  status?: "pending" | "approved" | "featured" | "archived" | "all";
  /** Filtrar por rating exacto: 1..5. */
  rating?: number;
  /** "recent" (default) | "oldest" | "rating-high" | "rating-low" */
  sort?: "recent" | "oldest" | "rating-high" | "rating-low";
  /**
   * Filtrar por producto específico — usado por tab "Reseñas" inline
   * en /admin/productos/[id]?section=resenas (Opción C Sprint 2).
   */
  productId?: string;
  page?: number;
  pageSize?: number;
};

export type ReviewListItem = {
  id: string;
  rating: number;
  comment: string;
  authorName: string | null;
  authorCity: string | null;
  isApproved: boolean;
  featured: boolean;
  isArchived: boolean;
  imagesCount: number;
  productId: string;
  productName: string;
  productSlug: string;
  customerId: string | null;
  customerEmail: string | null;
  customerFullName: string | null;
  contactId: string | null;
  orderNumber: string | null;
  createdAt: Date;
};

export type ReviewListResult = {
  items: ReviewListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  pendingCount: number;
};

function parseReviewTokenOrderNumber(createdBy: string | null | undefined): string | null {
  if (!createdBy || !createdBy.startsWith("review-token:")) return null;
  const raw = createdBy.slice("review-token:".length).trim();
  return raw.length > 0 ? raw : null;
}

export async function listReviewsAdmin(opts: ReviewListOpts = {}): Promise<ReviewListResult> {
  const q = opts.q?.trim();
  const qId = q?.replace(/^#/, "");
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? PAGE_SIZE;

  const orderBy = (() => {
    switch (opts.sort) {
      case "oldest":
        return [{ createdAt: "asc" as const }];
      case "rating-high":
        return [{ rating: "desc" as const }, { createdAt: "desc" as const }];
      case "rating-low":
        return [{ rating: "asc" as const }, { createdAt: "desc" as const }];
      case "recent":
      default:
        return [{ createdAt: "desc" as const }];
    }
  })();

  const statusFilter = (() => {
    switch (opts.status) {
      case "approved":
        return { isApproved: true, deletedAt: null };
      // "Destacadas" (Fase 3 · 3.5): las que rotan en la home — featured,
      // aprobadas y no archivadas (mismo criterio que listFeaturedReviews).
      case "featured":
        return { featured: true, isApproved: true, deletedAt: null };
      case "archived":
        return { deletedAt: { not: null } };
      case "all":
        return {};
      case "pending":
      default:
        return { isApproved: false, deletedAt: null };
    }
  })();

  const where = {
    ...statusFilter,
    ...(opts.rating ? { rating: opts.rating } : {}),
    ...(opts.productId ? { productId: opts.productId } : {}),
    ...(q
      ? {
          OR: [
            ...(qId ? [{ id: { contains: qId, mode: "insensitive" as const } }] : []),
            { comment: { contains: q, mode: "insensitive" as const } },
            { authorName: { contains: q, mode: "insensitive" as const } },
            { authorCity: { contains: q, mode: "insensitive" as const } },
            { product: { name: { contains: q, mode: "insensitive" as const } } },
            { customer: { email: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  // pendingCount: si filtramos por productId, contamos pendientes DE ESE producto.
  // Sin filtro, contamos pendientes globales (header del admin/resenas).
  const pendingWhere = opts.productId
    ? { isApproved: false, deletedAt: null, productId: opts.productId }
    : { isApproved: false, deletedAt: null };

  const [rawItems, total, pendingCount] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        rating: true,
        comment: true,
        authorName: true,
        authorCity: true,
        isApproved: true,
        featured: true,
        deletedAt: true,
        createdBy: true,
        images: true,
        createdAt: true,
        productId: true,
        product: { select: { name: true, slug: true } },
        customerId: true,
        customer: {
          select: { email: true, firstName: true, lastName: true, contactId: true },
        },
      },
    }),
    prisma.review.count({ where }),
    prisma.review.count({ where: pendingWhere }),
  ]);

  const guestOrderNumbers =
    rawItems.length > 0
      ? Array.from(
          new Set(
            rawItems
              .map((r) => parseReviewTokenOrderNumber(r.createdBy))
              .filter((n): n is string => Boolean(n)),
          ),
        )
      : [];

  const orderByNumber = new Map<string, { contactId: string | null; email: string }>();
  if (guestOrderNumbers.length > 0 && "order" in prisma && prisma.order) {
    const guestOrders = await prisma.order.findMany({
      where: { number: { in: guestOrderNumbers }, deletedAt: null },
      select: { number: true, contactId: true, email: true },
    });
    for (const o of guestOrders) {
      orderByNumber.set(o.number, { contactId: o.contactId, email: o.email });
    }
  }

  const items: ReviewListItem[] = rawItems.map((r) => {
    const orderNumber = parseReviewTokenOrderNumber(r.createdBy);
    const guestOrd = orderNumber ? orderByNumber.get(orderNumber) : undefined;
    return {
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      authorName: r.authorName,
      authorCity: r.authorCity,
      isApproved: r.isApproved,
      featured: r.featured,
      isArchived: !!r.deletedAt,
      imagesCount: r.images.length,
      productId: r.productId,
      productName: r.product.name,
      productSlug: r.product.slug,
      customerId: r.customerId,
      customerEmail: r.customer?.email ?? guestOrd?.email ?? null,
      customerFullName: r.customer
        ? [r.customer.firstName, r.customer.lastName].filter(Boolean).join(" ") || null
        : null,
      contactId: r.customer?.contactId ?? guestOrd?.contactId ?? null,
      orderNumber,
      createdAt: r.createdAt,
    };
  });

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    pendingCount,
  };
}

export type ReviewProductOption = { id: string; name: string; slug: string };

/**
 * Productos que tienen al menos una reseña no archivada (Fase 3 · 3.5) —
 * opciones del selector visible de producto en /admin/resenas. Orden
 * alfabético para escanear rápido.
 */
export async function listReviewProductOptions(): Promise<ReviewProductOption[]> {
  return prisma.product.findMany({
    where: { reviews: { some: { deletedAt: null } } },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Operaciones de moderación. Devuelven la reseña actualizada para que
 * la action layer pueda hacer revalidatePath con datos frescos.
 */

export async function approveReview(id: string, adminUserId: string) {
  return prisma.review.update({
    where: { id },
    data: { isApproved: true, updatedBy: adminUserId },
  });
}

/**
 * Featured flag de una reseña (2026-10-05) — lo consulta la página admin para el
 * notice post-aprobar: si ya está destacada lo dice, si no, muestra el CTA
 * "¿Mostrarla en la página principal? [Destacar]". null = reseña inexistente.
 */
export async function getReviewFeaturedFlag(id: string): Promise<boolean | null> {
  const r = await prisma.review.findUnique({ where: { id }, select: { featured: true } });
  return r?.featured ?? null;
}

export async function rejectReview(id: string, adminUserId: string) {
  // Rechazar = desaprobar (queda pending), no archivar — el admin puede
  // querer reaprobar después tras edición offline con el cliente.
  return prisma.review.update({
    where: { id },
    data: { isApproved: false, featured: false, updatedBy: adminUserId },
  });
}

export async function toggleFeaturedReview(id: string, adminUserId: string) {
  const current = await prisma.review.findUnique({
    where: { id },
    select: { featured: true, isApproved: true },
  });
  if (!current) throw new Error("Review not found");
  // Solo reseñas aprobadas pueden ser featured.
  if (!current.isApproved && !current.featured) {
    throw new Error("Solo reseñas aprobadas pueden marcarse como destacadas.");
  }
  return prisma.review.update({
    where: { id },
    data: { featured: !current.featured, updatedBy: adminUserId },
  });
}

export async function archiveReview(id: string, adminUserId: string) {
  return prisma.review.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedBy: adminUserId,
      featured: false,
      isApproved: false,
    },
  });
}

export async function restoreReview(id: string, adminUserId: string) {
  return prisma.review.update({
    where: { id },
    data: { deletedAt: null, deletedBy: null, updatedBy: adminUserId },
  });
}

/**
 * Bulk: aprueba N reseñas (pendientes → publicadas). Lucy 2026-06-26 — Opción
 * C backlog. Solo afecta reseñas no soft-deleted. Devuelve count.
 */
export async function bulkApproveReviews(
  ids: string[],
  adminUserId: string,
): Promise<{ count: number }> {
  if (ids.length === 0) return { count: 0 };
  const result = await prisma.review.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data: { isApproved: true, updatedBy: adminUserId },
  });
  return { count: result.count };
}

/**
 * Bulk: archiva N reseñas (las saca de la tienda). Reversible vía restore.
 */
export async function bulkArchiveReviews(
  ids: string[],
  adminUserId: string,
): Promise<{ count: number }> {
  if (ids.length === 0) return { count: 0 };
  const result = await prisma.review.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data: {
      deletedAt: new Date(),
      deletedBy: adminUserId,
      featured: false,
      isApproved: false,
    },
  });
  return { count: result.count };
}

/**
 * Devuelve los `slug` únicos de producto afectados por un lote de reseñas para revalidar sus PDPs.
 */
export async function listProductSlugsForReviewIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.review.findMany({
    where: { id: { in: ids } },
    select: { product: { select: { slug: true } } },
  });
  return Array.from(new Set(rows.map((r) => r.product.slug).filter(Boolean)));
}

export interface ReviewsExecutiveAnalytics {
  pendingCount: number;
  approvedCount: number;
  featuredCount: number;
  archivedCount: number;
  lowRatingActiveCount: number;
  allCount: number;
  approvedAverageRating: number | null;
  ratingDistribution: Array<{ rating: 5 | 4 | 3 | 2 | 1; count: number }>;
}

/**
 * Analítica ejecutiva de reputación (`Bloque 6` · `/admin/resenas`), opcionalmente acotada por `productId`.
 */
export async function getReviewsExecutiveAnalytics(
  productId?: string,
): Promise<ReviewsExecutiveAnalytics> {
  const prodFilter = productId ? { productId } : {};

  const [
    pendingCount,
    approvedCount,
    featuredCount,
    archivedCount,
    lowRatingActiveCount,
    byRating,
    approvedAgg,
  ] = await Promise.all([
    prisma.review.count({ where: { ...prodFilter, isApproved: false, deletedAt: null } }),
    prisma.review.count({ where: { ...prodFilter, isApproved: true, deletedAt: null } }),
    prisma.review.count({
      where: { ...prodFilter, featured: true, isApproved: true, deletedAt: null },
    }),
    prisma.review.count({ where: { ...prodFilter, deletedAt: { not: null } } }),
    prisma.review.count({
      where: { ...prodFilter, rating: { lte: 2 }, deletedAt: null },
    }),
    prisma.review.groupBy({
      by: ["rating"],
      where: { ...prodFilter, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.review.aggregate({
      where: { ...prodFilter, isApproved: true, deletedAt: null },
      _avg: { rating: true },
    }),
  ]);

  const map = new Map<number, number>();
  for (const r of byRating) {
    map.set(r.rating, r._count._all);
  }

  const ratingDistribution: Array<{ rating: 5 | 4 | 3 | 2 | 1; count: number }> = [
    { rating: 5, count: map.get(5) ?? 0 },
    { rating: 4, count: map.get(4) ?? 0 },
    { rating: 3, count: map.get(3) ?? 0 },
    { rating: 2, count: map.get(2) ?? 0 },
    { rating: 1, count: map.get(1) ?? 0 },
  ];

  const avgRaw = approvedAgg._avg.rating;
  const approvedAverageRating =
    typeof avgRaw === "number" && Number.isFinite(avgRaw) ? Math.round(avgRaw * 10) / 10 : null;

  return {
    pendingCount,
    approvedCount,
    featuredCount,
    archivedCount,
    lowRatingActiveCount,
    allCount: pendingCount + approvedCount + archivedCount,
    approvedAverageRating,
    ratingDistribution,
  };
}

const SAFE_REVIEW_RETURN_TO_RE =
  /^\/admin\/(?:resenas|productos\/c[a-z0-9]{24})(?:\?[a-z0-9_=&%-]*)?$/i;

/**
 * Sanitiza `returnTo` contra open-redirect y traversal antes de redirigir tras
 * moderar una reseña desde `/admin/resenas` o `/admin/productos/[id]`.
 */
export function sanitizeReviewReturnPath(raw: unknown): string {
  if (typeof raw !== "string") return "/admin/resenas";
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    trimmed.includes("..") ||
    /[\u0000-\u001F\u007F]/.test(trimmed)
  ) {
    return "/admin/resenas";
  }
  return SAFE_REVIEW_RETURN_TO_RE.test(trimmed) ? trimmed : "/admin/resenas";
}

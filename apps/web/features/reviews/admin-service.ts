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
  /** "pending" (default) | "approved" | "archived" | "all" */
  status?: "pending" | "approved" | "archived" | "all";
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

export async function listReviewsAdmin(opts: ReviewListOpts = {}): Promise<ReviewListResult> {
  const q = opts.q?.trim();
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
        images: true,
        createdAt: true,
        productId: true,
        product: { select: { name: true, slug: true } },
        customerId: true,
        customer: { select: { email: true, firstName: true, lastName: true } },
      },
    }),
    prisma.review.count({ where }),
    prisma.review.count({ where: pendingWhere }),
  ]);

  const items: ReviewListItem[] = rawItems.map((r) => ({
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
    customerEmail: r.customer?.email ?? null,
    customerFullName: r.customer
      ? [r.customer.firstName, r.customer.lastName].filter(Boolean).join(" ") || null
      : null,
    createdAt: r.createdAt,
  }));

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    pendingCount,
  };
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

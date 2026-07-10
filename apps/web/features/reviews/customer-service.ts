/*
 * Lectura/gestión de reseñas ORIENTADA AL CLIENTE (/mi-cuenta/resenas).
 * Scopea por customerId (aislamiento a nivel app). Complementa public-service
 * (featured) y admin-service (moderación con PII).
 */

import "server-only";
import { prisma } from "@/lib/db";

export type CustomerReview = {
  id: string;
  rating: number;
  comment: string;
  images: string[];
  createdAt: Date;
  status: "PUBLISHED" | "PENDING";
  product: { name: string; slug: string; image: string | null };
};

export async function listReviewsByCustomer(customerId: string): Promise<CustomerReview[]> {
  const rows = await prisma.review.findMany({
    where: { customerId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      rating: true,
      comment: true,
      images: true,
      isApproved: true,
      createdAt: true,
      product: { select: { name: true, slug: true, images: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    images: r.images,
    createdAt: r.createdAt,
    // Al cliente le mostramos dos estados legibles; 'rejected' del admin (isApproved
    // sigue false) se presenta como "En revisión" para no exponer moderación interna.
    status: r.isApproved ? "PUBLISHED" : "PENDING",
    product: {
      name: r.product.name,
      slug: r.product.slug,
      image: r.product.images[0] ?? null,
    },
  }));
}

export class ReviewNotFoundError extends Error {
  constructor() {
    super("Reseña no encontrada.");
    this.name = "ReviewNotFoundError";
  }
}

/** Soft-delete de la reseña del PROPIO cliente (verifica ownership por customerId). */
export async function deleteOwnReview(customerId: string, id: string): Promise<void> {
  const res = await prisma.review.updateMany({
    where: { id, customerId, deletedAt: null },
    data: { deletedAt: new Date(), deletedBy: customerId },
  });
  if (res.count === 0) throw new ReviewNotFoundError();
}

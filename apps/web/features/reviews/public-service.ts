/*
 * Service layer — Reviews (lectura pública).
 *
 * Solo expone reseñas con isApproved=true y deletedAt:null. Las
 * featured se usan en el carousel de home; las del PDP se filtran
 * por productId.
 */

import "server-only";
import { prisma } from "@/lib/db";

export type StorefrontReview = {
  id: string;
  rating: number;
  comment: string;
  authorName: string | null;
  authorCity: string | null;
  productName: string;
  productSlug: string;
  createdAt: Date;
};

export type ProductRatingAggregate = { ratingValue: number; reviewCount: number };

/*
 * Agregado de rating de un producto para el JSON-LD del PDP (auditoría 2026-07-16).
 * Solo cuenta reseñas aprobadas/no borradas. Devuelve null si no hay ninguna —
 * schema.org y Google rechazan `aggregateRating` sin datos reales, así que el
 * PDP omite el campo por completo en ese caso (no inventa un 5.0).
 */
export async function getProductRatingAggregate(
  productId: string,
): Promise<ProductRatingAggregate | null> {
  const agg = await prisma.review.aggregate({
    where: { productId, isApproved: true, deletedAt: null },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const reviewCount = agg._count._all;
  if (reviewCount === 0 || agg._avg.rating == null) return null;
  return { ratingValue: Math.round(agg._avg.rating * 10) / 10, reviewCount };
}

export async function listFeaturedReviews(limit = 8): Promise<StorefrontReview[]> {
  const items = await prisma.review.findMany({
    where: {
      isApproved: true,
      featured: true,
      deletedAt: null,
      product: { deletedAt: null, isActive: true },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      rating: true,
      comment: true,
      authorName: true,
      authorCity: true,
      createdAt: true,
      product: { select: { name: true, slug: true } },
    },
  });
  return items.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    authorName: r.authorName,
    authorCity: r.authorCity,
    createdAt: r.createdAt,
    productName: r.product.name,
    productSlug: r.product.slug,
  }));
}

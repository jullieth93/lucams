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

import "server-only";
import { prisma } from "@/lib/db";
import type { StorefrontProductCard } from "@/features/products/public-service";

/*
 * Wishlist / favoritos (palanca de ingreso, auditoría 2026-07-13). Cliente logueado guarda
 * productos. Ownership por customerId; el producto se valida activo (anti-tamper).
 */

export async function toggleWishlist(
  customerId: string,
  productId: string,
): Promise<{ wishlisted: boolean }> {
  const existing = await prisma.wishlistItem.findUnique({
    where: { customerId_productId: { customerId, productId } },
    select: { id: true },
  });
  if (existing) {
    await prisma.wishlistItem.delete({ where: { id: existing.id } });
    return { wishlisted: false };
  }
  // Solo se puede guardar un producto activo y no borrado.
  const product = await prisma.product.findFirst({
    where: { id: productId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!product) return { wishlisted: false };
  await prisma.wishlistItem.create({ data: { customerId, productId } });
  return { wishlisted: true };
}

/** Subconjunto de productIds que el cliente tiene en su wishlist (para pintar el corazón activo). */
export async function getWishlistedProductIds(
  customerId: string,
  productIds: string[],
): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();
  const rows = await prisma.wishlistItem.findMany({
    where: { customerId, productId: { in: productIds } },
    select: { productId: true },
  });
  return new Set(rows.map((r) => r.productId));
}

/** Productos en la wishlist del cliente, como cards del storefront (solo activos y visibles). */
export async function listWishlist(customerId: string): Promise<StorefrontProductCard[]> {
  const items = await prisma.wishlistItem.findMany({
    where: {
      customerId,
      product: { isActive: true, deletedAt: null, category: { isActive: true, deletedAt: null } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      product: {
        select: {
          id: true,
          slug: true,
          name: true,
          basePrice: true,
          compareAtPrice: true,
          isPersonalizable: true,
          images: true,
          category: { select: { slug: true, name: true } },
          _count: { select: { variants: { where: { deletedAt: null, isActive: true } } } },
          variants: {
            where: { deletedAt: null, isActive: true },
            select: { price: true, stock: true },
          },
        },
      },
    },
  });

  return items.map(({ product: p }) => {
    const overridePrices = p.variants
      .map((v) => v.price)
      .filter((price): price is number => price !== null && price > 0);
    const minVariantPrice =
      overridePrices.length > 0 ? Math.min(p.basePrice, ...overridePrices) : p.basePrice;
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      basePrice: p.basePrice,
      compareAtPrice: p.compareAtPrice,
      isPersonalizable: p.isPersonalizable,
      images: p.images,
      category: p.category,
      variantCount: p._count.variants,
      minVariantPrice,
      inStock: p.variants.some((v) => v.stock > 0),
    };
  });
}

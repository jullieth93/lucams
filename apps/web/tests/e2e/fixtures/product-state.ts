import { Prisma } from "@lucams/db";
import { db } from "./db";

const NEW_PRODUCT_SLUGS = ["bola-navidena-personalizada", "mini-libros-magneticos"];

export async function captureNewProductState() {
  return db().product.findMany({
    where: { slug: { in: NEW_PRODUCT_SLUGS }, deletedAt: null },
    select: {
      id: true,
      slug: true,
      isActive: true,
      basePrice: true,
      physicalSpecs: true,
      variants: {
        where: { deletedAt: null },
        select: { id: true, price: true, stock: true },
      },
    },
  });
}

export async function restoreNewProductState(
  states: Awaited<ReturnType<typeof captureNewProductState>>,
) {
  for (const product of states) {
    await db().product.update({
      where: { id: product.id },
      data: {
        isActive: product.isActive,
        basePrice: product.basePrice,
        physicalSpecs: product.physicalSpecs ?? Prisma.DbNull,
      },
    });
    for (const variant of product.variants) {
      await db().productVariant.update({
        where: { id: variant.id },
        data: { price: variant.price, stock: variant.stock },
      });
    }
  }
}

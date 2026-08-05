import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

// Guarda de ambiente: soft-delete masivo de categorías/productos — bloquea PRD/remotos no STG.
assertDestructiveAllowed("cleanup-junk-categories.mjs");

const prisma = new PrismaClient();

const JUNK_SLUGS = [
  "ord1785201494340237189-cat",
  "cart1785201494150207261-cat",
  "saga1785201494205580365-cat",
  "ITESTCUST1785194920839563664-cat",
  "itestoca178519485855356080-cat",
  "rtr1785194223708315556-cat",
  "test-1785193261329-910327-cat",
  "rtr1785193257100399708-cat",
  "test-1785187597141-636366-cat",
  "perso1785187579280469026-cat",
];

async function main() {
  const now = new Date();
  for (const slug of JUNK_SLUGS) {
    const cat = await prisma.category.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!cat) continue;

    const products = await prisma.product.findMany({
      where: { categoryId: cat.id },
      select: { id: true, name: true, slug: true },
    });
    console.log(`Category ${cat.name} (${slug}) has ${products.length} products:`);
    for (const p of products) {
      console.log(`  - ${p.name} (${p.slug})`);
    }

    // Soft-delete products
    if (products.length > 0) {
      const productIds = products.map((p) => p.id);
      await prisma.productVariant.updateMany({
        where: { productId: { in: productIds } },
        data: { isActive: false, deletedAt: now },
      });
      await prisma.product.updateMany({
        where: { id: { in: productIds } },
        data: { isActive: false, deletedAt: now },
      });
    }

    // Soft-delete category
    await prisma.category.update({
      where: { id: cat.id },
      data: { isActive: false, deletedAt: now },
    });
    console.log(`  -> archived ${cat.name} and ${products.length} products`);
  }
  console.log("DONE");
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

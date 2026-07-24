import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const totalCats = await prisma.category.count();
const activeCats = await prisma.category.count({ where: { isActive: true } });
const totalProds = await prisma.product.count();
const activeProds = await prisma.product.count({ where: { isActive: true } });
const badCats = await prisma.category.findMany({
  where: {
    isActive: true,
    OR: [
      { name: { contains: "Beta" } },
      { name: { contains: "Sibling" } },
      { slug: { contains: "cat178" } },
      { name: { contains: "test" } },
    ],
  },
  select: { slug: true, name: true },
  take: 20,
});
const realActiveCats = await prisma.category.findMany({
  where: { isActive: true },
  select: { slug: true, name: true },
});
console.log(JSON.stringify({ totalCats, activeCats, totalProds, activeProds, badCats, realActiveCats }, null, 2));
await prisma.$disconnect();

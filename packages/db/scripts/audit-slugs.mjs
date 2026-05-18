/*
 * audit-slugs.mjs — Dump de slugs activos (productos + categorías) para
 * que Lucy revise cuáles renombrar.
 *
 * Uso: make audit-slugs
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

console.log("\n══════════════════════════════════════════════════════════");
console.log(" CATEGORÍAS (activas + sub-categorías)");
console.log("══════════════════════════════════════════════════════════\n");

const categories = await prisma.category.findMany({
  where: { deletedAt: null },
  orderBy: [{ parentId: "asc" }, { order: "asc" }],
  select: { slug: true, name: true, parent: { select: { slug: true, name: true } } },
});
for (const c of categories) {
  const indent = c.parent ? "  └─ " : "";
  const parentNote = c.parent ? ` (de ${c.parent.slug})` : "";
  console.log(`${indent}/${c.slug.padEnd(35)} → ${c.name}${parentNote}`);
}

console.log("\n══════════════════════════════════════════════════════════");
console.log(" PRODUCTOS (activos, agrupados por categoría)");
console.log("══════════════════════════════════════════════════════════\n");

const products = await prisma.product.findMany({
  where: { deletedAt: null, isActive: true },
  orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  select: {
    slug: true,
    name: true,
    category: { select: { slug: true, name: true } },
    _count: { select: { variants: { where: { deletedAt: null } } } },
  },
});

let currentCat = "";
for (const p of products) {
  if (p.category.name !== currentCat) {
    currentCat = p.category.name;
    console.log(`\n┌── ${currentCat} (/${p.category.slug})`);
  }
  const variants = p._count.variants > 1 ? ` · ${p._count.variants} variants` : "";
  console.log(`│  /${p.slug.padEnd(40)} → ${p.name}${variants}`);
}

console.log("\n══════════════════════════════════════════════════════════");
console.log(` Total: ${categories.length} categorías + ${products.length} productos activos`);
console.log("══════════════════════════════════════════════════════════\n");

await prisma.$disconnect();

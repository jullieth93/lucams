/*
 * audit-variants.mjs — Dump de variants activos por producto. Útil para
 * que Lucy vea qué variants existen y qué falta dar de alta desde admin.
 *
 * Uso: pnpm --filter @lucams/db exec node scripts/audit-variants.mjs
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

const products = await prisma.product.findMany({
  where: { deletedAt: null, isActive: true },
  orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  include: {
    category: { select: { name: true } },
    variants: {
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
    },
  },
});

console.log("\n══════════════════════════════════════════════════════════════════════");
console.log(" VARIANTS POR PRODUCTO (activos)");
console.log("══════════════════════════════════════════════════════════════════════\n");

let productsConVariants = 0;
let productsSinAttrs = 0;
let variantsTotal = 0;
let variantsActivos = 0;

for (const p of products) {
  const activas = p.variants.filter((v) => v.isActive);
  const conAttrs = p.variants.filter(
    (v) => v.attributes && Object.keys(v.attributes).length > 0,
  );

  variantsTotal += p.variants.length;
  variantsActivos += activas.length;

  if (p.variants.length > 1) productsConVariants++;
  if (conAttrs.length === 0 && p.variants.length === 1) productsSinAttrs++;

  // Mostrar solo productos con >1 variant (los interesantes)
  if (p.variants.length <= 1) continue;

  console.log(`┌── ${p.name} (/${p.slug}) — ${p.category.name}`);
  console.log(`│   basePrice: $${(p.basePrice / 100).toLocaleString("es-CO")}`);
  for (const v of p.variants) {
    const attrs = v.attributes ?? {};
    const attrStr = Object.entries(attrs)
      .map(([k, val]) => `${k}=${val}`)
      .join(", ");
    const price = v.price ? `$${(v.price / 100).toLocaleString("es-CO")}` : "(hereda base)";
    const status = !v.isActive ? "❌ inactiva" : v.deletedAt ? "❌ archivada" : "✓";
    console.log(`│   ${status} ${v.name.padEnd(35)} ${price.padEnd(20)} ${attrStr}`);
  }
  console.log();
}

console.log("══════════════════════════════════════════════════════════════════════");
console.log(` Totales:`);
console.log(`   Productos con >1 variant: ${productsConVariants}`);
console.log(`   Productos con solo 'Default' (sin atributos): ${productsSinAttrs}`);
console.log(`   Variants en total: ${variantsTotal} (${variantsActivos} activas)`);
console.log("══════════════════════════════════════════════════════════════════════\n");

await prisma.$disconnect();

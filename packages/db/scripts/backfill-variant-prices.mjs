/*
 * backfill-variant-prices.mjs — ONE-SHOT 2026-05-18
 *
 * El script consolidate-product-families.mjs creó variants nuevas pero
 * NO copió el `price` de cada sibling original. Resultado: todas las
 * variants tienen `price=null` (heredan basePrice del producto base),
 * así que al cambiar de variant el cliente ve el mismo precio. UX rota:
 * "selector se mueve pero el precio no cambia".
 *
 * Este script:
 *   1. Para cada familia, mapea variant.attributes → sibling slug
 *      (definido en FAMILIES — misma fuente de verdad que consolidate).
 *   2. Busca el sibling soft-deleted por slug → lee su basePrice.
 *   3. Si el price actual del variant es null, lo actualiza con
 *      basePrice del sibling. Idempotente: no toca variants con price
 *      ya seteado manualmente.
 *   4. Skip de la variant Default y de variants huérfanas.
 *
 * Uso: make backfill-variant-prices
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

/**
 * Mapeo familia → variant.sku-suffix → sibling slug original.
 * Convención: SKU es `<basesku>-V<idx>` donde idx = 1-based index del
 * variant en el array FAMILIES del script de consolidación.
 */
const FAMILIES = [
  {
    baseSlugs: ["set-fotoimanes-polaroid", "set-12-fotoimanes-polaroid"],
    variantSiblings: [
      { skuSuffix: "-V1", siblingSlug: "set-6-fotoimanes-polaroid-grande" },
      { skuSuffix: "-V2", siblingSlug: "set-9-fotoimanes-polaroid-color" },
      { skuSuffix: "-V3", siblingSlug: "set-12-fotoimanes-polaroid" },
      { skuSuffix: "-V4", siblingSlug: "set-20-mini-polaroids" },
    ],
  },
  {
    baseSlugs: ["box-dia-mama", "big-box-dia-mama"],
    variantSiblings: [
      { skuSuffix: "-V1", siblingSlug: "big-box-dia-mama" },
      { skuSuffix: "-V2", siblingSlug: "mini-box-dia-mama" },
    ],
  },
  {
    baseSlugs: ["rutina-infantil-magnetica", "rutina-infantil-7-actividades"],
    variantSiblings: [
      { skuSuffix: "-V1", siblingSlug: "rutina-infantil-7-actividades" },
      { skuSuffix: "-V2", siblingSlug: "rutina-infantil-xl-9" },
    ],
  },
];

console.log("=== backfill-variant-prices (2026-05-18) ===\n");

let updated = 0;
let skipped = 0;

for (const family of FAMILIES) {
  // Buscar producto base por cualquiera de sus slugs (limpio o legacy).
  let baseProduct = null;
  for (const s of family.baseSlugs) {
    baseProduct = await prisma.product.findUnique({
      where: { slug: s },
      include: { variants: { where: { deletedAt: null } } },
    });
    if (baseProduct) break;
  }
  if (!baseProduct) {
    console.log(`  ⚠️  Base product no encontrado para ${family.baseSlugs[0]}`);
    continue;
  }

  console.log(`\n📦 ${baseProduct.name}`);

  for (const { skuSuffix, siblingSlug } of family.variantSiblings) {
    // Buscar sibling — puede estar soft-deleted o ser el base mismo.
    const sibling = await prisma.product.findFirst({
      where: { slug: siblingSlug },
      select: { basePrice: true, slug: true },
    });
    if (!sibling) {
      console.log(`  ⚠️  Sibling ${siblingSlug} no encontrado`);
      continue;
    }

    const expectedSku = `${baseProduct.sku}${skuSuffix}`;
    const variant = baseProduct.variants.find((v) => v.sku === expectedSku);
    if (!variant) {
      console.log(`  ⚠️  Variant ${expectedSku} no encontrado`);
      continue;
    }

    if (variant.price !== null) {
      console.log(`  · ${variant.name}: price ya seteado (${variant.price}) — skip`);
      skipped++;
      continue;
    }

    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { price: sibling.basePrice },
    });
    console.log(`  ✓ ${variant.name}: price = ${sibling.basePrice} (de ${sibling.slug})`);
    updated++;
  }
}

console.log(`\n=== Done. ${updated} variants actualizados, ${skipped} skipped ===`);
await prisma.$disconnect();

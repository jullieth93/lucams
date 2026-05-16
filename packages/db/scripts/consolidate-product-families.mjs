/*
 * Script de consolidación de familias de productos — M.3.b.CAT.2 (2026-05-14).
 *
 * Tarea: 49 productos del catálogo actual tienen "familias" fragmentadas
 * (Polaroid Set 6 / 9 / 12 / 20 como 4 productos distintos). Este script:
 *
 *   1. Identifica las familias definidas en `FAMILIES` (mapeo manual).
 *   2. Para cada familia:
 *      a. Elige el "producto base" (el primero del array — típicamente el
 *         más vendido o el de mejor SEO).
 *      b. Crea variants nuevos sobre el producto base con attributes
 *         (photoSlots, sizeCm, etc.) según el config de cada hermano.
 *      c. Migra reviews de los hermanos al producto base (asociar
 *         review.productId = base.id).
 *      d. Soft-deletes los productos hermanos (deletedAt = new Date(),
 *         isActive = false).
 *   3. Genera mapa de redirects `old-slug → new-slug?variant=v<id>`
 *      escrito a `apps/web/lib/product-redirects.ts` para que el proxy
 *      Next.js los aplique en runtime.
 *
 * Idempotente: re-correr no duplica variants (busca por SKU before create)
 * ni re-archiva productos ya archivados.
 *
 * Uso: make consolidate-product-families (target nuevo en Makefile)
 *      o: pnpm --filter @lucams/db exec node scripts/consolidate-product-families.mjs
 */

import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();
const __dirname = dirname(fileURLToPath(import.meta.url));

console.log("=== consolidate-product-families (M.3.b.CAT.2) ===\n");

/**
 * Definición de familias. Cada familia tiene:
 * - `baseSlug`: producto que queda activo + recibe los variants
 * - `siblings`: array de { slug, variantName, attributes } a archivar
 *
 * El primer slug de cada familia es el "base". Los demás se archivan
 * pero sus attributes se preservan como variants del base.
 */
const FAMILIES = [
  {
    name: "Set Fotoimanes Polaroid",
    baseSlug: "set-12-fotoimanes-polaroid", // 12 fotos = el sweet spot del mercado
    variants: [
      {
        slug: "set-6-fotoimanes-polaroid-grande",
        variantName: "Set 6 unidades · 7×9 cm",
        attributes: { photoSlots: 6, sizeCm: "7×9", aspectRatio: "7:9" },
      },
      {
        slug: "set-9-fotoimanes-polaroid-color",
        variantName: "Set 9 unidades · 6×8 cm",
        attributes: { photoSlots: 9, sizeCm: "6×8", aspectRatio: "6:8" },
      },
      {
        slug: "set-12-fotoimanes-polaroid",
        variantName: "Set 12 unidades · 6×8 cm",
        attributes: { photoSlots: 12, sizeCm: "6×8", aspectRatio: "6:8" },
      },
      {
        slug: "set-20-mini-polaroids",
        variantName: "Set 20 mini · 4×5 cm",
        attributes: { photoSlots: 20, sizeCm: "4×5", aspectRatio: "4:5" },
      },
    ],
  },
  {
    name: "Box Día de la Madre",
    baseSlug: "big-box-dia-mama",
    variants: [
      {
        slug: "big-box-dia-mama",
        variantName: "Big Box · 6 fotos + planner",
        attributes: { photoSlots: 6, sizeCm: "5×5" },
      },
      {
        slug: "mini-box-dia-mama",
        variantName: "Mini Box · 4 fotos + nota",
        attributes: { photoSlots: 4, sizeCm: "5×5" },
      },
    ],
  },
  {
    name: "Rutina Infantil Magnética",
    baseSlug: "rutina-infantil-7-actividades",
    variants: [
      {
        slug: "rutina-infantil-7-actividades",
        variantName: "Estándar · 7 actividades",
        attributes: { photoSlots: 7 },
      },
      {
        slug: "rutina-infantil-xl-9",
        variantName: "XL · 9 actividades",
        attributes: { photoSlots: 9 },
      },
    ],
  },
];

const redirectsMap = {};

for (const family of FAMILIES) {
  console.log(`\n📦 Familia: ${family.name}`);

  // Buscar producto base
  const baseProduct = await prisma.product.findUnique({
    where: { slug: family.baseSlug },
    include: { variants: { where: { deletedAt: null } } },
  });
  if (!baseProduct) {
    console.log(`  ⚠️  Base product '${family.baseSlug}' no existe — skip familia`);
    continue;
  }
  console.log(`  Base: ${baseProduct.name} (id=${baseProduct.id})`);

  // Para cada variant declarada, asegurar que existe como ProductVariant
  for (const v of family.variants) {
    const expectedSku = `${baseProduct.sku}-V${family.variants.indexOf(v) + 1}`;

    // Idempotency: buscar por sku
    let variantRow = baseProduct.variants.find((x) => x.sku === expectedSku);
    if (!variantRow) {
      variantRow = await prisma.productVariant.create({
        data: {
          productId: baseProduct.id,
          name: v.variantName,
          sku: expectedSku,
          attributes: v.attributes,
        },
      });
      console.log(`  ✓ Variant creado: ${v.variantName} (sku=${expectedSku})`);
    } else {
      // Actualizar attributes por si cambió la definición
      await prisma.productVariant.update({
        where: { id: variantRow.id },
        data: { name: v.variantName, attributes: v.attributes },
      });
      console.log(`  ✓ Variant actualizado: ${v.variantName}`);
    }

    // Registrar redirect si el slug no es el base
    if (v.slug !== family.baseSlug) {
      redirectsMap[v.slug] = `${family.baseSlug}?variant=${variantRow.id}`;
    }
  }

  // Soft-delete + migrar reviews de los siblings que NO son base
  const siblingSlugs = family.variants.filter((v) => v.slug !== family.baseSlug).map((v) => v.slug);
  if (siblingSlugs.length > 0) {
    const siblings = await prisma.product.findMany({
      where: { slug: { in: siblingSlugs }, deletedAt: null },
      select: { id: true, slug: true, name: true },
    });

    for (const sib of siblings) {
      // Migrar reviews al producto base
      const reviewsUpdated = await prisma.review.updateMany({
        where: { productId: sib.id },
        data: { productId: baseProduct.id },
      });
      if (reviewsUpdated.count > 0) {
        console.log(
          `  ↪ ${reviewsUpdated.count} reviews migradas de '${sib.slug}' a '${family.baseSlug}'`,
        );
      }

      // Soft-delete sibling
      await prisma.product.update({
        where: { id: sib.id },
        data: {
          deletedAt: new Date(),
          isActive: false,
          deletedBy: "system:consolidate-families-2026-05-14",
        },
      });
      console.log(`  📦 Soft-deleted: ${sib.slug}`);
    }
  }
}

// Generar product-redirects.ts
const redirectsContent = `/*
 * Auto-generated by packages/db/scripts/consolidate-product-families.mjs
 * Mapping de slugs legacy (productos archivados al consolidar familias)
 * hacia el producto base + variant pre-seleccionado.
 *
 * Usado por proxy.ts (Next.js middleware) para redirect 301.
 * NO editar a mano. Re-generar con: make consolidate-product-families
 */

export const PRODUCT_REDIRECTS: Record<string, string> = ${JSON.stringify(redirectsMap, null, 2)};
`;

const redirectsPath = join(
  __dirname,
  "..",
  "..",
  "..",
  "apps",
  "web",
  "lib",
  "product-redirects.ts",
);
writeFileSync(redirectsPath, redirectsContent, "utf-8");
console.log(`\n📝 Generado ${redirectsPath} con ${Object.keys(redirectsMap).length} redirects`);

console.log("\n=== Consolidación completada ===");
await prisma.$disconnect();
process.exit(0);

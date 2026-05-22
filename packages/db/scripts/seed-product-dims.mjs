#!/usr/bin/env node
/*
 * Seed peso + dimensiones (paquete final) por TODOS los productos.
 *
 * Lucy 2026-05-21: Aveonline cotiza con peso/dims reales. Hoy muchos
 * productos del catálogo seedeado NO los tienen → cotización falla.
 * Este script setea defaults razonables por `personalizationKind` SIN
 * pisar valores ya configurados manualmente.
 *
 * Idempotente: re-correr no cambia productos con dims completos.
 *
 * Defaults por kind (paquete final, no imán suelto):
 *   PHOTO_PACK (6-20 fotoimanes): caja 15×10×3 cm, 250g
 *   PHOTO_GRID:                   22×22×3 cm, 350g
 *   CALENDAR_PHOTO_MONTH:         22×15×2 cm, 250g
 *   CALENDAR_PHOTO_HERO:          30×20×2 cm, 350g
 *   EVENT_FAVOR:                  18×12×3 cm, 280g
 *   BUSINESS_LOGO:                15×10×3 cm, 300g
 *   CUSTOM_DECOR:                 25×15×3 cm, 300g
 *   TEXT_ONLY:                    12×8×2 cm, 100g
 *   NONE (coleccionables, etc.):  10×8×2 cm, 80g
 *
 * Uso:
 *   make seed-product-dims
 *   # o directo: node packages/db/scripts/seed-product-dims.mjs
 */

import { PrismaClient } from "@prisma/client";

const DEFAULTS_BY_KIND = {
  PHOTO_PACK: { weightGrams: 250, widthCm: 15, heightCm: 10, depthCm: 3 },
  PHOTO_GRID: { weightGrams: 350, widthCm: 22, heightCm: 22, depthCm: 3 },
  CALENDAR_PHOTO_MONTH: { weightGrams: 250, widthCm: 22, heightCm: 15, depthCm: 2 },
  CALENDAR_PHOTO_HERO: { weightGrams: 350, widthCm: 30, heightCm: 20, depthCm: 2 },
  EVENT_FAVOR: { weightGrams: 280, widthCm: 18, heightCm: 12, depthCm: 3 },
  BUSINESS_LOGO: { weightGrams: 300, widthCm: 15, heightCm: 10, depthCm: 3 },
  CUSTOM_DECOR: { weightGrams: 300, widthCm: 25, heightCm: 15, depthCm: 3 },
  TEXT_ONLY: { weightGrams: 100, widthCm: 12, heightCm: 8, depthCm: 2 },
  NONE: { weightGrams: 80, widthCm: 10, heightCm: 8, depthCm: 2 },
};

const prisma = new PrismaClient();

function hasCompleteDims(specs) {
  if (!specs || typeof specs !== "object") return false;
  return (
    typeof specs.weightGrams === "number" &&
    typeof specs.widthCm === "number" &&
    typeof specs.heightCm === "number" &&
    typeof specs.depthCm === "number"
  );
}

async function main() {
  console.log("─── Seed peso + dimensiones (paquete final) ───\n");

  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      slug: true,
      name: true,
      personalizationKind: true,
      physicalSpecs: true,
    },
  });

  console.log(`Encontrados ${products.length} productos activos.\n`);

  let updated = 0;
  let alreadyOk = 0;
  let unknownKind = 0;

  for (const p of products) {
    const existing = p.physicalSpecs && typeof p.physicalSpecs === "object" ? p.physicalSpecs : {};
    if (hasCompleteDims(existing)) {
      alreadyOk++;
      continue;
    }
    const defaults = DEFAULTS_BY_KIND[p.personalizationKind];
    if (!defaults) {
      console.warn(`⚠ Kind desconocido ${p.personalizationKind} para ${p.slug} — saltado`);
      unknownKind++;
      continue;
    }
    // Merge: preservar otras keys (material, packaging, etc.) si ya estaban
    const merged = {
      ...existing,
      weightGrams: existing.weightGrams ?? defaults.weightGrams,
      widthCm: existing.widthCm ?? defaults.widthCm,
      heightCm: existing.heightCm ?? defaults.heightCm,
      depthCm: existing.depthCm ?? defaults.depthCm,
    };
    await prisma.product.update({
      where: { id: p.id },
      data: { physicalSpecs: merged },
    });
    updated++;
    console.log(
      `  ✓ ${p.slug.padEnd(40)} ${p.personalizationKind.padEnd(22)} → ${defaults.weightGrams}g ${defaults.widthCm}×${defaults.heightCm}×${defaults.depthCm}cm`,
    );
  }

  console.log("\n─── Resumen ───");
  console.log(`  ✓ ${updated} productos actualizados`);
  console.log(`  ⏭  ${alreadyOk} ya tenían dims completas (sin cambios)`);
  if (unknownKind > 0) {
    console.log(`  ⚠ ${unknownKind} productos con kind desconocido (ver arriba)`);
  }
  console.log("\nListo. Probar /checkout/envio para confirmar cotización OK.\n");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});

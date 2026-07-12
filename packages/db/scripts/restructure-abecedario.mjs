/*
 * ADR-057 — Reestructura del abecedario a 3 PRODUCTOS (decisión de Lucy 2026-07-12):
 *   - Abecedario Completo  (NONE)      → idioma × tamaño × imantado (12 variantes)
 *   - Pack Vocales         (NONE)      → tamaño × imantado (6)
 *   - Nombre Personalizado (TEXT_ONLY) → idioma × tamaño × imantado (12), abre el editor
 *
 * Patrón "ficha configura, editor personaliza": las opciones (idioma/tamaño/imantado)
 * viven en la ficha (VariantSelector); el editor de nombre solo arma la palabra + colores.
 * Idioma es una OPCIÓN dentro del producto (ya no hay productos -espanol/-ingles).
 *
 * Archiva los productos viejos (abecedario-magnetico-espanol/-ingles/-magnetico).
 * Idempotente: upsert por slug/sku. En updates NO pisa el precio (respeta el admin).
 *
 * Uso: DATABASE_URL=$DIRECT_URL node packages/db/scripts/restructure-abecedario.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SIZES = [
  { size: "mini", sizeCm: "5×7", label: "Mini" },
  { size: "clasica", sizeCm: "7×10", label: "Clásica" },
  { size: "grande", sizeCm: "10×14", label: "Grande" },
];
const LANGS = [
  { language: "es", label: "Español", sku: "ES" },
  { language: "en", label: "Inglés", sku: "EN" },
];
const sizeSku = (s) => s.toUpperCase().slice(0, 4);

const basePhysicalSpecs = {
  widthCm: 7,
  heightCm: 10,
  depthCm: 1,
  weightGrams: 50,
  material: "PET laminado mate",
  magnetType: "FRIDGE",
  thicknessMm: 3,
  packaging: "STANDARD_BAG",
  countryOfOrigin: "CO",
  careInstructions: "Limpieza con paño seco.",
};

async function getCategoryId() {
  const cat = await prisma.category.findFirst({
    where: { slug: "juegos-aprendizaje", deletedAt: null },
    select: { id: true },
  });
  if (!cat) throw new Error("Categoría juegos-aprendizaje no existe");
  return cat.id;
}

async function upsertProduct(input) {
  const sku = input.sku;
  const existing = await prisma.product.findFirst({ where: { slug: input.slug } });
  const data = {
    name: input.name,
    description: input.description,
    personalizationKind: input.kind,
    personalizationSchema: input.schema ?? null,
    physicalSpecs: basePhysicalSpecs,
    basePrice: input.basePrice,
    cost: input.cost ?? Math.round(input.basePrice * 0.35),
    isActive: true,
    isFeatured: input.isFeatured ?? false,
    isPersonalizable: input.kind !== "NONE",
    deletedAt: null,
    categoryId: input.categoryId,
    images: [],
  };
  if (existing) {
    await prisma.product.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  const created = await prisma.product.create({ data: { slug: input.slug, sku, ...data } });
  return created.id;
}

async function upsertVariant(productId, sku, name, attributes, pricePesos) {
  const existing = await prisma.productVariant.findFirst({ where: { sku } });
  if (existing) {
    await prisma.productVariant.update({
      where: { id: existing.id },
      data: { productId, name, attributes, isActive: true, deletedAt: null },
      // price NO se toca: respeta lo que Lucy edite en el admin.
    });
    console.log(`    ~ ${sku} (actualizada, precio respetado)`);
    return;
  }
  await prisma.productVariant.create({
    data: { productId, sku, name, attributes, price: pricePesos * 100, stock: 100, isActive: true },
  });
  console.log(`    + ${sku} — $${pricePesos.toLocaleString("es-CO")}`);
}

async function main() {
  const categoryId = await getCategoryId();

  // ─────────── 1) Abecedario Completo (NONE) ───────────
  console.log("Abecedario Completo:");
  const completoPrices = {
    mini: { mag: 35000, nomag: 32000 },
    clasica: { mag: 45000, nomag: 42000 },
    grande: { mag: 58000, nomag: 55000 },
  };
  const completoId = await upsertProduct({
    slug: "abecedario-completo",
    sku: "ABC-COMPLETO",
    name: "Abecedario Magnético Completo",
    description:
      "El abecedario completo con diseños de animales kawaii (A de Ave, B de Burro…). Español: 27 letras (incluye Ñ). Inglés: 26 letras. Ideal para aprender a leer y decorar la nevera. Elige idioma, tamaño y con o sin imán.",
    kind: "NONE",
    basePrice: completoPrices.clasica.mag * 100,
    isFeatured: true,
    categoryId,
  });
  for (const lang of LANGS) {
    for (const s of SIZES) {
      for (const magnet of [true, false]) {
        const sku = `ABC-COMP-${lang.sku}-${sizeSku(s.size)}-${magnet ? "MAG" : "NOMAG"}`;
        const name = `${lang.label} · ${s.sizeCm} cm · ${magnet ? "Con imán" : "Sin imán"}`;
        await upsertVariant(
          completoId,
          sku,
          name,
          { language: lang.language, size: s.size, sizeCm: s.sizeCm, magnet },
          magnet ? completoPrices[s.size].mag : completoPrices[s.size].nomag,
        );
      }
    }
  }

  // ─────────── 2) Pack Vocales (NONE) ───────────
  console.log("Pack Vocales:");
  const vocalesPrices = {
    mini: { mag: 12000, nomag: 10000 },
    clasica: { mag: 15000, nomag: 13000 },
    grande: { mag: 22000, nomag: 20000 },
  };
  const vocalesId = await upsertProduct({
    slug: "pack-vocales",
    sku: "PACK-VOCALES",
    name: "Pack Vocales Magnéticas",
    description:
      "Las 5 vocales (A E I O U) con animalitos kawaii. Perfecto para los más peques. Elige tamaño y con o sin imán.",
    kind: "NONE",
    basePrice: vocalesPrices.clasica.mag * 100,
    categoryId,
  });
  for (const s of SIZES) {
    for (const magnet of [true, false]) {
      const sku = `VOC-${sizeSku(s.size)}-${magnet ? "MAG" : "NOMAG"}`;
      const name = `${s.sizeCm} cm · ${magnet ? "Con imán" : "Sin imán"}`;
      await upsertVariant(
        vocalesId,
        sku,
        name,
        { size: s.size, sizeCm: s.sizeCm, magnet },
        magnet ? vocalesPrices[s.size].mag : vocalesPrices[s.size].nomag,
      );
    }
  }

  // ─────────── 3) Nombre Personalizado (TEXT_ONLY) ───────────
  console.log("Nombre Personalizado:");
  const nombrePrices = {
    mini: { mag: 18000, nomag: 15000 },
    clasica: { mag: 25000, nomag: 22000 },
    grande: { mag: 35000, nomag: 32000 },
  };
  const nombreId = await upsertProduct({
    slug: "nombre-magnetico",
    sku: "NOMBRE-MAGNETICO",
    name: "Nombre Magnético Personalizado",
    description:
      "Escribe un nombre o palabra y recibe las fichas de letras kawaii que lo forman. Elige idioma, tamaño y con o sin imán, y personaliza los colores en el editor.",
    kind: "TEXT_ONLY",
    schema: { nameMaxLength: 10 },
    basePrice: nombrePrices.clasica.mag * 100,
    isFeatured: true,
    categoryId,
  });
  for (const lang of LANGS) {
    for (const s of SIZES) {
      for (const magnet of [true, false]) {
        const sku = `NOM-${lang.sku}-${sizeSku(s.size)}-${magnet ? "MAG" : "NOMAG"}`;
        const name = `${lang.label} · ${s.sizeCm} cm · ${magnet ? "Con imán" : "Sin imán"}`;
        await upsertVariant(
          nombreId,
          sku,
          name,
          {
            variant: "name",
            language: lang.language,
            size: s.size,
            sizeCm: s.sizeCm,
            magnet,
            letterCountMin: 3,
            letterCountMax: 10,
          },
          magnet ? nombrePrices[s.size].mag : nombrePrices[s.size].nomag,
        );
      }
    }
  }

  // ─────────── Archivar productos viejos ───────────
  console.log("Archivando productos viejos:");
  const oldSlugs = ["abecedario-magnetico-espanol", "abecedario-magnetico-ingles", "abecedario-magnetico"];
  for (const slug of oldSlugs) {
    const r = await prisma.product.updateMany({
      where: { slug },
      data: { isActive: false, deletedAt: new Date() },
    });
    if (r.count > 0) console.log(`    ⊘ ${slug} archivado`);
  }

  console.log("\n✓ DONE. Productos: /abecedario-completo · /pack-vocales · /nombre-magnetico");
  console.log("  Ajusta precios en /admin/productos/[id]/variants.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

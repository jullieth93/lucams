/*
 * ola2a-tiras-magneticas.mjs — Crea el producto OCULTO "Tiras Magnéticas" (isActive=false)
 * + su variante + su plantilla de Estudio (Ola 2A, Lucy 2026-07-22).
 *
 * Producto: tira vertical estilo photobooth 5×15 cm con 3 fotos apiladas sobre fondo de
 * color (blanco/negro/pasteles — la misma paleta `frameOptions` de la Ola 2A). Estudio:
 * 3 slots de foto (uno por foto) apilados en 1 columna (la plantilla fija gridCols=1) +
 * marco de color configurable. El preview compositado (1×3) ES la tira.
 *
 * Precio PROPUESTO (para que Lucy lo ajuste): $19.000 (1.900.000 centavos) — derivado de
 * los fotoimanes actuales: Cuadrados 6.5×6.5 = $16.000 1u / $19.200 3u; Polaroid 7×9 6u =
 * $27.500 (~$4.583/foto → 3 fotos ≈ $13.750 + base imantada 5×15 ≈ $5.000) ≈ $19.000.
 *
 * Idempotente: upsert por slug (producto/plantilla) y por sku (variante).
 * Uso: pnpm --filter @lucams/db exec node scripts/ola2a-tiras-magneticas.mjs
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

const FRAME_OPTIONS = ["blanco", "negro", "aguamarina", "rosa", "lavanda", "amarillo"];
const PRICE = 1_900_000; // $19.000 COP — propuesto, Lucy lo ajusta
const SLUG = "tiras-magneticas-fotos";
const SKU = "FI-TIRA-01";
const TEMPLATE_SLUG = "photo-strip-3-fotos";

const category = await prisma.category.findUnique({
  where: { slug: "foto-imanes" },
  select: { id: true, name: true },
});
if (!category) {
  console.error('✗ Categoría "foto-imanes" no encontrada');
  process.exit(1);
}

const result = await prisma.$transaction(async (tx) => {
  const product = await tx.product.upsert({
    where: { slug: SLUG },
    create: {
      slug: SLUG,
      name: "Tiras Magnéticas",
      description:
        "Tira vertical estilo photobooth de 5×15 cm con 3 de tus fotos apiladas sobre un fondo de color a tu gusto (blanco, negro o pasteles). La diseñas en el Estudio: subes 3 fotos y eliges el color del marco.",
      basePrice: PRICE,
      sku: SKU,
      isActive: false, // OCULTO hasta que Lucy confirme precio y lo active
      isPersonalizable: true,
      personalizationKind: "PHOTO_PACK",
      personalizationSchema: {
        photoSlots: 3,
        aspectRatio: "1:1", // aspect de CADA celda de foto (la tira completa es 1:3 = 5×15)
        sizeCm: "5×15",
        shape: "rectangle",
        frameOptions: FRAME_OPTIONS,
      },
      physicalSpecs: {
        widthCm: 5,
        heightCm: 15,
        thicknessMm: 1,
        weightGrams: 25,
        material: "PET laminado mate",
        magnetType: "FRIDGE",
        includes: ["1 tira magnética 5×15 cm con 3 fotos"],
        packaging: "ENVELOPE",
        countryOfOrigin: "CO",
        careInstructions: "Limpieza con paño seco. No doblar.",
      },
      images: [],
      categoryId: category.id,
    },
    update: {
      name: "Tiras Magnéticas",
      description:
        "Tira vertical estilo photobooth de 5×15 cm con 3 de tus fotos apiladas sobre un fondo de color a tu gusto (blanco, negro o pasteles). La diseñas en el Estudio: subes 3 fotos y eliges el color del marco.",
      basePrice: PRICE,
      isActive: false,
      personalizationKind: "PHOTO_PACK",
      personalizationSchema: {
        photoSlots: 3,
        aspectRatio: "1:1",
        sizeCm: "5×15",
        shape: "rectangle",
        frameOptions: FRAME_OPTIONS,
      },
      categoryId: category.id,
    },
    select: { id: true, slug: true, name: true, isActive: true, basePrice: true },
  });

  const variant = await tx.productVariant.upsert({
    where: { sku: `${SKU}-DEFAULT` },
    create: {
      productId: product.id,
      name: "5×15 cm · 3 fotos",
      sku: `${SKU}-DEFAULT`,
      price: PRICE,
      attributes: { photoSlots: 3, sizeCm: "5×15", aspectRatio: "1:1" },
    },
    update: {
      name: "5×15 cm · 3 fotos",
      price: PRICE,
      attributes: { photoSlots: 3, sizeCm: "5×15", aspectRatio: "1:1" },
    },
    select: { id: true, sku: true, name: true, price: true },
  });

  // Plantilla del Estudio: celda cuadrada (1 foto por slot) apilada en 1 columna
  // (gridCols=1) → el grid del editor y el preview compositado arman la tira 5×15.
  const template = await tx.personalizationTemplate.upsert({
    where: { slug: TEMPLATE_SLUG },
    create: {
      slug: TEMPLATE_SLUG,
      productId: product.id,
      kind: "PHOTO_PACK",
      name: "Tira photobooth (3 fotos)",
      order: 1,
      previewUrl: "/templates/personalizacion-libre.svg",
      canvasData: {
        version: 1,
        stage: { width: 500, height: 500, dpiPreview: 90, dpiProduction: 300 },
        gridCols: 1, // apilar las 3 fotos en vertical (la tira física es 1 columna)
        layers: [
          { id: "background", type: "background", color: "#FFFFFF" },
          {
            id: "photo",
            type: "image-placeholder",
            x: 0,
            y: 0,
            width: 500,
            height: 500,
            cornerRadius: 0,
            label: "Foto de la tira",
          },
        ],
      },
    },
    update: {
      productId: product.id,
      kind: "PHOTO_PACK",
      name: "Tira photobooth (3 fotos)",
      canvasData: {
        version: 1,
        stage: { width: 500, height: 500, dpiPreview: 90, dpiProduction: 300 },
        gridCols: 1,
        layers: [
          { id: "background", type: "background", color: "#FFFFFF" },
          {
            id: "photo",
            type: "image-placeholder",
            x: 0,
            y: 0,
            width: 500,
            height: 500,
            cornerRadius: 0,
            label: "Foto de la tira",
          },
        ],
      },
    },
    select: { id: true, slug: true },
  });

  return { product, variant, template };
});

console.log("✓ Producto:", JSON.stringify(result.product));
console.log("✓ Variante:", JSON.stringify(result.variant));
console.log("✓ Plantilla:", JSON.stringify(result.template));
console.log(
  `\nPrecio PROPUESTO: ${result.product.basePrice} centavos = $${(result.product.basePrice / 100).toLocaleString("es-CO")} COP (isActive=false — Lucy lo ajusta y activa)`,
);

await prisma.$disconnect();

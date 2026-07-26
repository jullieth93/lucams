/*
 * Ola 17 (Lucy 2026-07-24) — Separadores de Libros (Marcapáginas): renames + producto Alargados.
 *
 * 1. Rename categoría: "Separadores Magnéticos" → "Separadores de Libros (Marcapáginas)".
 * 2. Rename producto `separadores-libros`: "Separadores para Libros" → "Magnéticos"
 *    (se conserva el slug para no romper links, diseños ni cotizaciones existentes).
 * 3. Nuevo producto `separadores-alargados` ("Alargados"): marcapáginas PLANO alargado
 *    (NO se dobla — foto de referencia Lucy: pieza vertical 15×4 / 12×4 cm, bordes
 *    redondeados, diseño en toda la cara). Personalizable en AMBAS caras
 *    (facesPerUnit=2, frente + reverso; producción imprime espalda con espalda igual
 *    que los separadores doblados). `noFold: true` → la vista 3D de libro lo muestra
 *    acostado sobre la hoja.
 *    Variantes (1 unidad, $4.000 cualquier tamaño):
 *      - 15×4 cm  (aspectRatio 4:15, template separador-alargado-15-cara)
 *      - 12×4 cm  (aspectRatio 4:12, template separador-alargado-12-cara)
 *    Plantillas dedicadas por tamaño llamadas "Separador alargado" (el Estudio filtra
 *    por aspectRatio de la variante → el cliente solo ve la de su tamaño).
 *
 * Idempotente: upsert por slug/sku; en updates NO pisa el precio de las variantes
 * (respeta lo que el admin haya ajustado).
 *
 * Uso: pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/ola17-separadores-alargados.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_SLUG = "separadores-alargados";
const PRODUCT_SKU = "SEP-ALARGADOS";

const VARIANTS = [
  {
    sku: "SEP-ALG-15",
    name: "15×4 cm",
    sizeCm: "4×15",
    aspectRatio: "4:15",
    templateSlug: "separador-alargado-15-cara",
    stage: { width: 400, height: 1500 },
  },
  {
    sku: "SEP-ALG-12",
    name: "12×4 cm",
    sizeCm: "4×12",
    aspectRatio: "4:12",
    templateSlug: "separador-alargado-12-cara",
    stage: { width: 400, height: 1200 },
  },
];

const PRICE_CENTS = 4000 * 100; // $4.000 COP por unidad, cualquier tamaño.

const physicalSpecs = {
  widthCm: 4,
  heightCm: 15,
  depthCm: 0.1,
  weightGrams: 10,
  material: "PET laminado mate imantado",
  magnetType: "FLEXIBLE",
  thicknessMm: 1,
  packaging: "STANDARD_BAG",
  countryOfOrigin: "CO",
  careInstructions: "Limpieza con paño seco.",
};

async function main() {
  // ── 1. Rename categoría ──
  const cat = await prisma.category.findFirst({ where: { slug: "separadores", deletedAt: null } });
  if (!cat) throw new Error("Categoría 'separadores' no encontrada");
  if (cat.name !== "Separadores de Libros (Marcapáginas)") {
    await prisma.category.update({
      where: { id: cat.id },
      data: {
        name: "Separadores de Libros (Marcapáginas)",
        description:
          "Marcapáginas personalizados con tus fotos o diseños: magnéticos doblables y alargados planos. Acabado durable (PET laminado), impresos en ambas caras. Ideales para lectores, estudiantes y regalos.",
      },
    });
    console.log("✓ Categoría renombrada → Separadores de Libros (Marcapáginas)");
  } else {
    console.log("· Categoría ya renombrada (idempotente)");
  }

  // ── 2. Rename producto Magnéticos ──
  const mag = await prisma.product.findFirst({ where: { slug: "separadores-libros" } });
  if (mag && mag.name !== "Magnéticos") {
    await prisma.product.update({ where: { id: mag.id }, data: { name: "Magnéticos" } });
    console.log("✓ Producto separadores-libros renombrado → Magnéticos");
  } else {
    console.log("· Producto Magnéticos ya renombrado (idempotente)");
  }

  // ── 3. Producto Alargados ──
  const description =
    "Marcapáginas alargado PLANO (sin doblez) personalizado con tu foto o diseño en AMBAS caras. Elige el tamaño: 15×4 cm o 12×4 cm. Impresión full color en PET laminado mate imantado, bordes redondeados. Perfecto para marcar tu lectura con estilo propio.";

  const existing = await prisma.product.findFirst({ where: { slug: PRODUCT_SLUG }, select: { id: true } });
  const data = {
    name: "Alargados",
    description,
    personalizationKind: "PHOTO_PACK",
    personalizationSchema: {
      shape: "rectangle",
      allowText: false,
      galleryTag: "separadores",
      photoSlots: 1,
      aspectRatio: "4:15",
      facesPerUnit: 2,
      cornerRadiusPx: 28,
      noFold: true,
    },
    physicalSpecs,
    basePrice: PRICE_CENTS,
    cost: Math.round(PRICE_CENTS * 0.35),
    isActive: true,
    isFeatured: false,
    isPersonalizable: true,
    deletedAt: null,
    categoryId: cat.id,
    images: [],
  };
  let productId;
  if (existing) {
    await prisma.product.update({ where: { id: existing.id }, data });
    productId = existing.id;
    console.log("✓ Producto Alargados actualizado");
  } else {
    const created = await prisma.product.create({ data: { slug: PRODUCT_SLUG, sku: PRODUCT_SKU, ...data } });
    productId = created.id;
    console.log("✓ Producto Alargados creado");
  }

  // ── Variantes (precio NO se pisa en updates — respeta al admin) ──
  for (const v of VARIANTS) {
    const attributes = {
      shape: "rectangle",
      sizeCm: v.sizeCm,
      quantity: 1,
      photoSlots: 1,
      aspectRatio: v.aspectRatio,
      variantShape: "alargado",
    };
    const found = await prisma.productVariant.findFirst({ where: { sku: v.sku } });
    if (found) {
      await prisma.productVariant.update({
        where: { id: found.id },
        data: { productId, name: v.name, attributes, isActive: true, deletedAt: null },
      });
      console.log(`  ~ variante ${v.sku} (${v.name}) actualizada (precio respetado)`);
    } else {
      await prisma.productVariant.create({
        data: { productId, sku: v.sku, name: v.name, attributes, price: PRICE_CENTS, stock: 100, isActive: true },
      });
      console.log(`  + variante ${v.sku} (${v.name}) — $${(PRICE_CENTS / 100).toLocaleString("es-CO")}`);
    }
  }

  // ── Plantillas "Separador alargado" por tamaño (fondo + foto, sin texto) ──
  for (const v of VARIANTS) {
    const canvasData = {
      version: 1,
      stage: { ...v.stage, dpiPreview: 90, dpiProduction: 300 },
      layers: [
        { id: "background", type: "background", color: "#FFFFFF" },
        {
          id: "p1",
          type: "image-placeholder",
          x: 0,
          y: 0,
          width: v.stage.width,
          height: v.stage.height,
          rotation: 0,
          cornerRadius: 0,
          label: "Foto de la cara",
        },
      ],
    };
    const found = await prisma.personalizationTemplate.findUnique({ where: { slug: v.templateSlug } });
    const tplData = {
      name: "Separador alargado",
      kind: "PHOTO_PACK",
      mode: "EDITABLE",
      productId,
      isActive: true,
      deletedAt: null,
      previewUrl: "/templates/personalizacion-libre.svg",
      canvasData,
    };
    if (found) {
      await prisma.personalizationTemplate.update({ where: { id: found.id }, data: tplData });
      console.log(`  ~ plantilla ${v.templateSlug} actualizada`);
    } else {
      await prisma.personalizationTemplate.create({ data: { slug: v.templateSlug, ...tplData } });
      console.log(`  + plantilla ${v.templateSlug} creada (${v.stage.width}×${v.stage.height})`);
    }
  }

  console.log("Listo: Ola 17 aplicada.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

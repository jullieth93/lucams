/*
 * Ola 3 (feedback Lucy 2026-07-22) — plantillas Polaroid Clásica + Instagram 3:4,
 * plantillas de CARA para separadores 2 caras, y flags del producto separadores.
 *
 * Aplica SOLO upserts puntuales (sin el soft-delete de plantillas ajenas que hace
 * seed-templates.mjs) — seguro sobre la DB compartida mientras otros frentes
 * trabajan en datos. Idempotente: re-correr no duplica.
 *
 * Qué hace:
 *   1. Upsert "photo-pack-polaroid-clasica" (tarjeta con franja, frame-card +
 *      texto editable) y re-layout de "photo-pack-polaroid-instagram" a 450×600
 *      (3:4 = formato físico 7.5×10 → el filtro de aspect no la excluye más).
 *   2. Upsert plantillas de cara "separador-cuadrado-cara" (400×420) y
 *      "separador-rectangular-cara" (600×200) para separadores-libros.
 *   3. Producto separadores-libros: merge en personalizationSchema de
 *      { facesPerUnit: 2, cornerRadiusPx: 28 } (2 caras por unidad + troquel redondo).
 *      NO toca variantes ni precios (eso es del frente de datos).
 *
 * Uso: pnpm --filter @lucams/db exec node scripts/ola3-templates-2caras-polaroid.mjs
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

console.log("=== ola3-templates-2caras-polaroid ===\n");

const stage = (width, height) => ({ width, height, dpiPreview: 90, dpiProduction: 300 });

const polaroidProduct = await prisma.product.findUnique({
  where: { sku: "FI-POL-12" },
  select: { id: true },
});
if (!polaroidProduct) {
  console.error("✗ Producto Fotoimanes Polaroid (FI-POL-12) no existe.");
  await prisma.$disconnect();
  process.exit(1);
}

const separadoresProduct = await prisma.product.findUnique({
  where: { slug: "separadores-libros" },
  select: { id: true, personalizationSchema: true },
});

const TEMPLATES = [
  {
    slug: "photo-pack-polaroid-clasica",
    productId: polaroidProduct.id,
    kind: "PHOTO_PACK",
    name: "Polaroid Clásica",
    order: 1,
    previewUrl: "/templates/polaroid_clasica.svg",
    canvasData: {
      version: 1,
      stage: stage(450, 600),
      layers: [
        { id: "background", type: "background", color: "#FFFFFF" },
        { id: "card", type: "frame-card", fill: "#FFFFFF", cornerRadius: 18 },
        { id: "p1", type: "image-placeholder", x: 28, y: 28, width: 394, height: 394, label: "Tu foto" },
        {
          id: "message",
          type: "text",
          x: 225,
          y: 512,
          text: "Escribe tu mensaje",
          fontFamily: "Fredoka",
          fontSize: 34,
          fill: "#3D2E5C",
          fontWeight: "normal",
          align: "center",
          editable: true,
        },
      ],
    },
  },
  {
    slug: "photo-pack-polaroid-instagram",
    productId: polaroidProduct.id,
    kind: "PHOTO_PACK",
    name: "Polaroid Instagram",
    order: 2,
    previewUrl: "/templates/ig_post_3x4.svg",
    canvasData: {
      version: 1,
      stage: stage(450, 600),
      layers: [
        { id: "background", type: "background", color: "#FFFFFF" },
        { id: "p1", type: "image-placeholder", x: 25, y: 88, width: 400, height: 400, label: "Tu foto" },
        { id: "frame", type: "asset", src: "/templates/ig_post_3x4.svg", x: 0, y: 0, width: 450, height: 600, rotation: 0, opacity: 1 },
        { id: "user_name", type: "text", x: 80, y: 42, text: "@tu_usuario", fontFamily: "Inter", fontSize: 21, fill: "#262626", fontWeight: "bold", align: "left", editable: true },
        { id: "likes_count", type: "text", x: 28, y: 544, text: "362 me gusta", fontFamily: "Inter", fontSize: 17, fill: "#262626", fontWeight: "bold", align: "left", editable: true },
        { id: "caption", type: "text", x: 25, y: 568, text: "Tu título acá", fontFamily: "Inter", fontSize: 19, fill: "#262626", fontWeight: "bold", align: "left", editable: true },
        { id: "hashtags", type: "text", x: 25, y: 588, text: "#mirecuerdo #lucamsshop", fontFamily: "Inter", fontSize: 13, fill: "#00376B", fontWeight: "normal", align: "left", editable: true },
      ],
    },
  },
  ...(separadoresProduct
    ? [
        {
          slug: "separador-cuadrado-cara",
          productId: separadoresProduct.id,
          kind: "PHOTO_PACK",
          name: "Separador cuadrado (cara)",
          order: 1,
          previewUrl: "/templates/personalizacion-libre.svg",
          canvasData: {
            version: 1,
            stage: stage(400, 420),
            layers: [
              { id: "background", type: "background", color: "#FFFFFF" },
              { id: "p1", type: "image-placeholder", x: 0, y: 0, width: 400, height: 420, label: "Foto de la cara" },
            ],
          },
        },
        {
          slug: "separador-rectangular-cara",
          productId: separadoresProduct.id,
          kind: "PHOTO_PACK",
          name: "Separador rectangular (cara)",
          order: 2,
          previewUrl: "/templates/personalizacion-libre.svg",
          canvasData: {
            version: 1,
            stage: stage(600, 200),
            layers: [
              { id: "background", type: "background", color: "#FFFFFF" },
              { id: "p1", type: "image-placeholder", x: 0, y: 0, width: 600, height: 200, label: "Foto de la cara" },
            ],
          },
        },
      ]
    : []),
];

for (const t of TEMPLATES) {
  await prisma.personalizationTemplate.upsert({
    where: { slug: t.slug },
    update: {
      kind: t.kind,
      name: t.name,
      product: { connect: { id: t.productId } },
      previewUrl: t.previewUrl,
      canvasData: t.canvasData,
      order: t.order,
      isActive: true,
      deletedAt: null,
      deletedBy: null,
    },
    create: {
      kind: t.kind,
      name: t.name,
      slug: t.slug,
      product: { connect: { id: t.productId } },
      previewUrl: t.previewUrl,
      canvasData: t.canvasData,
      order: t.order,
      isActive: true,
    },
  });
  console.log(`  ✓ ${t.name} [${t.kind}]`);
}

// Flags del producto separadores: 2 caras por unidad + esquinas redondas del troquel.
if (separadoresProduct) {
  const current =
    separadoresProduct.personalizationSchema &&
    typeof separadoresProduct.personalizationSchema === "object"
      ? separadoresProduct.personalizationSchema
      : {};
  await prisma.product.update({
    where: { id: separadoresProduct.id },
    data: {
      personalizationSchema: { ...current, facesPerUnit: 2, cornerRadiusPx: 28 },
    },
  });
  console.log("  ✓ separadores-libros schema += { facesPerUnit: 2, cornerRadiusPx: 28 }");
} else {
  console.warn("  ⚠ separadores-libros no existe — se omitieron sus plantillas/flags.");
}

console.log("\nListo. Sin soft-deletes; solo upserts puntuales.");
await prisma.$disconnect();
process.exit(0);

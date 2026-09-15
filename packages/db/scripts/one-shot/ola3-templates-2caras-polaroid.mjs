/*
 * ARCHIVADO en one-shot/ (N-06, 2026-09-12): one-shot ya aplicado; se
 * conserva como referencia y para rerun DELIBERADO (ver lib/env-guard.mjs).
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
 *   2. RETIRADO (D4, 2026-09-15): ya NO upserta las plantillas de cara
 *      "separador-cuadrado-cara" (400×420) ni "separador-rectangular-cara"
 *      (600×200) — al re-correr las ARCHIVA (soft-delete idempotente). La
 *      rectangular tenía el stage HORIZONTAL para el formato 2×6 vertical
 *      (aspect 3.0 no matchea ninguna variante → nunca visible en el Estudio)
 *      y la cuadrada duplicaba exactamente a la canónica sep-mag-4x4-2; las
 *      canónicas por tamaño (sep-mag-2x6, sep-mag-4x4-2 de seed-templates.mjs)
 *      ya cubren ambas caras. Decisión: desactivar duplicados, no acumular
 *      plantillas muertas — la normalización en DBs existentes la hace
 *      scripts/one-shot/normalize-template-visibility-20260915.mjs.
 *   3. Producto separadores (hoy "separadores-magneticos", renombrado por
 *      ola19): merge en personalizationSchema de
 *      { facesPerUnit: 2, cornerRadiusPx: 28 } (2 caras por unidad + troquel redondo).
 *      NO toca variantes ni precios (eso es del frente de datos).
 *
 * Uso: pnpm --filter @lucams/db exec node scripts/one-shot/ola3-templates-2caras-polaroid.mjs
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";
// Guarda de ambiente (N-06, 2026-09-12): one-shot aplicado — al re-correrlo
// bloquea PRD/remotos no reconocidos (fail-closed, lib/env-guard.mjs).
assertDestructiveAllowed("ola3-templates-2caras-polaroid.mjs");

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

// D4 (2026-09-15) — el producto se llama hoy "separadores-magneticos" (ola19 lo
// renombró); se busca por ambos slugs para que un rerun deliberado lo encuentre.
const separadoresProduct = await prisma.product.findFirst({
  where: { slug: { in: ["separadores-magneticos", "separadores-libros"] }, deletedAt: null },
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
        {
          id: "p1",
          type: "image-placeholder",
          x: 28,
          y: 28,
          width: 394,
          height: 394,
          label: "Tu foto",
        },
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
        {
          id: "p1",
          type: "image-placeholder",
          x: 29,
          y: 58,
          width: 392,
          height: 392,
          label: "Tu foto",
        },
        {
          id: "frame",
          type: "asset",
          src: "/templates/ig_post_3x4.svg",
          x: 0,
          y: 0,
          width: 450,
          height: 600,
          rotation: 0,
          opacity: 1,
        },
        {
          id: "user_name",
          type: "text",
          x: 68,
          y: 28,
          text: "@tu_usuario",
          fontFamily: "Inter",
          fontSize: 16,
          fill: "#262626",
          fontWeight: "bold",
          align: "left",
          editable: true,
        },
        {
          id: "location",
          type: "text",
          x: 68,
          y: 46,
          text: "Bogotá, Colombia",
          fontFamily: "Inter",
          fontSize: 12,
          fill: "#8E8E8E",
          align: "left",
          editable: true,
        },
        // Footer alineado al fix 2026-07-24 (ola9): los iconos del chrome ocupan
        // y≈468–496; el texto debe caer bajo ellos (top = y − fontSize/2).
        {
          id: "likes_count",
          type: "text",
          x: 22,
          y: 510,
          text: "362 me gusta",
          fontFamily: "Inter",
          fontSize: 15,
          fill: "#262626",
          fontWeight: "bold",
          align: "left",
          editable: true,
        },
        {
          id: "caption",
          type: "text",
          x: 22,
          y: 526,
          text: "Tu título acá",
          fontFamily: "Inter",
          fontSize: 16,
          fill: "#262626",
          fontWeight: "bold",
          align: "left",
          editable: true,
        },
        {
          id: "hashtags",
          type: "text",
          x: 22,
          y: 542,
          text: "#mirecuerdo #lucamsshop",
          fontFamily: "Inter",
          fontSize: 13,
          fill: "#00376B",
          fontWeight: "normal",
          align: "left",
          editable: true,
        },
      ],
    },
  },
  // D4 (2026-09-15) — las plantillas de cara "separador-cuadrado-cara" y
  // "separador-rectangular-cara" salieron del upsert: la canónica por tamaño
  // (sep-mag-2x6 / sep-mag-4x4-2 en seed-templates.mjs) ya cubre ambas y la
  // rectangular estaba desorientada (stage 600×200 horizontal para el 2×6
  // vertical). Abajo se archivan por si existen en la DB.
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

// D4 (2026-09-15) — archivar las legadas de cara si existen (soft-delete
// idempotente, reversible desde el admin): así un rerun deliberado de este
// script no las deja activas compitiendo con las canónicas sep-mag-*.
for (const slug of ["separador-cuadrado-cara", "separador-rectangular-cara"]) {
  const legacy = await prisma.personalizationTemplate.findUnique({ where: { slug } });
  if (!legacy || legacy.deletedAt) continue;
  await prisma.personalizationTemplate.update({
    where: { id: legacy.id },
    data: {
      deletedAt: new Date(),
      isActive: false,
      deletedBy: "system:ola3-retire-cara-templates",
    },
  });
  console.log(`  ✓ ${slug} archivada (retirada D4 — la cubre la canónica sep-mag-*)`);
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
  console.log("  ✓ separadores schema += { facesPerUnit: 2, cornerRadiusPx: 28 }");
} else {
  console.warn("  ⚠ producto separadores no existe — se omitieron sus flags.");
}

console.log("\nListo. Upserts puntuales + archivado idempotente de las legadas de cara (D4).");
await prisma.$disconnect();
process.exit(0);

/*
 * ADR-057 Fase B — Separadores magnéticos para libros (marcar la página al leer).
 *
 * Visión de Lucy (2026-07-12): UN producto con 2 FORMAS (cuadrado / rectangular), cantidad
 * deseada, diseños prediseñados + subir tu imagen. Este script hace la FUNDACIÓN (B1):
 *   - UN producto "Separadores para Libros" (PHOTO_PACK) → editor de foto (sube N imágenes).
 *   - Variantes: forma (cuadrado 1:1 / rectangular 5:14, típico de marcapáginas) × cantidad
 *     (1/3/5). photoSlots = cantidad. aspectRatio por forma.
 *   - Activado (hoy los 2 productos viejos están inactivos → no vendible).
 *   - Archiva los 2 productos viejos (personalizables + prediseñados).
 *
 * Los prediseñados (elegir un diseño del catálogo por slot) llegan en B2 (gallery en el editor).
 * Idempotente: upsert por slug/sku; en updates NO pisa el precio (respeta el admin).
 *
 * Uso: DATABASE_URL=$DIRECT_URL node packages/db/scripts/restructure-separadores.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SHAPES = [
  { key: "cuadrado", label: "Cuadrado", aspectRatio: "1:1", sizeCm: "6×6", shape: "rectangle" },
  { key: "rectangular", label: "Rectangular", aspectRatio: "5:14", sizeCm: "5×14", shape: "rectangle" },
];
// cantidad → precio del pack (centavos COP). Descuento por volumen.
const QTYS = [
  { qty: 1, pesos: 6000 },
  { qty: 3, pesos: 15000 },
  { qty: 5, pesos: 22000 },
];

const basePhysicalSpecs = {
  widthCm: 5,
  heightCm: 14,
  depthCm: 0.1,
  weightGrams: 12,
  material: "PET laminado mate imantado",
  magnetType: "FLEXIBLE",
  thicknessMm: 1,
  packaging: "STANDARD_BAG",
  countryOfOrigin: "CO",
  careInstructions: "Limpieza con paño seco.",
};

async function main() {
  const cat = await prisma.category.findFirst({ where: { slug: "separadores", deletedAt: null }, select: { id: true } });
  if (!cat) throw new Error("Categoría 'separadores' no encontrada");

  console.log("Separadores para Libros:");
  const slug = "separadores-libros";
  const sku = "SEP-LIBROS";
  const description =
    "Separadores magnéticos para libros (marcan la página sin caerse). Elige la forma (cuadrado o rectangular) y cuántos quieres; personalízalos con tus fotos en el editor. Perfectos para regalar a quien ama leer.";

  const existing = await prisma.product.findFirst({ where: { slug }, select: { id: true } });
  const data = {
    name: "Separadores para Libros",
    description,
    personalizationKind: "PHOTO_PACK",
    // galleryTag: habilita la galería de diseños PREDISEÑADOS en el editor (Fase B2).
    personalizationSchema: { allowText: false, photoSlots: 1, aspectRatio: "1:1", shape: "rectangle", galleryTag: "separadores" },
    physicalSpecs: basePhysicalSpecs,
    basePrice: 6000 * 100,
    cost: Math.round(6000 * 100 * 0.35),
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
    console.log("  ~ producto actualizado");
  } else {
    const created = await prisma.product.create({ data: { slug, sku, ...data } });
    productId = created.id;
    console.log("  + producto creado");
  }

  for (const s of SHAPES) {
    for (const q of QTYS) {
      const vsku = `SEP-${s.key.slice(0, 4).toUpperCase()}-${q.qty}`;
      const name = `${s.label} · ${q.qty} separador${q.qty > 1 ? "es" : ""} · ${s.sizeCm} cm`;
      const attributes = {
        shape: s.shape,
        aspectRatio: s.aspectRatio,
        sizeCm: s.sizeCm,
        photoSlots: q.qty,
        quantity: q.qty,
        variantShape: s.key, // etiqueta de forma para el selector
      };
      const found = await prisma.productVariant.findFirst({ where: { sku: vsku } });
      if (found) {
        await prisma.productVariant.update({
          where: { id: found.id },
          data: { productId, name, attributes, isActive: true, deletedAt: null },
        });
        console.log(`    ~ ${vsku} (precio respetado)`);
      } else {
        await prisma.productVariant.create({
          data: { productId, sku: vsku, name, attributes, price: q.pesos * 100, stock: 100, isActive: true },
        });
        console.log(`    + ${vsku} — $${q.pesos.toLocaleString("es-CO")}`);
      }
    }
  }

  // Plantillas dedicadas por FORMA (solo [fondo, foto], sin texto). El editor filtra por
  // aspectRatio de la variante → la rectangular rutea a su stage tall (WYSIWYG del separador).
  const TEMPLATES = [
    { slug: "sep-cuadrado", name: "Separador cuadrado", stage: { width: 600, height: 600 } },
    { slug: "sep-rectangular", name: "Separador rectangular", stage: { width: 500, height: 1400 } },
  ];
  for (const t of TEMPLATES) {
    const canvasData = {
      version: 1,
      stage: { width: t.stage.width, height: t.stage.height, dpiPreview: 90, dpiProduction: 300 },
      layers: [
        { id: "bg", type: "background", color: "#FFFFFF" },
        { id: "photo", type: "image-placeholder", x: 0, y: 0, width: t.stage.width, height: t.stage.height, cornerRadius: 0 },
      ],
    };
    const found = await prisma.personalizationTemplate.findFirst({ where: { slug: t.slug } });
    const tdata = {
      productId,
      kind: "PHOTO_PACK",
      name: t.name,
      description: "Separador para libros — tu foto a todo el separador.",
      previewUrl: "/brand/lucams-logo.png",
      canvasData,
      isActive: true,
      order: -10, // gana el desempate vs plantilla global
      deletedAt: null,
    };
    if (found) {
      await prisma.personalizationTemplate.update({ where: { id: found.id }, data: tdata });
      console.log(`  ~ plantilla ${t.slug} (${t.stage.width}×${t.stage.height})`);
    } else {
      await prisma.personalizationTemplate.create({ data: { slug: t.slug, ...tdata } });
      console.log(`  + plantilla ${t.slug} (${t.stage.width}×${t.stage.height})`);
    }
  }

  // Archivar los 2 productos viejos (inactivos): personalizables + prediseñados.
  const oldSlugs = ["separadores-personalizables", "separadores-predisenados"];
  for (const os of oldSlugs) {
    const old = await prisma.product.findFirst({ where: { slug: os, deletedAt: null }, select: { id: true } });
    if (old) {
      await prisma.productVariant.updateMany({ where: { productId: old.id }, data: { isActive: false, deletedAt: new Date() } });
      await prisma.product.update({ where: { id: old.id }, data: { isActive: false, deletedAt: new Date() } });
      console.log(`  ⊘ ${os} archivado`);
    }
  }

  console.log("\n✓ DONE. /producto/separadores-libros (activo).");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

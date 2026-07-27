/*
 * Ola 19 — Separadores de Libros: renombrar categoría, dividir producto actual en
 * "Separadores Magnéticos" + nuevo "Separadores Alargados", y generar variantes
 * homogéneas (tamaño chip + cantidad stepper 1..6, $4.000 c/u).
 *
 * Convención de tamaños: ancho × alto (cm).
 *   - Magnéticos: 2×6 cm y 4×4.2 cm
 *   - Alargados:  4×12 cm y 4×15 cm
 *
 * Cada unidad tiene 2 caras (frente/respaldo). Los alargados se marcan con noFold
 * para que la vista 3D los muestre planos sobre la hoja (marcapáginas clásico).
 *
 * Idempotente: upsert por slug/sku. Respeta precios existentes salvo que estén
 * a 0 (los resetea al precio canónico).
 *
 * Uso: pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/ola19-separadores-libros.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATEGORY_SLUG = "separadores";
const CATEGORY_NAME = "Separadores de Libros (Marcapáginas)";

const UNIT_PRICE_CENTS = 4_000 * 100; // $4.000 COP
const MIN_QTY = 1;
const MAX_QTY = 6;

const PRODUCTS = [
  {
    slug: "separadores-magneticos",
    sku: "SEP-MAG",
    name: "Separadores Magnéticos",
    description:
      "Separadores magnéticos para libros. Elige el tamaño y la cantidad; personalízalos con tus fotos en el estudio. Doble cara, doble imagen.",
    // SEP1 — todos los separadores de libros comparten el galleryTag base para que el estudio
    // reconozca el producto como "bookmark" (vista inmersiva = libro, no nevera).
    galleryTag: "separadores",
    noFold: false,
    sizes: [
      { key: "2x6", label: "2×6 cm", widthCm: 2, heightCm: 6, cornerRadiusPx: 18 },
      { key: "4x4-2", label: "4×4.2 cm", widthCm: 4, heightCm: 4.2, cornerRadiusPx: 24 },
    ],
  },
  {
    slug: "separadores-alargados",
    sku: "SEP-ALR",
    name: "Separadores Alargados",
    description:
      "Marcapáginas alargados, ideales para regalar. Elige el tamaño y la cantidad; personalízalos con tus fotos en el estudio. Doble cara, doble imagen.",
    galleryTag: "separadores",
    noFold: true,
    sizes: [
      { key: "4x12", label: "4×12 cm", widthCm: 4, heightCm: 12, cornerRadiusPx: 24 },
      { key: "4x15", label: "4×15 cm", widthCm: 4, heightCm: 15, cornerRadiusPx: 24 },
    ],
  },
];

const basePhysicalSpecs = {
  depthCm: 0.1,
  weightGrams: 12,
  material: "PET laminado mate imantado",
  magnetType: "FLEXIBLE",
  thicknessMm: 1,
  packaging: "STANDARD_BAG",
  countryOfOrigin: "CO",
  careInstructions: "Limpieza con paño seco.",
};

function aspectRatioString(w, h) {
  // Normaliza a "W:H" con enteros pequeños cuando es posible.
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  // Usamos decimales para 4.2 → 42/10 → simplificar con 6.
  const wh = Math.round(w * 10);
  const hh = Math.round(h * 10);
  const g = gcd(wh, hh);
  return `${wh / g}:${hh / g}`;
}

function pxAt100PerCm(cm) {
  return Math.round(cm * 100);
}

async function main() {
  // ── 1. Renombrar categoría ──────────────────────────────────────────────
  const category = await prisma.category.findFirst({
    where: { slug: CATEGORY_SLUG, deletedAt: null },
    select: { id: true },
  });
  if (!category) throw new Error(`Categoría '${CATEGORY_SLUG}' no encontrada`);

  await prisma.category.update({
    where: { id: category.id },
    data: { name: CATEGORY_NAME },
  });
  console.log(`✓ Categoría renombrada: ${CATEGORY_NAME}`);

  // ── 2. Renombrar / migrar producto legacy ─────────────────────────────
  // El producto actual se llama "Separadores para Libros" (slug separadores-libros).
  // Lo renombramos a "Separadores Magnéticos". Si ya fue renombrado, lo buscamos por slug.
  let legacy = await prisma.product.findFirst({
    where: { slug: "separadores-libros", deletedAt: null },
    select: { id: true },
  });

  const magSpec = PRODUCTS[0];
  let magneticProductId;
  if (legacy) {
    await prisma.product.update({
      where: { id: legacy.id },
      data: {
        slug: magSpec.slug,
        sku: magSpec.sku,
        name: magSpec.name,
        description: magSpec.description,
        basePrice: UNIT_PRICE_CENTS,
        isActive: true,
        isPersonalizable: true,
        personalizationKind: "PHOTO_PACK",
        personalizationSchema: {
          allowText: false,
          photoSlots: 1,
          shape: "rectangle",
          galleryTag: magSpec.galleryTag,
          facesPerUnit: 2,
          cornerRadiusPx: 20,
          noFold: magSpec.noFold,
        },
        physicalSpecs: {
          ...basePhysicalSpecs,
          widthCm: magSpec.sizes[0].widthCm,
          heightCm: magSpec.sizes[0].heightCm,
        },
        cost: Math.round(UNIT_PRICE_CENTS * 0.35),
        deletedAt: null,
      },
    });
    magneticProductId = legacy.id;
    console.log(`✓ Producto legacy renombrado a ${magSpec.slug}`);
  } else {
    const existingMag = await prisma.product.findFirst({
      where: { slug: magSpec.slug, deletedAt: null },
      select: { id: true },
    });
    if (existingMag) {
      await prisma.product.update({
        where: { id: existingMag.id },
        data: {
          sku: magSpec.sku,
          name: magSpec.name,
          description: magSpec.description,
          basePrice: UNIT_PRICE_CENTS,
          isActive: true,
          isPersonalizable: true,
          personalizationKind: "PHOTO_PACK",
          personalizationSchema: {
            allowText: false,
            photoSlots: 1,
            shape: "rectangle",
            galleryTag: magSpec.galleryTag,
            facesPerUnit: 2,
            cornerRadiusPx: 20,
            noFold: magSpec.noFold,
          },
          physicalSpecs: {
            ...basePhysicalSpecs,
            widthCm: magSpec.sizes[0].widthCm,
            heightCm: magSpec.sizes[0].heightCm,
          },
          cost: Math.round(UNIT_PRICE_CENTS * 0.35),
          deletedAt: null,
        },
      });
      magneticProductId = existingMag.id;
      console.log(`✓ Producto actualizado: ${magSpec.slug}`);
    }
  }

  // ── 3. Crear/actualizar producto Alargados ──────────────────────────────
  const alargadoSpec = PRODUCTS[1];
  let alargadoProduct = await prisma.product.findFirst({
    where: { slug: alargadoSpec.slug, deletedAt: null },
    select: { id: true },
  });

  let alargadoProductId;
  if (!alargadoProduct) {
    const created = await prisma.product.create({
      data: {
        slug: alargadoSpec.slug,
        sku: alargadoSpec.sku,
        name: alargadoSpec.name,
        description: alargadoSpec.description,
        basePrice: UNIT_PRICE_CENTS,
        isActive: true,
        isPersonalizable: true,
        personalizationKind: "PHOTO_PACK",
        personalizationSchema: {
          allowText: false,
          photoSlots: 1,
          shape: "rectangle",
          galleryTag: alargadoSpec.galleryTag,
          facesPerUnit: 2,
          cornerRadiusPx: 20,
          noFold: alargadoSpec.noFold,
        },
        physicalSpecs: {
          ...basePhysicalSpecs,
          widthCm: alargadoSpec.sizes[0].widthCm,
          heightCm: alargadoSpec.sizes[0].heightCm,
        },
        cost: Math.round(UNIT_PRICE_CENTS * 0.35),
        categoryId: category.id,
        images: [],
      },
    });
    alargadoProductId = created.id;
    console.log(`✓ Producto creado: ${alargadoSpec.slug}`);
  } else {
    await prisma.product.update({
      where: { id: alargadoProduct.id },
      data: {
        sku: alargadoSpec.sku,
        name: alargadoSpec.name,
        description: alargadoSpec.description,
        basePrice: UNIT_PRICE_CENTS,
        isActive: true,
        isPersonalizable: true,
        personalizationKind: "PHOTO_PACK",
        personalizationSchema: {
          allowText: false,
          photoSlots: 1,
          shape: "rectangle",
          galleryTag: alargadoSpec.galleryTag,
          facesPerUnit: 2,
          cornerRadiusPx: 20,
          noFold: alargadoSpec.noFold,
        },
        physicalSpecs: {
          ...basePhysicalSpecs,
          widthCm: alargadoSpec.sizes[0].widthCm,
          heightCm: alargadoSpec.sizes[0].heightCm,
        },
        cost: Math.round(UNIT_PRICE_CENTS * 0.35),
        deletedAt: null,
      },
    });
    alargadoProductId = alargadoProduct.id;
    console.log(`✓ Producto actualizado: ${alargadoSpec.slug}`);
  }

  // Asegurar que ambos productos estén en la categoría correcta
  if (magneticProductId) {
    await prisma.product.update({ where: { id: magneticProductId }, data: { categoryId: category.id } });
  }

  // ── 4. Variantes ────────────────────────────────────────────────────────
  for (const spec of PRODUCTS) {
    const productId = spec.slug === "separadores-magneticos" ? magneticProductId : alargadoProductId;
    if (!productId) continue;

    for (const size of spec.sizes) {
      for (let qty = MIN_QTY; qty <= MAX_QTY; qty++) {
        const sku = `${spec.sku}-${size.key.toUpperCase().replace(/[.-]/g, "")}-${qty}`;
        const name = `${size.label} · ${qty} separador${qty > 1 ? "es" : ""}`;
        const price = UNIT_PRICE_CENTS * qty;
        const aspect = aspectRatioString(size.widthCm, size.heightCm);
        // Ola 19c — separadores: cada unidad física tiene 2 caras (A/B). El estudio
        // multiplica `photoSlots` (unidades físicas) por `facesPerUnit=2` para crear
        // los slots 1A/1B…qA/qB. Por eso `photoSlots = qty` (cantidad de separadores),
        // no qty*2. La dimensión visible en PDP es `quantity` (stepper 1..6);
        // `photoSlots` se oculta vía PDP_HIDDEN_DIMENSION_KEYS porque es técnico.
        const attributes = {
          shape: "rectangle",
          aspectRatio: aspect,
          sizeCm: size.label.replace(" cm", ""),
          photoSlots: qty,
          quantity: qty,
          facesPerUnit: 2,
          variantShape: size.key,
          cornerRadiusPx: size.cornerRadiusPx,
          noFold: spec.noFold,
        };

        const existing = await prisma.productVariant.findFirst({ where: { sku } });
        if (existing) {
          await prisma.productVariant.update({
            where: { id: existing.id },
            data: {
              productId,
              name,
              attributes,
              price,
              stock: 100,
              isActive: true,
              deletedAt: null,
            },
          });
        } else {
          await prisma.productVariant.create({
            data: {
              productId,
              sku,
              name,
              attributes,
              price,
              stock: 100,
              isActive: true,
            },
          });
        }
      }
    }
    console.log(`✓ Variantes ${spec.slug}: ${spec.sizes.length} tamaños × ${MAX_QTY} cantidades`);
  }

  // ── 5. Plantillas base de CARA (unitTemplate) para cada tamaño ─────────
  // Estas plantillas son EDITABLE y específicas de producto. El estudio las filtra
  // por productId y por aspect ratio de la variante seleccionada.
  for (const spec of PRODUCTS) {
    const productId = spec.slug === "separadores-magneticos" ? magneticProductId : alargadoProductId;
    if (!productId) continue;

    for (const size of spec.sizes) {
      const tplSlug = `sep-${spec.sku.toLowerCase().replace(/sep-/, "")}-${size.key}`;
      const width = pxAt100PerCm(size.widthCm);
      const height = pxAt100PerCm(size.heightCm);
      const canvasData = {
        version: 1,
        stage: {
          width,
          height,
          dpiPreview: 90,
          dpiProduction: 300,
        },
        layers: [
          { id: "background", type: "background", color: "#FFFFFF" },
          {
            id: "photo",
            type: "image-placeholder",
            x: 0,
            y: 0,
            width,
            height,
            cornerRadius: size.cornerRadiusPx,
          },
        ],
      };

      const existing = await prisma.personalizationTemplate.findFirst({ where: { slug: tplSlug } });
      const data = {
        productId,
        kind: "PHOTO_PACK",
        mode: "EDITABLE",
        name: `${spec.name} — ${size.label}`,
        description: `Plantilla base para ${size.label}`,
        previewUrl: "/brand/lucams-logo.png",
        canvasData,
        isActive: true,
        order: -10,
        deletedAt: null,
      };

      if (existing) {
        await prisma.personalizationTemplate.update({ where: { id: existing.id }, data });
      } else {
        await prisma.personalizationTemplate.create({ data: { slug: tplSlug, ...data } });
      }
    }
    console.log(`✓ Plantillas base ${spec.slug}: ${spec.sizes.length} plantillas`);
  }

  // ── 6. Archivar variantes viejas de los productos activos ───────────────
  // (dejan de venderse porque el SKU no matchea el nuevo esquema homogéneo).
  for (const spec of PRODUCTS) {
    const productId = spec.slug === "separadores-magneticos" ? magneticProductId : alargadoProductId;
    if (!productId) continue;
    const expectedPrefix = `${spec.sku}-`;
    const stale = await prisma.productVariant.findMany({
      where: { productId, isActive: true, deletedAt: null },
      select: { id: true, sku: true },
    });
    const toArchive = stale.filter((v) => !v.sku.startsWith(expectedPrefix));
    if (toArchive.length > 0) {
      await prisma.productVariant.updateMany({
        where: { id: { in: toArchive.map((v) => v.id) } },
        data: { isActive: false, deletedAt: new Date() },
      });
      console.log(`⊘ ${toArchive.length} variantes viejas archivadas en ${spec.slug}`);
    }
  }

  // ── 7. Archivar slugs legacy huérfanos ──────────────────────────────────
  const orphanSlugs = ["separadores-personalizables", "separadores-predisenados"];
  for (const os of orphanSlugs) {
    const prod = await prisma.product.findFirst({ where: { slug: os, deletedAt: null }, select: { id: true } });
    if (prod) {
      await prisma.productVariant.updateMany({
        where: { productId: prod.id },
        data: { isActive: false, deletedAt: new Date() },
      });
      await prisma.product.update({ where: { id: prod.id }, data: { isActive: false, deletedAt: new Date() } });
      console.log(`⊘ ${os} archivado`);
    }
  }

  console.log("\n✅ DONE. Verifica /producto/separadores-magneticos y /producto/separadores-alargados");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

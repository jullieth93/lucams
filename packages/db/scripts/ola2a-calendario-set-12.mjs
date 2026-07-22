/*
 * ola2a-calendario-set-12.mjs — Calendario → SET DE 12 TARJETAS mensuales 7.5×10 cm
 * (decisión Lucy 2026-07-22). El calendario de pared con espiral se archiva.
 *
 * Cambios (transaccionales, idempotentes):
 *   1. Product `calendario-mes-a-mes-fotos`:
 *      - name/description/physicalSpecs → set de tarjetas (ya no "paneles A4 + marco").
 *      - personalizationSchema += sizeCm "7.5×10", aspectRatio "3:4", shape "rectangle".
 *      - PRECIO INTACTO (se reporta el actual).
 *   2. Variant default del set: nombre + attributes coherentes (photoSlots 12, 7.5×10, 3:4).
 *   3. Template del Estudio `libre-calendar-photo-month`: ventana de foto 600×450 (4:3)
 *      full-bleed arriba — espejo de la región de foto de producción (1080×810 sobre la
 *      tarjeta 1080×1440) para que el encuadre del cliente mapee 1:1 (WYSIWYG).
 *
 * Uso: pnpm --filter @lucams/db exec node scripts/ola2a-calendario-set-12.mjs
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

const SLUG = "calendario-mes-a-mes-fotos";

const product = await prisma.product.findUnique({
  where: { slug: SLUG },
  include: { variants: { where: { deletedAt: null } } },
});
if (!product) {
  console.error(`✗ Producto /${SLUG} no encontrado`);
  process.exit(1);
}

console.log("=== ANTES ===");
console.log(`Product: ${product.name} (/${product.slug})`);
console.log(`  basePrice: ${product.basePrice} centavos = $${(product.basePrice / 100).toLocaleString("es-CO")} COP`);
console.log(`  description: ${product.description}`);
console.log(`  schema: ${JSON.stringify(product.personalizationSchema)}`);
console.log(`  physicalSpecs: ${JSON.stringify(product.physicalSpecs)}`);

const result = await prisma.$transaction(async (tx) => {
  // 1. Producto → set de 12 tarjetas 7.5×10. Precio intacto.
  const updatedProduct = await tx.product.update({
    where: { id: product.id },
    data: {
      name: "Calendario Set 12 Tarjetas",
      description:
        "Set de 12 tarjetas mensuales de 7.5×10 cm: tu foto arriba y el mes abajo en lettering grande, con los festivos de Colombia marcados. Subes las 12 fotos en el Estudio y eliges el año de tu calendario.",
      personalizationSchema: {
        year: 2027,
        photoSlots: 12,
        monthLabels: true,
        sizeCm: "7.5×10",
        aspectRatio: "3:4",
        shape: "rectangle",
      },
      physicalSpecs: {
        ...(typeof product.physicalSpecs === "object" && product.physicalSpecs !== null
          ? product.physicalSpecs
          : {}),
        widthCm: 7.5,
        heightCm: 10,
        depthCm: 0.5,
        thicknessMm: 1,
        weightGrams: 90,
        includes: ["12 tarjetas mensuales 7.5×10 cm", "Empaque regalo"],
        careInstructions: "Limpieza con paño seco. No doblar las tarjetas.",
      },
    },
    select: { id: true, name: true, basePrice: true },
  });

  // 2. Variant default del set: nombre + attributes coherentes.
  const variant = product.variants[0];
  let updatedVariant = null;
  if (variant) {
    updatedVariant = await tx.productVariant.update({
      where: { id: variant.id },
      data: {
        name: "Set 12 tarjetas · 7.5×10 cm",
        attributes: { photoSlots: 12, sizeCm: "7.5×10", aspectRatio: "3:4" },
      },
      select: { id: true, name: true, price: true },
    });
  }

  // 3. Template del Estudio: ventana de foto 600×450 (4:3) full-bleed arriba sobre
  //    tarjeta 600×800 (3:4) — espejo de CALENDAR_PHOTO (1080×810 en página 1080×1440).
  const template = await tx.personalizationTemplate.findUnique({
    where: { slug: "libre-calendar-photo-month" },
  });
  let updatedTemplate = null;
  if (template) {
    updatedTemplate = await tx.personalizationTemplate.update({
      where: { id: template.id },
      data: {
        canvasData: {
          version: 1,
          stage: { width: 600, height: 800, dpiPreview: 90, dpiProduction: 300 },
          layers: [
            { id: "background", type: "background", color: "#FFFFFF" },
            {
              id: "p1",
              type: "image-placeholder",
              x: 0,
              y: 0,
              width: 600,
              height: 450,
              cornerRadius: 0,
              rotation: 0,
              label: "Foto del mes",
            },
          ],
        },
      },
      select: { id: true, slug: true },
    });
  }

  return { updatedProduct, updatedVariant, updatedTemplate };
});

console.log("\n=== DESPUÉS ===");
console.log(`✓ Product actualizado: ${result.updatedProduct.name} (id=${result.updatedProduct.id})`);
console.log(`  PRECIO CONSERVADO: ${result.updatedProduct.basePrice} centavos = $${(result.updatedProduct.basePrice / 100).toLocaleString("es-CO")} COP`);
if (result.updatedVariant) {
  console.log(`✓ Variant actualizada: ${result.updatedVariant.name} (id=${result.updatedVariant.id}) precio=${result.updatedVariant.price}`);
} else {
  console.log("⚠ Sin variants activas que actualizar");
}
if (result.updatedTemplate) {
  console.log(`✓ Template actualizado: ${result.updatedTemplate.slug} (id=${result.updatedTemplate.id}) → foto 600×450 (4:3)`);
} else {
  console.log("⚠ Template libre-calendar-photo-month no encontrado (re-correr make seed-templates)");
}

await prisma.$disconnect();

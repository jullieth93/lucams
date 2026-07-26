/*
 * Ola 18b (Lucy 2026-07-26) — Corrección de datos de catálogo encontrada en el barrido:
 *
 * 1. CUADRADOS (set-fotoimanes-cuadrados): los tamaños reales son 6.5×6.5 y 7.5×10
 *    (la descripción del producto ya lo dice), pero el catálogo tenía 6.5×6.5, 8×8 y
 *    10×10. Fix:
 *      - Variantes 8×8 (blanco/negro × qty 1-6) → se convierten en 7.5×10 (sizeCm y
 *        aspectRatio 3:4). Precios se respetan.
 *      - Variantes 10×10 → isActive=false (no se borran).
 *      - Plantilla "foto-rectangular-simple" (600×800 = 3:4, inactiva) → se ACTIVA y
 *        se renombra "Plantilla Rectangular" (las variantes 7.5×10 la enrutan solas
 *        por aspectRatio, igual que 6.5×6.5 enruta a "Plantilla Cuadrado").
 *
 * 2. TIRAS (tiras-magneticas-fotos): Lucy pidió "tira completa de 3 o 4 fotos" y solo
 *    existía la de 3. Fix:
 *      - Variante default → se renombra "Tira de 3 fotos · 6.5×20 cm".
 *      - Nueva variante "Tira de 4 fotos · 6.5×26.5 cm" (photoSlots=4, aspectRatio 3:4)
 *        — precio inicial $24.000 (lineal ~$6.000/foto con leve descuento; el admin lo
 *        ajusta en el panel, el script NO pisa precios en re-runs).
 *      - Nueva plantilla "photo-strip-4-fotos" ("Plantilla Tiras"): mismo dibujo que la
 *        de 3 (stage 390×400, gridCols=1 gap=0) escalada a 390×530 para 4 fotos
 *        (misma altura por foto ≈133px, proporción física 6.5×26.5).
 *
 * Idempotente: upsert por slug/sku; updates NO pisan price.
 *
 * Uso: pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/ola18b-cuadrados-tiras-fix.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixCuadrados() {
  const product = await prisma.product.findFirst({ where: { slug: "set-fotoimanes-cuadrados" } });
  if (!product) throw new Error("set-fotoimanes-cuadrados no encontrado");

  // 8×8 → 7.5×10 (aspectRatio 3:4 para enrutar a la plantilla rectangular 600×800);
  // 10×10 → isActive=false. Se actualiza variante por variante (attributes es JSON).
  const variants = await prisma.productVariant.findMany({
    where: { productId: product.id, deletedAt: null },
  });
  let toRect = 0;
  let deactivated = 0;
  for (const v of variants) {
    const a = v.attributes;
    if (a?.sizeCm === "8×8") {
      await prisma.productVariant.update({
        where: { id: v.id },
        data: {
          name: v.name.replace(/8×8/g, "7.5×10"),
          attributes: { ...a, sizeCm: "7.5×10", aspectRatio: "3:4" },
        },
      });
      toRect++;
    } else if (a?.sizeCm === "10×10" && v.isActive) {
      await prisma.productVariant.update({ where: { id: v.id }, data: { isActive: false } });
      deactivated++;
    }
  }
  console.log(`✓ Cuadrados: ${toRect} variantes 8×8 → 7.5×10 · ${deactivated} variantes 10×10 desactivadas`);

  // Activar plantilla rectangular (600×800 = 3:4) como "Plantilla Rectangular"
  const tpl = await prisma.personalizationTemplate.findUnique({ where: { slug: "foto-rectangular-simple" } });
  if (tpl) {
    await prisma.personalizationTemplate.update({
      where: { id: tpl.id },
      data: { name: "Plantilla Rectangular", isActive: true, deletedAt: null },
    });
    console.log("✓ Cuadrados: plantilla 'foto-rectangular-simple' activa como 'Plantilla Rectangular'");
  }
}

async function fixTiras() {
  const product = await prisma.product.findFirst({ where: { slug: "tiras-magneticas-fotos" } });
  if (!product) throw new Error("tiras-magneticas-fotos no encontrado");

  // Renombrar la variante default (3 fotos)
  const def = await prisma.productVariant.findFirst({ where: { sku: "FI-TIRA-01-DEFAULT" } });
  if (def) {
    await prisma.productVariant.update({
      where: { id: def.id },
      data: {
        name: "Tira de 3 fotos · 6.5×20 cm",
        attributes: { ...(def.attributes ?? {}), quantity: 1 },
        isActive: true,
        deletedAt: null,
      },
    });
    console.log("✓ Tiras: variante 3 fotos renombrada");
  }

  // Nueva variante 4 fotos (precio NO se pisa en re-runs)
  const sku4 = "FI-TIRA-4FOTOS";
  const found = await prisma.productVariant.findFirst({ where: { sku: sku4 } });
  const attrs4 = { sizeCm: "6.5×26.5", photoSlots: 4, aspectRatio: "3:4", quantity: 1 };
  if (found) {
    await prisma.productVariant.update({
      where: { id: found.id },
      data: { productId: product.id, name: "Tira de 4 fotos · 6.5×26.5 cm", attributes: attrs4, isActive: true, deletedAt: null },
    });
    console.log("  ~ variante 4 fotos actualizada (precio respetado)");
  } else {
    await prisma.productVariant.create({
      data: { productId: product.id, sku: sku4, name: "Tira de 4 fotos · 6.5×26.5 cm", attributes: attrs4, price: 24000 * 100, stock: 100, isActive: true },
    });
    console.log("  + variante 4 fotos — $24.000 (ajustable en admin)");
  }

  // Plantilla 4 fotos (mismo dibujo que la de 3, escalada)
  const tpl3 = await prisma.personalizationTemplate.findUnique({ where: { slug: "photo-strip-3-fotos" } });
  if (!tpl3) throw new Error("photo-strip-3-fotos no encontrada");
  const cd3 = tpl3.canvasData;
  const canvas4 = {
    ...cd3,
    stage: { ...cd3.stage, height: 530 },
    layers: cd3.layers.map((l) =>
      l.id === "photo" ? { ...l, height: 530 } : l,
    ),
  };
  const slug4 = "photo-strip-4-fotos";
  const tplFound = await prisma.personalizationTemplate.findUnique({ where: { slug: slug4 } });
  const tplData = {
    name: "Plantilla Tiras",
    kind: "PHOTO_PACK",
    mode: "EDITABLE",
    productId: product.id,
    isActive: true,
    deletedAt: null,
    previewUrl: tpl3.previewUrl,
    canvasData: canvas4,
  };
  if (tplFound) {
    await prisma.personalizationTemplate.update({ where: { id: tplFound.id }, data: tplData });
    console.log("  ~ plantilla photo-strip-4-fotos actualizada");
  } else {
    await prisma.personalizationTemplate.create({ data: { slug: slug4, ...tplData } });
    console.log("  + plantilla photo-strip-4-fotos creada (390×530)");
  }
}

async function main() {
  await fixCuadrados();
  await fixTiras();
  console.log("Listo: Ola 18b aplicada.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

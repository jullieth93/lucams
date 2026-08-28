/*
 * Activa SOLO los productos que Lucy vende hoy + setea precios:
 *
 *   - Sets Fotoimanes (4 productos × variantes existentes)
 *       Base: 6 fotos 6×6 cm = $25.000
 *             12 fotos 6×6 cm = $35.000
 *       Reglas de escala (Lucy ajusta después en /admin/productos):
 *         · Por #fotos (lineal, descuento volumen):
 *             4 fotos = $18.000   ·  9 fotos = $30.000   ·  20 fotos = $48.000
 *         · Por tamaño:
 *             5×5 cm: -15%   ·   6×6 cm: base   ·   8×8 cm: +25%
 *
 *   - Abecedario Magnético (refactor: 2 productos × 3 variantes)
 *       Set completo 27 fichas = $45.000
 *       Set vocales 5 = $15.000
 *       Nombre personalizado 5-10 letras = $25.000
 *
 *   - Separadores Magnéticos (refactor: personalizables + prediseñados)
 *       1 unidad = $5.000   ·   3 unidades = $10.000   ·   5 unidades = $15.000
 *
 *   - Calendario Magnético (mes a mes, foto personalizable)
 *       Único: $45.000
 *
 * Todo lo demás: soft-delete (Product.deletedAt = now). Lucy reactiva
 * desde /admin/productos cuando quiera reincorporar.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ACTIVE_SLUGS = new Set([
  // Sets fotoimanes
  "set-fotoimanes-cuadrados",
  "set-fotoimanes-circulares",
  "set-fotoimanes-polaroid",
  "set-fotoimanes-corazon",
  // Abecedario (lo refactorizamos abajo)
  "abecedario-magnetico-espanol",
  "abecedario-magnetico-ingles",
  // Separadores
  "separadores-personalizables",
  "separadores-prediseñados",
  // Calendario
  "calendario-mes-a-mes-fotos",
]);

// ───────────────────────────── PRICING TABLE ─────────────────────────────
// Lucy ajusta después en /admin/productos. Esto solo es seed razonable.

function priceFotoimanCOP(photoSlots, sizeCm) {
  // Base: 6 fotos 6×6 = 25000, 12 fotos 6×6 = 35000
  // Lineal por foto: ~$2.083/foto desde 6→12
  const base6x6BySlots = {
    4: 18000,
    6: 25000,
    9: 30000,
    12: 35000,
    20: 48000,
  };
  const base = base6x6BySlots[photoSlots] ?? 25000;
  // Tamaño multiplicador
  const sizeMult = (() => {
    if (!sizeCm) return 1;
    if (sizeCm.includes("4×4") || sizeCm.includes("4x4") || sizeCm.includes("4×5")) return 0.7;
    if (sizeCm.includes("5×5") || sizeCm.includes("5x5") || sizeCm === "5") return 0.85;
    if (sizeCm.includes("6×6") || sizeCm.includes("6x6") || sizeCm === "6") return 1.0;
    if (sizeCm.includes("6×8") || sizeCm.includes("7×9")) return 1.1;
    if (sizeCm.includes("8×8") || sizeCm.includes("8x8") || sizeCm === "8") return 1.25;
    return 1.0;
  })();
  return Math.round((base * sizeMult) / 100) * 100; // redondeo a $100
}

async function main() {
  console.log("=== STEP 1: Soft-delete productos NO listados ===\n");

  // 1.a) Buscar archivar los que SÍ están activos pero no en nuestra lista
  const allActive = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { id: true, slug: true, name: true },
  });

  let archivedCount = 0;
  for (const p of allActive) {
    if (!ACTIVE_SLUGS.has(p.slug)) {
      await prisma.product.update({
        where: { id: p.id },
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
      });
      archivedCount++;
      console.log(`  ✗ Archivado: ${p.slug}`);
    }
  }
  console.log(`\n  Total archivados: ${archivedCount}`);

  console.log("\n=== STEP 2: Sets Fotoimanes — actualizar precios variantes ===\n");

  const fotoimanProducts = [
    "set-fotoimanes-cuadrados",
    "set-fotoimanes-circulares",
    "set-fotoimanes-polaroid",
    "set-fotoimanes-corazon",
  ];
  for (const slug of fotoimanProducts) {
    const p = await prisma.product.findFirst({
      where: { slug, deletedAt: null },
      include: { variants: { where: { deletedAt: null } } },
    });
    if (!p) {
      console.log(`  ⚠ ${slug} no existe`);
      continue;
    }
    console.log(`  ${slug}:`);
    for (const v of p.variants) {
      const attrs = v.attributes;
      const slots = attrs?.photoSlots ?? 6;
      const size = attrs?.sizeCm ?? "6×6";
      const newPrice = priceFotoimanCOP(slots, size);
      await prisma.productVariant.update({
        where: { id: v.id },
        data: { price: newPrice * 100 }, // centavos COP
      });
      console.log(`    ${v.name.padEnd(35)} → $${newPrice.toLocaleString("es-CO")}`);
    }
  }

  console.log("\n=== STEP 3: Calendario — confirmar precio $45.000 ===\n");
  const cal = await prisma.product.findFirst({
    where: { slug: "calendario-mes-a-mes-fotos", deletedAt: null },
    include: { variants: { where: { deletedAt: null } } },
  });
  if (cal) {
    for (const v of cal.variants) {
      await prisma.productVariant.update({
        where: { id: v.id },
        data: { price: 4500000 }, // $45.000 = 4.500.000 centavos
      });
      console.log(`  ${v.name} → $45.000`);
    }
  }

  console.log("\n=== STEP 4: Re-activar (asegurar) los 4 productos fotoimanes ===\n");
  for (const slug of fotoimanProducts) {
    await prisma.product.updateMany({
      where: { slug },
      data: { isActive: true, deletedAt: null },
    });
    console.log(`  ✓ ${slug} activo`);
  }
  await prisma.product.updateMany({
    where: { slug: "calendario-mes-a-mes-fotos" },
    data: { isActive: true, deletedAt: null },
  });
  console.log(`  ✓ calendario-mes-a-mes-fotos activo`);

  console.log("\n✓ DONE. Próximo paso: refactor abecedario + separadores (script separado).");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

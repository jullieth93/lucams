/*
 * ADR-057 — Variantes de TAMAÑO × IMANTADO para el "nombre personalizado" del
 * abecedario (español e inglés). Idempotente (upsert por SKU).
 *
 * La variante "Nombre" pasa de 1 a 6: 3 tamaños (mini/clásica/grande) × con/sin imán.
 * Todas conservan variant:"name" + letterCountMin/Max (para que el Estudio abra el
 * editor de nombre y valide 3–10 letras). Los PRECIOS son de arranque; Lucy los edita
 * en /admin/productos/[id]/variants.
 *
 * La variante existente (ABC-xx-NAME) se REUSA como "Clásica · Con imán" para no
 * romper su id (ya circula en URLs). Precios en pesos → *100 = centavos.
 *
 * Uso: DATABASE_URL=$DIRECT_URL node packages/db/scripts/add-abecedario-name-variants.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LETTERS = { letterCountMin: 3, letterCountMax: 10 };

// tier → { sizeCm, precios {mag, nomag} en PESOS }
const SIZES = [
  { size: "mini", sizeCm: "5×7", label: "Mini", price: { mag: 18000, nomag: 15000 } },
  { size: "clasica", sizeCm: "7×10", label: "Clásica", price: { mag: 25000, nomag: 22000 } },
  { size: "grande", sizeCm: "10×14", label: "Grande", price: { mag: 35000, nomag: 32000 } },
];

async function upsertVariant(productId, sku, name, attributes, pricePesos) {
  const price = pricePesos * 100;
  const existing = await prisma.productVariant.findFirst({ where: { sku } });
  if (existing) {
    await prisma.productVariant.update({
      where: { id: existing.id },
      data: { productId, name, attributes, isActive: true, deletedAt: null },
      // NO tocamos price en updates: respeta el precio que Lucy haya editado en admin.
    });
    return { sku, action: "updated (precio respetado)" };
  }
  await prisma.productVariant.create({
    data: { productId, sku, name, attributes, price, stock: 100, isActive: true },
  });
  return { sku, action: `created ($${pricePesos.toLocaleString("es-CO")})` };
}

async function seedForProduct(slug, prefix) {
  const product = await prisma.product.findFirst({ where: { slug }, select: { id: true } });
  if (!product) {
    console.log(`  ⚠ producto ${slug} no encontrado — omitido`);
    return;
  }

  // Reusar la variante NAME existente como "Clásica · Con imán" (conserva su id).
  const existingName = await prisma.productVariant.findFirst({
    where: { sku: `${prefix}-NAME` },
    select: { id: true },
  });
  if (existingName) {
    await prisma.productVariant.update({
      where: { id: existingName.id },
      data: {
        name: "Nombre personalizado · Clásica · Con imán",
        attributes: { variant: "name", size: "clasica", magnet: true, sizeCm: "7×10", ...LETTERS },
        isActive: true,
        deletedAt: null,
      },
    });
    console.log(`  ✓ ${prefix}-NAME reusada → Clásica · Con imán (id conservado)`);
  }

  for (const s of SIZES) {
    for (const magnet of [true, false]) {
      // La combinación clásica+con-imán ya es la variante NAME reusada arriba.
      if (s.size === "clasica" && magnet && existingName) continue;
      const magSku = magnet ? "MAG" : "NOMAG";
      const sku = `${prefix}-NAME-${s.size.toUpperCase().slice(0, 4)}-${magSku}`;
      const magLabel = magnet ? "Con imán" : "Sin imán";
      const name = `Nombre personalizado · ${s.label} · ${magLabel}`;
      const attributes = {
        variant: "name",
        size: s.size,
        magnet,
        sizeCm: s.sizeCm,
        ...LETTERS,
      };
      const price = magnet ? s.price.mag : s.price.nomag;
      const r = await upsertVariant(product.id, sku, name, attributes, price);
      console.log(`  ✓ ${r.sku} — ${name} — ${r.action}`);
    }
  }
}

async function main() {
  console.log("Abecedario ESPAÑOL:");
  await seedForProduct("abecedario-magnetico-espanol", "ABC-ES");
  console.log("\nAbecedario INGLÉS:");
  await seedForProduct("abecedario-magnetico-ingles", "ABC-EN");
  console.log("\n✓ DONE. Ajusta precios en /admin/productos/[id]/variants.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

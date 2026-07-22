/*
 * Activa "Tiras Magnéticas" (/producto/tiras-magneticas-fotos) — feedback Lucy 2026-07-22.
 *
 * El producto se creó OCULTO (isActive=false) en ola2a-tiras-magneticas.mjs con precio
 * PROPUESTO $19.000 (1.900.000 centavos). Lucy pidió activarlo CON ESE PRECIO
 * (ella lo ajusta después en /admin/productos). Se activa producto + su variante
 * FI-TIRA-01-DEFAULT (pausarla a ella dejaría el PDP sin opción comprable).
 *
 * Idempotente: update plano por slug/SKU; re-run no cambia nada. Transaccional.
 * Uso: pnpm --filter @lucams/db exec node scripts/activate-tiras-magneticas.mjs
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

const SLUG = "tiras-magneticas-fotos";
const VARIANT_SKU = "FI-TIRA-01-DEFAULT";
const PRICE = 1_900_000; // $19.000 COP — confirmado por Lucy 2026-07-22 (ella lo ajusta en admin)

async function main() {
  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { slug: SLUG, deletedAt: null },
      select: {
        id: true,
        isActive: true,
        basePrice: true,
        category: { select: { isActive: true, deletedAt: true } },
      },
    });
    if (!product) throw new Error(`Producto '${SLUG}' no encontrado`);
    if (!product.category.isActive || product.category.deletedAt) {
      throw new Error(
        "La categoría del producto está inactiva/archivada — el storefront lo ocultaría",
      );
    }

    const updated = await tx.product.update({
      where: { id: product.id },
      data: { isActive: true, basePrice: PRICE, compareAtPrice: null },
      select: { slug: true, name: true, isActive: true, basePrice: true },
    });
    const variant = await tx.productVariant.update({
      where: { sku: VARIANT_SKU },
      data: { isActive: true, price: PRICE, stock: 100 },
      select: { sku: true, isActive: true, price: true, stock: true },
    });
    return { updated, variant, wasActive: product.isActive };
  });

  console.log(
    `${result.wasActive ? "~ ya estaba activo" : "✓ activado"}: ${result.updated.name} (/${result.updated.slug}) — $${(result.updated.basePrice / 100).toLocaleString("es-CO")} COP`,
  );
  console.log(
    `✓ variante ${result.variant.sku}: isActive=${result.variant.isActive}, $${(result.variant.price / 100).toLocaleString("es-CO")}, stock=${result.variant.stock}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

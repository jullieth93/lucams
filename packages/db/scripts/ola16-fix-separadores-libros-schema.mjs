/*
 * Ola 16 (hotfix) — asegurar que separadores-libros tenga facesPerUnit: 2 y
 * cornerRadiusPx: 28. Si el producto se creó sin estos flags (por ejemplo,
 * ejecutando solo restructure-separadores.mjs sin ola3), el Estudio no crea
 * 2 slots por separador y la vista 3D repite la cara A en ambos lados.
 *
 * Idempotente: si ya está correcto, no escribe.
 *
 * Uso: pnpm --filter @lucams/db exec node scripts/ola16-fix-separadores-libros-schema.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SLUG = "separadores-libros";

async function main() {
  const product = await prisma.product.findUnique({
    where: { slug: SLUG },
    select: { id: true, personalizationSchema: true },
  });
  if (!product) {
    console.warn(`⚠ Producto ${SLUG} no existe — nada que reparar.`);
    return;
  }

  const current =
    product.personalizationSchema && typeof product.personalizationSchema === "object"
      ? product.personalizationSchema
      : {};

  const needsUpdate = current.facesPerUnit !== 2 || current.cornerRadiusPx !== 28;

  if (!needsUpdate) {
    console.log(`✓ ${SLUG} ya tiene facesPerUnit=2 y cornerRadiusPx=28.`);
    return;
  }

  await prisma.product.update({
    where: { id: product.id },
    data: {
      personalizationSchema: { ...current, facesPerUnit: 2, cornerRadiusPx: 28 },
    },
  });
  console.log(`✓ ${SLUG} actualizado: facesPerUnit=2, cornerRadiusPx=28.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

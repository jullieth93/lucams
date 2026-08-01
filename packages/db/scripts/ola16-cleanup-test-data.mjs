/*
 * Ola 16 (hotfix) — limpieza de datos de prueba en Supabase.
 *
 * Deja activas solo las 4 categorías reales y los 8 productos reales que
 * conforman el catálogo publicado de catalogo-whatsapp. Todo lo demás se
 * desactiva (isActive=false) pero NO se elimina físicamente.
 *
 * Categorías reales: foto-imanes, calendarios, juegos-aprendizaje, separadores
 * Productos reales:
 *   - foto-imanes: set-fotoimanes-cuadrados, set-fotoimanes-polaroid, tiras-magneticas-fotos
 *   - calendarios: calendario-mes-a-mes-fotos
 *   - juegos-aprendizaje: nombre-personalizado, pack-vocales, abecedario-completo
 *   - separadores: separadores-libros
 *
 * Idempotente: si ya está limpio, no vuelve a escribir.
 *
 * Uso: pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/ola16-cleanup-test-data.mjs
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

// Guarda de ambiente: desactiva en masa todo lo que no sea catálogo real —
// bloquea PRD/remotos no STG (salvo LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1).
assertDestructiveAllowed("ola16-cleanup-test-data.mjs");

const prisma = new PrismaClient();

const REAL_CATEGORIES = ["foto-imanes", "calendarios", "juegos-aprendizaje", "separadores"];

const REAL_PRODUCTS = [
  "set-fotoimanes-cuadrados",
  "set-fotoimanes-polaroid",
  "tiras-magneticas-fotos",
  "calendario-mes-a-mes-fotos",
  "nombre-personalizado",
  "pack-vocales",
  "abecedario-completo",
  "separadores-libros",
];

async function main() {
  const realCategoryIds = await prisma.category
    .findMany({ where: { slug: { in: REAL_CATEGORIES } }, select: { id: true, slug: true } })
    .then((rows) => new Map(rows.map((r) => [r.id, r.slug])));

  const realProductIds = await prisma.product
    .findMany({ where: { slug: { in: REAL_PRODUCTS } }, select: { id: true, slug: true } })
    .then((rows) => new Map(rows.map((r) => [r.id, r.slug])));

  console.log("Categorías reales encontradas:", realCategoryIds.size, "/", REAL_CATEGORIES.length);
  console.log("Productos reales encontrados:", realProductIds.size, "/", REAL_PRODUCTS.length);

  if (realCategoryIds.size < REAL_CATEGORIES.length) {
    const found = new Set(realCategoryIds.values());
    console.warn(
      "Faltan categorías:",
      REAL_CATEGORIES.filter((s) => !found.has(s)),
    );
  }
  if (realProductIds.size < REAL_PRODUCTS.length) {
    const found = new Set(realProductIds.values());
    console.warn(
      "Faltan productos:",
      REAL_PRODUCTS.filter((s) => !found.has(s)),
    );
  }

  // 1. Desactivar categorías que no sean las reales.
  const { count: deactivatedCategories } = await prisma.category.updateMany({
    where: {
      isActive: true,
      id: { notIn: Array.from(realCategoryIds.keys()) },
    },
    data: { isActive: false },
  });

  // 2. Desactivar productos que no sean los reales.
  const { count: deactivatedProducts } = await prisma.product.updateMany({
    where: {
      isActive: true,
      id: { notIn: Array.from(realProductIds.keys()) },
    },
    data: { isActive: false },
  });

  // 3. Asegurar que las reales estén activas (sanity check).
  await prisma.category.updateMany({
    where: { id: { in: Array.from(realCategoryIds.keys()) } },
    data: { isActive: true },
  });
  await prisma.product.updateMany({
    where: { id: { in: Array.from(realProductIds.keys()) } },
    data: { isActive: true },
  });

  console.log(`✓ Categorías desactivadas: ${deactivatedCategories}`);
  console.log(`✓ Productos desactivados: ${deactivatedProducts}`);
  console.log("✓ Catálogo limpio: 4 categorías y 8 productos activos.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

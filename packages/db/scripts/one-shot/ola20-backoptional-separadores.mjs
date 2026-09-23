/*
 * One-shot (2026-09-22) — backOptional: true en los separadores de libros.
 *
 * La cara B (reverso) de los separadores pasa a ser OPCIONAL en el Estudio: el
 * cliente puede diseñar solo la cara A y producción imprime la misma imagen en
 * ambas caras. El server (features/personalization/service.ts, finalizeDesign)
 * solo relaja la validación de snapshots cuando el personalizationSchema del
 * PRODUCTO declara `backOptional: true` — este script lo agrega.
 *
 * Productos afectados (slugs de ola19-separadores-libros.mjs y
 * one-shot/ola17-separadores-alargados.mjs):
 *   - separadores-magneticos (tamaños 2×6 y 4×4.2, facesPerUnit=2)
 *   - separadores-alargados  (4×12 y 4×15, facesPerUnit=2, noFold)
 *
 * Idempotente: si el flag ya está en true, no escribe. Merge ADITIVO sobre el
 * schema existente (no pisa facesPerUnit/cornerRadiusPx/noFold/galleryTag…).
 * Fail-closed de schema: si el producto no tiene facesPerUnit=2, avisa y NO lo
 * toca (backOptional solo tiene sentido en productos de 2 caras).
 *
 * Uso: pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/one-shot/ola20-backoptional-separadores.mjs
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

// Guarda de ambiente (N-06, 2026-09-12): escribe personalizationSchema de
// productos del catálogo — bloquea PRD/remotos no reconocidos (fail-closed).
assertDestructiveAllowed("ola20-backoptional-separadores.mjs");

const prisma = new PrismaClient();

const SLUGS = ["separadores-magneticos", "separadores-alargados"];

async function main() {
  for (const slug of SLUGS) {
    const product = await prisma.product.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true, personalizationSchema: true },
    });
    if (!product) {
      console.warn(`⚠ ${slug}: no existe — nada que hacer.`);
      continue;
    }

    const current =
      product.personalizationSchema && typeof product.personalizationSchema === "object"
        ? product.personalizationSchema
        : {};

    if (current.facesPerUnit !== 2) {
      console.warn(
        `⚠ ${slug}: facesPerUnit=${current.facesPerUnit ?? "ausente"} (esperado 2) — ` +
          `backOptional no aplica a productos de 1 cara; NO se toca.`,
      );
      continue;
    }

    if (current.backOptional === true) {
      console.log(`✓ ${slug}: ya tiene backOptional=true (idempotente, sin escritura).`);
      continue;
    }

    await prisma.product.update({
      where: { id: product.id },
      data: { personalizationSchema: { ...current, backOptional: true } },
    });
    console.log(`✓ ${slug}: personalizationSchema += backOptional=true (cara B opcional).`);
  }

  console.log("\n✅ DONE. El Estudio ya puede dejar la cara B sin diseñar en los separadores.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

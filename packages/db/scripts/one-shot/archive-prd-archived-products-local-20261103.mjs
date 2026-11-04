#!/usr/bin/env node
/*
 * archive-prd-archived-products-local-20261103.mjs — archiva en LOCAL los
 * productos que PRD ya NO vende (PRD es la fuente de verdad comercial,
 * ADR-099), alineando el "superset de desarrollo" con la tienda real:
 *
 *   - set-fotoimanes-circulares (FI-CIRC-6) — archivado en PRD 2026-08-11
 *   - set-fotoimanes-corazon   (FI-COR-6)   — archivado en PRD 2026-08-11
 *   - pack-separadores-libros  (ORG-SEP-6)  — no existe en STG/PRD (retirado
 *     al consolidar los separadores personalizables SEP-MAG/SEP-ALR)
 *
 * Contexto: LOCAL los seguía mostrando ACTIVOS (drift histórico) y, sin
 * plantilla activa para circulares, el audit de consistencia los flagueaba.
 * El seed canónico dejó de declararlos el 2026-11-03 (regla R5: el seed
 * declara solo el catálogo vivo) — este script alinea la DB local existente.
 *
 * Mismo patrón de la papelera admin (softDeleteProduct): deletedAt + isActive
 * false en el PRODUCTO (las variantes quedan intactas; el storefront gatea por
 * producto). Env-guard fail-closed: SOLO corre contra LOCAL/destinos
 * reconocidos no-PRD. Dry-run por defecto + `--apply`. Idempotente.
 *
 * Uso (desde packages/db):
 *   npx dotenv -e ../../.env.local -- node scripts/one-shot/archive-prd-archived-products-local-20261103.mjs --apply
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

assertDestructiveAllowed("archive-prd-archived-products-local-20261103.mjs");

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

const SLUGS = [
  "set-fotoimanes-circulares",
  "set-fotoimanes-corazon",
  "pack-separadores-libros",
];

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY-RUN (sin cambios; --apply ejecuta) ===\n");

  for (const slug of SLUGS) {
    const product = await prisma.product.findUnique({
      where: { slug },
      select: { id: true, name: true, isActive: true, deletedAt: true },
    });
    if (!product) {
      console.log(`~ /${slug} no existe en este ambiente — nada que hacer`);
      continue;
    }
    if (product.deletedAt && !product.isActive) {
      console.log(`~ ${product.name} (/${slug}) ya está archivado`);
      continue;
    }
    console.log(`→ archivar ${product.name} (/${slug})`);
    if (APPLY) {
      await prisma.product.update({
        where: { id: product.id },
        data: { deletedAt: new Date(), isActive: false, deletedBy: "one-shot-20261103" },
      });
      console.log("  ✓ archivado");
    }
  }

  if (!APPLY) console.log("\n(dry-run) corre con --apply para ejecutar");
}

main()
  .catch((err) => {
    console.error("✗", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

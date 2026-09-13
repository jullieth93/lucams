/*
 * ARCHIVADO en one-shot/ (N-06, 2026-09-12): one-shot ya aplicado; se
 * conserva como referencia y para rerun DELIBERADO (ver lib/env-guard.mjs).
 * Inactiva (soft-delete) las categorías sin productos activos.
 *
 * Conserva SOLO las categorías que contienen alguno de los 9 productos
 * activos de Lucy. El resto se marca isActive=false + deletedAt=now() —
 * no se borran de DB, así Lucy puede reactivarlas desde /admin/categorias
 * cuando quiera reincorporar productos archivados.
 *
 * Categorías que SIEMPRE quedan activas (whitelist):
 *   - foto-imanes        (4 sets fotoimanes)
 *   - juegos-aprendizaje (abecedarios + separadores)
 *   - calendarios        (calendario foto-mes)
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";
// Guarda de ambiente (N-06, 2026-09-12): one-shot aplicado — al re-correrlo
// bloquea PRD/remotos no reconocidos (fail-closed, lib/env-guard.mjs).
assertDestructiveAllowed("cleanup-empty-categories.mjs");


const prisma = new PrismaClient();

const ALWAYS_KEEP = new Set(["foto-imanes", "juegos-aprendizaje", "calendarios"]);

async function main() {
  const all = await prisma.category.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      slug: true,
      name: true,
      isActive: true,
      _count: { select: { products: { where: { deletedAt: null, isActive: true } } } },
    },
  });

  let archived = 0;
  let kept = 0;
  for (const c of all) {
    const hasActive = c._count.products > 0;
    const inWhitelist = ALWAYS_KEEP.has(c.slug);
    if (hasActive || inWhitelist) {
      // Asegurar que esté activa (algunas estaban inactivas por seed previo)
      if (!c.isActive) {
        await prisma.category.update({
          where: { id: c.id },
          data: { isActive: true },
        });
        console.log(`  ↑ Reactivada: ${c.slug} (${c._count.products} productos)`);
      } else {
        console.log(`  ✓ Mantengo: ${c.slug} (${c._count.products} productos)`);
      }
      kept++;
    } else {
      await prisma.category.update({
        where: { id: c.id },
        data: { isActive: false, deletedAt: new Date() },
      });
      archived++;
      console.log(`  ✗ Archivada: ${c.slug}`);
    }
  }

  console.log(`\n=== Resumen ===`);
  console.log(`  Mantenidas activas: ${kept}`);
  console.log(`  Archivadas: ${archived}`);
  console.log(`  Total: ${all.length}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

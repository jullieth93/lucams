/*
 * ONE-SHOT (2026-09-15) — Tira de 4 fotos: aspectRatio "3:4" → "1:1".
 *
 * Causa (bug reportado por Lucy: "las tiras se ven muy grandes en el 3D"):
 * la celda FÍSICA de la tira 6.5×26.5 cm es 6.5×6.625 ≈ cuadrada (igual que
 * la de 3 fotos, 6.5×6.667 — el diseño original Ola 2A dice "aspect de CADA
 * celda 1:1"). ola18b declaró la variante con aspectRatio "3:4" y la plantilla
 * photo-strip-4-fotos con stage 390×530: el 3D deriva el alto de la pieza del
 * aspect de la textura → renderizaba la tira como si midiera ~35 cm (1.3×).
 * El mockup tira-4-fotos.svg (390×1590 = 4 celdas de 397.5) siempre tuvo la
 * razón. La plantilla se corrige en seed-templates.mjs (stage 390×398); este
 * script alinea las variantes (el ruteo plantilla↔variante tolera ±0.05:
 * 1:1 = 1.0 vs stage 0.98 → diff 0.02 ✓).
 *
 * Cubre FI-TIRA-4FOTOS y FI-TIRA-4FOTOS-NOMAG (y cualquier variante viva de
 * tiras con photoSlots 4 y aspectRatio ≠ "1:1", por si hay drift entre
 * ambientes). Solo toca attributes.aspectRatio — precios y stock intactos.
 *
 * Guardarraíles (patrón de los one-shots 2026-09):
 *   - DRY-RUN por defecto; `--apply` ejecuta.
 *   - env-guard fail-closed (../lib/env-guard.mjs): STG/local directo; PRD
 *     solo con LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1.
 *   - Idempotente: re-correrlo es no-op.
 *
 * Uso:
 *   node scripts/one-shot/fix-tira-4fotos-aspect-20260915.mjs           # DRY-RUN
 *   node scripts/one-shot/fix-tira-4fotos-aspect-20260915.mjs --apply   # ejecuta
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

const APPLY = process.argv.includes("--apply");
if (APPLY) assertDestructiveAllowed("fix-tira-4fotos-aspect-20260915.mjs");

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

const targets = await prisma.productVariant.findMany({
  where: {
    product: { slug: "tiras-magneticas-fotos" },
    deletedAt: null,
    attributes: { path: ["photoSlots"], equals: 4 },
  },
  select: { id: true, sku: true, name: true, attributes: true },
});

console.log(`=== fix-tira-4fotos-aspect-20260915 (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
let changed = 0;
for (const v of targets) {
  const attrs = v.attributes ?? {};
  if (attrs.aspectRatio === "1:1") {
    console.log(`  ✓ ${v.sku} ya está en 1:1 — nada que hacer`);
    continue;
  }
  console.log(`  ~ ${v.sku} (${v.name}): aspectRatio ${attrs.aspectRatio} → "1:1"`);
  if (APPLY) {
    await prisma.productVariant.update({
      where: { id: v.id },
      data: { attributes: { ...attrs, aspectRatio: "1:1" } },
    });
  }
  changed++;
}
console.log(
  `\n✓ DONE (${APPLY ? "aplicado" : "dry-run — revisa y corre con --apply"}): ${changed} variante(s) ${APPLY ? "corregidas" : "por corregir"}. ` +
    `Después corre seed-templates.mjs --apply (stage 390×398 de photo-strip-4-fotos).`,
);
await prisma.$disconnect();

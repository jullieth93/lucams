#!/usr/bin/env node
/*
 * update-production-days-20260911.mjs — baja `productionDays` del catálogo a
 * 2 días hábiles (decisión de Lucy, 2026-09-11: "despacho real, máximo 2 días").
 *
 * Por qué existe: el catálogo traía productionDays=3 (default del schema) y la
 * auditoría de información pública encontró la contradicción con la promesa
 * global (FAQ/home/checkout decían 2). Lucy confirmó que el despacho real es
 * MÁX. 2 DÍAS, así que el dato del catálogo era el que sobraba. La PDP renderiza
 * este campo por producto (app/producto/[slug]/page.tsx) — debe decir lo mismo
 * que el FAQ y el checkout.
 *
 * Regla:
 *   - kind != NONE  → productionDays = 2
 *   - kind == NONE  → productionDays = 1  (stock listo — decisión 4.8 del
 *     PLAN_CATALOG_V2; los coleccionables activos traían 3 por el default)
 *
 * Idempotente: solo toca filas que difieren. Reversible con respaldo previo
 * (imprime ANTES por consola) o editando en /admin/productos.
 *
 * Uso:
 *   node scripts/update-production-days-20260911.mjs           # dry-run (default)
 *   node scripts/update-production-days-20260911.mjs --apply   # aplica
 * Con dotenv según ambiente (desde packages/db):
 *   npx dotenv -e ../../.env.local -- node scripts/update-production-days-20260911.mjs --apply
 *   npx dotenv -e ../../.env.stg   -- node scripts/update-production-days-20260911.mjs --apply
 *   npx dotenv -e ../../.env.local.nube-backup -- node scripts/update-production-days-20260911.mjs --apply
 *
 * N-06 (2026-09-12): EXENCIÓN deliberada del env-guard. Su caso de uso ES la
 * corrección de datos en PRD (ya se aplicó en los 3 ambientes el 2026-09-11),
 * así que bloquearlo lo volvería inútil; protege con dry-run por defecto +
 * `--apply` explícito. Está allowlistado en lib/check-script-guards.mjs como
 * PRD-deliberado.
 */

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

function targetRef() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
  if (/127\.0\.0\.1|localhost/.test(url)) return "LOCAL (127.0.0.1)";
  const m = url.match(/db\.([a-z0-9]+)\.supabase\.co|postgres\.([a-z0-9]+)@/);
  return m ? `Supabase ref ${m[1] ?? m[2]}` : "host desconocido";
}

console.log(`=== update-production-days-20260911 — ${APPLY ? "APLICANDO" : "DRY-RUN"} ===`);
console.log(`Destino: ${targetRef()}\n`);

const products = await prisma.product.findMany({
  where: { deletedAt: null },
  select: { id: true, name: true, personalizationKind: true, productionDays: true },
  orderBy: { name: "asc" },
});

let changed = 0;
for (const p of products) {
  const target = p.personalizationKind === "NONE" ? 1 : 2;
  if (p.productionDays === target) {
    console.log(`= ${p.name} (${p.personalizationKind}): ya en ${target} — skip`);
    continue;
  }
  console.log(`→ ${p.name} (${p.personalizationKind}): ${p.productionDays} → ${target}`);
  if (APPLY) {
    await prisma.product.update({ where: { id: p.id }, data: { productionDays: target } });
    console.log("    ✓ actualizado");
  }
  changed++;
}

console.log(
  `\nResumen: ${changed} por actualizar${APPLY ? " (aplicados)" : ""}, ${products.length - changed} sin cambio.`,
);
if (!APPLY && changed > 0) console.log("Re-corre con --apply para aplicar.");

await prisma.$disconnect();

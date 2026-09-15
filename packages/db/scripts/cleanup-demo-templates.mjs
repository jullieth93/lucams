/*
 * cleanup-demo-templates.mjs (2026-09-14) — remediación de plantillas del
 * Estudio, decisión del owner: "las pendientes de aprobar son enteramente demo,
 * eliminarlas; las plantillas deben verse como la realidad".
 *
 * Tres acciones quirúrgicas (idempotentes):
 *
 *   1. RENOMBRE de slugs "libre-*" que SÍ son plantillas reales de producto:
 *      el prefijo las marcaba como "respaldo" en /admin/plantillas y su preview
 *      era el genérico "Personalización Libre".
 *        libre-photo-pack           → cuadrados-foto-y-texto
 *        libre-calendar-photo-month → calendario-mes-clasico
 *
 *   2. REACTIVACIÓN de las plantillas reales de separadores (sep-mag-2x6,
 *      sep-mag-4x4-2, sep-alr-4x12, sep-alr-4x15): nacieron fuera del seed y un
 *      --prune las soft-deletó → el Estudio de Magnéticos/Alargados caía al
 *      canvas cuadrado 1080×1080 de respaldo (bug "se ven cuadrados"). Ya están
 *      declaradas en seed-templates.mjs para que no vuelva a pasar.
 *
 *   3. HARD-DELETE de las plantillas demo (sin producto activo que las use):
 *      libre-photo-grid, libre-calendar-photo-hero, libre-event-favor,
 *      libre-business-logo, libre-custom-decor, libre-text-only,
 *      foto-rectangular-simple, foto-cuadrado-simple.
 *      GUARD de referencias: si alguna tiene ≥1 Design que la referencie, NO se
 *      borra — queda archivada (soft-delete) y se reporta (sus diseños
 *      conservan templateId; la regla histórica es archivar, nunca borrar).
 *
 * Guardarraíles (patrón N-06):
 *   - DRY-RUN por defecto; `--apply` ejecuta. Env-guard fail-closed (PRD solo
 *     con LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1, intervención autorizada).
 *   - BACKUP: en --apply vuelca las filas borradas/renombradas a
 *     tmp/backups/templates-demo-<ts>.json ANTES de tocar nada.
 *   - Conteos antes/después.
 *
 * Uso:
 *   cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/cleanup-demo-templates.mjs          # DRY-RUN
 *   cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/cleanup-demo-templates.mjs --apply  # ejecuta
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

assertDestructiveAllowed("cleanup-demo-templates.mjs");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const HERE = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(HERE, "..", "..", "..", "tmp", "backups");

const RENAMES = [
  { from: "libre-photo-pack", to: "cuadrados-foto-y-texto" },
  { from: "libre-calendar-photo-month", to: "calendario-mes-clasico" },
];

const REACTIVATE = ["sep-mag-2x6", "sep-mag-4x4-2", "sep-alr-4x12", "sep-alr-4x15"];

const DEMO_DELETE = [
  "libre-photo-grid",
  "libre-calendar-photo-hero",
  "libre-event-favor",
  "libre-business-logo",
  "libre-custom-decor",
  "libre-text-only",
  "foto-rectangular-simple",
  "foto-cuadrado-simple",
];

async function main() {
  console.log(`=== cleanup-demo-templates (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);
  const backup = { renames: [], reactivated: [], deleted: [], keptArchived: [] };

  // ── 1. Renombres de slug ──
  console.log("1) Renombres de slug (quitar el prefijo libre- a plantillas reales):");
  for (const { from, to } of RENAMES) {
    const src = await prisma.personalizationTemplate.findUnique({ where: { slug: from } });
    if (!src) {
      console.log(`  · ${from} no existe (ya renombrada o DB fresca)`);
      continue;
    }
    const dst = await prisma.personalizationTemplate.findUnique({ where: { slug: to } });
    if (dst) {
      console.log(`  ⚠ ${to} YA existe — no se renombra ${from} (revisar a mano)`);
      continue;
    }
    console.log(`  ${APPLY ? "✓" : "→"} ${from} → ${to}`);
    backup.renames.push(src);
    if (APPLY) {
      await prisma.personalizationTemplate.update({ where: { id: src.id }, data: { slug: to } });
    }
  }

  // ── 2. Reactivación de plantillas reales de separadores ──
  console.log("\n2) Reactivación de plantillas de separadores (borradas por un --prune):");
  for (const slug of REACTIVATE) {
    const t = await prisma.personalizationTemplate.findUnique({ where: { slug } });
    if (!t) {
      console.log(`  ⚠ ${slug} NO existe en este ambiente (correr seed-templates --apply)`);
      continue;
    }
    if (!t.deletedAt && t.isActive) {
      console.log(`  · ${slug} ya activa`);
      continue;
    }
    console.log(`  ${APPLY ? "✓" : "→"} ${slug} reactivada (deletedAt=null, isActive=true)`);
    backup.reactivated.push(t);
    if (APPLY) {
      await prisma.personalizationTemplate.update({
        where: { id: t.id },
        data: { deletedAt: null, deletedBy: null, isActive: true },
      });
    }
  }

  // ── 3. Hard-delete de plantillas demo (guard: 0 diseños referenciantes) ──
  console.log("\n3) Borrado de plantillas demo (guard: con diseños → solo se archiva):");
  for (const slug of DEMO_DELETE) {
    const t = await prisma.personalizationTemplate.findUnique({ where: { slug } });
    if (!t) {
      console.log(`  · ${slug} no existe (nada que hacer)`);
      continue;
    }
    const designs = await prisma.design.count({ where: { templateId: t.id } });
    if (designs > 0) {
      console.log(`  ⚠ ${slug}: ${designs} diseños la referencian → ARCHIVADA, no borrada`);
      backup.keptArchived.push(t);
      if (APPLY && !t.deletedAt) {
        await prisma.personalizationTemplate.update({
          where: { id: t.id },
          data: { deletedAt: new Date(), isActive: false, deletedBy: "system:cleanup-demo-templates" },
        });
      }
      continue;
    }
    console.log(`  ${APPLY ? "✓" : "→"} ${slug} borrada definitivamente (0 diseños)`);
    backup.deleted.push(t);
    if (APPLY) {
      await prisma.personalizationTemplate.delete({ where: { id: t.id } });
    }
  }

  // ── Backup + resumen ──
  if (APPLY) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const file = join(BACKUP_DIR, `templates-demo-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(backup, null, 2));
    console.log(`\nBackup: ${file}`);
  }
  const remaining = await prisma.personalizationTemplate.count();
  const active = await prisma.personalizationTemplate.count({
    where: { deletedAt: null, isActive: true },
  });
  console.log(`\nPlantillas totales: ${remaining} · activas visibles: ${active}`);
  if (!APPLY) console.log("DRY-RUN (sin cambios). Para ejecutar: --apply");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

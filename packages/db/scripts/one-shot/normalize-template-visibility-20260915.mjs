/*
 * ONE-SHOT (D3/D4, 2026-09-15) — NORMALIZACIÓN de visibilidad de plantillas.
 *
 * Contexto: reporte "las plantillas cargadas en el Admin no se ven en el
 * Estudio". El diagnóstico (scripts/one-shot/diagnose-template-visibility-
 * 20260915.mjs — correrlo ANTES y DESPUÉS) replica los filtros del Estudio y
 * mostró dos clases de causa de datos:
 *
 *   1. CANÓNICAS APAGADAS: las plantillas curadas del catálogo (las que declara
 *      scripts/seed-templates.mjs) pueden quedar isActive=false o soft-deleted
 *      — p.ej. el incidente documentado en seed-templates.mjs (2026-09-14): el
 *      lookup viejo a "separadores-libros" dejó las sep-mag/sep-alr sin
 *      declarar y un `--prune` las archivó → el Estudio de Magnéticos y
 *      Alargados cayó al canvas cuadrado de respaldo. El admin las sigue
 *      listando (muestra archivadas) → "existen pero no se ven".
 *      → Este script las REACTIVA (isActive=true, deletedAt=null, mode=EDITABLE).
 *
 *   2. LEGADAS DUPLICADAS/DESORIENTADAS de separadores (ola3, 2026-07-22):
 *      - "separador-rectangular-cara": stage 600×200 HORIZONTAL (aspect 3.0)
 *        para el formato 2×6 VERTICAL. No matchea ningún aspect de variante
 *        (1:3 ni 20:21) → nunca visible en el Estudio pero sí en el admin, y al
 *        ser específica del producto participa en preferProductSpecific.
 *        La canónica sep-mag-2x6 (200×600 vertical) ya cubre esa cara.
 *      - "separador-cuadrado-cara": stage 400×420 — DUPLICADO exacto de la
 *        canónica sep-mag-4x4-2 (mismo producto, mismo aspect): para la
 *        variante 4×4.2 el Estudio mostraba dos plantillas idénticas.
 *      → Este script las ARCHIVA (soft-delete, reversible desde el admin; los
 *        diseños viejos conservan su snapshot y su templateId). Decisión D4
 *        (2026-09-15): desactivar duplicados en vez de corregir la legacy, para
 *        no acumular plantillas muertas — ola3-templates-2caras-polaroid.mjs ya
 *        no las re-upserta (ver su header).
 *
 * Guardarraíles (patrón archive-lucams10-20260913.mjs):
 *   - DRY-RUN por defecto; `--apply` ejecuta.
 *   - env-guard fail-closed (../lib/env-guard.mjs — ruta desde one-shot/).
 *   - Idempotente: re-correr no cambia nada (lo reporta y sale 0).
 *   - Imprime el estado ANTES y DESPUÉS de cada plantilla tocada.
 *
 * Uso:
 *   pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/one-shot/normalize-template-visibility-20260915.mjs           # DRY-RUN
 *   pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/one-shot/normalize-template-visibility-20260915.mjs --apply   # ejecuta
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

// Guarda de ambiente: reactiva/archiva plantillas — bloquea PRD/remotos no STG
// (PRD solo con el bypass deliberado documentado en lib/env-guard.mjs).
assertDestructiveAllowed("normalize-template-visibility-20260915.mjs");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const ARCHIVE_ACTOR = "system:normalize-template-visibility-20260915";

// Canónicas del catálogo = las que declara scripts/seed-templates.mjs (fuente de
// verdad de la curaduría). Si el seed agrega una, agregarla acá también.
const CANONICAL_SLUGS = [
  "photo-pack-polaroid-clasica",
  "photo-pack-polaroid-instagram",
  "sep-mag-2x6",
  "sep-mag-4x4-2",
  "sep-alr-4x12",
  "sep-alr-4x15",
  "photo-strip-3-fotos",
  "photo-strip-4-fotos",
  "cuadrados-foto-y-texto",
  "calendario-mes-clasico",
  "calendario-mes-lateral",
];

// Legadas ola3 a archivar (ver header, clase 2).
const LEGACY_ARCHIVE_SLUGS = ["separador-rectangular-cara", "separador-cuadrado-cara"];

const stateOf = (t) =>
  `isActive=${t.isActive} · mode=${t.mode} · deletedAt=${t.deletedAt ? t.deletedAt.toISOString().slice(0, 10) : "null"}`;

async function main() {
  console.log(`=== normalize-template-visibility (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

  // ── 1. Reactivar canónicas apagadas ──────────────────────────────────────
  console.log("— Canónicas (deben estar activas, EDITABLE y sin deletedAt) —");
  for (const slug of CANONICAL_SLUGS) {
    const t = await prisma.personalizationTemplate.findUnique({ where: { slug } });
    if (!t) {
      console.log(`  ⚠ ${slug}: NO EXISTE en esta DB (semillar con seed-templates.mjs).`);
      continue;
    }
    const needsFix = !t.isActive || t.deletedAt !== null || t.mode !== "EDITABLE";
    if (!needsFix) {
      console.log(`  ✓ ${slug}: ya visible (${stateOf(t)})`);
      continue;
    }
    console.log(`  → ${slug}: ANTES ${stateOf(t)}`);
    if (APPLY) {
      const updated = await prisma.personalizationTemplate.update({
        where: { id: t.id },
        data: { isActive: true, deletedAt: null, deletedBy: null, mode: "EDITABLE" },
      });
      console.log(`    DESPUÉS ${stateOf(updated)}  ✓ reactivada`);
    } else {
      console.log(`    se reactivaría (isActive=true, deletedAt=null, mode=EDITABLE)`);
    }
  }

  // ── 2. Archivar legadas duplicadas/desorientadas ─────────────────────────
  console.log("\n— Legadas ola3 (duplican canónicas / aspect imposible) —");
  for (const slug of LEGACY_ARCHIVE_SLUGS) {
    const t = await prisma.personalizationTemplate.findUnique({ where: { slug } });
    if (!t) {
      console.log(`  ✓ ${slug}: no existe en esta DB — nada que archivar.`);
      continue;
    }
    if (t.deletedAt) {
      console.log(
        `  ✓ ${slug}: ya archivada (deletedAt ${t.deletedAt.toISOString().slice(0, 10)}) — idempotente.`,
      );
      continue;
    }
    // Referencias: los diseños/cartItems/orderItems conservan templateId y el
    // snapshot del canvas (soft-delete no rompe historial — mismo criterio que
    // el archivado de ola4). Solo se reportan para trazabilidad.
    const designs = await prisma.design.count({ where: { templateId: t.id } });
    console.log(`  → ${slug}: ANTES ${stateOf(t)} · diseños que la referencian: ${designs}`);
    if (APPLY) {
      const updated = await prisma.personalizationTemplate.update({
        where: { id: t.id },
        data: { deletedAt: new Date(), isActive: false, deletedBy: ARCHIVE_ACTOR },
      });
      console.log(
        `    DESPUÉS ${stateOf(updated)}  ✓ archivada (soft-delete, reversible desde el admin)`,
      );
    } else {
      console.log(`    se archivaría (soft-delete con deletedBy=${ARCHIVE_ACTOR})`);
    }
  }

  console.log(
    APPLY
      ? "\nListo. Verifica con: node scripts/one-shot/diagnose-template-visibility-20260915.mjs"
      : "\nDRY-RUN (sin cambios). Para ejecutar: node scripts/one-shot/normalize-template-visibility-20260915.mjs --apply",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

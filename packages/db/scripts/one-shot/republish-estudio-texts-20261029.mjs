#!/usr/bin/env node
/*
 * republish-estudio-texts-20261029.mjs — republica 2 textos del Estudio cuyo
 * DEFAULT cambió con la jornada de pulido UX (2026-10-29, ADR-178):
 *
 *   estudio.lienzo.cal-banner-hint   → "Una foto por mes: toca cada mes para elegir la tuya"
 *     (antes arrancaba con «·» huérfano — se veía raro al envolver en móvil).
 *   estudio.fotos.thumb-arrastrar    → "Tócala para ponerla en el próximo lienzo vacío, o arrástrala al lienzo que quieras"
 *     («Mis fotos» ahora es biblioteca usable: el tap asigna — el texto viejo
 *     solo mencionaba arrastrar).
 *
 * Por qué: migrate-cms-v2 solo actualiza la ESTRUCTURA de campos existentes y
 * nunca pisa el cuerpo publicado (contenido del owner). Estos dos campos ya
 * estaban sembrados en los 3 ambientes con la copia vieja.
 *
 * Mecánica CMS v2 (misma de republish-checkout-rural-copy-20261021): NUEVA
 * CmsFieldVersion publicada por campo y el campo apunta a ella (historial
 * intacto — revertible desde /admin/contenido). Si el cuerpo publicado fue
 * EDITADO por el owner (difiere del default anterior), NO se toca.
 *
 * EXENCIÓN del env-guard (como republish-checkout-rural-copy-20261021): su
 * caso de uso ES correr contra los 3 ambientes incl. PRD. Dry-run por defecto
 * + `--apply`. Allowlistado en lib/check-script-guards.mjs como PRD-deliberado.
 *
 * Uso (desde packages/db):
 *   npx dotenv -e ../../.env.local            -- node scripts/one-shot/republish-estudio-texts-20261029.mjs --apply
 *   npx dotenv -e ../../.env.stg              -- node scripts/one-shot/republish-estudio-texts-20261029.mjs --apply
 *   npx dotenv -e ../../.env.local.nube-backup -- node scripts/one-shot/republish-estudio-texts-20261029.mjs --apply
 *
 * Tras aplicar: invalidar el caché CMS desde /admin/contenido (o esperar 1 h).
 */

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

// [key, cuerpo nuevo, cuerpo default ANTERIOR (si el publicado difiere de ambos
// es edición del owner → no se toca)]
const FIELDS = [
  [
    "estudio.lienzo.cal-banner-hint",
    "Una foto por mes: toca cada mes para elegir la tuya",
    "· una foto por mes (toca cada mes para elegir tu foto)",
  ],
  [
    "estudio.fotos.thumb-arrastrar",
    "Tócala para ponerla en el próximo lienzo vacío, o arrástrala al lienzo que quieras",
    "Arrastra al canvas o toca un slot vacío para asignar",
  ],
];

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY-RUN (sin cambios; --apply ejecuta) ===");
  let updated = 0;
  let skipped = 0;
  for (const [key, newBody, oldDefault] of FIELDS) {
    const field = await prisma.cmsField.findUnique({
      where: { key },
      include: { publishedVersion: true },
    });
    if (!field) {
      console.log(`= ${key}: no existe en este ambiente (se siembra con migrate-cms-v2) — skip`);
      skipped++;
      continue;
    }
    const current = field.publishedVersion?.body ?? "";
    if (current === newBody) {
      console.log(`= ${key}: ya tiene la copia nueva — skip`);
      skipped++;
      continue;
    }
    if (current !== oldDefault) {
      console.log(
        `! ${key}: el cuerpo publicado difiere del default anterior — posible edición del owner, NO se toca:`,
      );
      console.log(`    ACTUAL: ${current.slice(0, 100)}…`);
      skipped++;
      continue;
    }
    console.log(`→ ${key}:`);
    console.log(`    ANTES:   ${current.slice(0, 100)}…`);
    console.log(`    DESPUÉS: ${newBody.slice(0, 100)}…`);
    if (APPLY) {
      const last = await prisma.cmsFieldVersion.findFirst({
        where: { fieldId: field.id },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const version = await prisma.cmsFieldVersion.create({
        data: {
          fieldId: field.id,
          version: (last?.version ?? 0) + 1,
          title: field.publishedVersion?.title ?? null,
          body: newBody,
          metadata: field.publishedVersion?.metadata ?? {},
          publishedAt: new Date(),
          createdBy: "script:republish-estudio-texts-20261029",
        },
      });
      await prisma.cmsField.update({
        where: { id: field.id },
        data: { body: newBody, publishedVersionId: version.id, isPublished: true },
      });
      console.log(`    ✓ publicada como versión ${version.version}`);
    }
    updated++;
  }
  console.log(`\nListo: ${updated} por actualizar, ${skipped} sin cambios.`);
  if (!APPLY) console.log("Para ejecutar: agrega --apply");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

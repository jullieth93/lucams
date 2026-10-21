#!/usr/bin/env node
/*
 * republish-checkout-rural-copy-20261021.mjs — republica 3 textos del checkout
 * rural cuyo DEFAULT cambió con la dirección estructurada (2026-10-21):
 *
 *   checkout.datos.finca-label      → "Finca / negocio / lugar (opcional)"
 *   checkout.datos.ref-placeholder  → "Ej.: a 200 m del puente sobre el río, casa azul de portón negro, al lado de la tienda de Doña Mary"
 *   checkout.datos.ref-error        → "Mínimo 20 caracteres — el courier necesita referencias claras"
 *
 * Por qué: migrate-cms-v2 solo actualiza la ESTRUCTURA de campos existentes y
 * nunca pisa el cuerpo publicado (contenido del owner). El mínimo rural subió
 * de 10 a 20 caracteres (RURAL_REF_MIN_LENGTH) y el label de finca cambió —
 * los ambientes con el campo ya sembrado (LOCAL/STG/PRD) mostraban la copia
 * VIEJA contradiciendo la validación nueva, y el test de integridad CMS
 * ("sembrado = defaults") divergía entre DB fresca (CI) y existente (local).
 *
 * Mecánica CMS v2 (misma de publish-legal-v5): NUEVA CmsFieldVersion publicada
 * por campo y el campo apunta a ella (historial intacto — revertible desde
 * /admin/contenido). Si el cuerpo publicado fue EDITADO por el owner (difiere
 * del default anterior), NO se toca: el contenido editado manda.
 *
 * EXENCIÓN del env-guard (como publish-legal-v5): su caso de uso ES correr
 * contra los 3 ambientes incl. PRD — la copia vieja contradice la validación
 * ya desplegada. Protege con dry-run por defecto + `--apply`. Allowlistado en
 * lib/check-script-guards.mjs como PRD-deliberado.
 *
 * Uso (desde packages/db):
 *   npx dotenv -e ../../.env.local            -- node scripts/one-shot/republish-checkout-rural-copy-20261021.mjs --apply
 *   npx dotenv -e ../../.env.stg              -- node scripts/one-shot/republish-checkout-rural-copy-20261021.mjs --apply
 *   npx dotenv -e ../../.env.local.nube-backup -- node scripts/one-shot/republish-checkout-rural-copy-20261021.mjs --apply
 *
 * Tras aplicar: invalidar el caché CMS desde /admin/contenido (o esperar 1 h).
 */

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

// [key, cuerpo nuevo, cuerpo default ANTERIOR (si el publicado difiere de ambos
// es edición del owner → no se toca)]
const FIELDS = [
  ["checkout.datos.finca-label", "Finca / negocio / lugar (opcional)", "Finca / Lugar (opcional)"],
  [
    "checkout.datos.ref-placeholder",
    "Ej.: a 200 m del puente sobre el río, casa azul de portón negro, al lado de la tienda de Doña Mary",
    "Ej. A 200m del puente sobre el río, casa de dos pisos color azul, portón de madera. Llamar al llegar.",
  ],
  [
    "checkout.datos.ref-error",
    "Mínimo 20 caracteres — el courier necesita referencias claras",
    "Mínimo 10 caracteres — el courier necesita referencias claras",
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
          createdBy: "script:republish-checkout-rural-copy-20261021",
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

/*
 * fix-envio-lucams-nombre-20261012.mjs — corrige el valor PUBLICADO del texto
 * CMS `pdp.envio.lucams-nombre` a "Envío Lucams" (branding unificado 2026-10-12:
 * la marca nunca lleva apóstrofe ni underscore en textos visibles).
 *
 * El campo pudo quedar publicado con el nombre viejo ("Envío Lucam's" o el
 * rename intermedio "LUCAMS" de apply-brand-updates-20261007); el fallback del
 * código ya dice "Envío Lucams" (apps/web/app/producto/[slug]/page.tsx) y este
 * script alinea la BD.
 *
 * Respeta el modelo de versionado CMS: nueva CmsFieldVersion
 * (max(version)+1, publishedAt=now) + CmsField.body y publishedVersionId
 * actualizados. Idempotente: si el valor ya es el deseado, no crea versión.
 *
 * Guardarraíles (patrón N-06): DRY-RUN por defecto; `--apply` ejecuta;
 * env-guard fail-closed.
 *
 * Uso:
 *   cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/one-shot/fix-envio-lucams-nombre-20261012.mjs          # DRY-RUN
 *   cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/one-shot/fix-envio-lucams-nombre-20261012.mjs --apply  # ejecuta
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

assertDestructiveAllowed("fix-envio-lucams-nombre-20261012.mjs");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const FIELD_KEY = "pdp.envio.lucams-nombre";
const NEW_VALUE = "Envío Lucams";

async function main() {
  console.log(`=== fix-envio-lucams-nombre-20261012 (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

  const field = await prisma.cmsField.findUnique({
    where: { key: FIELD_KEY },
    include: { publishedVersion: true },
  });
  if (!field) {
    console.log(`  ✗ ${FIELD_KEY}: el campo no existe (corre migrate-cms-v2 primero)`);
    return;
  }
  if (field.publishedVersion?.body === NEW_VALUE && field.body === NEW_VALUE) {
    console.log(`  · ${FIELD_KEY}: ya tiene el valor deseado — sin cambios`);
    return;
  }

  const nextVersion = (field.publishedVersion?.version ?? 0) + 1;
  console.log(
    `  ${APPLY ? "✓" : "→"} ${FIELD_KEY}: "${field.publishedVersion?.body ?? ""}" → "${NEW_VALUE}" (v${nextVersion})`,
  );
  if (!APPLY) {
    console.log("\nDRY-RUN (sin cambios). Para ejecutar: --apply");
    return;
  }

  const version = await prisma.cmsFieldVersion.create({
    data: {
      fieldId: field.id,
      version: nextVersion,
      title: field.publishedVersion?.title ?? null,
      body: NEW_VALUE,
      publishedAt: new Date(),
      createdBy: "one-shot/fix-envio-lucams-nombre-20261012",
    },
  });
  await prisma.cmsField.update({
    where: { id: field.id },
    data: { body: NEW_VALUE, isPublished: true, publishedVersionId: version.id },
  });

  console.log(
    "\n✓ listo — invalida el caché CMS desde /admin/contenido (o espera la revalidación).",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

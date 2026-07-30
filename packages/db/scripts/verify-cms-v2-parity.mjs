/*
 * Verificación de paridad CMS v2 — compara el valor PUBLICADO de cada
 * CmsBlock / SiteSetting (tablas DEPRECATED, respaldo) contra su CmsField
 * equivalente en el modelo nuevo. Solo lectura.
 *
 * Uso:
 *   pnpm --filter @lucams/db exec node scripts/verify-cms-v2-parity.mjs
 *
 * Exit 0 si todo coincide; exit 1 si hay diferencias (las lista).
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

const diffs = [];

// ── Bloques: body de la versión publicada, viejo vs nuevo ──
const blocks = await prisma.cmsBlock.findMany({
  where: { deletedAt: null },
  include: { publishedVersion: true },
});
for (const block of blocks) {
  const field = await prisma.cmsField.findUnique({
    where: { key: block.key },
    include: { publishedVersion: true },
  });
  if (!field) {
    diffs.push(`FALTA campo BLOCK ${block.key}`);
    continue;
  }
  if (field.kind !== "BLOCK") diffs.push(`${block.key}: kind ${field.kind} ≠ BLOCK`);
  const oldBody = block.publishedVersion?.body ?? null;
  const newBody = field.publishedVersion?.body ?? null;
  if (block.isPublished !== field.isPublished) {
    diffs.push(`${block.key}: isPublished ${block.isPublished} → ${field.isPublished}`);
  }
  if (oldBody !== newBody) {
    diffs.push(
      `${block.key}: body publicado difiere (viejo ${oldBody?.length ?? 0} chars, nuevo ${newBody?.length ?? 0} chars)`,
    );
  }
  const oldVersions = await prisma.cmsBlockVersion.count({ where: { blockId: block.id } });
  const newVersions = await prisma.cmsFieldVersion.count({ where: { fieldId: field.id } });
  if (oldVersions !== newVersions) {
    diffs.push(`${block.key}: versiones ${oldVersions} → ${newVersions}`);
  }
}

// ── Settings: valor, viejo vs nuevo ──
const settings = await prisma.siteSetting.findMany();
for (const setting of settings) {
  const field = await prisma.cmsField.findUnique({
    where: { key: setting.key },
    include: { publishedVersion: true },
  });
  if (!field) {
    diffs.push(`FALTA campo SETTING ${setting.key}`);
    continue;
  }
  if (field.kind !== "SETTING") diffs.push(`${setting.key}: kind ${field.kind} ≠ SETTING`);
  if (field.publishedVersion?.body !== setting.value) {
    diffs.push(
      `${setting.key}: valor difiere ("${setting.value}" → "${field.publishedVersion?.body}")`,
    );
  }
  if (!field.isPublished) diffs.push(`${setting.key}: SETTING no publicado`);
}

console.log(`=== Paridad CMS v2 ===`);
console.log(`Bloques comparados: ${blocks.length}`);
console.log(`Settings comparados: ${settings.length}`);
if (diffs.length === 0) {
  console.log("OK — todo el contenido publicado coincide entre el modelo viejo y el v2.");
} else {
  console.log(`✗ ${diffs.length} diferencias:`);
  for (const d of diffs) console.log(`  - ${d}`);
}

await prisma.$disconnect();
process.exit(diffs.length === 0 ? 0 : 1);

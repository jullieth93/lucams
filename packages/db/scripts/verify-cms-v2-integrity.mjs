#!/usr/bin/env node
/*
 * Verificación de INTEGRIDAD del CMS v2 (reemplaza a verify-cms-v2-parity.mjs
 * tras el drop de tablas legacy de A2). Solo lectura; exit 1 si hay anomalías.
 *
 * Chequeos:
 *   1. Campos marcados como publicados SIN versión publicada (o con
 *      publishedVersionId colgando de una versión inexistente) → 0.
 *   2. Campos IMAGE publicados cuya versión publicada apunta a un CmsMedia
 *      inexistente (el sitio caería al fallback en silencio) → 0.
 *   3. Campos LISTA (metadata.listSchema) cuya versión publicada no es un
 *      array JSON válido → 0.
 *
 * Uso:
 *   pnpm --filter @lucams/db exec node scripts/verify-cms-v2-integrity.mjs
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();
const anomalies = [];

// 1. Publicados sin versión viva
const fields = await prisma.cmsField.findMany({
  where: { deletedAt: null, isPublished: true },
  include: { publishedVersion: true },
});
for (const f of fields) {
  if (!f.publishedVersionId) {
    anomalies.push(`${f.key}: isPublished=true sin publishedVersionId`);
  } else if (!f.publishedVersion) {
    anomalies.push(`${f.key}: publishedVersionId → versión inexistente (${f.publishedVersionId})`);
  }
}

// 2. IMAGE publicados apuntando a asset inexistente
const imageFields = fields.filter((f) => f.type === "IMAGE" && f.publishedVersion);
const mediaIds = [
  ...new Set(imageFields.map((f) => f.publishedVersion.body.trim()).filter(Boolean)),
];
const media = mediaIds.length
  ? await prisma.cmsMedia.findMany({ where: { id: { in: mediaIds } }, select: { id: true } })
  : [];
const mediaSet = new Set(media.map((m) => m.id));
for (const f of imageFields) {
  const id = f.publishedVersion.body.trim();
  if (id && !mediaSet.has(id)) {
    anomalies.push(`${f.key}: versión publicada apunta a CmsMedia inexistente (${id})`);
  }
}

// 3. LISTA publicados con JSON inválido
const listFields = fields.filter(
  (f) =>
    f.publishedVersion &&
    typeof f.metadata === "object" &&
    f.metadata !== null &&
    !Array.isArray(f.metadata) &&
    Array.isArray(f.metadata.listSchema),
);
for (const f of listFields) {
  try {
    const parsed = JSON.parse(f.publishedVersion.body);
    if (!Array.isArray(parsed)) anomalies.push(`${f.key}: lista publicada no es un array JSON`);
  } catch {
    anomalies.push(`${f.key}: lista publicada con JSON inválido`);
  }
}

console.log(
  `Integridad CMS v2: ${fields.length} campos publicados · ${imageFields.length} IMAGE · ${listFields.length} LISTA`,
);
if (anomalies.length > 0) {
  console.error(`\n${anomalies.length} ANOMALÍA(S):`);
  for (const a of anomalies.slice(0, 30)) console.error(`  - ${a}`);
  if (anomalies.length > 30) console.error(`  … y ${anomalies.length - 30} más`);
  process.exit(1);
}
console.log("OK — 0 anomalías.");
await prisma.$disconnect();

/*
 * apply-brand-updates-20261007.mjs — aplica en el CMS las dos actualizaciones de
 * marca aprobadas por el owner (2026-10-07):
 *
 *   1. `pdp.envio.lucams-nombre`: "Envío Lucam's" → "LUCAMS" (coherencia con el
 *      rename del checkout Fase 3; el campo estaba publicado con el nombre viejo).
 *   2. `site.logo`: sube `apps/web/public/brand/lucams-logo.png` a la Mediateca
 *      (bucket cms-media, optimizado WebP q82 ≤2000px — mismo criterio que
 *      uploadCmsMedia) y publica el campo con el CmsMedia.id.
 *
 * Ambas ediciones respetan el modelo de versionado CMS: nueva CmsFieldVersion
 * (max(version)+1, publishedAt=now) + CmsField.body y publishedVersionId
 * actualizados. Idempotente: si el valor ya es el deseado, no crea versión.
 *
 * Guardarraíles (patrón N-06): DRY-RUN por defecto; `--apply` ejecuta;
 * env-guard fail-closed.
 *
 * Uso:
 *   cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/one-shot/apply-brand-updates-20261007.mjs          # DRY-RUN
 *   cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/one-shot/apply-brand-updates-20261007.mjs --apply  # ejecuta
 */

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);
process.env.NEXT_PUBLIC_SUPABASE_URL = stripQuotes(process.env.NEXT_PUBLIC_SUPABASE_URL);
process.env.SUPABASE_SECRET_KEY = stripQuotes(process.env.SUPABASE_SECRET_KEY);

assertDestructiveAllowed("apply-brand-updates-20261007.mjs");

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..", "..");
const requireFromWeb = createRequire(join(REPO_ROOT, "apps", "web", "package.json"));
const { createClient } = requireFromWeb("@supabase/supabase-js");
const sharp = requireFromWeb("sharp");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const LOGO_FILE = join(REPO_ROOT, "apps", "web", "public", "brand", "lucams-logo.png");

/** Publica un nuevo valor para un CmsField (versión + body + publishedVersionId). */
async function publishFieldValue(key, body) {
  const field = await prisma.cmsField.findUnique({
    where: { key },
    include: { publishedVersion: true },
  });
  if (!field) {
    console.log(`  ✗ ${key}: el campo no existe (corre migrate-cms-v2 primero)`);
    return false;
  }
  if (field.publishedVersion?.body === body && field.body === body) {
    console.log(`  · ${key}: ya tiene el valor deseado — sin cambios`);
    return true;
  }
  const nextVersion = (field.publishedVersion?.version ?? 0) + 1;
  console.log(`  ${APPLY ? "✓" : "→"} ${key}: "${field.publishedVersion?.body ?? ""}" → "${body}" (v${nextVersion})`);
  if (!APPLY) return true;
  const version = await prisma.cmsFieldVersion.create({
    data: {
      fieldId: field.id,
      version: nextVersion,
      title: field.publishedVersion?.title ?? null,
      body,
      publishedAt: new Date(),
      createdBy: "one-shot/apply-brand-updates-20261007",
    },
  });
  await prisma.cmsField.update({
    where: { id: field.id },
    data: { body, isPublished: true, publishedVersionId: version.id },
  });
  return true;
}

async function main() {
  console.log(`=== apply-brand-updates-20261007 (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

  // 1. Nombre de la mensajería propia en la PDP.
  await publishFieldValue("pdp.envio.lucams-nombre", "LUCAMS");

  // 2. Logo del sitio: upload a Mediateca + publicar site.logo con el CmsMedia.id.
  const png = readFileSync(LOGO_FILE);
  const optimized = await sharp(png)
    .rotate()
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  console.log(
    `  · logo optimizado: ${optimized.info.width}×${optimized.info.height} · ${(optimized.info.size / 1024).toFixed(1)} KB`,
  );

  if (!APPLY) {
    console.log(`  → site.logo: subiría media/lucams-logo-<uuid>.webp a cms-media y publicaría el campo`);
  } else {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const path = `media/${randomUUID()}.webp`;
    const { error: uploadErr } = await supabase.storage
      .from("cms-media")
      .upload(path, optimized.data, { contentType: "image/webp", cacheControl: "31536000" });
    if (uploadErr) throw new Error(`upload cms-media falló: ${uploadErr.message}`);
    const media = await prisma.cmsMedia.create({
      data: {
        bucket: "cms-media",
        path,
        alt: "Logo de LUCAMS",
        width: optimized.info.width,
        height: optimized.info.height,
        bytes: optimized.info.size,
        mime: "image/webp",
        createdBy: "one-shot/apply-brand-updates-20261007",
      },
    });
    console.log(`  ✓ CmsMedia ${media.id} (${path})`);
    await publishFieldValue("site.logo", media.id);
  }

  console.log(
    APPLY
      ? "\n✓ listo — invalida el caché CMS desde /admin/contenido (o espera la revalidación)."
      : "\nDRY-RUN (sin cambios). Para ejecutar: --apply",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

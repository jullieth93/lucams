#!/usr/bin/env node
/*
 * ONE-SHOT (2026-10-12) — PURGA de objetos HUÉRFANOS en Supabase Storage.
 *
 * Contexto: diagnóstico post aviso "grace period" de Supabase. En PRD se
 * midieron ~316 MB de archivos cuyo diseño ya no existe en la tabla Design
 * (217 MB en production-assets, 99 MB en customer-uploads): restos de diseños
 * eliminados antes de que las purgas de retención (ADR-130, 2026-10-08)
 * borraran también los bytes. La fila de storage.objects desaparece pero el
 * byte quedaba — este script borra ambos vía Storage API (remove()).
 *
 * Reglas de orfandad (por convención de paths de apps/web/lib/storage.ts):
 *   - production-assets:  <designId>/…              → huérfano si designId ∉ Design
 *   - design-previews:    <designId>/…              → huérfano si designId ∉ Design
 *   - customer-uploads:   <ownerId>/<designId>/…    → huérfano si designId ∉ Design
 *                         <ownerId>/pending/…       → huérfano si tiene > 7 días
 *                                                     (uploads temporales que
 *                                                     nunca se asociaron a un diseño)
 *
 * Guardarraíles (patrón N-06): DRY-RUN por defecto · --apply ejecuta ·
 * env-guard fail-closed (escape hatch LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1) ·
 * manifiesto JSON de lo borrado en tmp/backups/orphan-storage-<ts>.json.
 * Los bytes además están cubiertos por el backup diario a R2 (retención 30d).
 *
 * NOTA (2026-10-12): desde hoy existe barrido RECURRENTE de huérfanos
 * (`sweepOrphanStorageObjects`, mismo cron `purge-anon-designs`, STG+PRD) con estas mismas
 * reglas — este script queda para diagnóstico/purga manual acotada (ver «Higiene de Supabase
 * Storage» en docs/OPERATIONS.md).
 *
 * Uso (desde packages/db):
 *   pnpm exec dotenv -e ../../.env.stg -- node scripts/one-shot/purge-orphan-storage-20261012.mjs
 *   pnpm exec dotenv -e ../../.env.stg -- node scripts/one-shot/purge-orphan-storage-20261012.mjs --apply
 *   LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 pnpm exec dotenv -e ../../.env.local.nube-backup -- node scripts/one-shot/purge-orphan-storage-20261012.mjs --apply
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(HERE, "..", "..", "..", "..", "tmp", "backups");

const APPLY = process.argv.includes("--apply");
if (APPLY) assertDestructiveAllowed("purge-orphan-storage-20261012.mjs");

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const SUPABASE_URL = stripQuotes(process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/, "");
const SERVICE_KEY = stripQuotes(process.env.SUPABASE_SECRET_KEY);
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✗ faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY en el env del destino");
  process.exit(1);
}

const PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DELETE_BATCH = 100;

const prisma = new PrismaClient();
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function classify(bucket, name, createdAt, designIds, now) {
  const parts = name.split("/");
  if (bucket === "production-assets" || bucket === "design-previews") {
    return !designIds.has(parts[0]) ? "design-inexistente" : null;
  }
  if (bucket === "customer-uploads") {
    const designPart = parts[1] ?? "";
    if (designPart === "pending") {
      const age = now - new Date(createdAt).getTime();
      return age > PENDING_MAX_AGE_MS ? "pending-vencido" : null;
    }
    return !designIds.has(designPart) ? "design-inexistente" : null;
  }
  return null;
}

async function main() {
  console.log(`=== purge-orphan-storage-20261012 (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);

  const designs = await prisma.design.findMany({ select: { id: true } });
  const designIds = new Set(designs.map((d) => d.id));
  console.log(`Designs vivos: ${designIds.size}`);

  const objects = await prisma.$queryRawUnsafe(
    `SELECT bucket_id AS "bucket", name, created_at AS "createdAt",
            COALESCE((metadata->>'size')::bigint, 0) AS size
     FROM storage.objects
     WHERE bucket_id IN ('production-assets', 'customer-uploads', 'design-previews')`,
  );

  const now = Date.now();
  const orphans = [];
  for (const obj of objects) {
    const reason = classify(obj.bucket, obj.name, obj.createdAt, designIds, now);
    if (reason) orphans.push({ ...obj, reason });
  }

  const byBucket = {};
  for (const o of orphans) {
    byBucket[o.bucket] ??= { files: 0, bytes: 0n };
    byBucket[o.bucket].files += 1;
    byBucket[o.bucket].bytes += o.size;
  }
  console.log(`Objetos escaneados: ${objects.length} · huérfanos: ${orphans.length}`);
  for (const [bucket, agg] of Object.entries(byBucket)) {
    console.log(`  · ${bucket}: ${agg.files} archivos, ${Number(agg.bytes / 1024n / 1024n)} MB`);
  }

  if (!APPLY || orphans.length === 0) {
    console.log(APPLY ? "✓ nada que borrar" : "DRY-RUN — sin cambios (correr con --apply para ejecutar)");
    await prisma.$disconnect();
    return;
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const manifestPath = join(
    BACKUP_DIR,
    `orphan-storage-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );

  const deleted = [];
  const failed = [];
  for (const bucket of Object.keys(byBucket)) {
    const paths = orphans.filter((o) => o.bucket === bucket).map((o) => o.name);
    for (let i = 0; i < paths.length; i += DELETE_BATCH) {
      const batch = paths.slice(i, i + DELETE_BATCH);
      const { data, error } = await supabase.storage.from(bucket).remove(batch);
      if (error) {
        failed.push({ bucket, batch, error: error.message });
        console.error(`✗ ${bucket} batch ${i / DELETE_BATCH + 1}: ${error.message}`);
      } else {
        deleted.push(...data.map((d) => ({ bucket, name: d.name })));
      }
    }
  }

  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        orphans: orphans.map((o) => ({
          bucket: o.bucket,
          name: o.name,
          size: Number(o.size),
          reason: o.reason,
        })),
        deleted,
        failed,
      },
      null,
      2,
    ),
  );
  console.log(`✓ borrados ${deleted.length} objetos · fallidos ${failed.length} · manifiesto: ${manifestPath}`);
  await prisma.$disconnect();
  if (failed.length > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error("✗", err);
  await prisma.$disconnect();
  process.exit(1);
});

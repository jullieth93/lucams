#!/usr/bin/env node
/*
 * sync-gallery-stg-to-prd.mjs — sincroniza DesignGalleryImage de STG → PRD
 * (diseños prediseñados de la galería) junto con los objetos de Storage que
 * referencian.
 *
 * Por qué existe (2026-10-02): STG tiene 129 diseños y PRD 78 — faltan los 51
 * del tag 'separadores-magneticos' (backfill 4×4.2 + Fase 5 variantFilter).
 * La galería se cura en STG y PRD quedó atrás; este one-shot iguala PRD.
 *
 * Qué hace:
 *   1. Lee DesignGalleryImage completo de AMBAS DBs (creds de ../../.env.stg y
 *      ../../.env.local.nube-backup — el script carga los archivos él mismo,
 *      no hace falta dotenv) y hace diff con cruce en dos niveles (lib/gallery-sync):
 *        - por ID, y si el id no existe en PRD, por (tag, name) — al 2026-10-02
 *          solo 12 cuids coinciden entre ambientes: las demás filas comunes se
 *          sembraron independientes y matchear por id puro INSERTARÍA 66
 *          duplicados. Las filas cruzadas por (tag, name) se UPDATEan en sitio
 *          conservando el id de PRD (hay FKs: DesignAsset.galleryImageId).
 *        - sin id ni (tag, name) en PRD → INSERT con TODOS los campos y el id
 *          de STG (re-corridas idempotentes, sin duplicados).
 *        - contenido distinto (tag/name/imageUrl/imageUrlB/variantFilter/
 *          order/isActive/deletedAt) → UPDATE al estado de STG (STG es la
 *          fuente de verdad del contenido, decisión del owner).
 *        - solo en PRD → NO se tocan; se reportan.
 *   2. Storage: para cada fila a insertar/actualizar, extrae bucket/path de
 *      imageUrl/imageUrlB y copia el objeto del bucket STG al bucket PRD (mismo
 *      path) SOLO si no existe allí. Descarga con fetch nativo (bucket público)
 *      y sube con SUPABASE_SECRET_KEY de PRD. Re-intenta 1 vez y acumula fallos
 *      sin abortar el lote.
 *
 * Precondición: la migración 20261002140000_design_gallery_variant_filter
 * deployada en PRD (si falta, el DRY-RUN degrada con aviso y el APPLY aborta).
 *
 * Escritura PRD-DELIBERADA: corre con env-guard (fail-closed) — el modo APPLY
 * exige LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1. DRY-RUN por defecto (solo LEE ambas
 * DBs y hace HEAD al bucket PRD; imprime el plan).
 *
 * Uso (desde packages/db):
 *   node scripts/one-shot/sync-gallery-stg-to-prd.mjs           # DRY-RUN (plan)
 *   LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 node scripts/one-shot/sync-gallery-stg-to-prd.mjs --apply
 */

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import {
  assertDestructiveAllowed,
  classifyUrl,
} from "../lib/env-guard.mjs";
import { diffGallery, collectStorageObjects } from "../lib/gallery-sync.mjs";

const APPLY = process.argv.includes("--apply");
for (const arg of process.argv.slice(2)) {
  if (arg !== "--apply") {
    console.error(`✗ argumento no reconocido: ${arg} (válidos: --apply)`);
    process.exit(1);
  }
}

const STG_ENV = new URL("../../../../.env.stg", import.meta.url).pathname;
const PRD_ENV = new URL("../../../../.env.local.nube-backup", import.meta.url).pathname;

// Mismo parser de .env que sync-nomag-variants-to-prd.mjs (sin dependencias).
function loadEnvFile(path) {
  const out = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    if (!/^[A-Z0-9_]+$/.test(key)) continue;
    let val = line.slice(idx + 1).trim();
    if (val.startsWith('"') || val.startsWith("'")) {
      const q = val[0];
      const end = val.indexOf(q, 1);
      val = end > 0 ? val.slice(1, end) : val.slice(1);
    }
    out[key] = val;
  }
  return out;
}

const stgEnv = loadEnvFile(STG_ENV);
const prdEnv = loadEnvFile(PRD_ENV);

// Fail-closed anti-archivos-cruzados: cada .env debe clasificar como su ambiente
// (mismos refs que env-guard). Si no, abortar antes de abrir conexiones.
const stgKind = classifyUrl(stgEnv.DIRECT_URL);
const prdKind = classifyUrl(prdEnv.DIRECT_URL);
if (stgKind !== "stg" || prdKind !== "prd") {
  console.error(
    `✗ credenciales cruzadas o irreconocibles: .env.stg clasifica como "${stgKind}" y ` +
      `.env.local.nube-backup como "${prdKind}" (esperado: stg y prd). Abortando.`,
  );
  process.exit(1);
}

// La env-guard mira process.env: se la alimenta con el destino PRD real para
// que el APPLY quede bloqueado salvo bypass deliberado (LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1).
if (APPLY) {
  process.env.DIRECT_URL = prdEnv.DIRECT_URL;
  process.env.DATABASE_URL = prdEnv.DATABASE_URL ?? prdEnv.DIRECT_URL;
  assertDestructiveAllowed("sync-gallery-stg-to-prd.mjs");
}

const stg = new PrismaClient({ datasources: { db: { url: stgEnv.DIRECT_URL } } });
// "db" = destino (PRD). El lint check-script-guards detecta las escrituras
// `db.designGalleryImage.*` y exige el import de env-guard (arriba).
const db = new PrismaClient({ datasources: { db: { url: prdEnv.DIRECT_URL } } });

const stgPublicBase = stgEnv.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const prdPublicBase = prdEnv.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const prdSecret = prdEnv.SUPABASE_SECRET_KEY;
if (!stgPublicBase || !prdPublicBase || !prdSecret) {
  console.error("✗ faltan NEXT_PUBLIC_SUPABASE_URL (stg/prd) o SUPABASE_SECRET_KEY (prd) en los .env");
  process.exit(1);
}
const supabasePrd = createClient(prdPublicBase, prdSecret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const publicUrlOf = (base, bucket, path) =>
  `${base}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;

async function statusOf(url) {
  try {
    const head = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(10_000) });
    if (head.status !== 405) return head.status;
    const get = await fetch(url, {
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(10_000),
    });
    return get.status;
  } catch {
    return 0;
  }
}

async function withRetry(label, fn) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`  … reintentando ${label} tras: ${err.message}`);
    return fn(); // 1 reintento; si falla, propaga y se acumula en failures
  }
}

/** Columnas reales de DesignGalleryImage en una DB (preflight de drift de schema). */
async function columnSet(client) {
  const rows = await client.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'DesignGalleryImage'`;
  return new Set(rows.map((r) => r.column_name));
}

async function main() {
  console.log(`=== sync-gallery-stg-to-prd (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);

  // Preflight de schema: la migración 20261002140000_design_gallery_variant_filter
  // (Fase 5) puede no estar deployada en PRD aún. En DRY-RUN se degrada con aviso
  // (variantFilter se asume null en PRD); en APPLY se aborta — los inserts con
  // variantFilter no nulo fallarían y una sync sin esa columna sería parcial.
  const [stgCols, prdCols] = await Promise.all([columnSet(stg), columnSet(db)]);
  const prdHasVariantFilter = prdCols.has("variantFilter");
  if (!prdHasVariantFilter) {
    const msg =
      "PRD no tiene la columna DesignGalleryImage.variantFilter — aplicar primero la migración " +
      "20261002140000_design_gallery_variant_filter a PRD (prisma migrate deploy).";
    if (APPLY) {
      console.error(`✗ ${msg}`);
      process.exit(1);
    }
    console.warn(`⚠ ${msg}\n  DRY-RUN degradado: variantFilter se asume null en PRD (el plan de inserts/updates no cambia).`);
  }

  const SELECT = {
    id: true, tag: true, name: true, imageUrl: true, imageUrlB: true,
    variantFilter: true, order: true, isActive: true,
    createdAt: true, updatedAt: true, createdBy: true, updatedBy: true, deletedAt: true,
  };
  const selectFor = (cols) => {
    const s = { ...SELECT };
    if (!cols.has("variantFilter")) delete s.variantFilter;
    if (!cols.has("imageUrlB")) delete s.imageUrlB;
    return s;
  };
  const [stgRowsRaw, prdRowsRaw] = await Promise.all([
    stg.designGalleryImage.findMany({ orderBy: { id: "asc" }, select: selectFor(stgCols) }),
    db.designGalleryImage.findMany({ orderBy: { id: "asc" }, select: selectFor(prdCols) }),
  ]);
  const fill = (r) => ({ imageUrlB: null, variantFilter: null, ...r });
  const stgRows = stgRowsRaw.map(fill);
  const prdRows = prdRowsRaw.map(fill);
  console.log(`STG: ${stgRows.length} filas · PRD: ${prdRows.length} filas`);

  const { inserts, updates, prdOnly } = diffGallery(stgRows, prdRows);
  const touched = [...inserts, ...updates.map((u) => u.row)];
  const objects = collectStorageObjects(touched);

  // Existencia en el bucket PRD (HEAD público — lectura, segura en dry-run).
  const missingObjects = [];
  for (const obj of objects) {
    const status = await statusOf(publicUrlOf(prdPublicBase, obj.bucket, obj.path));
    if (status < 200 || status >= 300) missingObjects.push(obj);
  }

  const byTagName = updates.filter((u) => u.matchedBy === "tag+name").length;
  console.log(
    `\nPlan: ${inserts.length} inserts · ${updates.length} updates ` +
      `(${updates.length - byTagName} por id, ${byTagName} por tag+name) · ` +
      `${objects.length} objetos referenciados (${missingObjects.length} a copiar a PRD) · ` +
      `${prdOnly.length} filas solo-PRD (NO se tocan)`,
  );
  for (const row of inserts) {
    console.log(`  + INSERT ${row.id} · ${row.tag}/${row.name}${row.isActive ? "" : " (inactiva)"}${row.deletedAt ? " (archivada)" : ""}`);
  }
  for (const { row, prdRow, fields, matchedBy } of updates) {
    const idNote = matchedBy === "id" ? row.id : `${prdRow.id} (cruce tag+name; id STG ${row.id})`;
    console.log(`  ~ UPDATE ${idNote} · ${row.tag}/${row.name} · campos: ${fields.join(", ")}`);
  }
  for (const obj of missingObjects) {
    console.log(`  ⇪ COPIAR objeto ${obj.bucket}/${obj.path}`);
  }
  if (prdOnly.length) {
    console.log("— Solo en PRD (se conservan tal cual):");
    for (const row of prdOnly) console.log(`  · ${row.id} · ${row.tag}/${row.name}`);
  }

  if (!APPLY) {
    console.log("\nDRY-RUN (sin cambios). Para ejecutar: LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 … --apply");
    return;
  }

  // 1) Copiar objetos de Storage que faltan en PRD.
  const failures = [];
  let copiedObjects = 0;
  for (const obj of missingObjects) {
    const src = publicUrlOf(stgPublicBase, obj.bucket, obj.path);
    try {
      const bytes = await withRetry(`descarga ${obj.path}`, async () => {
        const res = await fetch(src, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`GET ${obj.bucket}/${obj.path} → HTTP ${res.status}`);
        return {
          body: Buffer.from(await res.arrayBuffer()),
          contentType: res.headers.get("content-type") ?? "application/octet-stream",
        };
      });
      await withRetry(`subida ${obj.path}`, async () => {
        const { error } = await supabasePrd.storage.from(obj.bucket).upload(obj.path, bytes.body, {
          contentType: bytes.contentType,
          cacheControl: "31536000",
          upsert: false, // solo se copia lo que FALTA; nunca pisar un objeto PRD
        });
        if (error) throw new Error(`upload ${obj.bucket}/${obj.path}: ${error.message}`);
      });
      copiedObjects++;
      console.log(`  ✓ objeto copiado ${obj.bucket}/${obj.path}`);
    } catch (err) {
      failures.push(`storage ${obj.bucket}/${obj.path} — ${err.message}`);
      console.warn(`  ✗ objeto ${obj.bucket}/${obj.path}: ${err.message}`);
    }
  }

  // 2) Escrituras en DB (fila a fila: un fallo no aborta el lote).
  let inserted = 0;
  let updated = 0;
  for (const row of inserts) {
    try {
      await db.designGalleryImage.create({
        data: {
          id: row.id, // mismo id: re-corridas idempotentes, sin duplicados
          tag: row.tag,
          name: row.name,
          imageUrl: row.imageUrl,
          imageUrlB: row.imageUrlB,
          variantFilter: row.variantFilter ?? undefined,
          order: row.order,
          isActive: row.isActive,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          createdBy: row.createdBy,
          updatedBy: row.updatedBy,
          deletedAt: row.deletedAt,
        },
      });
      inserted++;
      console.log(`  ✓ INSERT ${row.id} · ${row.tag}/${row.name}`);
    } catch (err) {
      failures.push(`insert ${row.id} — ${err.message}`);
      console.warn(`  ✗ INSERT ${row.id}: ${err.message}`);
    }
  }
  for (const { row, prdRow, fields } of updates) {
    try {
      const data = { updatedBy: "system:sync-gallery-stg-to-prd" };
      for (const f of fields) data[f] = f === "variantFilter" ? (row[f] ?? null) : row[f];
      // where por id de PRD: en cruces tag+name la cuid difiere de la de STG y se conserva la de PRD.
      await db.designGalleryImage.update({ where: { id: prdRow.id }, data });
      updated++;
      console.log(`  ✓ UPDATE ${prdRow.id} · ${row.tag}/${row.name}`);
    } catch (err) {
      failures.push(`update ${prdRow.id} — ${err.message}`);
      console.warn(`  ✗ UPDATE ${prdRow.id}: ${err.message}`);
    }
  }

  const after = await db.designGalleryImage.count();
  console.log(
    `\nResumen: ${inserted}/${inserts.length} inserts · ${updated}/${updates.length} updates · ` +
      `${copiedObjects}/${missingObjects.length} objetos copiados · ${prdOnly.length} solo-PRD intactas · ` +
      `PRD ahora: ${after} filas · ${failures.length} fallos`,
  );
  if (failures.length) {
    console.warn("— FALLOS (re-correr es seguro: el script es idempotente):");
    for (const f of failures) console.warn(`  ✗ ${f}`);
  }
  console.log(failures.length ? "✗ terminó con fallos" : "✓ listo");
  process.exitCode = failures.length ? 1 : 0;
}

main()
  .catch((err) => {
    console.error("Error:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stg.$disconnect();
    await db.$disconnect();
  });

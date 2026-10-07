#!/usr/bin/env node
/*
 * ONE-SHOT (2026-10-07, Fase 3 · item 3.10) — BACKFILL de miniaturas con
 * watermark para TODOS los diseños prediseñados existentes.
 *
 * Contexto: desde 2026-10-07 todo upload nuevo de prediseñado genera ADEMÁS
 * una miniatura de exhibición (~800px borde largo, WebP q78, watermark LUCAMS
 * en tiling — uploadGalleryThumb en apps/web/lib/storage.ts) y el Estudio la
 * sirve en vez del original (anti-copia + peso; el original solo lo descarga
 * el SERVIDOR al aplicar el diseño). Las filas subidas ANTES no tienen
 * miniatura: listGalleryImages les expone thumbUrl=null y el Estudio cae al
 * original (fallback transitorio). Este script genera las miniaturas de esas
 * filas históricas leyendo imageUrl de la DB, descargando el original del
 * bucket público product-images y subiendo la miniatura al path derivado
 * determinista:
 *
 *   gallery-<tag>/<uuid>.webp   →   gallery-<tag>/thumbs/<uuid>.webp
 *
 * (misma convención que uploadGalleryThumb / galleryThumbPath — SIN columna
 * nueva: el thumbUrl se deriva del imageUrl; la existencia se verifica con un
 * list del folder de thumbs).
 *
 * Reglas:
 *   - Solo la CARA A (imageUrl): es la única que el Estudio exhibe. La cara B
 *     nunca se muestra en el navegador del cliente.
 *   - Idempotente: si la miniatura ya existe en <folder>/thumbs se SALTA
 *     (--force regenera). Correrlo dos veces es casi un no-op.
 *   - Procesa también filas ARCHIVADAS (deletedAt no null): si Lucy las
 *     restaura, su miniatura ya existe.
 *   - Filas cuyo imageUrl no pertenece a nuestro bucket se reportan y saltan.
 *
 * Guardarraíles (patrón N-06): DRY-RUN por defecto · --apply ejecuta ·
 * env-guard fail-closed (bloquea PRD/remotos desconocidos; escape hatch
 * LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1) · manifiesto JSON de lo escrito en
 * tmp/backups/gallery-thumbs-<ts>.json (auditoría/rollback manual: los thumbs
 * son objetos NUEVOS, nada se sobrescribe salvo con --force).
 *
 * Concurrencia limitada (--concurrency=N, default 4). Resumen final; exit 1 si
 * hubo fallos (re-correr es seguro).
 *
 * Env requerido (del ambiente destino):
 *   DATABASE_URL / DIRECT_URL            — Prisma (filas de la galería)
 *   NEXT_PUBLIC_SUPABASE_URL             — proyecto Supabase
 *   SUPABASE_SECRET_KEY                  — service/secret key (bypassea RLS)
 *
 * Uso (desde packages/db):
 *   pnpm exec dotenv -e ../../.env.local -- node scripts/one-shot/backfill-gallery-thumbs-20261007.mjs
 *   pnpm exec dotenv -e ../../.env.stg -- node scripts/one-shot/backfill-gallery-thumbs-20261007.mjs --apply
 *   LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 pnpm exec dotenv -e ../../.env.nube -- node scripts/one-shot/backfill-gallery-thumbs-20261007.mjs --apply
 *   … --tag=separadores-magneticos --force --concurrency=6
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(HERE, "..", "..", "..", "..", "tmp", "backups");

const APPLY = process.argv.includes("--apply");
if (APPLY) assertDestructiveAllowed("backfill-gallery-thumbs-20261007.mjs");

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

// ─── Args ───
function parseArgs(argv) {
  let tag = null;
  let force = false;
  let concurrency = 4;
  for (const arg of argv) {
    if (arg === "--apply") continue;
    if (arg === "--force") {
      force = true;
    } else if (arg.startsWith("--tag=")) {
      tag = arg.slice("--tag=".length).trim() || null;
    } else if (arg.startsWith("--concurrency=")) {
      concurrency = Math.max(1, Number.parseInt(arg.slice("--concurrency=".length), 10) || 4);
    } else {
      console.error(`✗ argumento no reconocido: ${arg}`);
      process.exit(1);
    }
  }
  return { tag, force, concurrency };
}
const { tag: onlyTag, force, concurrency } = parseArgs(process.argv.slice(2));

const SUPABASE_URL = stripQuotes(process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/, "");
const SERVICE_KEY = stripQuotes(process.env.SUPABASE_SECRET_KEY);
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✗ faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY en el env del destino");
  process.exit(1);
}

const BUCKET = "product-images";
const PUBLIC_URL_MARKER = `/storage/v1/object/public/${BUCKET}/`;
const THUMB_MAX_EDGE_PX = 800;
const THUMB_WEBP_QUALITY = 78;

const prisma = new PrismaClient();
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── Misma derivación/algoritmo que apps/web/lib/storage.ts (3.10) ───
// OJO: duplicado a propósito (los one-shots no importan TS de apps/web). Si
// cambia la convención allá, cambiar acá.
function pathFromPublicUrl(url) {
  const idx = url.indexOf(PUBLIC_URL_MARKER);
  if (idx === -1) return null;
  return url.slice(idx + PUBLIC_URL_MARKER.length);
}
function thumbPathOf(originalPath) {
  const idx = originalPath.lastIndexOf("/");
  if (idx === -1) return null;
  return `${originalPath.slice(0, idx)}/thumbs/${originalPath.slice(idx + 1)}`;
}
function buildWatermarkTileSvg(tileW, tileH) {
  const text = (x, y) =>
    `<text x="${x}" y="${y}" fill="#ffffff" fill-opacity="0.30" stroke="#000000" stroke-opacity="0.10" stroke-width="1.2">LUCAMS</text>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${tileH}" viewBox="0 0 380 230">` +
    `<g font-family="DejaVu Sans, Verdana, sans-serif" font-size="36" font-weight="700" letter-spacing="8">` +
    `<g transform="rotate(-24 190 115)">${text(20, 96)}${text(200, 212)}</g>` +
    `</g></svg>`
  );
}
async function generateThumb(buffer) {
  const resized = await sharp(buffer)
    .rotate()
    .resize({
      width: THUMB_MAX_EDGE_PX,
      height: THUMB_MAX_EDGE_PX,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toBuffer({ resolveWithObject: true });
  return sharp(resized.data)
    .composite([
      {
        input: Buffer.from(
          buildWatermarkTileSvg(
            Math.min(380, resized.info.width),
            Math.min(230, resized.info.height),
          ),
        ),
        tile: true,
        blend: "over",
      },
    ])
    .webp({ quality: THUMB_WEBP_QUALITY })
    .toBuffer();
}

// ─── Miniaturas existentes por folder (idempotencia) ───
async function listExistingThumbs(folder) {
  const out = new Set();
  const { data, error } = await supabase.storage.from(BUCKET).list(`${folder}/thumbs`, {
    limit: 1000,
  });
  if (error || !data) return out;
  for (const e of data) {
    if (e.id !== null && e.name !== ".emptyFolderPlaceholder")
      out.add(`${folder}/thumbs/${e.name}`);
  }
  return out;
}

// ─── Procesamiento de una fila ───
async function processRow(row, existingThumbs) {
  const originalPath = pathFromPublicUrl(row.imageUrl);
  if (!originalPath) return { status: "skipped-foreign", row };
  const thumbPath = thumbPathOf(originalPath);
  if (!thumbPath) return { status: "skipped-foreign", row };
  if (!force && existingThumbs.has(thumbPath)) return { status: "skipped-exists", row, thumbPath };

  const { data, error } = await supabase.storage.from(BUCKET).download(originalPath);
  if (error || !data)
    throw new Error(`download ${originalPath}: ${error?.message ?? "empty body"}`);
  const original = Buffer.from(await data.arrayBuffer());
  const thumb = await generateThumb(original);

  if (APPLY) {
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(thumbPath, thumb, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: true,
    });
    if (upErr) throw new Error(`upload ${thumbPath}: ${upErr.message}`);
  }
  return {
    status: APPLY ? "created" : "would-create",
    row,
    thumbPath,
    beforeBytes: original.length,
    afterBytes: thumb.length,
  };
}

// ─── Main ───
const fmtKB = (n) => `${(n / 1024).toFixed(1)} KB`;

console.log(`=== backfill-gallery-thumbs-20261007 (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
console.log(
  `bucket ${BUCKET} · ≤${THUMB_MAX_EDGE_PX}px q${THUMB_WEBP_QUALITY} + watermark LUCAMS · ` +
    `concurrencia ${concurrency}${onlyTag ? ` · tag=${onlyTag}` : ""}${force ? " · --force" : ""}`,
);

const rows = await prisma.designGalleryImage.findMany({
  where: onlyTag ? { tag: onlyTag } : {},
  orderBy: [{ tag: "asc" }, { order: "asc" }],
  select: { id: true, tag: true, name: true, imageUrl: true, deletedAt: true },
});
console.log(`\n${rows.length} diseño(s) prediseñado(s) en DB${onlyTag ? ` (tag ${onlyTag})` : ""}`);

const folders = [...new Set(rows.map((r) => `gallery-${r.tag}`))];
const existingByFolder = new Map();
for (const folder of folders) {
  existingByFolder.set(folder, await listExistingThumbs(folder));
}

const manifest = [];
const totals = { created: 0, exists: 0, foreign: 0, failed: 0, beforeBytes: 0, afterBytes: 0 };

let idx = 0;
async function worker() {
  while (idx < rows.length) {
    const row = rows[idx++];
    try {
      const r = await processRow(row, existingByFolder.get(`gallery-${row.tag}`));
      if (r.status === "skipped-foreign") {
        totals.foreign++;
        console.warn(
          `  · ${row.tag}/${row.name}: imageUrl fuera de ${BUCKET} — saltado (${row.imageUrl})`,
        );
        continue;
      }
      if (r.status === "skipped-exists") {
        totals.exists++;
        continue;
      }
      totals.created++;
      totals.beforeBytes += r.beforeBytes;
      totals.afterBytes += r.afterBytes;
      manifest.push({
        id: row.id,
        tag: row.tag,
        name: row.name,
        archived: row.deletedAt !== null,
        thumbPath: r.thumbPath,
        beforeBytes: r.beforeBytes,
        afterBytes: r.afterBytes,
      });
      console.log(
        `  ${APPLY ? "✓" : "·"} ${r.thumbPath} (${fmtKB(r.beforeBytes)} → ${fmtKB(r.afterBytes)})${row.deletedAt ? " [archivado]" : ""}`,
      );
    } catch (err) {
      totals.failed++;
      console.warn(`  ✗ ${row.tag}/${row.name} (${row.id}): ${err.message}`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker));

if (APPLY && manifest.length > 0) {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const file = join(
    BACKUP_DIR,
    `gallery-thumbs-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  writeFileSync(
    file,
    JSON.stringify({ script: "backfill-gallery-thumbs-20261007", created: manifest }, null, 2),
  );
  console.log(`\nManifiesto: ${file}`);
}

console.log(
  `\nResumen: ${totals.created} ${APPLY ? "creadas" : "a crear"} · ${totals.exists} ya existían · ` +
    `${totals.foreign} fuera del bucket · ${totals.failed} fallos · ` +
    `thumbs ${fmtKB(totals.afterBytes)} (originales ${fmtKB(totals.beforeBytes)})`,
);
console.log(APPLY ? "✓ listo" : "DRY-RUN — sin cambios (correr con --apply para ejecutar)");
await prisma.$disconnect();
if (totals.failed > 0) process.exit(1);

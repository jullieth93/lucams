#!/usr/bin/env node
/*
 * ONE-SHOT / batch (2026-09-22) — Normalización a WebP de imágenes YA cargadas
 * en Supabase Storage (backfill de optimizeCatalogImage, lib/storage.ts).
 *
 * Contexto: desde 2026-09-18 toda imagen NUEVA de catálogo/mediateca pasa por
 * optimizeCatalogImage (WebP q82, borde largo ≤2000 px) antes de subir, pero
 * los objetos cargados ANTES quedaron como PNG/JPEG pesados. Este script los
 * recorre y los re-comprime a WebP SOLO si el resultado es más liviano.
 *
 * Buckets:
 *   - design-previews   (default; público, max 3 MB — previews PNG de
 *     finalizeDesign y templates seed). Re-comprime con borde largo ≤1600 px
 *     (resolución de preview: el mosaico se muestra a ≤~800 px en pantalla,
 *     ×2 DPR) y actualiza Design.previewUrl / Template.previewUrl si la
 *     extensión cambia (…/preview.png → …/preview.webp).
 *   - product-images    (--bucket=product-images; catálogo: ≤2000 px q82,
 *     igual que optimizeCatalogImage). Actualiza Product.images[] y
 *     ProductVariant.images[] si cambia la extensión.
 *   - cms-media         (--bucket=cms-media; ≤2000 px q82). Actualiza la fila
 *     CmsMedia (path/mime/bytes/width/height — la URL pública se DERIVA de
 *     bucket+path, así que basta con el path).
 *   NO toca customer-uploads (originales de impresión del cliente) ni
 *   production-assets (PNGs 300 DPI para imprenta): esos bytes se consumen
 *   tal cual por el pipeline de producción.
 *
 * Reglas:
 *   - Solo reemplaza si el WebP resultante pesa menos que el original por un
 *     margen mínimo (--min-savings, default 5%). Si ya es .webp y no ahorra,
 *     se salta (idempotente: correrlo dos veces es un no-op casi total).
 *   - Si la extensión cambia: sube el .webp nuevo (upsert), actualiza las
 *     referencias en DB y recién DESPUÉS borra el objeto viejo — nunca queda
 *     una URL colgada apuntando a un objeto inexistente.
 *   - Si la extensión NO cambia (ya era .webp): upsert in-place sobre el mismo
 *     path. OJO: los objetos viejos tienen cacheControl largo; el CDN/navegador
 *     puede servir el anterior hasta que venza el cache (las imágenes nuevas
 *     llevan UUID en el path, las históricas no siempre — riesgo aceptado para
 *     un backfill one-shot).
 *
 * Guardarraíles: DRY-RUN por defecto · --apply ejecuta · env-guard fail-closed
 * (bloquea PRD/remotos desconocidos; escape hatch LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1).
 *
 * Concurrencia limitada (--concurrency=N, default 4): descarga + sharp +
 * upload por objeto, con resumen final (procesados, reemplazados, saltados,
 * bytes antes/después).
 *
 * Env requerido (del ambiente destino):
 *   DATABASE_URL / DIRECT_URL            — Prisma (referencias en DB)
 *   NEXT_PUBLIC_SUPABASE_URL             — proyecto Supabase
 *   SUPABASE_SECRET_KEY                  — service/secret key (bypassea RLS)
 *
 * Uso (desde packages/db):
 *   pnpm exec dotenv -e ../../.env.local -- node scripts/one-shot/normalize-storage-images-webp.mjs
 *   pnpm exec dotenv -e ../../.env.local -- node scripts/one-shot/normalize-storage-images-webp.mjs --bucket=product-images --bucket=cms-media
 *   LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 pnpm exec dotenv -e ../../.env.nube -- node scripts/one-shot/normalize-storage-images-webp.mjs --apply
 */

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

const APPLY = process.argv.includes("--apply");
if (APPLY) assertDestructiveAllowed("normalize-storage-images-webp.mjs");

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

// ─── Args ───
const KNOWN_BUCKETS = {
  "design-previews": { maxEdge: 1600, quality: 82 },
  "product-images": { maxEdge: 2000, quality: 82 },
  "cms-media": { maxEdge: 2000, quality: 82 },
};

function parseArgs(argv) {
  const buckets = [];
  let concurrency = 4;
  let minSavings = 0.05;
  for (const arg of argv) {
    if (arg === "--apply") continue;
    if (arg.startsWith("--bucket=")) {
      const b = arg.slice("--bucket=".length).trim();
      if (!KNOWN_BUCKETS[b]) {
        console.error(
          `✗ bucket desconocido "${b}". Conocidos: ${Object.keys(KNOWN_BUCKETS).join(", ")}`,
        );
        process.exit(1);
      }
      if (!buckets.includes(b)) buckets.push(b);
    } else if (arg.startsWith("--concurrency=")) {
      concurrency = Math.max(1, Number.parseInt(arg.slice("--concurrency=".length), 10) || 4);
    } else if (arg.startsWith("--min-savings=")) {
      const v = Number.parseFloat(arg.slice("--min-savings=".length));
      if (!Number.isFinite(v) || v < 0 || v >= 1) {
        console.error("✗ --min-savings debe ser una fracción 0 ≤ v < 1 (ej. 0.05)");
        process.exit(1);
      }
      minSavings = v;
    } else {
      console.error(`✗ argumento no reconocido: ${arg}`);
      process.exit(1);
    }
  }
  // design-previews es el objetivo obligatorio del backfill.
  if (buckets.length === 0) buckets.push("design-previews");
  return { buckets, concurrency, minSavings };
}

const { buckets, concurrency, minSavings } = parseArgs(process.argv.slice(2));

const SUPABASE_URL = stripQuotes(process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/, "");
const SERVICE_KEY = stripQuotes(process.env.SUPABASE_SECRET_KEY);
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✗ faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY en el env del destino");
  process.exit(1);
}

const prisma = new PrismaClient();
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|avif)$/i;
const publicUrlOf = (bucket, path) => `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

// ─── Listado recursivo (mismo patrón que apps/web/scripts/backup-storage-to-r2.mjs) ───
async function listAllObjects(bucket) {
  const PAGE = 1000;
  const objects = [];
  async function walk(prefix) {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: PAGE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`listing ${bucket}/${prefix || ""}: ${error.message}`);
      const entries = data || [];
      for (const entry of entries) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id === null) {
          await walk(path); // carpeta
        } else if (entry.name === ".emptyFolderPlaceholder") {
          // marker de Supabase, no es un objeto real
        } else if (IMAGE_EXT_RE.test(entry.name)) {
          objects.push({ path, size: Number(entry.metadata?.size) || 0 });
        }
      }
      if (entries.length < PAGE) break;
      offset += PAGE;
    }
  }
  await walk("");
  return objects;
}

// ─── Actualización de referencias en DB cuando cambia el path (ext → .webp) ───
// Devuelve cuántas filas se tocaron (o se tocarían en dry-run).
async function updateDbRefs(bucket, oldPath, newPath, meta, apply) {
  const oldUrl = publicUrlOf(bucket, oldPath);
  const newUrl = publicUrlOf(bucket, newPath);
  let touched = 0;

  if (bucket === "design-previews") {
    if (oldPath !== newPath) {
      const designs = await prisma.design.findMany({
        where: { previewUrl: { contains: `/design-previews/${oldPath}` } },
        select: { id: true, previewUrl: true },
      });
      const templates = await prisma.personalizationTemplate.findMany({
        where: { previewUrl: { contains: `/design-previews/${oldPath}` } },
        select: { id: true, previewUrl: true },
      });
      touched += designs.length + templates.length;
      if (apply) {
        for (const d of designs) {
          await prisma.design.update({
            where: { id: d.id },
            data: { previewUrl: d.previewUrl.replace(oldUrl, newUrl) },
          });
        }
        for (const t of templates) {
          await prisma.personalizationTemplate.update({
            where: { id: t.id },
            data: { previewUrl: t.previewUrl.replace(oldUrl, newUrl) },
          });
        }
      }
    }
  } else if (bucket === "product-images") {
    if (oldPath !== newPath) {
      const products = await prisma.product.findMany({
        where: { images: { has: oldUrl } },
        select: { id: true, images: true },
      });
      const variants = await prisma.productVariant.findMany({
        where: { images: { has: oldUrl } },
        select: { id: true, images: true },
      });
      touched += products.length + variants.length;
      if (apply) {
        for (const p of products) {
          await prisma.product.update({
            where: { id: p.id },
            data: { images: p.images.map((u) => (u === oldUrl ? newUrl : u)) },
          });
        }
        for (const v of variants) {
          await prisma.productVariant.update({
            where: { id: v.id },
            data: { images: v.images.map((u) => (u === oldUrl ? newUrl : u)) },
          });
        }
      }
    }
  } else if (bucket === "cms-media") {
    // La URL pública se DERIVA de bucket+path: hay que actualizar la fila
    // siempre que se reemplace el objeto (path, mime, bytes y dimensiones
    // post-resize), cambie o no la extensión.
    const media = await prisma.cmsMedia.findFirst({ where: { bucket, path: oldPath } });
    if (media) {
      touched++;
      if (apply) {
        await prisma.cmsMedia.update({
          where: { id: media.id },
          data: {
            path: newPath,
            mime: "image/webp",
            bytes: meta.bytes,
            width: meta.width,
            height: meta.height,
          },
        });
      }
    }
  }
  return touched;
}

// ─── Procesamiento de un objeto ───
async function processObject(bucket, cfg, obj) {
  const { data, error } = await supabase.storage.from(bucket).download(obj.path);
  if (error || !data) throw new Error(`download: ${error?.message ?? "empty body"}`);
  const original = Buffer.from(await data.arrayBuffer());
  const beforeBytes = original.length;

  const out = await sharp(original)
    .rotate() // auto-orient por EXIF + strip
    .resize({
      width: cfg.maxEdge,
      height: cfg.maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: cfg.quality })
    .toBuffer({ resolveWithObject: true });
  const afterBytes = out.data.length;

  // Solo reemplazar si ahorra lo suficiente.
  if (afterBytes >= beforeBytes * (1 - minSavings)) {
    return { status: "skipped", beforeBytes, afterBytes, width: out.info.width, height: out.info.height };
  }

  const isWebp = /\.webp$/i.test(obj.path);
  const newPath = isWebp ? obj.path : obj.path.replace(IMAGE_EXT_RE, ".webp");
  const meta = { bytes: afterBytes, width: out.info.width, height: out.info.height };

  if (APPLY) {
    const { error: upErr } = await supabase.storage.from(bucket).upload(newPath, out.data, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: true, // idempotente: re-correr tras un fallo no deja duplicados
    });
    if (upErr) throw new Error(`upload: ${upErr.message}`);
    const touched = await updateDbRefs(bucket, obj.path, newPath, meta, true);
    if (newPath !== obj.path) {
      // Borrar el original DESPUÉS de subir el nuevo y apuntar la DB a él.
      const { error: rmErr } = await supabase.storage.from(bucket).remove([obj.path]);
      if (rmErr) {
        console.warn(`  ⚠ ${bucket}/${newPath} subido y DB actualizada, pero no se pudo borrar ${obj.path}: ${rmErr.message}`);
      }
    }
    return { status: "replaced", beforeBytes, afterBytes, newPath, dbRefs: touched, ...meta };
  }

  const touched = await updateDbRefs(bucket, obj.path, newPath, meta, false);
  return { status: "would-replace", beforeBytes, afterBytes, newPath, dbRefs: touched, ...meta };
}

// ─── Main ───
const fmtKB = (n) => `${(n / 1024).toFixed(1)} KB`;

console.log(`=== normalize-storage-images-webp (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
console.log(`buckets: ${buckets.join(", ")} · concurrencia ${concurrency} · min-savings ${(minSavings * 100).toFixed(0)}%`);

const totals = { seen: 0, replaced: 0, skipped: 0, failed: 0, beforeBytes: 0, afterBytes: 0 };

for (const bucket of buckets) {
  const cfg = KNOWN_BUCKETS[bucket];
  const objects = await listAllObjects(bucket);
  console.log(`\n— ${bucket}: ${objects.length} imagen(es) (≤${cfg.maxEdge}px q${cfg.quality})`);

  let idx = 0;
  async function worker() {
    while (idx < objects.length) {
      const obj = objects[idx++];
      totals.seen++;
      try {
        const r = await processObject(bucket, cfg, obj);
        if (r.status === "skipped") {
          totals.skipped++;
          continue;
        }
        totals.replaced++;
        totals.beforeBytes += r.beforeBytes;
        totals.afterBytes += r.afterBytes;
        console.log(
          `  ${APPLY ? "✓" : "·"} ${obj.path} → ${r.newPath} ` +
            `${fmtKB(r.beforeBytes)} → ${fmtKB(r.afterBytes)}` +
            (r.dbRefs ? ` · ${r.dbRefs} ref(s) DB` : ""),
        );
      } catch (err) {
        totals.failed++;
        console.warn(`  ✗ ${bucket}/${obj.path}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, objects.length) }, worker));
}

console.log(
  `\nResumen: ${totals.seen} vistas · ${totals.replaced} ${APPLY ? "reemplazadas" : "a reemplazar"} · ` +
    `${totals.skipped} saltadas (sin ahorro) · ${totals.failed} fallos · ` +
    `ahorro ${fmtKB(totals.beforeBytes - totals.afterBytes)} (${fmtKB(totals.beforeBytes)} → ${fmtKB(totals.afterBytes)})`,
);
console.log(APPLY ? "✓ listo" : "DRY-RUN — sin cambios (correr con --apply para ejecutar)");
await prisma.$disconnect();
if (totals.failed > 0) process.exit(1);

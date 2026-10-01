#!/usr/bin/env node
/*
 * ONE-SHOT / herramienta (T5, 2026-10-01) — Migrar imágenes hot-linked de Unsplash
 * al bucket público `product-images` del ambiente destino.
 *
 * Contexto: el catálogo sembrado por seed-catalog-canonical.mjs hot-linkea ~32 fotos de
 * images.unsplash.com. Riesgos: una foto retirada deja la PDP con imagen rota (hubo un 404
 * en pack-frases-motivacionales, corregido en el seed), dependencia de un CDN externo en el
 * LCP móvil, y CSP/remotePatterns abiertos a Unsplash por siempre.
 *
 * Qué hace (por cada URL images.unsplash.com referenciada en el catálogo):
 *   1. La descarga (timeout 20s; con ?w=2000 para no bajar el original gigante).
 *   2. La pasa por el MISMO pipeline que optimizeCatalogImage (apps/web/lib/storage.ts:
 *      sharp rotate + resize ≤2000 px inside + WebP q82) — reimplementado acá porque el
 *      helper de la app no es importable desde packages/db (alias "@/", server-only).
 *   3. La sube a product-images como `migrated-unsplash/<sha256(url)[:16]>.webp`
 *      (nombre determinista → idempotente: re-correr tras un fallo no deja duplicados),
 *      cacheControl 1 año (path content-addressed por URL).
 *   4. Reescribe la referencia en la DB (Product.images, ProductVariant.images,
 *      Category.image, LetterTile.imageUrl, DesignGalleryImage.imageUrl/imageUrlB).
 *
 * Guardarraíles: DRY-RUN por defecto · --write (o --apply) ejecuta · env-guard fail-closed
 * (bloquea PRD/remotos desconocidos; escape hatch LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 para la
 * corrida deliberada contra STG/PRD). Solo aborta el rewrite de una URL si su descarga falla.
 *
 * PASO POSTERIOR (manual, tras correr --write y verificar 0 URLs unsplash con
 * audit-product-image-urls.mjs Y limpiar el seed de futuras siembras): quitar
 * images.unsplash.com de images.remotePatterns (apps/web/next.config.ts) y de img-src
 * (apps/web/lib/security-headers.ts). NO se hizo en este cambio porque el seed canónico
 * todavía referencia Unsplash: quitar el remotePattern antes rompería las PDP recién
 * sembradas.
 *
 * Env requerido (del ambiente destino):
 *   DATABASE_URL / DIRECT_URL            — Prisma (referencias en DB)
 *   NEXT_PUBLIC_SUPABASE_URL             — proyecto Supabase
 *   SUPABASE_SECRET_KEY                  — service/secret key (bypassea RLS)
 *
 * Uso (desde packages/db):
 *   pnpm exec dotenv -e ../../.env.stg -- node scripts/one-shot/migrate-unsplash-to-bucket.mjs
 *   LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 pnpm exec dotenv -e ../../.env.stg -- node scripts/one-shot/migrate-unsplash-to-bucket.mjs --write
 */

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

const WRITE = process.argv.includes("--write") || process.argv.includes("--apply");
if (WRITE) assertDestructiveAllowed("migrate-unsplash-to-bucket.mjs");
for (const arg of process.argv.slice(2)) {
  if (arg !== "--write" && arg !== "--apply") {
    console.error(`✗ argumento no reconocido: ${arg} (válidos: --write)`);
    process.exit(1);
  }
}

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const SUPABASE_URL = stripQuotes(process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/, "");
const SERVICE_KEY = stripQuotes(process.env.SUPABASE_SECRET_KEY);
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✗ faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY en el env del destino");
  process.exit(1);
}

const BUCKET = "product-images";
const UNSPLASH_HOST = "images.unsplash.com";
// Mismos parámetros que optimizeCatalogImage (apps/web/lib/storage.ts).
const MAX_EDGE = 2000;
const WEBP_QUALITY = 82;

const prisma = new PrismaClient();
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const newPathFor = (url) =>
  `migrated-unsplash/${createHash("sha256").update(url).digest("hex").slice(0, 16)}.webp`;
const publicUrlOf = (path) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

// ── 1. Recolectar referencias Unsplash en el catálogo ──
const [products, variants, categories, tiles, gallery] = await Promise.all([
  prisma.product.findMany({ select: { id: true, slug: true, images: true } }),
  prisma.productVariant.findMany({ select: { id: true, sku: true, images: true } }),
  prisma.category.findMany({ select: { id: true, slug: true, image: true } }),
  prisma.letterTile.findMany({ select: { id: true, imageUrl: true } }),
  prisma.designGalleryImage.findMany({ select: { id: true, imageUrl: true, imageUrlB: true } }),
]);
const isUnsplash = (url) => {
  try {
    return new URL(url).hostname === UNSPLASH_HOST;
  } catch {
    return false;
  }
};

const urls = new Set();
for (const p of products) p.images.filter(isUnsplash).forEach((u) => urls.add(u));
for (const v of variants) v.images.filter(isUnsplash).forEach((u) => urls.add(u));
for (const c of categories) if (c.image && isUnsplash(c.image)) urls.add(c.image);
for (const t of tiles) if (isUnsplash(t.imageUrl)) urls.add(t.imageUrl);
for (const g of gallery) {
  if (isUnsplash(g.imageUrl)) urls.add(g.imageUrl);
  if (g.imageUrlB && isUnsplash(g.imageUrlB)) urls.add(g.imageUrlB);
}

console.log(`=== migrate-unsplash-to-bucket (${WRITE ? "WRITE" : "DRY-RUN"}) ===`);
console.log(`URLs de ${UNSPLASH_HOST} referenciadas: ${urls.size}`);
if (urls.size === 0) {
  console.log("✓ nada que migrar");
  await prisma.$disconnect();
  process.exit(0);
}

// ── 2. Descargar + optimizar + subir cada URL ──
const migrated = new Map(); // url original → publicUrl nueva
const failures = [];
for (const url of urls) {
  const path = newPathFor(url);
  try {
    // Pedir el borde largo destino al CDN: menos bytes por la red (el w=800 del seed
    // queda reemplazado; si la URL no trae params, Unsplash igual honra w/q).
    const src = new URL(url);
    src.searchParams.set("w", String(MAX_EDGE));
    src.searchParams.set("q", "90");
    const res = await fetch(src, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`descarga HTTP ${res.status}`);
    const original = Buffer.from(await res.arrayBuffer());

    const out = await sharp(original)
      .rotate() // auto-orient por EXIF + strip
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    if (WRITE) {
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, out, {
        contentType: "image/webp",
        cacheControl: "31536000", // path determinista por URL → inmutable a efectos prácticos
        upsert: true, // idempotente: re-correr tras un fallo no deja duplicados
      });
      if (upErr) throw new Error(`upload: ${upErr.message}`);
    }
    migrated.set(url, publicUrlOf(path));
    console.log(
      `  ${WRITE ? "✓" : "·"} ${url.slice(0, 80)} → ${path} ` +
        `(${(original.length / 1024).toFixed(0)} KB → ${(out.length / 1024).toFixed(0)} KB)`,
    );
  } catch (err) {
    failures.push(`${url} — ${err.message}`);
    console.warn(`  ✗ ${url}: ${err.message}`);
  }
}

// ── 3. Reescribir referencias en la DB (solo de las URLs migradas OK) ──
const replaceIn = (value) => {
  if (value == null) return value;
  const next = migrated.get(value);
  return next ?? value;
};
let touched = 0;
for (const p of products) {
  const next = p.images.map(replaceIn);
  if (JSON.stringify(next) !== JSON.stringify(p.images)) {
    touched++;
    if (WRITE) await prisma.product.update({ where: { id: p.id }, data: { images: next } });
    console.log(`  ${WRITE ? "✓" : "·"} Product ${p.slug}: ${p.images.filter(isUnsplash).length} URL(s)`);
  }
}
for (const v of variants) {
  const next = v.images.map(replaceIn);
  if (JSON.stringify(next) !== JSON.stringify(v.images)) {
    touched++;
    if (WRITE) await prisma.productVariant.update({ where: { id: v.id }, data: { images: next } });
    console.log(`  ${WRITE ? "✓" : "·"} ProductVariant ${v.sku}: ${v.images.filter(isUnsplash).length} URL(s)`);
  }
}
for (const c of categories) {
  if (c.image && migrated.has(c.image)) {
    touched++;
    if (WRITE) {
      await prisma.category.update({ where: { id: c.id }, data: { image: migrated.get(c.image) } });
    }
    console.log(`  ${WRITE ? "✓" : "·"} Category ${c.slug}`);
  }
}
for (const t of tiles) {
  if (migrated.has(t.imageUrl)) {
    touched++;
    if (WRITE) {
      await prisma.letterTile.update({ where: { id: t.id }, data: { imageUrl: migrated.get(t.imageUrl) } });
    }
    console.log(`  ${WRITE ? "✓" : "·"} LetterTile ${t.id}`);
  }
}
for (const g of gallery) {
  const nextA = replaceIn(g.imageUrl);
  const nextB = replaceIn(g.imageUrlB);
  if (nextA !== g.imageUrl || nextB !== g.imageUrlB) {
    touched++;
    if (WRITE) {
      await prisma.designGalleryImage.update({
        where: { id: g.id },
        data: { imageUrl: nextA, ...(nextB !== undefined ? { imageUrlB: nextB } : {}) },
      });
    }
    console.log(`  ${WRITE ? "✓" : "·"} DesignGalleryImage ${g.id}`);
  }
}

console.log(
  `\nResumen: ${migrated.size}/${urls.size} migradas · ${failures.length} fallos · ${touched} fila(s) DB ${WRITE ? "actualizadas" : "a actualizar"}`,
);
if (failures.length) {
  for (const f of failures) console.warn(`  ✗ pendiente: ${f}`);
  console.warn("Las URLs con fallo quedaron SIN tocar en la DB — re-correr para reintentarlas.");
}
console.log(WRITE ? "✓ listo" : "DRY-RUN — sin cambios (correr con --write para ejecutar)");
await prisma.$disconnect();
if (failures.length) process.exit(1);

/*
 * ONE-SHOT (2026-09-20) — Imágenes de catálogo autosuficientes por ambiente.
 *
 * Contexto: el 100% de las URLs de Product.images/ProductVariant.images en
 * PRD apuntaban al bucket `product-images` del proyecto STG (mjbdiq…). Eso
 * funciona (bucket público) pero deja a PRD dependiendo de STG: si STG se
 * pausa/resetea, las imágenes de la tienda en vivo se rompen. Decisión de
 * Lucy (2026-09-20): STG es la referencia de CONTENIDO; cada ambiente sirve
 * sus propias imágenes.
 *
 * Qué hace (por ambiente destino, vía su env):
 *   1. Recolecta las URLs de imágenes de Product + ProductVariant.
 *   2. Para cada URL cuyo host sea el proyecto STG: deriva la key, descarga
 *      el objeto de la URL pública de STG y lo sube al bucket
 *      `product-images` DEL DESTINO (misma key, upsert — si ya existe con el
 *      mismo tamaño lo salta).
 *   3. Reescribe en la DB el host STG → host destino en esas columnas text[].
 *
 * URLs con otro host (propias del destino, unsplash de demo, etc.) → intactas.
 *
 * Guardarraíles: DRY-RUN por defecto · --apply ejecuta · env-guard fail-closed
 * · idempotente. Requiere en el env del destino: DATABASE_URL/DIRECT_URL,
 * NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY.
 *
 * Uso (desde packages/db):
 *   pnpm exec dotenv -e ../../.env.local.nube-backup -- node scripts/one-shot/sync-product-images-stg-20260920.mjs
 *   LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 pnpm exec dotenv -e ../../.env.local.nube-backup -- node scripts/one-shot/sync-product-images-stg-20260920.mjs --apply
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

const APPLY = process.argv.includes("--apply");
if (APPLY) assertDestructiveAllowed("sync-product-images-stg-20260920.mjs");

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const STG_HOST = "https://mjbdiqdkykhsixvqlrrp.supabase.co";
const BUCKET = "product-images";
const TARGET_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!TARGET_URL || !SERVICE_KEY) {
  console.error("✗ faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY en el env del destino");
  process.exit(1);
}

const prisma = new PrismaClient();
// Segundo cliente: STG (fuente de verdad del CONTENIDO — incluidas las URLs
// de imágenes, que en PRD apuntaban a objetos ya reemplazados/inexistentes).
const stgEnvText = readFileSync(new URL("../../../../.env.stg", import.meta.url), "utf8");
const stgDbUrl = stgEnvText.match(/^DIRECT_URL=\s*"([^"]*)"/m)?.[1];
if (!stgDbUrl) {
  console.error("✗ no se pudo leer DIRECT_URL de .env.stg (fuente de las imágenes)");
  process.exit(1);
}
const stg = new PrismaClient({ datasources: { db: { url: stgDbUrl } } });
const PUBLIC_PREFIX = `/storage/v1/object/public/${BUCKET}/`;

// ── 0. Espejar arrays de imágenes STG → destino (aún con host STG) ──
// Sin esto, el destino conserva referencias a objetos ya reemplazados en STG
// (PRD tenía 6 URLs rotas en separadores-magneticos al momento del one-shot).
const [stgProducts, stgVariants] = await Promise.all([
  stg.product.findMany({ select: { slug: true, images: true } }),
  stg.productVariant.findMany({ select: { sku: true, images: true } }),
]);
const stgImgBySlug = new Map(stgProducts.map((p) => [p.slug, p.images]));
const stgImgBySku = new Map(stgVariants.map((v) => [v.sku, v.images]));

const [products, variants] = await Promise.all([
  prisma.product.findMany({ select: { id: true, slug: true, images: true } }),
  prisma.productVariant.findMany({ select: { id: true, sku: true, images: true } }),
]);

let mirrored = 0;
for (const row of products) {
  const want = stgImgBySlug.get(row.slug);
  if (want && JSON.stringify(want) !== JSON.stringify(row.images)) {
    mirrored++;
    if (APPLY) {
      await prisma.product.update({ where: { id: row.id }, data: { images: want } });
      row.images = want;
    }
  }
}
for (const row of variants) {
  const want = stgImgBySku.get(row.sku);
  if (want && JSON.stringify(want) !== JSON.stringify(row.images)) {
    mirrored++;
    if (APPLY) {
      await prisma.productVariant.update({ where: { id: row.id }, data: { images: want } });
      row.images = want;
    }
  }
}
console.log(`Arrays de imágenes espejados desde STG: ${mirrored} fila(s)`);

// 1. Recolectar URLs con host STG.
const stgUrls = new Set();
for (const row of [...products, ...variants]) {
  for (const url of row.images ?? []) {
    if (url.startsWith(STG_HOST)) stgUrls.add(url);
  }
}
console.log(`=== sync-product-images (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
console.log(`URLs con host STG referenciadas: ${stgUrls.size}`);

// 2. Copiar objetos al bucket destino.
let copied = 0;
let skipped = 0;
const failures = [];
if (APPLY) {
  for (const url of stgUrls) {
    const key = url.split(PUBLIC_PREFIX)[1];
    if (!key) {
      failures.push(`${url} — key no derivable`);
      continue;
    }
    try {
      const head = await fetch(`${TARGET_URL}${PUBLIC_PREFIX}${key}`, { method: "HEAD" });
      const src = await fetch(url);
      if (!src.ok) throw new Error(`origen HTTP ${src.status}`);
      const bytes = Buffer.from(await src.arrayBuffer());
      if (head.ok && Number(head.headers.get("content-length")) === bytes.length) {
        skipped++;
        continue;
      }
      const res = await fetch(`${TARGET_URL}/storage/v1/object/${BUCKET}/${key}`, {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": src.headers.get("content-type") ?? "application/octet-stream",
          "x-upsert": "true",
        },
        body: bytes,
      });
      if (!res.ok) throw new Error(`upload HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
      copied++;
    } catch (err) {
      failures.push(`${key} — ${err.message}`);
    }
  }
  console.log(`Objetos copiados: ${copied} · ya presentes: ${skipped} · fallos: ${failures.length}`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  if (failures.length) {
    console.error("✗ abortando rewrite de URLs: hay objetos sin copiar (la DB quedaría apuntando a objetos inexistentes)");
    process.exit(1);
  }
}

// 3. Reescribir host en la DB.
let rows = 0;
for (const row of [...products, ...variants]) {
  const next = (row.images ?? []).map((u) => (u.startsWith(STG_HOST) ? u.replace(STG_HOST, TARGET_URL) : u));
  if (JSON.stringify(next) !== JSON.stringify(row.images)) {
    rows++;
    if (APPLY) {
      if (row.slug) await prisma.product.update({ where: { id: row.id }, data: { images: next } });
      else await prisma.productVariant.update({ where: { id: row.id }, data: { images: next } });
    }
  }
}
console.log(`Filas con URLs reescritas (${STG_HOST.split("//")[1]} → ${TARGET_URL.split("//")[1]}): ${rows}`);
console.log(APPLY ? "✓ listo" : "DRY-RUN — sin cambios");
await prisma.$disconnect();
await stg.$disconnect();

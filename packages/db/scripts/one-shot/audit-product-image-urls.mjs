#!/usr/bin/env node
/*
 * AUDITORÍA (solo lectura) — Salud de las URLs de imágenes del catálogo (T5, 2026-10-01).
 *
 * Contexto: la galería del PDP y las cards son técnicamente sanas; el problema son los
 * DATOS — URLs muertas (hubo un Unsplash 404 en el seed canónico), hosts locales
 * (127.0.0.1/localhost/192.168.* dejados por seeds corridos en dev) y URLs apuntando al
 * proyecto Supabase equivocado (ej. refs de STG en la base de PRD).
 *
 * Qué hace:
 *   1. Recolecta TODAS las URLs de imagen del catálogo:
 *      Product.images[], ProductVariant.images[], Category.image,
 *      LetterTile.imageUrl, DesignGalleryImage.imageUrl / imageUrlB.
 *   2. HEAD a cada URL única (timeout 10s, concurrencia acotada con --concurrency=N,
 *      default 6). Unsplash y algunos CDN responden 405/403 a HEAD → reintenta con GET
 *      (rango 0-0) antes de declararla rota.
 *   3. Clasifica hallazgos: rotas (4xx/5xx/red), host local, y URLs cuyo proyecto
 *      Supabase NO es el del env actual (detecta el ref en la URL vs el ref del env:
 *      NEXT_PUBLIC_SUPABASE_URL o, en su defecto, el ref del pooler/host en DATABASE_URL).
 *
 * NO modifica datos (solo lectura + reporte). Exit code 1 si hay URLs rotas (gate CI-friendly);
 * los hallazgos de host local / proyecto cruzado se reportan pero NO rompen el exit code
 * (pueden ser legítimos en una base local de desarrollo).
 *
 * Uso (desde packages/db):
 *   pnpm exec dotenv -e ../../.env.local -- node scripts/one-shot/audit-product-image-urls.mjs
 *   pnpm exec dotenv -e ../../.env.stg   -- node scripts/one-shot/audit-product-image-urls.mjs --concurrency=8
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

function parseArgs(argv) {
  let concurrency = 6;
  for (const arg of argv) {
    if (arg.startsWith("--concurrency=")) {
      concurrency = Math.max(1, Number.parseInt(arg.slice("--concurrency=".length), 10) || 6);
    } else {
      console.error(`✗ argumento no reconocido: ${arg}`);
      process.exit(1);
    }
  }
  return { concurrency };
}
const { concurrency } = parseArgs(process.argv.slice(2));

const prisma = new PrismaClient();

// ── 1. Recolectar referencias ──
const refs = []; // { tabla, id, url }
const [products, variants, categories, tiles, gallery] = await Promise.all([
  prisma.product.findMany({ select: { id: true, slug: true, images: true } }),
  prisma.productVariant.findMany({ select: { id: true, sku: true, images: true } }),
  prisma.category.findMany({ select: { id: true, slug: true, image: true } }),
  prisma.letterTile.findMany({ select: { id: true, imageUrl: true } }),
  prisma.designGalleryImage.findMany({ select: { id: true, imageUrl: true, imageUrlB: true } }),
]);
for (const p of products) for (const url of p.images) refs.push({ tabla: "Product", id: p.slug, url });
for (const v of variants) for (const url of v.images) refs.push({ tabla: "ProductVariant", id: v.sku, url });
for (const c of categories) if (c.image) refs.push({ tabla: "Category", id: c.slug, url: c.image });
for (const t of tiles) refs.push({ tabla: "LetterTile", id: t.id, url: t.imageUrl });
for (const g of gallery) {
  refs.push({ tabla: "DesignGalleryImage", id: g.id, url: g.imageUrl });
  if (g.imageUrlB) refs.push({ tabla: "DesignGalleryImage", id: `${g.id} (B)`, url: g.imageUrlB });
}

const uniqueUrls = [...new Set(refs.map((r) => r.url))];
console.log(`=== audit-product-image-urls ===`);
console.log(`Referencias: ${refs.length} · URLs únicas: ${uniqueUrls.length}`);

// ── 2. Clasificación estática (host local / proyecto cruzado) ──
const LOCAL_HOST_RE = /^(127\.0\.0\.1|localhost|::1|192\.168\.\d{1,3}\.\d{1,3})$/;
// Ref del proyecto Supabase del ENV actual (de la URL pública o de la conexión DB).
function envSupabaseRef() {
  const pub = stripQuotes(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const m1 = pub?.match(/https?:\/\/([a-z0-9]{20})\.supabase\.co/);
  if (m1) return m1[1];
  for (const u of [process.env.DIRECT_URL, process.env.DATABASE_URL]) {
    const m2 = u?.match(/(?:db\.|postgres\.)([a-z0-9]{20})(?:\.supabase\.|@)/);
    if (m2) return m2[1];
  }
  return null;
}
const ENV_REF = envSupabaseRef();
console.log(`Proyecto Supabase del env: ${ENV_REF ?? "(no detectado — se omite el chequeo cruzado)"}`);

const localHost = []; // { tabla, id, url }
const wrongProject = []; // { tabla, id, url, ref }
for (const ref of refs) {
  let host = "";
  try {
    host = new URL(ref.url).hostname;
  } catch {
    // URL no parseable: la atrapará el chequeo HTTP como error.
    continue;
  }
  if (LOCAL_HOST_RE.test(host)) localHost.push(ref);
  const m = host.match(/^([a-z0-9]{20})\.supabase\.co$/);
  if (m && ENV_REF && m[1] !== ENV_REF) wrongProject.push({ ...ref, ref: m[1] });
}

// ── 3. HEAD/GET con concurrencia acotada ──
async function checkUrl(url) {
  for (const method of ["HEAD", "GET"]) {
    try {
      const res = await fetch(url, {
        method,
        signal: AbortSignal.timeout(10_000),
        headers: method === "GET" ? { Range: "bytes=0-0" } : {},
        redirect: "follow",
      });
      // 405/403 a HEAD: el CDN no acepta HEAD → reintentar con GET.
      if (method === "HEAD" && (res.status === 405 || res.status === 403 || res.status === 501)) {
        continue;
      }
      return { ok: res.ok, status: res.status };
    } catch (err) {
      if (method === "HEAD") continue; // red/timeout → un intento más con GET
      return { ok: false, status: err.name === "TimeoutError" ? "timeout" : `red: ${err.cause?.code ?? err.message}` };
    }
  }
  return { ok: false, status: "?" };
}

const results = new Map(); // url → { ok, status }
let idx = 0;
async function worker() {
  while (idx < uniqueUrls.length) {
    const url = uniqueUrls[idx++];
    results.set(url, await checkUrl(url));
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, uniqueUrls.length) }, worker));

// ── 4. Reporte ──
const broken = refs.filter((r) => results.get(r.url) && !results.get(r.url).ok);
const row = (r, extra = "") => `  ${r.tabla.padEnd(19)} ${String(r.id).padEnd(28)} ${extra}${r.url}`;

console.log(`\n— URLs ROTAS (4xx/5xx/red/timeout): ${broken.length}`);
for (const r of broken) console.log(row(r, `[${results.get(r.url).status}] `));
console.log(`\n— URLs con HOST LOCAL (127.0.0.1/localhost/192.168.*): ${localHost.length}`);
for (const r of localHost) console.log(row(r));
console.log(`\n— URLs de OTRO proyecto Supabase (env=${ENV_REF ?? "?"}): ${wrongProject.length}`);
for (const r of wrongProject) console.log(row(r, `[ref=${r.ref}] `));

const okCount = uniqueUrls.length - new Set(broken.map((r) => r.url)).size;
console.log(
  `\nResumen: ${okCount}/${uniqueUrls.length} URLs sanas · ${broken.length} ref(s) rotas · ` +
    `${localHost.length} host local · ${wrongProject.length} proyecto cruzado`,
);
await prisma.$disconnect();
if (broken.length > 0) {
  console.error("✗ hay URLs rotas — corregir datos o correr migrate-unsplash-to-bucket.mjs");
  process.exit(1);
}
console.log("✓ sin URLs rotas");

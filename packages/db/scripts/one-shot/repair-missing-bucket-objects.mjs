#!/usr/bin/env node
/*
 * repair-missing-bucket-objects.mjs — repara referencias de imágenes de catálogo
 * rotas o cruzadas entre los buckets de STG y PRD.
 *
 * Por qué existe (hallazgo 2026-10-01, `audit-product-image-urls.mjs`):
 * las URLs guardadas en DB y los objetos reales del bucket se desincronizaron
 * entre ambientes (syncs parciales STG↔PRD, one-shots que reemplazaron objetos):
 *   - STG tenía 66 refs apuntando a SU PROPIO bucket con objeto inexistente
 *     (400) — variantes de separadores y FI-CUAD-65-1 sin foto en la PDP.
 *   - y 24 refs cruzadas al bucket de PRD (funcionan, pero si PRD cambia, STG
 *     se rompe — mismo riesgo que el incidente inverso de 2026-09-20).
 *
 * Qué hace, sobre las 5 tablas/columnas de imágenes de catálogo (mismo set que
 * audit-product-image-urls.mjs):
 *   A) URL del PROYECTO ACTUAL que NO responde (400/404/red): intenta la MISMA
 *      ruta en el otro proyecto (STG↔PRD). Si allí existe (200), copia el objeto
 *      al bucket local EN LA MISMA RUTA (la ref de DB no cambia — queda sana
 *      sin tocar datos). Si no existe en ninguno, pasa al caso C.
 *   B) URL del OTRO proyecto que SÍ responde (ref cruzada funcional): copia el
 *      objeto al bucket local en la misma ruta y REESCRIBE la ref en DB al host
 *      local (normalización: cada ambiente sirve sus propios objetos).
 *   C) Herencia del one-shot normalize-storage-images-webp (renombró objetos
 *      .png→.webp sin actualizar todas las refs): si la rota es .png y existe
 *      el MISMO objeto como .webp en el bucket local, reescribe la ref a .webp
 *      (caso real 2026-10-01: 66 refs de variantes separadores en STG y 73 en
 *      PRD — los objetos nunca se perdieron, solo cambió la extensión).
 *   D) Si ni A ni C aplican y la columna es un ARRAY (Product/ProductVariant
 *      .images): poda la ref muerta SOLO si la fila conserva ≥1 imagen sana
 *      (verificado con status 200) — estrictamente mejor que servir el
 *      placeholder de imagen rota. Si la fila quedaría vacía o la columna es
 *      escalar (Category.image, LetterTile, DesignGalleryImage), la reporta
 *      como huérfana para decisión manual (nunca deja una ficha sin imágenes
 *      por automatismo).
 *
 * No optimiza ni transforma: copia byte a byte (los objetos ya pasaron por el
 * pipeline sharp en su momento). Idempotente: re-correr solo copia lo que falte.
 *
 * Uso (desde packages/db):
 *   pnpm exec dotenv -e ../../.env.stg -- node scripts/one-shot/repair-missing-bucket-objects.mjs           # DRY-RUN
 *   pnpm exec dotenv -e ../../.env.stg -- node scripts/one-shot/repair-missing-bucket-objects.mjs --write   # aplica
 * Contra PRD la env-guard exige además LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1.
 */

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

const WRITE = process.argv.includes("--write") || process.argv.includes("--apply");
if (WRITE) assertDestructiveAllowed("repair-missing-bucket-objects.mjs");
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

// Los dos proyectos conocidos (mismos refs que scripts/lib/env-guard.mjs). El
// "otro" se deduce del env actual; si el env no es ninguno de los dos, no hay
// contraparte que consultar y el script no aplica.
const KNOWN_REFS = ["mjbdiqdkykhsixvqlrrp", "zxkucphbsfygakgxcnik"];
const currentRef = SUPABASE_URL.match(/https?:\/\/([a-z0-9]{20})\.supabase\.co/)?.[1];
const otherRef = KNOWN_REFS.find((r) => r !== currentRef);
if (!currentRef || !otherRef) {
  console.error(`✗ el env no es STG ni PRD (ref=${currentRef ?? "?"}) — nada que reparar`);
  process.exit(1);
}
const otherPublicBase = `https://${otherRef}.supabase.co`;

const prisma = new PrismaClient();
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── 1. Recolectar referencias (mismo set que audit-product-image-urls.mjs) ──
const refs = []; // { tabla, rowId, label, col, url } — col: "images" (array) | "image" | "imageUrl" | "imageUrlB"
const [products, variants, categories, tiles, gallery] = await Promise.all([
  prisma.product.findMany({ select: { id: true, slug: true, images: true } }),
  prisma.productVariant.findMany({ select: { id: true, sku: true, images: true } }),
  prisma.category.findMany({ select: { id: true, slug: true, image: true } }),
  prisma.letterTile.findMany({ select: { id: true, imageUrl: true } }),
  prisma.designGalleryImage.findMany({ select: { id: true, imageUrl: true, imageUrlB: true } }),
]);
for (const p of products)
  for (const url of p.images) refs.push({ tabla: "Product", rowId: p.id, label: p.slug, col: "images", url });
for (const v of variants)
  for (const url of v.images)
    refs.push({ tabla: "ProductVariant", rowId: v.id, label: v.sku, col: "images", url });
for (const c of categories)
  if (c.image) refs.push({ tabla: "Category", rowId: c.id, label: c.slug, col: "image", url: c.image });
for (const t of tiles)
  refs.push({ tabla: "LetterTile", rowId: t.id, label: t.id, col: "imageUrl", url: t.imageUrl });
for (const g of gallery) {
  refs.push({ tabla: "DesignGalleryImage", rowId: g.id, label: g.id, col: "imageUrl", url: g.imageUrl });
  if (g.imageUrlB)
    refs.push({ tabla: "DesignGalleryImage", rowId: g.id, label: `${g.id} (B)`, col: "imageUrlB", url: g.imageUrlB });
}

// Parsea una URL pública de Storage de UNO de los dos proyectos.
// → { project: "current" | "other", bucket, path } | null (host ajeno a ambos).
function parseStorageUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (!m) return null;
    if (u.hostname === `${currentRef}.supabase.co`) return { project: "current", bucket: m[1], path: m[2] };
    if (u.hostname === `${otherRef}.supabase.co`) return { project: "other", bucket: m[1], path: m[2] };
    return null;
  } catch {
    return null;
  }
}

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

const otherUrlOf = (bucket, path) =>
  `${otherPublicBase}/storage/v1/object/public/${bucket}/${path}`;
const localUrlOf = (bucket, path) =>
  `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

// ── 2. Clasificar y reparar ──
console.log(`=== repair-missing-bucket-objects (${WRITE ? "WRITE" : "DRY-RUN"}) ===`);
console.log(`env=${currentRef} · contraparte=${otherRef} · refs=${refs.length}\n`);

// Cache de copias ya hechas: "<bucket>/<path>" → true (muchos refs repiten objeto).
const copied = new Set();
const rewrites = new Map(); // url vieja (cross-project) → url local
let repairedA = 0;
const orphans = [];
const failures = [];

async function copyObject(bucket, path, sourceUrl) {
  const key = `${bucket}/${path}`; // solo para el cache de la corrida
  if (copied.has(key)) return true;
  const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return false;
  const bytes = Buffer.from(await res.arrayBuffer());
  if (WRITE) {
    // OJO: el path del upload es RELATIVO al bucket (`.from(bucket)` ya lo
    // determina) — prefijarlo con el bucket dejaba el objeto en
    // "<bucket>/<bucket>/<path>" (URL pública 404, bug detectado 2026-10-01).
    const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
      cacheControl: "31536000",
      upsert: true, // idempotente
    });
    if (error) throw new Error(`upload ${key}: ${error.message}`);
  }
  copied.add(key);
  return true;
}

const candidates = [];
for (const ref of refs) {
  const parsed = parseStorageUrl(ref.url);
  if (!parsed) continue; // Unsplash u otro host: no es de este script
  candidates.push({ ref, parsed });
}

// [D] refs declaradas huérfanas en columnas array → candidatas a poda.
// { tabla, rowId, label, col, url }
const deadArrayRefs = [];
let swappedC = 0;
let normalizedB = 0;

for (const { ref, parsed } of candidates) {
  const localStatus = parsed.project === "current" ? await statusOf(ref.url) : 0;
  try {
    if (parsed.project === "current" && localStatus >= 200 && localStatus < 300) continue; // sana
    if (parsed.project === "current") {
      // A) rota en el bucket local → ¿existe en el otro proyecto?
      const src = otherUrlOf(parsed.bucket, parsed.path);
      const srcStatus = await statusOf(src);
      if (srcStatus >= 200 && srcStatus < 300) {
        await copyObject(parsed.bucket, parsed.path, src);
        repairedA++;
        console.log(`  ${WRITE ? "✓" : "·"} [A] ${ref.tabla} ${ref.label} ← copiado de ${otherRef} (${parsed.path.slice(0, 60)}…)`);
        continue;
      }
      // C) ¿el objeto existe como .webp en el bucket local? (herencia normalize-webp)
      if (parsed.path.toLowerCase().endsWith(".png")) {
        const webpPath = parsed.path.replace(/\.png$/i, ".webp");
        const webpUrl = localUrlOf(parsed.bucket, webpPath);
        const webpStatus = await statusOf(webpUrl);
        if (webpStatus >= 200 && webpStatus < 300) {
          rewrites.set(ref.url, webpUrl);
          swappedC++;
          console.log(`  ${WRITE ? "✓" : "·"} [C] ${ref.tabla} ${ref.label} → .webp (mismo objeto, extensión migrada)`);
          continue;
        }
      }
      // D) array con otras imágenes → poda; si no, huérfana para decisión manual
      if (ref.col === "images") {
        deadArrayRefs.push(ref);
      } else {
        orphans.push(`${ref.tabla} ${ref.label} — no existe en ninguno de los dos proyectos ni como .webp: ${ref.url}`);
      }
    } else {
      // B) ref cruzada funcional → copiar local + reescribir ref
      const srcStatus = await statusOf(ref.url);
      if (srcStatus >= 200 && srcStatus < 300) {
        await copyObject(parsed.bucket, parsed.path, ref.url);
        rewrites.set(ref.url, localUrlOf(parsed.bucket, parsed.path));
        normalizedB++;
        console.log(`  ${WRITE ? "✓" : "·"} [B] ${ref.tabla} ${ref.label} → normalizada a ${currentRef}`);
      } else {
        orphans.push(`${ref.tabla} ${ref.label} — ref cruzada rota (ni ${otherRef} la sirve): ${ref.url}`);
      }
    }
  } catch (err) {
    failures.push(`${ref.tabla} ${ref.label} — ${err.message}`);
    console.warn(`  ✗ ${ref.tabla} ${ref.label}: ${err.message}`);
  }
}

// ── 2b. Caso D: podar refs muertas de arrays que conservan imágenes sanas ──
// Agrupa por fila; verifica que al menos UNA ref restante responda 200 antes
// de podar (si ninguna responde, la fila se reporta, no se toca).
const deadByRow = new Map(); // "tabla|rowId" → ref[]
for (const r of deadArrayRefs) {
  const key = `${r.tabla}|${r.rowId}`;
  if (!deadByRow.has(key)) deadByRow.set(key, []);
  deadByRow.get(key).push(r);
}
let prunedD = 0;
const pruneByRow = new Map(); // key → Set<url muerta a quitar>
for (const [key, rowRefs] of deadByRow) {
  const { tabla, rowId, label } = rowRefs[0];
  const row = tabla === "Product" ? products.find((p) => p.id === rowId) : variants.find((v) => v.id === rowId);
  if (!row) continue;
  const survivors = row.images.filter((u) => !rowRefs.some((r) => r.url === u));
  let anyAlive = false;
  for (const u of survivors) {
    const s = await statusOf(u);
    if (s >= 200 && s < 300) {
      anyAlive = true;
      break;
    }
  }
  if (anyAlive && survivors.length > 0) {
    pruneByRow.set(key, new Set(rowRefs.map((r) => r.url)));
    prunedD += rowRefs.length;
    console.log(`  ${WRITE ? "✓" : "·"} [D] ${tabla} ${label}: poda de ${rowRefs.length} ref(s) muerta(s) (quedan ${survivors.length} sana(s))`);
  } else {
    for (const r of rowRefs) orphans.push(`${tabla} ${label} — array sin imágenes sanas de respaldo, NO se poda: ${r.url}`);
  }
}

// ── 3. Reescribir refs en DB (casos B y C) y podar arrays (caso D) ──
let touched = 0;
{
  const swap = (v) => (v == null ? v : (rewrites.get(v) ?? v));
  const prune = (tabla, rowId, arr) => {
    const dead = pruneByRow.get(`${tabla}|${rowId}`);
    return dead ? arr.filter((u) => !dead.has(u)) : arr;
  };
  for (const p of products) {
    const next = prune("Product", p.id, p.images.map(swap));
    if (JSON.stringify(next) !== JSON.stringify(p.images)) {
      touched++;
      if (WRITE) await prisma.product.update({ where: { id: p.id }, data: { images: next } });
    }
  }
  for (const v of variants) {
    const next = prune("ProductVariant", v.id, v.images.map(swap));
    if (JSON.stringify(next) !== JSON.stringify(v.images)) {
      touched++;
      if (WRITE) await prisma.productVariant.update({ where: { id: v.id }, data: { images: next } });
    }
  }
  for (const c of categories) {
    if (c.image && rewrites.has(c.image)) {
      touched++;
      if (WRITE) await prisma.category.update({ where: { id: c.id }, data: { image: rewrites.get(c.image) } });
    }
  }
  for (const t of tiles) {
    if (rewrites.has(t.imageUrl)) {
      touched++;
      if (WRITE) await prisma.letterTile.update({ where: { id: t.id }, data: { imageUrl: rewrites.get(t.imageUrl) } });
    }
  }
  for (const g of gallery) {
    const nextA = swap(g.imageUrl);
    const nextB = swap(g.imageUrlB);
    if (nextA !== g.imageUrl || nextB !== g.imageUrlB) {
      touched++;
      if (WRITE) {
        await prisma.designGalleryImage.update({
          where: { id: g.id },
          data: { imageUrl: nextA, ...(nextB !== undefined ? { imageUrlB: nextB } : {}) },
        });
      }
    }
  }
}

console.log(
  `\nResumen: [A] ${repairedA} objeto(s) restaurados desde ${otherRef} · [B] ${normalizedB} ref(s) cruzadas normalizadas (${rewrites.size} URL(s) únicas reescritas en total) · [C] ${swappedC} ref(s) .png→.webp · [D] ${prunedD} ref(s) muertas podadas · ${touched} filas DB ${WRITE ? "actualizadas" : "a actualizar"} · ${orphans.length} huérfanas · ${failures.length} fallos`,
);
if (orphans.length) {
  console.warn("— HUÉRFANAS (requieren decisión: re-subir la imagen o cambiar la ref a mano):");
  for (const o of orphans) console.warn(`  ✗ ${o}`);
}
if (failures.length) for (const f of failures) console.warn(`  ✗ fallo: ${f}`);
console.log(WRITE ? "✓ listo" : "DRY-RUN — sin cambios (correr con --write para ejecutar)");
await prisma.$disconnect();
process.exit(failures.length ? 1 : 0);

#!/usr/bin/env node
/*
 * sync-catalog-stg-to-prd.mjs — sincroniza el CATÁLOGO y el CMS de STG → PRD:
 * Category, Product, ProductVariant, CmsPage, CmsSection, CmsField (+ su
 * versión publicada y sus CmsListItem) y PersonalizationTemplate, junto con
 * los objetos de Storage que referencian sus imágenes.
 *
 * Por qué existe (2026-10-02): el comparador de homologación
 * (scripts/diag-stg/homologacion.sh + 06-homologacion-datos.sql) reporta
 * divergencias STG→PRD: Category 84=84 con diff de contenido, Product 12 vs 11
 * (falta `separadores-magneticos-delgados` en PRD con sus variantes),
 * ProductVariant 153 vs 152, CmsField 1119 vs 1115 (SETTING 43 vs 39) y
 * PersonalizationTemplate 11=11 con diff de contenido. El catálogo/CMS se cura
 * en STG (fuente de verdad del CONTENIDO, decisión del owner) y PRD quedó atrás.
 * Coupon NO se sincroniza (la extra en STG es basura de tests) y AdminUser
 * NO se toca.
 *
 * Claves naturales (los ids cuid difieren entre ambientes — lección del sync
 * de galería): Category por slug · Product por slug · ProductVariant por sku ·
 * CmsPage por slug · CmsSection por (pageSlug, key) · CmsField por key
 * (@unique global) · PersonalizationTemplate por slug. Cruce en dos niveles
 * (id → clave natural, lib/catalog-sync.diffEntity):
 *   - existe en ambos → UPDATE del contenido conservando el id de PRD (hay
 *     FKs: OrderItem.variantId, Design.templateId, CmsField.sectionId…);
 *     createdAt/updatedAt de PRD se preservan (updatedAt se actualiza solo).
 *   - falta en PRD → INSERT con el id de STG (idempotente), resolviendo FKs
 *     al id del ambiente destino (categoryId/parentId/productId/sectionId).
 *   - solo en PRD → NO se tocan; se reportan.
 *   - soft-deletes: si en STG está archivada y en PRD viva, propaga el
 *     deletedAt (STG manda) y lo reporta explícito en el plan. Si en STG fue
 *     restaurada, propaga deletedAt=null.
 *
 * ⚠ STOCK — LÉEME ⚠
 * ProductVariant.stock NO SE SINCRONIZA JAMÁS. El stock de PRD es OPERATIVO
 * REAL: lo descuentan órdenes pagadas (InventoryLog) y lo revierten
 * cancelaciones. Sobrescribirlo con el stock de pruebas de STG vendería
 * inventario fantasma o dejaría sin stock productos que sí hay. Las variantes
 * INSERTADAS (producto nuevo) entran con stock=0 (default del schema) y se
 * reportan en grande: Lucy carga el stock operativo a mano en /admin.
 *
 * CMS — versión publicada: el storefront lee `publishedVersion.body`
 * (apps/web/lib/cms.ts), NO `CmsField.body`. Sincronizar el borrador sin la
 * versión publicada dejaría PRD sirviendo el texto viejo. Por eso, por cada
 * CmsField tocado cuya versión publicada difiera por contenido
 * (publishedVersionChanged), se AGREGA una CmsFieldVersion nueva en PRD
 * (append-only: version = max+1 del field, id = el de la versión STG →
 * idempotente) y se repunta publishedVersionId. Si STG la tiene en null, se
 * repunta a null (despublicar también manda STG). Los CmsListItem (edición de
 * campos LISTA) se reemplazan por los de STG cuando difieren — si no, el
 * próximo guardado admin reserializaría el JSON viejo sobre el body nuevo.
 * Los CmsField type=IMAGE guardan en body un CmsMedia.id (cuid por ambiente):
 * se remapea por (bucket, path) al CmsMedia de PRD; si no existe en PRD se
 * reporta y se omite ese body (nunca se escribe un id colgado).
 *
 * Imágenes: Product.images / ProductVariant.images / Category.image /
 * PersonalizationTemplate.previewUrl son URLs de Storage. PRD sirve sus
 * propias imágenes (decisión 2026-09-20, sync-product-images-stg): al escribir
 * en PRD se reescribe el host STG → PRD y se copian al bucket PRD (mismo path,
 * upsert:false) los objetos que falten, con fetch nativo + SUPABASE_SECRET_KEY
 * de PRD — mismo patrón que sync-gallery-stg-to-prd.mjs.
 *
 * Orden de operaciones (dependencias): categorías (padres primero) → productos
 * → variantes → CmsPage → CmsSection → CmsField (+versiones/items) → templates.
 * Storage se copia ANTES de las escrituras DB para no dejar URLs colgadas.
 *
 * Escritura PRD-DELIBERADA: corre con env-guard (fail-closed) — el modo APPLY
 * exige LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1. DRY-RUN por defecto (solo LEE ambas
 * DBs y hace HEAD al bucket PRD; imprime el plan por entidad).
 *
 * Uso (desde packages/db):
 *   node scripts/one-shot/sync-catalog-stg-to-prd.mjs           # DRY-RUN (plan)
 *   LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 node scripts/one-shot/sync-catalog-stg-to-prd.mjs --apply
 */

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import {
  assertDestructiveAllowed,
  classifyUrl,
} from "../lib/env-guard.mjs";
import {
  ENTITY_DEFS,
  diffEntity,
  publishedVersionChanged,
  listItemsChanged,
  rewriteImageHost,
  imageUrlsOf,
  collectUrlObjects,
} from "../lib/catalog-sync.mjs";

const SYNC_TAG = "system:sync-catalog-stg-to-prd";

const APPLY = process.argv.includes("--apply");
// 2026-10-09 — destino parametrizable: --to=prd (default, comportamiento
// histórico intacto) o --to=local (espejo del stack de desarrollo). El resto
// del script opera sobre "prdEnv"/"db" como ALIAS del destino elegido.
let TARGET = "prd";
for (const arg of process.argv.slice(2)) {
  if (arg === "--apply") continue;
  if (arg === "--to=prd" || arg === "--to=local") {
    TARGET = arg.slice(5);
    continue;
  }
  console.error(`✗ argumento no reconocido: ${arg} (válidos: --apply, --to=prd, --to=local)`);
  process.exit(1);
}

const STG_ENV = new URL("../../../../.env.stg", import.meta.url).pathname;
const PRD_ENV = new URL("../../../../.env.local.nube-backup", import.meta.url).pathname;
const LOCAL_ENV = new URL("../../../../.env.local", import.meta.url).pathname;
const TARGET_ENV = TARGET === "local" ? LOCAL_ENV : PRD_ENV;
const TARGET_LABEL = TARGET === "local" ? ".env.local" : ".env.local.nube-backup";

// Mismo parser de .env que sync-gallery-stg-to-prd.mjs (sin dependencias).
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
    } else {
      // Comentario inline estilo `KEY=valor  # explicación` (usado en .env.local):
      // solo en valores SIN comillas, cortar en el primer " #" — las contraseñas
      // con '#' pegado al contenido no se ven afectadas.
      const hash = val.indexOf(" #");
      if (hash > 0) val = val.slice(0, hash).trim();
    }
    out[key] = val;
  }
  return out;
}

const stgEnv = loadEnvFile(STG_ENV);
const prdEnv = loadEnvFile(TARGET_ENV);

// Fail-closed anti-archivos-cruzados: cada .env debe clasificar como su ambiente.
const stgKind = classifyUrl(stgEnv.DIRECT_URL);
const prdKind = classifyUrl(prdEnv.DIRECT_URL);
const expectedTargetKind = TARGET === "local" ? "local" : "prd";
if (stgKind !== "stg" || prdKind !== expectedTargetKind) {
  console.error(
    `✗ credenciales cruzadas o irreconocibles: .env.stg clasifica como "${stgKind}" y ` +
      `${TARGET_LABEL} como "${prdKind}" (esperado: stg y ${expectedTargetKind}). Abortando.`,
  );
  process.exit(1);
}

// La env-guard mira process.env: se la alimenta con el destino PRD real para
// que el APPLY quede bloqueado salvo bypass deliberado.
if (APPLY) {
  process.env.DIRECT_URL = prdEnv.DIRECT_URL;
  process.env.DATABASE_URL = prdEnv.DATABASE_URL ?? prdEnv.DIRECT_URL;
  assertDestructiveAllowed("sync-catalog-stg-to-prd.mjs");
}

const stg = new PrismaClient({ datasources: { db: { url: stgEnv.DIRECT_URL } } });
// "db" = destino (PRD). El lint check-script-guards detecta las escrituras
// `db.<modelo>.*` y exige el import de env-guard (arriba).
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
    return fn();
  }
}

/** select plano + relaciones para aplanar FKs a su clave natural. */
const SELECTS = {
  category: {
    id: true, slug: true, name: true, description: true, richDescription: true,
    useCase: true, image: true, icon: true, gradient: true, visibleFilters: true,
    defaultSort: true, featuredProductSlug: true, activeFrom: true, activeUntil: true,
    order: true, isActive: true, createdAt: true, createdBy: true, deletedAt: true,
    parent: { select: { slug: true } },
  },
  product: {
    id: true, slug: true, sku: true, name: true, description: true, basePrice: true,
    compareAtPrice: true, cost: true, isPersonalizable: true, personalizationKind: true,
    personalizationSchema: true, richDescription: true, whyChooseThis: true, idealFor: true,
    physicalSpecs: true, warrantyMonths: true, productionDays: true, shippingDaysMin: true,
    shippingDaysMax: true, minimumQuantity: true, maximumQuantity: true, images: true,
    isActive: true, isFeatured: true, seoTitle: true, seoDescription: true,
    createdAt: true, createdBy: true, deletedAt: true,
    category: { select: { slug: true } },
  },
  variant: {
    id: true, sku: true, name: true, description: true, price: true, compareAtPrice: true,
    stock: true, images: true, attributes: true, isActive: true,
    createdAt: true, createdBy: true, deletedAt: true,
    product: { select: { slug: true } },
  },
  cmsPage: {
    id: true, slug: true, title: true, description: true, path: true, icon: true,
    sortOrder: true, createdAt: true,
  },
  cmsSection: {
    id: true, key: true, title: true, description: true, sortOrder: true, createdAt: true,
    page: { select: { slug: true } },
  },
  cmsField: {
    id: true, key: true, kind: true, label: true, helpText: true, type: true, body: true,
    metadata: true, category: true, sortOrder: true, isPublished: true, publishedVersionId: true,
    createdAt: true, createdBy: true, deletedAt: true,
    section: { select: { key: true, page: { select: { slug: true } } } },
    publishedVersion: { select: { id: true, title: true, body: true, metadata: true, publishedAt: true, version: true } },
    items: { select: { id: true, position: true, values: true } },
  },
  template: {
    id: true, slug: true, kind: true, mode: true, name: true, description: true,
    previewUrl: true, canvasData: true, isActive: true, order: true,
    createdAt: true, createdBy: true, deletedAt: true,
    product: { select: { slug: true } },
  },
};

/** Aplana las relaciones del select a claves naturales (parentSlug, …). */
const FLATTEN = {
  category: (r) => ({ ...r, parentSlug: r.parent?.slug ?? null, parent: undefined }),
  product: (r) => ({ ...r, categorySlug: r.category.slug, category: undefined }),
  variant: (r) => ({ ...r, productSlug: r.product.slug, product: undefined }),
  cmsPage: (r) => r,
  cmsSection: (r) => ({ ...r, pageSlug: r.page.slug, page: undefined }),
  cmsField: (r) => ({
    ...r,
    sectionRef: `${r.section.page.slug}|${r.section.key}`,
    section: undefined,
  }),
  template: (r) => ({ ...r, productSlug: r.product?.slug ?? null, product: undefined }),
};

const failures = [];

async function main() {
  console.log(`=== sync-catalog-stg-to-prd (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);

  // ── 1. Lectura de ambas DBs (solo lectura — seguro en dry-run) ──
  const raw = {};
  const models = {
    category: "category", product: "product", variant: "productVariant",
    cmsPage: "cmsPage", cmsSection: "cmsSection", cmsField: "cmsField", template: "personalizationTemplate",
  };
  for (const [entity, model] of Object.entries(models)) {
    const [stgRows, prdRows] = await Promise.all([
      stg[model].findMany({ orderBy: { id: "asc" }, select: SELECTS[entity] }),
      db[model].findMany({ orderBy: { id: "asc" }, select: SELECTS[entity] }),
    ]);
    raw[entity] = {
      stg: stgRows.map((r) => FLATTEN[entity](r)),
      prd: prdRows.map((r) => FLATTEN[entity](r)),
    };
  }
  // CmsMedia: los CmsField type=IMAGE guardan en body un CmsMedia.id (cuid
  // por ambiente) → remap por (bucket, path).
  const [stgMedia, prdMedia] = await Promise.all([
    stg.cmsMedia.findMany({ select: { id: true, bucket: true, path: true } }),
    db.cmsMedia.findMany({ select: { id: true, bucket: true, path: true } }),
  ]);
  const prdMediaByPath = new Map(prdMedia.map((m) => [`${m.bucket}/${m.path}`, m.id]));
  const stgMediaById = new Map(stgMedia.map((m) => [m.id, m]));
  /** CmsMedia.id de STG → id equivalente en PRD (null si no hay match). */
  const remapMediaId = (stgId) => {
    const m = stgMediaById.get(stgId);
    if (!m) return undefined; // no es un id de media (body de otro tipo)
    return prdMediaByPath.get(`${m.bucket}/${m.path}`) ?? null;
  };

  // ── 2. Diff por entidad ──
  const diffs = {};
  for (const [entity, def] of Object.entries(ENTITY_DEFS)) {
    diffs[entity] = diffEntity(raw[entity].stg, raw[entity].prd, def);
  }

  // Mapas cuid-STG → cuid-PRD por entidad (matches conservan id PRD; inserts
  // entran con el id de STG). Se construyen en orden de dependencia.
  const idMaps = {};
  for (const [entity, def] of Object.entries(ENTITY_DEFS)) {
    const map = new Map();
    for (const { row, prdRow } of diffs[entity].matches) map.set(row.id, prdRow.id);
    for (const row of diffs[entity].inserts) map.set(row.id, row.id);
    idMaps[entity] = map;
  }
  const stgIdByKey = (entity) => new Map(raw[entity].stg.map((r) => [ENTITY_DEFS[entity].keyOf(r), r.id]));
  const catIdBySlug = stgIdByKey("category");
  const productIdBySlug = stgIdByKey("product");
  const pageIdBySlug = stgIdByKey("cmsPage");
  const sectionIdByRef = stgIdByKey("cmsSection");

  /** Traduce una FK aplanada (clave natural STG) al id cuid de PRD. */
  const resolveFk = (stgId, map) => map.get(stgId) ?? null;

  // ── 3. Plan de storage (imágenes de filas tocadas) ──
  const touchedUrls = [];
  for (const [entity, def] of Object.entries(ENTITY_DEFS)) {
    const touched = [...diffs[entity].inserts, ...diffs[entity].updates.map((u) => u.row)];
    for (const row of touched) touchedUrls.push(...imageUrlsOf(row, def.imageFields));
  }
  const objects = collectUrlObjects(touchedUrls);
  const missingObjects = [];
  for (const obj of objects) {
    const status = await statusOf(publicUrlOf(prdPublicBase, obj.bucket, obj.path));
    if (status < 200 || status >= 300) missingObjects.push(obj);
  }

  // ── 4. Plan de versiones publicadas e items de CmsField ──
  const cmsFieldTouched = [
    ...diffs.cmsField.inserts.map((row) => ({ row, prdRow: null, isInsert: true })),
    ...diffs.cmsField.updates.map((u) => ({ row: u.row, prdRow: u.prdRow, isInsert: false })),
  ];
  const versionOps = []; // { row, prdRow, stgVer } — crear CmsFieldVersion en PRD y repuntar
  const unpublishOps = []; // { row, prdRow } — publishedVersionId → null
  const itemOps = []; // { row, prdRowId } — reemplazar CmsListItem
  for (const { row, prdRow, isInsert } of cmsFieldTouched) {
    const stgVer = row.publishedVersion;
    const prdVer = prdRow?.publishedVersion ?? null;
    if (stgVer && (isInsert || publishedVersionChanged(row, prdRow) || !prdVer)) {
      versionOps.push({ row, prdRow, stgVer });
    } else if (!stgVer && prdVer) {
      unpublishOps.push({ row, prdRow });
    }
    if (isInsert ? (row.items?.length ?? 0) > 0 : listItemsChanged(row.items, prdRow.items)) {
      itemOps.push({ row, prdRowId: prdRow?.id ?? row.id });
    }
  }
  // body de campos IMAGE: remap CmsMedia id STG → PRD (reporta los sin match).
  const mediaRemapNotes = [];
  const remapImageBody = (body) => {
    const mapped = remapMediaId(body);
    if (mapped === undefined) return { body, note: null }; // no es media id
    if (mapped === null) return { body: null, note: `CmsMedia ${body} sin equivalente en PRD (body queda null)` };
    return { body: mapped, note: null };
  };

  // ── 5. Reporte del plan ──
  console.log("\n──────────────── PLAN POR ENTIDAD ────────────────");
  let totalInserts = 0;
  let totalUpdates = 0;
  for (const [entity, def] of Object.entries(ENTITY_DEFS)) {
    const { inserts, updates, prdOnly } = diffs[entity];
    totalInserts += inserts.length;
    totalUpdates += updates.length;
    const softDeletes = updates.filter((u) => u.fields.includes("deletedAt") && u.row.deletedAt);
    const restores = updates.filter((u) => u.fields.includes("deletedAt") && !u.row.deletedAt);
    const byKey = updates.filter((u) => u.matchedBy === "key").length;
    console.log(
      `\n${def.label}: ${raw[entity].stg.length} STG / ${raw[entity].prd.length} PRD → ` +
        `${inserts.length} inserts · ${updates.length} updates (${updates.length - byKey} por id, ${byKey} por clave) · ` +
        `${prdOnly.length} solo-PRD (NO se tocan)` +
        (softDeletes.length ? ` · ⚠ ${softDeletes.length} SOFT-DELETE(s) a propagar` : "") +
        (restores.length ? ` · ${restores.length} restauración(es)` : ""),
    );
    for (const row of inserts) {
      console.log(`  + INSERT ${def.keyOf(row)}${row.isActive === false ? " (inactiva)" : ""}${row.deletedAt ? " (archivada)" : ""}`);
    }
    for (const { row, prdRow, fields, matchedBy } of updates) {
      const idNote = matchedBy === "id" ? row.id : `${prdRow.id} (cruce por clave; id STG ${row.id})`;
      const sd = fields.includes("deletedAt") && row.deletedAt ? " ⚠ SOFT-DELETE" : "";
      console.log(`  ~ UPDATE ${def.keyOf(row)} → ${idNote} · campos: ${fields.join(", ")}${sd}`);
    }
    if (prdOnly.length) {
      console.log(`  — solo en PRD (se conservan tal cual):`);
      for (const row of prdOnly) console.log(`    · ${def.keyOf(row)}`);
    }
  }

  const variantInserts = diffs.variant.inserts;
  if (variantInserts.length) {
    console.log(
      `\n⚠ STOCK: ${variantInserts.length} variante(s) nuevas entran a PRD con stock=0 ` +
        `(el stock de STG es de pruebas y NUNCA se copia; el stock operativo lo carga Lucy en /admin):`,
    );
    for (const v of variantInserts) console.log(`    · ${v.sku} (stock STG=${v.stock} IGNORADO)`);
  }
  const variantStockDiffs = diffs.variant.matches.filter(
    ({ row, prdRow }) => row.stock !== prdRow.stock,
  );
  if (variantStockDiffs.length) {
    console.log(
      `\n⚠ STOCK NO sincronizado en ${variantStockDiffs.length} variante(s) existentes ` +
        `(PRD manda — es operativo real):`,
    );
    for (const { row, prdRow } of variantStockDiffs) {
      console.log(`    · ${row.sku}: STG=${row.stock} PRD=${prdRow.stock} → se conserva PRD`);
    }
  }

  console.log(
    `\nCmsField extra: ${versionOps.length} versiones publicadas a crear/repuntar · ` +
      `${unpublishOps.length} despublicaciones · ${itemOps.length} campos con CmsListItem a reemplazar`,
  );
  for (const { row, stgVer } of versionOps) {
    console.log(`  § VERSION ${row.key} → publicar v${stgVer.version} de STG en PRD`);
  }
  for (const { row } of unpublishOps) {
    console.log(`  § DESPUBLICAR ${row.key} (STG no tiene versión publicada)`);
  }
  for (const { row } of itemOps) {
    console.log(`  § ITEMS ${row.key} (${row.items?.length ?? 0} items STG)`);
  }
  // Notas de remap de CmsMedia en campos IMAGE tocados.
  for (const { row } of cmsFieldTouched) {
    if (row.type !== "IMAGE") continue;
    for (const [label, body] of [["body", row.body], ["publishedVersion.body", row.publishedVersion?.body]]) {
      if (!body) continue;
      const { note } = remapImageBody(body);
      if (note) mediaRemapNotes.push(`${row.key} (${label}): ${note}`);
    }
  }
  for (const n of mediaRemapNotes) console.warn(`  ⚠ ${n}`);

  console.log(
    `\nStorage: ${objects.length} objetos referenciados por filas tocadas · ${missingObjects.length} a copiar a PRD`,
  );
  for (const obj of missingObjects) console.log(`  ⇪ COPIAR objeto ${obj.bucket}/${obj.path}`);

  console.log(
    `\nTOTAL: ${totalInserts} inserts · ${totalUpdates} updates · ` +
      `${versionOps.length} versiones CMS · ${missingObjects.length} objetos storage`,
  );

  if (!APPLY) {
    console.log("\nDRY-RUN (sin cambios). Para ejecutar: LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 … --apply");
    return;
  }

  // ── 6. APPLY: storage primero (no dejar URLs colgadas) ──
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

  // ── 7. APPLY: escrituras DB en orden de dependencias ──
  // Construye el data de escritura: campos de contenido con FKs resueltas a
  // cuid PRD e imágenes reescritas al host PRD.
  const img = (v) => rewriteImageHost(v, stgPublicBase, prdPublicBase);

  const buildData = {
    category: (row, fields) => {
      const all = {
        slug: row.slug, name: row.name, description: row.description,
        richDescription: row.richDescription, useCase: row.useCase, image: img(row.image),
        icon: row.icon, gradient: row.gradient, visibleFilters: row.visibleFilters,
        defaultSort: row.defaultSort, featuredProductSlug: row.featuredProductSlug,
        activeFrom: row.activeFrom, activeUntil: row.activeUntil, order: row.order,
        isActive: row.isActive, deletedAt: row.deletedAt,
        parentId: row.parentSlug ? resolveFk(catIdBySlug.get(row.parentSlug), idMaps.category) : null,
      };
      if (!fields) return all;
      const data = {};
      for (const f of fields) data[f === "parentSlug" ? "parentId" : f] = all[f === "parentSlug" ? "parentId" : f];
      return data;
    },
    product: (row, fields) => {
      const all = {
        slug: row.slug, sku: row.sku, name: row.name, description: row.description,
        basePrice: row.basePrice, compareAtPrice: row.compareAtPrice, cost: row.cost,
        isPersonalizable: row.isPersonalizable, personalizationKind: row.personalizationKind,
        personalizationSchema: row.personalizationSchema,
        richDescription: row.richDescription, whyChooseThis: row.whyChooseThis,
        idealFor: row.idealFor, physicalSpecs: row.physicalSpecs,
        warrantyMonths: row.warrantyMonths, productionDays: row.productionDays,
        shippingDaysMin: row.shippingDaysMin, shippingDaysMax: row.shippingDaysMax,
        minimumQuantity: row.minimumQuantity, maximumQuantity: row.maximumQuantity,
        images: img(row.images), isActive: row.isActive, isFeatured: row.isFeatured,
        seoTitle: row.seoTitle, seoDescription: row.seoDescription, deletedAt: row.deletedAt,
        categoryId: resolveFk(catIdBySlug.get(row.categorySlug), idMaps.category),
      };
      if (!fields) return all;
      const data = {};
      for (const f of fields) {
        const k = f === "categorySlug" ? "categoryId" : f;
        data[k] = all[k];
      }
      return data;
    },
    variant: (row, fields) => {
      // stock NUNCA en updates; en inserts entra con 0 (ver header ⚠ STOCK).
      const all = {
        sku: row.sku, name: row.name, description: row.description, price: row.price,
        compareAtPrice: row.compareAtPrice, stock: 0, images: img(row.images),
        attributes: row.attributes, isActive: row.isActive, deletedAt: row.deletedAt,
        productId: resolveFk(productIdBySlug.get(row.productSlug), idMaps.product),
      };
      if (!fields) return all;
      const data = {};
      for (const f of fields) {
        if (f === "productSlug") data.productId = all.productId;
        else data[f] = all[f];
      }
      return data;
    },
    cmsPage: (row, fields) => {
      const all = {
        slug: row.slug, title: row.title, description: row.description,
        path: row.path, icon: row.icon, sortOrder: row.sortOrder,
      };
      if (!fields) return all;
      return Object.fromEntries(fields.map((f) => [f, all[f]]));
    },
    cmsSection: (row, fields) => {
      const all = {
        key: row.key, title: row.title, description: row.description, sortOrder: row.sortOrder,
        pageId: resolveFk(pageIdBySlug.get(row.pageSlug), idMaps.cmsPage),
      };
      if (!fields) return all;
      const data = {};
      for (const f of fields) data[f] = all[f];
      return data;
    },
    cmsField: (row, fields) => {
      const body = row.type === "IMAGE" ? remapImageBody(row.body).body : row.body;
      const all = {
        key: row.key, kind: row.kind, label: row.label, helpText: row.helpText,
        type: row.type, body, metadata: row.metadata, category: row.category,
        sortOrder: row.sortOrder, isPublished: row.isPublished, deletedAt: row.deletedAt,
        sectionId: resolveFk(sectionIdByRef.get(row.sectionRef), idMaps.cmsSection),
      };
      if (!fields) return all;
      const data = {};
      for (const f of fields) {
        const k = f === "sectionRef" ? "sectionId" : f;
        data[k] = all[k];
      }
      return data;
    },
    template: (row, fields) => {
      const all = {
        slug: row.slug, kind: row.kind, mode: row.mode, name: row.name,
        description: row.description, previewUrl: img(row.previewUrl),
        canvasData: row.canvasData, isActive: row.isActive, order: row.order,
        deletedAt: row.deletedAt,
        productId: row.productSlug ? resolveFk(productIdBySlug.get(row.productSlug), idMaps.product) : null,
      };
      if (!fields) return all;
      const data = {};
      for (const f of fields) {
        const k = f === "productSlug" ? "productId" : f;
        data[k] = all[k];
      }
      return data;
    },
  };

  const writeEntity = async (entity, model, orderRows) => {
    const { inserts, updates } = diffs[entity];
    let inserted = 0;
    let updated = 0;
    for (const row of orderRows ? orderRows(inserts) : inserts) {
      try {
        await db[model].create({
          data: {
            ...buildData[entity](row, null),
            id: row.id, // mismo id: re-corridas idempotentes, sin duplicados
            createdAt: row.createdAt,
            createdBy: row.createdBy,
          },
        });
        inserted++;
        console.log(`  ✓ INSERT ${ENTITY_DEFS[entity].label} ${ENTITY_DEFS[entity].keyOf(row)}`);
      } catch (err) {
        failures.push(`insert ${entity} ${ENTITY_DEFS[entity].keyOf(row)} — ${err.message}`);
        console.warn(`  ✗ INSERT ${entity} ${ENTITY_DEFS[entity].keyOf(row)}: ${err.message}`);
      }
    }
    for (const { row, prdRow, fields } of updates) {
      try {
        const data = { ...buildData[entity](row, fields), updatedBy: SYNC_TAG };
        // Soft-delete: audita quién archivó/restauró (deletedBy no es FK).
        if (fields.includes("deletedAt")) data.deletedBy = row.deletedAt ? SYNC_TAG : null;
        await db[model].update({ where: { id: prdRow.id }, data });
        updated++;
        console.log(`  ✓ UPDATE ${ENTITY_DEFS[entity].label} ${ENTITY_DEFS[entity].keyOf(row)}`);
      } catch (err) {
        failures.push(`update ${entity} ${ENTITY_DEFS[entity].keyOf(row)} — ${err.message}`);
        console.warn(`  ✗ UPDATE ${entity} ${ENTITY_DEFS[entity].keyOf(row)}: ${err.message}`);
      }
    }
    return { inserted, updated };
  };

  // Categorías: padres antes que hijos (profundidad por cadena parentSlug en STG).
  const catDepth = (row, seen = new Set()) => {
    if (!row.parentSlug || seen.has(row.slug)) return 0;
    const parent = raw.category.stg.find((c) => c.slug === row.parentSlug);
    if (!parent) return 0;
    seen.add(row.slug);
    return 1 + catDepth(parent, seen);
  };
  const totals = {};
  totals.category = await writeEntity("category", "category", (rows) =>
    rows.slice().sort((a, b) => catDepth(a) - catDepth(b)),
  );
  totals.product = await writeEntity("product", "product");
  totals.variant = await writeEntity("variant", "productVariant");
  totals.cmsPage = await writeEntity("cmsPage", "cmsPage");
  totals.cmsSection = await writeEntity("cmsSection", "cmsSection");
  totals.cmsField = await writeEntity("cmsField", "cmsField");

  // CmsField: versiones publicadas (append-only, id = id de la versión STG →
  // idempotente) y CmsListItem.
  let versionsCreated = 0;
  let unpublished = 0;
  for (const { row, prdRow, stgVer } of versionOps) {
    const fieldId = prdRow?.id ?? row.id;
    try {
      const existing = await db.cmsFieldVersion.findUnique({ where: { id: stgVer.id } });
      let versionId = existing?.id;
      if (!existing) {
        const { _max } = await db.cmsFieldVersion.aggregate({
          _max: { version: true },
          where: { fieldId },
        });
        const verBody = row.type === "IMAGE" ? remapImageBody(stgVer.body).body : stgVer.body;
        const created = await db.cmsFieldVersion.create({
          data: {
            id: stgVer.id,
            fieldId,
            version: (_max.version ?? 0) + 1,
            title: stgVer.title,
            body: verBody ?? "",
            metadata: stgVer.metadata,
            publishedAt: stgVer.publishedAt ?? new Date(),
            createdBy: SYNC_TAG,
          },
        });
        versionId = created.id;
        versionsCreated++;
      }
      await db.cmsField.update({ where: { id: fieldId }, data: { publishedVersionId: versionId } });
      console.log(`  ✓ VERSION publicada ${row.key} → ${versionId}`);
    } catch (err) {
      failures.push(`version ${row.key} — ${err.message}`);
      console.warn(`  ✗ VERSION ${row.key}: ${err.message}`);
    }
  }
  for (const { row, prdRow } of unpublishOps) {
    try {
      await db.cmsField.update({
        where: { id: prdRow?.id ?? row.id },
        data: { publishedVersionId: null, updatedBy: SYNC_TAG },
      });
      unpublished++;
      console.log(`  ✓ DESPUBLICADO ${row.key}`);
    } catch (err) {
      failures.push(`unpublish ${row.key} — ${err.message}`);
      console.warn(`  ✗ DESPUBLICAR ${row.key}: ${err.message}`);
    }
  }
  let itemsReplaced = 0;
  for (const { row, prdRowId } of itemOps) {
    try {
      await db.cmsListItem.deleteMany({ where: { fieldId: prdRowId } });
      for (const item of row.items ?? []) {
        await db.cmsListItem.create({
          data: { id: item.id, fieldId: prdRowId, position: item.position, values: item.values },
        });
      }
      itemsReplaced++;
      console.log(`  ✓ ITEMS ${row.key} (${row.items?.length ?? 0})`);
    } catch (err) {
      failures.push(`items ${row.key} — ${err.message}`);
      console.warn(`  ✗ ITEMS ${row.key}: ${err.message}`);
    }
  }

  totals.template = await writeEntity("template", "personalizationTemplate");

  // ── 8. Resumen ──
  const sum = (k) => Object.values(totals).reduce((a, t) => a + t[k], 0);
  console.log(
    `\nResumen: ${sum("inserted")}/${totalInserts} inserts · ${sum("updated")}/${totalUpdates} updates · ` +
      `${versionsCreated}/${versionOps.length} versiones CMS creadas · ${unpublished} despublicaciones · ` +
      `${itemsReplaced} campos con items reemplazados · ${copiedObjects}/${missingObjects.length} objetos copiados · ` +
      `${failures.length} fallos`,
  );
  if (variantInserts.length) {
    console.warn(
      `⚠ RECORDATORIO STOCK: ${variantInserts.length} variante(s) nuevas quedaron con stock=0 en PRD ` +
        `— cargar el stock operativo en /admin antes de anunciar el producto.`,
    );
  }
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

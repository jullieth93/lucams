/*
 * Homologación de catálogo desde PRD (N-20, auditoría 360°).
 *
 * Regla de negocio (decisión del orquestador, ratificable por Lucy):
 *   - PRD es la fuente de verdad COMERCIAL (curaduría de la operadora vía admin).
 *   - Las variantes gemelas "-NOMAG" (multi-unidad, seed-magnet-variants) son la
 *     oferta «Sin imán»: DECIDIDO — viven también en PRD desde 2026-09-14
 *     (one-shot sync-nomag-variants-to-prd.mjs, idempotente por SKU; decisión
 *     reconfirmada por Lucy 2026-10-20). Este script sigue sin tocarlas porque
 *     su dirección es PRD → destino y ellas ya están en ambos.
 *   - PRD se lee y NUNCA se escribe.
 *   - El stock NUNCA se sincroniza (operativo por ambiente: PRD lo descuentan
 *     órdenes reales; LOCAL/STG lo gastan las pruebas).
 *   - Los datos de prueba del destino (pedidos, reseñas, admins/clientes de
 *     prueba, cupones de prueba) NO se tocan.
 *
 * Qué hace (3 pasadas + storage), siempre PRD → destino (LOCAL o STG):
 *   1. ESTADOS de productos/variantes: copia isActive/deletedAt de PRD por
 *      slug/sku (variantes "-NOMAG" excluidas). Filas del destino ausentes en
 *      PRD → solo se reportan (decisión humana).
 *   2. CONTENIDO de Product: alinea TODOS los campos del checksum de
 *      homologación (scripts/diag-stg/06-homologacion-datos.sql — name,
 *      description, precios, personalizationSchema, richDescription,
 *      whyChooseThis, idealFor, physicalSpecs, warranty/production/shipping
 *      days, min/max quantity, images, isFeatured, seo, categoría por slug…)
 *      en los productos presentes en ambos ambientes (cruce por slug, se
 *      conserva el id del destino — hay FKs). Productos solo-PRD → solo se
 *      reportan (crear catálogo es decisión humana; faltarían variantes).
 *   3. GALERÍA (DesignGalleryImage): cruza por id y por (tag, name) — las filas
 *      sembradas independientes en cada ambiente tienen cuid distinta; las
 *      cruzadas por (tag, name) se UPDATEan conservando el id del destino (FK
 *      DesignAsset.galleryImageId). Filas solo-PRD → INSERT en el destino con
 *      el id de PRD (re-corridas idempotentes). Filas solo-destino → solo se
 *      reportan, nunca se borran.
 *   4. STORAGE: cada ambiente tiene su proyecto Supabase (buckets distintos).
 *      Los objetos de product-images referenciados por las filas tocadas que
 *      FALTEN en el destino se descargan del bucket público de PRD y se suben
 *      al bucket del destino con el MISMO path relativo (upsert:false — nunca
 *      pisa un objeto del destino); las URLs escritas en DB apuntan al host
 *      del destino (el checksum normaliza host → storage://, así que esto es
 *      transparente para la comparación).
 *
 * Uso:
 *   cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/homologate-catalog-from-prd.mjs          # dry-run
 *   cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/homologate-catalog-from-prd.mjs --apply
 * (PRD se lee vía ../../.env.local.nube-backup; el destino vía el -e indicado:
 *  env-guard permite LOCAL/STG y bloquea que el DESTINO sea PRD por accidente.
 *  El destino necesita además NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY
 *  para la pasada de storage.)
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { assertDestructiveAllowed, classifyUrl } from "./lib/env-guard.mjs";
import {
  ENTITY_DEFS,
  diffEntity,
  buildProductData,
  collectUrlObjects,
  imageUrlsOf,
} from "./lib/catalog-sync.mjs";
import { diffGallery, buildGalleryData, collectStorageObjects } from "./lib/gallery-sync.mjs";

assertDestructiveAllowed("homologate-catalog-from-prd.mjs");

const APPLY = process.argv.includes("--apply");
const PRD_ENV = new URL("../../../.env.local.nube-backup", import.meta.url).pathname;

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
    // Comillas: si el valor abre con comilla, se toma hasta su CIERRE (lo que
    // hace dotenv) — hay líneas del backup con texto suelto tras el cierre.
    if (val.startsWith('"') || val.startsWith("'")) {
      const q = val[0];
      const end = val.indexOf(q, 1);
      val = end > 0 ? val.slice(1, end) : val.slice(1);
    }
    out[key] = val;
  }
  return out;
}

const prdEnv = loadEnvFile(PRD_ENV);
// Sanity anti-cruce: el archivo de backup debe clasificar como PRD (mismo ref
// que env-guard). Si apuntara a otro ambiente, la "fuente de verdad" sería
// falsa y sincronizaríamos espejo → espejo.
const prdKind = classifyUrl(prdEnv.DIRECT_URL);
if (prdKind !== "prd") {
  console.error(
    `✗ .env.local.nube-backup no clasifica como PRD (clasifica como "${prdKind}"). Abortando.`,
  );
  process.exit(1);
}

const prd = new PrismaClient({ datasources: { db: { url: prdEnv.DIRECT_URL } } });
const target = new PrismaClient(); // el env cargado por dotenv del caller

const prdPublicBase = prdEnv.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const tgtPublicBase = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const tgtSecret = process.env.SUPABASE_SECRET_KEY;
if (!prdPublicBase || !tgtPublicBase || !tgtSecret) {
  console.error(
    "✗ faltan NEXT_PUBLIC_SUPABASE_URL (destino o PRD) o SUPABASE_SECRET_KEY (destino) — requeridos para la pasada de storage.",
  );
  process.exit(1);
}
const supabaseTgt = createClient(tgtPublicBase, tgtSecret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const isNomag = (sku) => typeof sku === "string" && sku.toUpperCase().includes("NOMAG");

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

const PRODUCT_SELECT = {
  id: true,
  slug: true,
  sku: true,
  name: true,
  description: true,
  basePrice: true,
  compareAtPrice: true,
  cost: true,
  isPersonalizable: true,
  personalizationKind: true,
  personalizationSchema: true,
  richDescription: true,
  whyChooseThis: true,
  idealFor: true,
  physicalSpecs: true,
  warrantyMonths: true,
  productionDays: true,
  shippingDaysMin: true,
  shippingDaysMax: true,
  minimumQuantity: true,
  maximumQuantity: true,
  images: true,
  isActive: true,
  isFeatured: true,
  seoTitle: true,
  seoDescription: true,
  deletedAt: true,
  category: { select: { slug: true } },
};
const flattenProduct = (p) => {
  const { category, ...rest } = p;
  return { ...rest, categorySlug: category.slug };
};

const GALLERY_SELECT = {
  id: true,
  tag: true,
  name: true,
  imageUrl: true,
  imageUrlB: true,
  variantFilter: true,
  order: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
  deletedAt: true,
};

async function main() {
  // ── 1) Estado de PRD (lectura) ──
  const prdProducts = await prd.product.findMany({
    select: { slug: true, isActive: true, deletedAt: true },
  });
  const prdVariants = await prd.productVariant.findMany({
    select: { sku: true, isActive: true, deletedAt: true },
  });
  const prdProdBySlug = new Map(prdProducts.map((p) => [p.slug, p]));
  const prdVarBySku = new Map(prdVariants.map((v) => [v.sku, v]));

  // ── 2) Estado del destino ──
  const tgtProducts = await target.product.findMany({
    select: { id: true, slug: true, isActive: true, deletedAt: true },
  });
  const tgtVariants = await target.productVariant.findMany({
    select: { id: true, sku: true, isActive: true, deletedAt: true },
  });

  const prodUpdates = [];
  const varUpdates = [];
  const reportOnly = { products: [], variants: [] };
  let nomagSkipped = 0;

  for (const p of tgtProducts) {
    const src = prdProdBySlug.get(p.slug);
    if (!src) {
      reportOnly.products.push(p.slug);
      continue;
    }
    const same = p.isActive === src.isActive && Boolean(p.deletedAt) === Boolean(src.deletedAt);
    if (!same) {
      prodUpdates.push({
        id: p.id,
        slug: p.slug,
        from: `${p.isActive ? "activo" : "pausado"}${p.deletedAt ? "+archivado" : ""}`,
        to: `${src.isActive ? "activo" : "pausado"}${src.deletedAt ? "+archivado" : ""}`,
        isActive: src.isActive,
        deletedAt: src.deletedAt,
      });
    }
  }

  for (const v of tgtVariants) {
    if (isNomag(v.sku)) {
      nomagSkipped++;
      continue; // banco de validación intencional — nunca se toca
    }
    const src = prdVarBySku.get(v.sku);
    if (!src) {
      reportOnly.variants.push(v.sku);
      continue;
    }
    const same = v.isActive === src.isActive && Boolean(v.deletedAt) === Boolean(src.deletedAt);
    if (!same) {
      varUpdates.push({
        id: v.id,
        sku: v.sku,
        from: `${v.isActive ? "activa" : "pausada"}${v.deletedAt ? "+archivada" : ""}`,
        to: `${src.isActive ? "activa" : "pausada"}${src.deletedAt ? "+archivada" : ""}`,
        isActive: src.isActive,
        deletedAt: src.deletedAt,
      });
    }
  }

  console.log(`\n=== homologate-catalog-from-prd (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
  console.log(`PRD: ${prdProducts.length} productos, ${prdVariants.length} variantes (lectura).`);
  console.log(`NOMAG preservadas (banco de validación): ${nomagSkipped}`);
  console.log(`Productos a alinear (estado): ${prodUpdates.length}`);
  for (const u of prodUpdates) console.log(`  ~ ${u.slug}: ${u.from} → ${u.to}`);
  console.log(`Variantes a alinear (estado): ${varUpdates.length}`);
  const show = varUpdates.slice(0, 40);
  for (const u of show) console.log(`  ~ ${u.sku}: ${u.from} → ${u.to}`);
  if (varUpdates.length > show.length) console.log(`  … y ${varUpdates.length - show.length} más`);
  if (reportOnly.products.length)
    console.log(`Solo reporte (producto no existe en PRD): ${reportOnly.products.join(", ")}`);
  if (reportOnly.variants.length)
    console.log(
      `Solo reporte (variante no-NOMAG ausente en PRD): ${reportOnly.variants.join(", ")}`,
    );

  // ── 3) CONTENIDO de Product (los campos del checksum de homologación) ──
  const [prdFull, tgtFull, tgtCategories] = await Promise.all([
    prd.product.findMany({ select: PRODUCT_SELECT }),
    target.product.findMany({ select: PRODUCT_SELECT }),
    target.category.findMany({ select: { id: true, slug: true } }),
  ]);
  const tgtCatIdBySlug = new Map(tgtCategories.map((c) => [c.slug, c.id]));
  const prodDiff = diffEntity(
    prdFull.map(flattenProduct),
    tgtFull.map(flattenProduct),
    ENTITY_DEFS.product,
  );
  // Productos presentes en PRD pero ausentes en el destino: NO se crean
  // (crear catálogo es decisión humana — faltarían además sus variantes).
  const prdOnlyProducts = prodDiff.inserts;
  // Updates con categorySlug que no existe en el destino: se reportan y se
  // saltan (re-mapear categorías es decisión humana).
  const productContentUpdates = [];
  const skippedNoCategory = [];
  for (const u of prodDiff.updates) {
    if (u.fields.includes("categorySlug") && !tgtCatIdBySlug.has(u.row.categorySlug)) {
      skippedNoCategory.push(
        `${u.row.slug} (categoría PRD '${u.row.categorySlug}' ausente en destino)`,
      );
      continue;
    }
    productContentUpdates.push(u);
  }

  console.log(`\nProductos a alinear (contenido): ${productContentUpdates.length}`);
  for (const u of productContentUpdates)
    console.log(`  ~ ${u.row.slug} · campos: ${u.fields.join(", ")}`);
  if (prdOnlyProducts.length)
    console.log(
      `Solo reporte (producto de PRD ausente en destino — NO se crea): ${prdOnlyProducts.map((r) => r.slug).join(", ")}`,
    );
  if (skippedNoCategory.length)
    console.log(
      `Solo reporte (sin categoría destino, update omitido): ${skippedNoCategory.join(", ")}`,
    );

  // ── 4) GALERÍA (DesignGalleryImage) ──
  const [prdGallery, tgtGallery] = await Promise.all([
    prd.designGalleryImage.findMany({ orderBy: { id: "asc" }, select: GALLERY_SELECT }),
    target.designGalleryImage.findMany({ orderBy: { id: "asc" }, select: GALLERY_SELECT }),
  ]);
  const galleryDiff = diffGallery(prdGallery, tgtGallery);
  // En este sentido (PRD → destino): inserts = filas de PRD que faltan en el
  // destino; prdOnly = filas del DESTINO ausentes en PRD (solo se reportan).
  const galleryOnlyTarget = galleryDiff.prdOnly;

  console.log(`\nGalería: ${prdGallery.length} filas PRD · ${tgtGallery.length} filas destino`);
  console.log(
    `  a insertar en destino: ${galleryDiff.inserts.length} · a actualizar: ${galleryDiff.updates.length} · ` +
      `solo-destino (NO se tocan): ${galleryOnlyTarget.length}`,
  );
  for (const row of galleryDiff.inserts)
    console.log(
      `  + INSERT ${row.tag}/${row.name}${row.isActive ? "" : " (inactiva)"}${row.deletedAt ? " (archivada)" : ""}`,
    );
  for (const { row, prdRow, fields, matchedBy } of galleryDiff.updates)
    console.log(
      `  ~ UPDATE ${row.tag}/${row.name} · campos: ${fields.join(", ")}${matchedBy === "tag+name" ? ` (cruce tag+name; id destino ${prdRow.id})` : ""}`,
    );
  for (const row of galleryOnlyTarget)
    console.log(`  · solo-destino: ${row.tag}/${row.name} (id ${row.id})`);

  // ── 5) STORAGE: objetos referenciados por filas tocadas que falten en destino ──
  const touchedProducts = productContentUpdates.map((u) => u.row);
  const productObjects = collectUrlObjects(
    touchedProducts.flatMap((r) => imageUrlsOf(r, ENTITY_DEFS.product.imageFields)),
  );
  const galleryObjects = collectStorageObjects([
    ...galleryDiff.inserts,
    ...galleryDiff.updates.map((u) => u.row),
  ]);
  const seen = new Set();
  const objects = [...productObjects, ...galleryObjects].filter((o) => {
    const k = `${o.bucket}/${o.path}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const missingObjects = [];
  for (const obj of objects) {
    const status = await statusOf(publicUrlOf(tgtPublicBase, obj.bucket, obj.path));
    if (status < 200 || status >= 300) missingObjects.push(obj);
  }
  console.log(
    `\nStorage: ${objects.length} objetos referenciados · ${missingObjects.length} faltan en el destino (a copiar PRD → destino)`,
  );
  for (const obj of missingObjects) console.log(`  ⇪ COPIAR ${obj.bucket}/${obj.path}`);

  if (!APPLY) {
    console.log("\nDRY-RUN (sin cambios). Para ejecutar: … --apply");
    return;
  }

  const failures = [];

  // ── APPLY 1: copiar objetos de Storage que faltan en el destino ──
  let copiedObjects = 0;
  for (const obj of missingObjects) {
    const src = publicUrlOf(prdPublicBase, obj.bucket, obj.path);
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
        const { error } = await supabaseTgt.storage.from(obj.bucket).upload(obj.path, bytes.body, {
          contentType: bytes.contentType,
          cacheControl: "31536000",
          upsert: false, // solo se copia lo que FALTA; nunca pisar un objeto del destino
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

  // ── APPLY 2: estados (transacción única, comportamiento histórico) ──
  const stateResult = await target.$transaction(async (tx) => {
    let pCount = 0;
    let vCount = 0;
    for (const u of prodUpdates) {
      await tx.product.update({
        where: { id: u.id },
        data: { isActive: u.isActive, deletedAt: u.deletedAt },
      });
      pCount++;
    }
    for (const u of varUpdates) {
      await tx.productVariant.update({
        where: { id: u.id },
        data: { isActive: u.isActive, deletedAt: u.deletedAt },
      });
      vCount++;
    }
    return { pCount, vCount };
  });
  console.log(
    `\n✓ Estados homologados: ${stateResult.pCount} productos, ${stateResult.vCount} variantes.`,
  );

  // ── APPLY 3: contenido de Product (fila a fila: un fallo no aborta el lote) ──
  let prodContentUpdated = 0;
  for (const u of productContentUpdates) {
    try {
      const data = buildProductData(u.row, u.fields, {
        categoryId: tgtCatIdBySlug.get(u.row.categorySlug) ?? null,
        fromBase: prdPublicBase,
        toBase: tgtPublicBase,
      });
      // deletedAt se copia con el VALOR EXACTO de PRD (la pasada de estados
      // solo iguala presencia/ausencia; el checksum compara deletedAt::text).
      // where por id del DESTINO (cruce por slug: las cuid difieren y hay FKs).
      await target.product.update({ where: { id: u.prdRow.id }, data });
      prodContentUpdated++;
      console.log(`  ✓ UPDATE Product ${u.row.slug} · campos: ${u.fields.join(", ")}`);
    } catch (err) {
      failures.push(`update product ${u.row.slug} — ${err.message}`);
      console.warn(`  ✗ UPDATE Product ${u.row.slug}: ${err.message}`);
    }
  }

  // ── APPLY 4: galería ──
  let galleryInserted = 0;
  let galleryUpdated = 0;
  for (const row of galleryDiff.inserts) {
    try {
      const data = buildGalleryData(row, null, { fromBase: prdPublicBase, toBase: tgtPublicBase });
      // Json? de Prisma: null plano en create escribe JSON 'null' (JsonNull), NO
      // SQL NULL — y el checksum compara variantFilter::text ('null' ≠ '').
      // undefined = columna por defecto (SQL NULL), como en PRD.
      if (data.variantFilter === null) data.variantFilter = undefined;
      await target.designGalleryImage.create({
        data: {
          ...data,
          id: row.id, // mismo id que PRD: re-corridas idempotentes, sin duplicados
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          createdBy: row.createdBy,
          updatedBy: row.updatedBy,
        },
      });
      galleryInserted++;
      console.log(`  ✓ INSERT galería ${row.tag}/${row.name}`);
    } catch (err) {
      failures.push(`insert galería ${row.tag}/${row.name} — ${err.message}`);
      console.warn(`  ✗ INSERT galería ${row.tag}/${row.name}: ${err.message}`);
    }
  }
  for (const { row, prdRow, fields } of galleryDiff.updates) {
    try {
      const data = {
        ...buildGalleryData(row, fields, { fromBase: prdPublicBase, toBase: tgtPublicBase }),
        updatedBy: "system:homologate-catalog-from-prd",
      };
      // En updates, limpiar variantFilter a SQL NULL exige Prisma.DbNull
      // (null plano escribiría JSON 'null' — ver nota en inserts).
      if ("variantFilter" in data && data.variantFilter === null)
        data.variantFilter = Prisma.DbNull;
      // where por id del DESTINO: en cruces tag+name la cuid difiere y se conserva la del destino.
      await target.designGalleryImage.update({ where: { id: prdRow.id }, data });
      galleryUpdated++;
      console.log(`  ✓ UPDATE galería ${row.tag}/${row.name}`);
    } catch (err) {
      failures.push(`update galería ${row.tag}/${row.name} — ${err.message}`);
      console.warn(`  ✗ UPDATE galería ${row.tag}/${row.name}: ${err.message}`);
    }
  }

  const after = await target.productVariant.groupBy({
    by: ["isActive"],
    _count: { _all: true },
    where: { deletedAt: null },
  });
  console.log(
    `Estado variantes destino (deletedAt null): ${JSON.stringify(after.map((a) => ({ isActive: a.isActive, n: a._count._all })))}`,
  );
  console.log(
    `\nResumen: ${prodContentUpdated}/${productContentUpdates.length} productos (contenido) · ` +
      `${galleryInserted}/${galleryDiff.inserts.length} + ${galleryUpdated}/${galleryDiff.updates.length} galería · ` +
      `${copiedObjects}/${missingObjects.length} objetos copiados · ${failures.length} fallos`,
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
    process.exit(1);
  })
  .finally(async () => {
    await prd.$disconnect();
    await target.$disconnect();
  });

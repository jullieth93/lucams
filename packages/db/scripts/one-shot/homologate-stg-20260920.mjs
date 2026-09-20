/*
 * ONE-SHOT (2026-09-20) — HOMOLOGACIÓN STG → ambiente destino.
 *
 * Decisión de Lucy (2026-09-20): "STG es la referencia en este momento,
 * ajusta los otros 2 ambientes" — tras detectarse 42 divergencias VIVAS
 * STG↔PRD con homologation-diff (precios/attributes SEP-ALR, 18 variantes
 * SEP-MAG-NOMAG vivas solo en PRD, orden de categorías, hero CMS, stocks
 * de prueba). Este script espeja el snapshot STG en el ambiente destino.
 *
 * Referencia: tmp/homologation/stg.json (homologation-dump del mismo día).
 *
 * Alcance (solo estado VIVO; las filas archivadas son ruido histórico):
 *   - Categorías: name, isActive, order (por slug; no crea ni borra).
 *   - Productos (11): name, sku, basePrice, compareAtPrice, isActive,
 *     isFeatured, isPersonalizable, personalizationKind, personalizationSchema,
 *     categoría (por slug; no crea productos — los 11 ya existen en los 3).
 *   - Variantes: upsert total por SKU vivo en STG (name, price,
 *     compareAtPrice, stock, isActive, attributes, deletedAt=null);
 *     variante VIVA en destino cuyo SKU NO está vivo en STG → soft-delete
 *     (caso de las 18 SEP-MAG-*-NOMAG de PRD).
 *   - CMS: body/isPublished de todo campo VIVO que difiera (por key).
 *
 * NO toca: imágenes (las cubre sync-product-images-stg-20260920.mjs),
 *   plantillas (homologadas vía seed-templates), entidades transaccionales.
 *
 * Guardarraíles: DRY-RUN por defecto · --apply ejecuta · env-guard fail-closed
 * (PRD exige LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1) · transacción por producto con
 * timeout extendido · idempotente. Backup = el propio snapshot
 * tmp/homologation/<label>.json del destino, tomado antes de aplicar.
 *
 * Uso (desde packages/db, con el env del destino):
 *   pnpm exec dotenv -e ../../.env.local.nube-backup -- node scripts/one-shot/homologate-stg-20260920.mjs           # DRY-RUN
 *   LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 pnpm exec dotenv -e ../../.env.local.nube-backup -- node scripts/one-shot/homologate-stg-20260920.mjs --apply
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

const APPLY = process.argv.includes("--apply");
if (APPLY) assertDestructiveAllowed("homologate-stg-20260920.mjs");

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();
// Cliente STG: solo se usa para traer la FILA COMPLETA de productos/categorías
// ausentes en destino (el snapshot no incluye description/richDescription/etc.,
// que son requeridos por el schema).
const stgEnvText = readFileSync(new URL("../../../../.env.stg", import.meta.url), "utf8");
const stgDbUrl = stgEnvText.match(/^DIRECT_URL=\s*"([^"]*)"/m)?.[1];
if (!stgDbUrl) {
  console.error("✗ no se pudo leer DIRECT_URL de .env.stg");
  process.exit(1);
}
const stg = new PrismaClient({ datasources: { db: { url: stgDbUrl } } });
const STG = JSON.parse(readFileSync("../../tmp/homologation/stg.json", "utf8"));

const same = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
let touched = 0;

console.log(`=== homologate-stg-20260920 (${APPLY ? "APPLY" : "DRY-RUN"}) — referencia: STG ===`);

// Carga masiva del destino (3 queries — el pooler de Supabase cobra cada
// roundtrip; 1074 SELECTs secuenciales tardaban >8 min y se refactorizó).
const [dbCategories, dbProducts, dbCmsFields] = await Promise.all([
  prisma.category.findMany({ select: { id: true, slug: true, name: true, isActive: true, order: true } }),
  prisma.product.findMany({
    select: {
      id: true, slug: true, name: true, sku: true, basePrice: true, compareAtPrice: true,
      isActive: true, isFeatured: true, isPersonalizable: true,
      personalizationKind: true, personalizationSchema: true, deletedAt: true,
      category: { select: { slug: true } },
      variants: {
        where: { deletedAt: null },
        select: { id: true, sku: true, name: true, price: true, compareAtPrice: true, stock: true, isActive: true, attributes: true },
      },
    },
  }),
  prisma.cmsField.findMany({ select: { id: true, key: true, body: true, isPublished: true, deletedAt: true } }),
]);
const catBySlug = new Map(dbCategories.map((c) => [c.slug, c]));
const prodBySlug = new Map(dbProducts.map((p) => [p.slug, p]));
const cmsByKey = new Map(dbCmsFields.map((f) => [f.key, f]));

// ── 1. Categorías ──
for (const ref of STG.categories) {
  const target = catBySlug.get(ref.slug);
  if (!target) {
    // Categoría ausente (legacy inactiva en STG o no sembrada en destino):
    // se crea copiando la fila completa de STG para dejar el diff en cero.
    const full = await stg.category.findFirst({ where: { slug: ref.slug } });
    if (!full) continue;
    touched++;
    console.log(`  + categoría ${ref.slug}: AUSENTE en destino → crear (active=${full.isActive})`);
    if (APPLY) {
      const { id: _id, createdAt: _c, updatedAt: _u, ...data } = full;
      const created = await prisma.category.create({ data });
      catBySlug.set(ref.slug, created);
    }
    continue;
  }
  if (target.name !== ref.name || target.isActive !== ref.isActive || target.order !== ref.order) {
    touched++;
    console.log(
      `  · categoría ${ref.slug}: name ${target.name !== ref.name ? `"${target.name}"→"${ref.name}"` : "="} · active ${target.isActive}→${ref.isActive} · order ${target.order}→${ref.order}`,
    );
    if (APPLY) {
      await prisma.category.update({
        where: { id: target.id },
        data: { name: ref.name, isActive: ref.isActive, order: ref.order },
      });
    }
  }
}

// ── 2. Productos + variantes ──
for (const ref of STG.products) {
  const target = prodBySlug.get(ref.slug);
  if (!target) {
    // Espejo completo: el producto falta en destino (p.ej. creado en vivo en
    // STG, no por seed — tiras-magneticas-fotos en LOCAL tras reset) → se crea
    // con sus variantes vivas desde el snapshot.
    const category = catBySlug.get(ref.category);
    if (!category) {
      console.log(`  ⚠ producto ${ref.slug}: categoría ${ref.category} ausente en destino → skip`);
      continue;
    }
    touched++;
    console.log(`  + producto ${ref.slug}: AUSENTE en destino → crear con ${ref.variants.filter((v) => !v.deleted).length} variantes`);
    if (APPLY) {
      // Fila completa desde STG: el snapshot no incluye description (requerida)
      // ni richDescription/whyChooseThis/idealFor/physicalSpecs/images.
      const full = await stg.product.findFirst({
        where: { slug: ref.slug },
        include: { variants: { where: { deletedAt: null } } },
      });
      if (!full) continue;
      const {
        id: _id, createdAt: _c, updatedAt: _u, categoryId: _cid, variants: _v, ...productData
      } = full;
      await prisma.product.create({
        data: {
          ...productData,
          categoryId: category.id,
          variants: {
            create: full.variants.map((v) => {
              const { id: _vid, productId: _pid, createdAt: _vc, updatedAt: _vu, ...vdata } = v;
              return vdata;
            }),
          },
        },
      });
      console.log(`  ✓ ${ref.slug} creado`);
    }
    continue;
  }
  const category = catBySlug.get(ref.category);

  const productData = {
    name: ref.name,
    sku: ref.sku,
    basePrice: ref.basePrice,
    compareAtPrice: ref.compareAtPrice,
    isActive: ref.isActive,
    isFeatured: ref.isFeatured,
    isPersonalizable: ref.isPersonalizable,
    personalizationKind: ref.personalizationKind,
    personalizationSchema: ref.personalizationSchema ?? undefined,
    // Respeta el estado archivado/vivo de STG (fix 2026-09-20: la primera
    // corrida forzaba deletedAt=null y resucitó set-fotoimanes-circulares y
    // -corazon, archivados a propósito en STG).
    deletedAt: ref.deleted ? (target.deletedAt ?? new Date()) : null,
    ...(category ? { categoryId: category.id } : {}),
  };
  const productDiff =
    target.name !== ref.name ||
    target.sku !== ref.sku ||
    target.basePrice !== ref.basePrice ||
    target.compareAtPrice !== ref.compareAtPrice ||
    target.isActive !== ref.isActive ||
    target.isFeatured !== ref.isFeatured ||
    target.isPersonalizable !== ref.isPersonalizable ||
    target.personalizationKind !== ref.personalizationKind ||
    (ref.deleted ? target.deletedAt === null : target.deletedAt !== null) ||
    !same(target.personalizationSchema, ref.personalizationSchema) ||
    (category && target.category.slug !== ref.category);

  const stgLiveSkus = new Set(ref.variants.filter((v) => !v.deleted).map((v) => v.sku));
  const variantOps = [];

  for (const v of ref.variants.filter((v) => !v.deleted)) {
    const tv = target.variants.find((x) => x.sku === v.sku);
    const data = {
      name: v.name,
      price: v.price,
      compareAtPrice: v.compareAtPrice,
      stock: v.stock,
      isActive: v.isActive,
      attributes: v.attributes ?? undefined,
      deletedAt: null,
    };
    if (
      !tv ||
      tv.name !== v.name ||
      tv.price !== v.price ||
      tv.compareAtPrice !== v.compareAtPrice ||
      tv.stock !== v.stock ||
      tv.isActive !== v.isActive ||
      !same(tv.attributes, v.attributes)
    ) {
      touched++;
      variantOps.push({ sku: v.sku, data, create: !tv });
      console.log(
        `  · variante ${v.sku}${tv ? "" : " (AUSENTE/archivada en destino → upsert)"}: price ${tv?.price}→${v.price} · stock ${tv?.stock}→${v.stock} · active ${tv?.isActive}→${v.isActive}${!same(tv?.attributes, v.attributes) ? " · attributes ≠" : ""}`,
      );
    }
  }
  for (const tv of target.variants) {
    if (!stgLiveSkus.has(tv.sku)) {
      touched++;
      variantOps.push({ sku: tv.sku, softDelete: true });
      console.log(`  · variante ${tv.sku}: viva en destino, NO viva en STG → soft-delete`);
    }
  }

  if (!productDiff && variantOps.length === 0) continue;
  if (productDiff) touched++;
  if (APPLY) {
    await prisma.$transaction(
      async (tx) => {
        if (productDiff) await tx.product.update({ where: { id: target.id }, data: productData });
        for (const op of variantOps) {
          if (op.softDelete) {
            await tx.productVariant.updateMany({
              where: { productId: target.id, sku: op.sku, deletedAt: null },
              data: { isActive: false, deletedAt: new Date() },
            });
          } else if (op.create) {
            await tx.productVariant.create({ data: { ...op.data, sku: op.sku, productId: target.id } });
          } else {
            await tx.productVariant.updateMany({
              where: { productId: target.id, sku: op.sku },
              data: op.data,
            });
          }
        }
      },
      { timeout: 30000 },
    );
    console.log(`  ✓ ${ref.slug} aplicado`);
  }
}

// ── 2b. Productos VIVOS en destino ausentes en STG → soft-delete ──
// (LOCAL tras reset siembra catálogo demo propio — 54 productos que no
// existen en STG. Espejo = que no queden vivos.)
const stgSlugs = new Set(STG.products.map((p) => p.slug));
for (const p of dbProducts) {
  if (!stgSlugs.has(p.slug) && p.deletedAt === null) {
    touched++;
    console.log(`  · producto ${p.slug}: vivo en destino, NO existe en STG → soft-delete`);
    if (APPLY) {
      await prisma.product.update({
        where: { id: p.id },
        data: { isActive: false, deletedAt: new Date() },
      });
      await prisma.productVariant.updateMany({
        where: { productId: p.id, deletedAt: null },
        data: { isActive: false, deletedAt: new Date() },
      });
    }
  }
}

// ── 3. CMS ──
for (const ref of STG.cmsFields) {
  if (ref.deleted) continue;
  const target = cmsByKey.get(ref.key);
  if (!target) {
    // Campo ausente en destino (p.ej. LOCAL tras reset: el site map sembrado
    // es más viejo que el de STG) → se crea copiando la fila completa de STG,
    // resolviendo la sección/página POR KEY en el destino (los ids difieren
    // por ambiente — de ahí la FK CmsField_sectionId_fkey).
    const full = await stg.cmsField.findFirst({
      where: { key: ref.key },
      include: { section: { include: { page: true } } },
    });
    if (!full?.section?.page) continue;
    touched++;
    console.log(
      `  + cms ${ref.key}: AUSENTE en destino → crear (página "${full.section.page.slug}", sección "${full.section.key}")`,
    );
    if (APPLY) {
      const page = await prisma.cmsPage.upsert({
        where: { slug: full.section.page.slug },
        create: {
          slug: full.section.page.slug,
          title: full.section.page.title,
          description: full.section.page.description,
          path: full.section.page.path,
          icon: full.section.page.icon,
          sortOrder: full.section.page.sortOrder,
        },
        update: {},
        select: { id: true },
      });
      const section = await prisma.cmsSection.upsert({
        where: { pageId_key: { pageId: page.id, key: full.section.key } },
        create: {
          pageId: page.id,
          key: full.section.key,
          title: full.section.title,
          description: full.section.description,
          sortOrder: full.section.sortOrder,
        },
        update: {},
        select: { id: true },
      });
      const { id: _id, sectionId: _sid, createdAt: _c, updatedAt: _u, section: _s, ...data } = full;
      // publishedVersionId apunta a una CmsFieldVersion de STG (inexistente en
      // destino → FK): se crea el campo con su versión 1 publicada localmente.
      const isPublished = data.isPublished;
      delete data.publishedVersionId;
      const field = await prisma.cmsField.create({
        data: { ...data, sectionId: section.id, isPublished: false },
        select: { id: true },
      });
      if (isPublished) {
        const version = await prisma.cmsFieldVersion.create({
          data: {
            fieldId: field.id,
            version: 1,
            body: data.body,
            metadata: data.metadata ?? {},
            publishedAt: new Date(),
          },
          select: { id: true },
        });
        await prisma.cmsField.update({
          where: { id: field.id },
          data: { isPublished: true, publishedVersionId: version.id },
        });
      }
    }
    continue;
  }
  if (target.body !== ref.body || target.isPublished !== ref.isPublished || target.deletedAt !== null) {
    touched++;
    console.log(
      `  · cms ${ref.key}: ${target.body !== ref.body ? `body "${String(target.body).slice(0, 60)}…" → "${String(ref.body).slice(0, 60)}…"` : ""}${target.isPublished !== ref.isPublished ? ` published ${target.isPublished}→${ref.isPublished}` : ""}`,
    );
    if (APPLY) {
      await prisma.cmsField.update({
        where: { id: target.id },
        data: { body: ref.body, isPublished: ref.isPublished, deletedAt: null },
      });
    }
  }
}

console.log(`\n${APPLY ? "APLICADO" : "DRY-RUN"} — ${touched} cambio(s) ${APPLY ? "aplicados" : "por aplicar"}.`);
await prisma.$disconnect();
await stg.$disconnect();

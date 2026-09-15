/*
 * homologation-dump-20260915.mjs (SOLO LECTURA) — snapshot canónico del estado
 * comercial/estudio/CMS de UNA base de datos, para cruzar ambientes y certificar
 * homologación total (pedido del owner 2026-09-15: "certificar profundamente que
 * todos los ambientes estén verdaderamente homologados, incluyendo DB").
 *
 * Se corre una vez por ambiente con su env y vuelca tmp/homologation/<label>.json:
 *   node scripts/one-shot/homologation-dump-20260915.mjs <label>
 * Luego: node scripts/one-shot/homologation-diff-20260915.mjs <a> <b>
 *
 * Claves naturales (nunca IDs — difieren por ambiente por diseño):
 *   categorías por slug · productos por slug · variantes por sku · plantillas
 *   por slug · campos CMS por key. Se ignoran createdAt/updatedAt (ruido) y se
 *   incluye deletedAt/isActive como estado (la homologación cubre soft-deletes:
 *   una variante viva en un ambiente y archivada en otro ES divergencia).
 */

import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";

const label = process.argv[2];
if (!label) {
  console.error("uso: node homologation-dump-20260915.mjs <label>  (ej. local|stg|prd)");
  process.exit(1);
}

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

const categories = await prisma.category.findMany({
  select: { slug: true, name: true, isActive: true, order: true },
  orderBy: { slug: "asc" },
});

const products = await prisma.product.findMany({
  select: {
    slug: true, sku: true, name: true, basePrice: true, compareAtPrice: true,
    isActive: true, isFeatured: true, isPersonalizable: true,
    personalizationKind: true, personalizationSchema: true,
    deletedAt: true, category: { select: { slug: true } },
    variants: {
      select: {
        sku: true, name: true, price: true, compareAtPrice: true, stock: true,
        isActive: true, deletedAt: true, attributes: true,
      },
      orderBy: { sku: "asc" },
    },
  },
  orderBy: { slug: "asc" },
});

const templates = await prisma.personalizationTemplate.findMany({
  select: {
    slug: true, name: true, kind: true, mode: true, isActive: true, deletedAt: true,
    order: true, previewUrl: true,
    product: { select: { slug: true } },
    canvasData: true,
  },
  orderBy: { slug: "asc" },
});

const cmsFields = await prisma.cmsField.findMany({
  select: { key: true, body: true, isPublished: true, deletedAt: true },
  orderBy: { key: "asc" },
});

const snap = {
  label,
  at: new Date().toISOString(),
  categories: categories.map((c) => ({ ...c })),
  products: products.map((p) => ({
    slug: p.slug, sku: p.sku, name: p.name, basePrice: p.basePrice,
    compareAtPrice: p.compareAtPrice, isActive: p.isActive, isFeatured: p.isFeatured,
    isPersonalizable: p.isPersonalizable, personalizationKind: p.personalizationKind,
    personalizationSchema: p.personalizationSchema, deleted: p.deletedAt != null,
    category: p.category?.slug ?? null,
    variants: p.variants.map((v) => ({
      sku: v.sku, name: v.name, price: v.price, compareAtPrice: v.compareAtPrice,
      stock: v.stock, isActive: v.isActive, deleted: v.deletedAt != null,
      attributes: v.attributes,
    })),
  })),
  templates: templates.map((t) => ({
    slug: t.slug, name: t.name, kind: t.kind, mode: t.mode, isActive: t.isActive,
    deleted: t.deletedAt != null, order: t.order, previewUrl: t.previewUrl,
    product: t.product?.slug ?? null,
    stage: t.canvasData?.stage
      ? { width: t.canvasData.stage.width, height: t.canvasData.stage.height }
      : null,
    layers: Array.isArray(t.canvasData?.layers) ? t.canvasData.layers.length : null,
  })),
  cmsFields: cmsFields.map((f) => ({
    key: f.key,
    body: f.body,
    isPublished: f.isPublished,
    deleted: f.deletedAt != null,
  })),
};

mkdirSync("../../tmp/homologation", { recursive: true });
const file = `../../tmp/homologation/${label}.json`;
writeFileSync(file, JSON.stringify(snap, null, 1));
console.log(
  `✓ ${label}: ${snap.categories.length} categorías · ${snap.products.length} productos · ` +
    `${snap.products.reduce((n, p) => n + p.variants.length, 0)} variantes · ` +
    `${snap.templates.length} plantillas · ${snap.cmsFields.length} campos CMS → tmp/homologation/${label}.json`,
);
await prisma.$disconnect();

#!/usr/bin/env node
/*
 * Shipping dims coverage audit (read-only).
 *
 * Replicates the resolution logic of `getEffectiveShippingDims`
 * (apps/web/features/products/shipping-schemas.ts):
 *   1. variant.attributes._shipping complete -> effective
 *   2. else product.physicalSpecs complete   -> effective
 *   3. else -> GAP (quoteShipping throws MissingShippingDimsError and the
 *      whole shipping quote fails for the cart)
 *
 * Reports, for ACTIVE products/variants (not soft-deleted):
 *   - active products without complete physicalSpecs
 *   - active variants whose EFFECTIVE dims are null (the ones that break checkout)
 *   - effective dims outside the schema ranges (weight 10-50000 g, dims 1-100 cm)
 *   - partial physicalSpecs (some fields present, some missing)
 *
 * Usage (read-only, safe against any env):
 *   set -a; source .env.local; set +a; node packages/db/scripts/shipping-dims-audit.mjs
 *   set -a; source .env.stg;   set +a; node packages/db/scripts/shipping-dims-audit.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const REQUIRED = ["weightGrams", "widthCm", "heightCm", "depthCm"];

function dimsFrom(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const dims = {};
  for (const key of REQUIRED) {
    const v = obj[key];
    if (typeof v !== "number" || Number.isNaN(v)) return null;
    dims[key] = v;
  }
  return dims;
}

function partialFields(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  return REQUIRED.filter((k) => typeof obj[k] === "number");
}

function outOfRange(dims) {
  const issues = [];
  if (dims.weightGrams < 10 || dims.weightGrams > 50000)
    issues.push(`weightGrams=${dims.weightGrams} out of 10..50000`);
  for (const k of ["widthCm", "heightCm", "depthCm"]) {
    if (dims[k] < 1 || dims[k] > 100) issues.push(`${k}=${dims[k]} out of 1..100`);
  }
  return issues;
}

const products = await prisma.product.findMany({
  where: { isActive: true, deletedAt: null },
  select: {
    slug: true,
    name: true,
    personalizationKind: true,
    physicalSpecs: true,
    variants: {
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true, sku: true, attributes: true },
    },
  },
  orderBy: { slug: "asc" },
});

const missingProductSpecs = [];
const partialProductSpecs = [];
const missingEffective = [];
const rangeIssues = [];
let okVariants = 0;
let totalVariants = 0;

for (const p of products) {
  const productDims = dimsFrom(p.physicalSpecs);
  if (!productDims) {
    const present = partialFields(p.physicalSpecs);
    if (present.length > 0) {
      partialProductSpecs.push({ slug: p.slug, present });
    } else {
      missingProductSpecs.push({ slug: p.slug, kind: p.personalizationKind });
    }
  }
  for (const v of p.variants) {
    totalVariants++;
    const override = dimsFrom(v.attributes?._shipping);
    const effective = override ?? productDims;
    if (!effective) {
      missingEffective.push({ slug: p.slug, variant: v.name, sku: v.sku });
      continue;
    }
    const issues = outOfRange(effective);
    if (issues.length > 0) {
      rangeIssues.push({ slug: p.slug, variant: v.name, sku: v.sku, issues });
      continue;
    }
    okVariants++;
  }
}

console.log("=== Shipping dims audit ===");
console.log(`Active products: ${products.length}`);
console.log(`Active variants: ${totalVariants}`);
console.log(`Variants with valid effective dims: ${okVariants}`);
console.log("");
console.log(
  `[GAP] Variants with NULL effective dims (break checkout quote): ${missingEffective.length}`,
);
for (const m of missingEffective) console.log(`  - ${m.slug} :: ${m.variant} (${m.sku})`);
console.log("");
console.log(`[GAP] Active products with NO physicalSpecs at all: ${missingProductSpecs.length}`);
for (const m of missingProductSpecs) console.log(`  - ${m.slug} (${m.kind})`);
console.log("");
console.log(`[WARN] Products with PARTIAL physicalSpecs: ${partialProductSpecs.length}`);
for (const m of partialProductSpecs) console.log(`  - ${m.slug}: has ${m.present.join(", ")} only`);
console.log("");
console.log(`[WARN] Effective dims out of schema range: ${rangeIssues.length}`);
for (const m of rangeIssues)
  console.log(`  - ${m.slug} :: ${m.variant} (${m.sku}): ${m.issues.join("; ")}`);

await prisma.$disconnect();
process.exit(missingEffective.length > 0 ? 1 : 0);

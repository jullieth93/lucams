/*
 * ONE-SHOT (2026-09-15) — HOMOLOGACIÓN TOTAL de ambientes (pedido del owner:
 * "certificar profundamente que todos los ambientes estén verdaderamente
 * homologados, incluyendo DB"). Espeja el estado de STG (referencia curada)
 * en el ambiente destino, más las 3 decisiones comerciales de Lucy en sesión
 * y el fix de drift "6x2" → "2×6".
 *
 * Referencia: tmp/homologation/stg.json (snapshot de homologation-dump).
 *
 * Decisiones de Lucy (2026-09-15):
 *   1. Calendario Magnético: precio oficial = STG ($37.900 / tachado $42.900;
 *      variante MAG $39.900/$44.900, NOMAG $37.900/$42.900) → va en el espejo.
 *   2. Nombre Personalizado: ACTIVO en los 3 (override de isActive).
 *   3. COD_ENABLED: apagada en los 3 (override CMS).
 * Fix de drift (sin pregunta — evidencia: ola19 declara "2×6" y la owner lo
 *   llama "2×6 cm"): SEP-MAG-2X6-* (MAG y NOMAG) tenían name/sizeCm "6x2" en
 *   STG/PRD (edición manual) → se normalizan a "2×6" en TODOS los ambientes
 *   (STG incluida). El "6x2" además volteaba la pieza en el 3D.
 *
 * Alcance (solo estado VIVO — las filas archivadas son ruido histórico):
 *   - Productos (11): name, sku, basePrice, compareAtPrice, isActive,
 *     isFeatured, isPersonalizable, personalizationKind, personalizationSchema,
 *     categoría.
 *   - Variantes vivas (o vivas en destino): upsert total por SKU
 *     (name/price/compareAtPrice/stock/isActive/attributes, deletedAt=null);
 *     variante viva en destino ausente/archivada en STG → soft-delete.
 *   - CMS: estudio.comun.listo="Vista previa", faq.04-envios-cobertura=body STG,
 *     COD_ENABLED="false".
 * NO toca: plantillas (ya homologadas vía seed-templates --apply en los 3),
 *   filas archivadas, ni entidades fuera del catálogo/estudio/CMS.
 *
 * Guardarraíles: DRY-RUN por defecto · --apply ejecuta · env-guard fail-closed
 * (PRD exige LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1) · transacción por producto con
 * timeout extendido (lección P2028) · idempotente.
 *
 * Uso:
 *   node scripts/one-shot/homologate-20260915.mjs           # DRY-RUN
 *   node scripts/one-shot/homologate-20260915.mjs --apply   # ejecuta
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

const APPLY = process.argv.includes("--apply");
if (APPLY) assertDestructiveAllowed("homologate-20260915.mjs");

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();
const STG = JSON.parse(readFileSync("../../tmp/homologation/stg.json", "utf8"));

// ── Overrides de la sesión ──
const ACTIVE_OVERRIDES = { "nombre-personalizado": true }; // decisión 2
const CMS_OVERRIDES = {
  "estudio.comun.listo": "Vista previa",
  "faq.04-envios-cobertura": STG.cmsFields.find((f) => f.key === "faq.04-envios-cobertura")?.body,
  COD_ENABLED: "false", // decisión 3
};
// Fix "6x2" → "2×6" (name + sizeCm) — aplica a STG/PRD (local ya está bien).
const fix62 = (v) => ({
  ...v,
  name: v.name.replace(/^6x2 cm/, "2×6 cm"),
  attributes:
    v.attributes && typeof v.attributes === "object" && v.attributes.sizeCm === "6x2"
      ? { ...v.attributes, sizeCm: "2×6" }
      : v.attributes,
});

const same = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
let touched = 0;

console.log(`=== homologate-20260915 (${APPLY ? "APPLY" : "DRY-RUN"}) — referencia: STG ===`);

for (const ref of STG.products.map((p) => ({ ...p, variants: p.variants.map(fix62) }))) {
  const target = await prisma.product.findFirst({
    where: { slug: ref.slug },
    select: {
      id: true, slug: true, name: true, sku: true, basePrice: true, compareAtPrice: true,
      isActive: true, isFeatured: true, isPersonalizable: true,
      personalizationKind: true, personalizationSchema: true, deletedAt: true,
      category: { select: { slug: true } },
      variants: { select: { id: true, sku: true, isActive: true, deletedAt: true } },
    },
  });
  if (!target) {
    console.log(`  ⚠ producto ${ref.slug} no existe en este ambiente → skip (no se crean productos)`);
    continue;
  }
  const category = await prisma.category.findFirst({
    where: { slug: ref.category },
    select: { id: true },
  });

  const wantActive = ACTIVE_OVERRIDES[ref.slug] ?? ref.isActive;
  const productData = {
    name: ref.name,
    sku: ref.sku,
    basePrice: ref.basePrice,
    compareAtPrice: ref.compareAtPrice,
    isActive: wantActive,
    isFeatured: ref.isFeatured,
    isPersonalizable: ref.isPersonalizable,
    personalizationKind: ref.personalizationKind,
    personalizationSchema: ref.personalizationSchema ?? undefined,
    ...(category ? { categoryId: category.id } : {}),
  };
  const productDiff =
    target.name !== ref.name ||
    target.sku !== ref.sku ||
    target.basePrice !== ref.basePrice ||
    target.compareAtPrice !== ref.compareAtPrice ||
    target.isActive !== wantActive ||
    target.isFeatured !== ref.isFeatured ||
    target.isPersonalizable !== ref.isPersonalizable ||
    target.personalizationKind !== ref.personalizationKind ||
    !same(target.personalizationSchema, ref.personalizationSchema);

  const work = async (tx) => {
    if (productDiff) {
      console.log(`  ~ producto ${ref.slug}${wantActive !== ref.isActive ? " (isActive override → " + wantActive + ")" : ""}`);
      touched++;
      if (APPLY) await tx.product.update({ where: { id: target.id }, data: productData });
    }
    const refLive = new Map(ref.variants.filter((v) => !v.deleted).map((v) => [v.sku, v]));
    const targetLive = new Map(
      target.variants.filter((v) => v.deletedAt == null).map((v) => [v.sku, v]),
    );
    // Upsert de las vivas en la referencia (reactiva archivadas si la referencia las tiene vivas).
    for (const [sku, v] of refLive) {
      const existing = await tx.productVariant.findFirst({ where: { sku } });
      if (existing) {
        console.log(`  ~ variante ${sku} (${v.name})`);
        touched++;
        if (APPLY) {
          await tx.productVariant.update({
            where: { id: existing.id },
            data: {
              productId: target.id,
              name: v.name,
              price: v.price,
              compareAtPrice: v.compareAtPrice,
              stock: v.stock,
              isActive: v.isActive,
              deletedAt: null,
              attributes: v.attributes ?? undefined,
            },
          });
        }
      } else {
        console.log(`  + variante ${sku} (${v.name}) — falta en este ambiente`);
        touched++;
        if (APPLY) {
          await tx.productVariant.create({
            data: {
              productId: target.id,
              sku,
              name: v.name,
              price: v.price,
              compareAtPrice: v.compareAtPrice,
              stock: v.stock,
              isActive: v.isActive,
              attributes: v.attributes ?? undefined,
            },
          });
        }
      }
    }
    // Viva en destino pero archivada/ausente en la referencia → archivar.
    for (const [sku, v] of targetLive) {
      if (!refLive.has(sku)) {
        console.log(`  ⊘ variante ${sku}: viva acá pero archivada/ausente en STG → archivar`);
        touched++;
        if (APPLY) {
          await tx.productVariant.update({
            where: { id: v.id },
            data: { isActive: false, deletedAt: new Date(), deletedBy: "system:homologate-20260915" },
          });
        }
      }
    }
  };

  if (APPLY) {
    await prisma.$transaction(work, { timeout: 60_000, maxWait: 15_000 });
  } else {
    await work({
      product: { update: async () => {} },
      productVariant: {
        findFirst: (q) => prisma.productVariant.findFirst(q),
        update: async () => {},
        create: async () => {},
      },
    });
  }
}

// CMS overrides
for (const [key, body] of Object.entries(CMS_OVERRIDES)) {
  if (body == null) continue;
  const cur = await prisma.cmsField.findFirst({ where: { key }, select: { body: true } });
  if (cur && cur.body !== body) {
    console.log(`  ~ cms ${key}`);
    touched++;
    if (APPLY) await prisma.cmsField.updateMany({ where: { key }, data: { body } });
  }
}

console.log(
  `\n✓ DONE (${APPLY ? "aplicado" : "dry-run — revisa y corre con --apply"}): ${touched} cambio(s). ` +
    `Después: re-correr homologation-dump en los 3 ambientes y el diff cruzado (debe dar 0 vivo).`,
);
await prisma.$disconnect();

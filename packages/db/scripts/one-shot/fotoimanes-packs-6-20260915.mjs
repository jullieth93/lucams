/*
 * ONE-SHOT (2026-09-15) — Fotoimanes unificados por formato, vendidos por PACKS
 * de 6 unidades (decisión de producto 2026-09-15).
 *
 * Re-modela las dos familias de fotoimanes en STG/PRD (el seed canónico ya
 * declara el modelo nuevo para frescos, pero su update NO pisa precios ni
 * archiva variantes sin --prune — de ahí este script):
 *
 *   - Fotoimanes Polaroid (sku FI-POL-12): se unifica en UN formato (6×8 cm).
 *     Variantes = photoSlots 6/12/18/24 (1-4 packs de 6). Precio lineal de la
 *     tabla vieja (Set 12 · 6×8: $45.000/12 = $3.750 und → pack 6 = $22.500).
 *     Legacy desactivadas: Set 6·7×9 (V1 viejo), Set 9 (V2), Set 20 mini (V4)
 *     y cualquier otra activa fuera de la matriz nueva (sufijos -BC/-PAS del
 *     rollout de estilos, cantidades libres 1..10, etc.).
 *   - Fotoimanes Cuadrados (sku FI-CUAD-12): se mantiene la dimensión Tamaño
 *     (4×4/5×5/7×7) y la Cantidad pasa a packs de 6 (photoSlots 6/12/18/24 por
 *     tamaño). Precio pack = 6 × unitario (4×4 $4.000 / 5×5 $4.500 / 7×7
 *     $6.000). Legacy desactivadas: las de 9 unidades (V12/V22/V32) y cualquier
 *     otra activa fuera de la matriz nueva.
 *
 * SKUs PRESERVADOS donde la composición coincide (6 und → 1 pack, 12 und → 2
 * packs): FI-POL-12-V1/V3 y FI-CUAD-12-V11/V13/V21/V23/V31/V33 — así los
 * CartItem/OrderItem históricos y los redirects siguen apuntando a filas
 * vivas. Los packs nuevos (18/24) estrenan SKU (V5/V6, V14/V15, V24/V25,
 * V34/V35).
 *
 * A DIFERENCIA de restructure-abecedario.mjs, acá el update SÍ escribe el
 * precio de la variante: la composición cambió (otra cantidad/tamaño físico),
 * así que el precio viejo ya no describe la opción. Lucy puede ajustarlos
 * después en /admin/productos/[id]/variants (el seed no los pisa).
 *
 * También alinea del producto: basePrice (= precio de 1 pack), compareAtPrice
 * (polaroid: mismo % de promo de la tabla vieja), description y
 * personalizationSchema (photoSlots 6) — el update del seed no toca precios.
 *
 * El cobro NO se ve afectado: el carrito resuelve la variante server-side por
 * photoSlots+sizeCm (features/products/photo-pack-resolve.ts) y la matriz
 * nueva tiene exactamente 1 variante por combinación.
 *
 * Guardarraíles (patrón archive-lucams10-20260913.mjs):
 *   - DRY-RUN por defecto; `--apply` ejecuta (una transacción por producto).
 *   - env-guard fail-closed (../lib/env-guard.mjs): STG/local directo; PRD
 *     solo con el bypass deliberado LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1.
 *   - Idempotente: re-correrlo es no-op (upsert por SKU + soft-delete por
 *     "no está en la matriz").
 *   - Legacy se DESACTIVA (soft-delete, sufijo "(legacy)"), nunca se borra:
 *     el historial de pedidos/carritos queda íntegro.
 *
 * Uso:
 *   node scripts/one-shot/fotoimanes-packs-6-20260915.mjs           # DRY-RUN
 *   node scripts/one-shot/fotoimanes-packs-6-20260915.mjs --apply   # ejecuta
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

// Guarda de ambiente: reestructura variantes (upsert + archivado) — bloquea
// PRD/remotos no STG (PRD solo con el bypass deliberado de lib/env-guard.mjs).
assertDestructiveAllowed("fotoimanes-packs-6-20260915.mjs");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// Stock made-to-order de personalizables (misma constante del seed canónico).
const MADE_TO_ORDER_STOCK = 100_000;
const LEGACY_ACTOR = "system:fotoimanes-packs-6-20260915";

const packName = (units, sizeCm) => {
  const packs = units / 6;
  return `${packs} ${packs === 1 ? "pack" : "packs"} (${units} unidades) · ${sizeCm} cm`;
};

// Matriz POLAROID: tamaño fijo 6×8, $3.750/unidad (tabla vieja Set 12).
const POLAROID = {
  sku: "FI-POL-12",
  slugs: ["set-fotoimanes-polaroid", "set-12-fotoimanes-polaroid"],
  product: {
    name: "Fotoimanes Polaroid",
    description:
      "Fotoimanes con tus fotos en formato polaroid clásico (6×8 cm). Bordes blancos icónicos, impresión alta resolución, acabado mate. Se venden por packs: 1 pack = 6 unidades. El estilo (Clásica/Instagram) lo eliges como plantilla en el Estudio.",
    basePrice: 2250000,
    compareAtPrice: 2750000,
    personalizationSchema: { photoSlots: 6, aspectRatio: "6:8", allowText: true, sizeCm: "6×8" },
  },
  variants: [6, 12, 18, 24].map((units, i) => ({
    // SKUs preservados: V1 (era Set 6) y V3 (era Set 12); V5/V6 estrenan.
    sku: ["FI-POL-12-V1", "FI-POL-12-V3", "FI-POL-12-V5", "FI-POL-12-V6"][i],
    name: packName(units, "6×8"),
    price: units * 375000,
    attributes: { photoSlots: units, sizeCm: "6×8", aspectRatio: "6:8" },
  })),
};

// Matriz CUADRADOS: por tamaño, pack = 6 × unitario de la tabla.
const CUADRADOS_SIZES = [
  { sizeCm: "4×4", unit: 400000, skus: ["FI-CUAD-12-V11", "FI-CUAD-12-V13", "FI-CUAD-12-V14", "FI-CUAD-12-V15"] },
  { sizeCm: "5×5", unit: 450000, skus: ["FI-CUAD-12-V21", "FI-CUAD-12-V23", "FI-CUAD-12-V24", "FI-CUAD-12-V25"] },
  { sizeCm: "7×7", unit: 600000, skus: ["FI-CUAD-12-V31", "FI-CUAD-12-V33", "FI-CUAD-12-V34", "FI-CUAD-12-V35"] },
];
const CUADRADOS = {
  sku: "FI-CUAD-12",
  slugs: ["set-fotoimanes-cuadrados", "set-12-fotoimanes-cuadrados"],
  product: {
    name: "Fotoimanes Cuadrados",
    description:
      "Fotoimanes cuadrados con tus fotos. Formato minimalista, sin bordes. Ideal para galerías extensas. Elige el tamaño (4×4, 5×5 o 7×7 cm) y los packs: 1 pack = 6 unidades.",
    basePrice: 2700000, // 1 pack de 5×5 (tamaño del schema)
    personalizationSchema: { photoSlots: 6, aspectRatio: "1:1", sizeCm: "5×5", shape: "rectangle" },
  },
  variants: CUADRADOS_SIZES.flatMap((s) =>
    [6, 12, 18, 24].map((units, i) => ({
      sku: s.skus[i],
      name: packName(units, s.sizeCm),
      price: units * s.unit,
      attributes: { photoSlots: units, sizeCm: s.sizeCm, aspectRatio: "1:1", shape: "rectangle" },
    })),
  ),
};

async function migrateFamily(db, family) {
  console.log(`\n■ ${family.product.name} (${family.sku})`);
  const product = await db.product.findFirst({
    where: { OR: [{ sku: family.sku }, { slug: { in: family.slugs } }], deletedAt: null },
    select: { id: true, slug: true, name: true },
  });
  if (!product) {
    console.log(`  ⚠️  producto no encontrado (sku ${family.sku}) → skip`);
    return;
  }
  console.log(`  producto: ${product.slug} (#${product.id})`);

  // Producto: basePrice = 1 pack, compareAt (polaroid), description y schema.
  console.log(
    `  ~ producto: basePrice=${family.product.basePrice} · compareAt=${family.product.compareAtPrice ?? "(sin tocar)"} · schema.photoSlots=6`,
  );
  if (APPLY) {
    await db.product.update({
      where: { id: product.id },
      data: {
        name: family.product.name,
        description: family.product.description,
        basePrice: family.product.basePrice,
        ...(family.product.compareAtPrice !== undefined
          ? { compareAtPrice: family.product.compareAtPrice }
          : {}),
        personalizationSchema: family.product.personalizationSchema,
      },
    });
  }

  // Variantes de la matriz nueva: upsert por SKU. El update SÍ escribe precio
  // (la composición física cambió — ver header), name y attributes.
  const keepSkus = new Set(family.variants.map((v) => v.sku));
  for (const v of family.variants) {
    const existing = await db.productVariant.findUnique({ where: { sku: v.sku } });
    if (!existing) {
      console.log(`  + ${v.sku} — ${v.name} ($${(v.price / 100).toLocaleString("es-CO")})`);
      if (APPLY) {
        await db.productVariant.create({
          data: {
            productId: product.id,
            sku: v.sku,
            name: v.name,
            price: v.price,
            stock: MADE_TO_ORDER_STOCK,
            isActive: true,
            attributes: v.attributes,
          },
        });
      }
    } else {
      console.log(
        `  ~ ${v.sku} — ${v.name} ($${(v.price / 100).toLocaleString("es-CO")}; re-parent a ${family.sku} si hace falta)`,
      );
      if (APPLY) {
        await db.productVariant.update({
          where: { id: existing.id },
          data: {
            productId: product.id,
            name: v.name,
            price: v.price,
            // Promo vieja LIMPIADA: el compareAt describía la composición
            // anterior (otra cantidad/tamaño) → dejarlo pintaría un descuento
            // falso. Lucy re-agrega promos desde el admin si aplica.
            compareAtPrice: null,
            attributes: v.attributes,
            isActive: true,
            deletedAt: null,
          },
        });
      }
    }
    // Stock made-to-order si quedó en 0 (misma regla H11 del seed).
    if (APPLY) {
      await db.productVariant.updateMany({
        where: { sku: v.sku, stock: 0 },
        data: { stock: MADE_TO_ORDER_STOCK },
      });
    }
  }

  // Legacy: TODA variante viva del producto fuera de la matriz → soft-delete.
  // Cubre las conocidas (Set 6·7×9, Set 9, Set 20 mini, 9-unidades de
  // cuadrados) y las de rollouts viejos (-BC/-PAS, cantidades libres…).
  const legacy = await db.productVariant.findMany({
    where: { productId: product.id, sku: { notIn: [...keepSkus] }, deletedAt: null },
    select: { id: true, sku: true, name: true, price: true },
  });
  for (const v of legacy) {
    console.log(
      `  ⊘ legacy ${v.sku} (${v.name}) → desactivar${APPLY ? "" : "  [dry-run]"}`,
    );
    if (APPLY) {
      await db.productVariant.update({
        where: { id: v.id },
        data: {
          isActive: false,
          deletedAt: new Date(),
          deletedBy: LEGACY_ACTOR,
          name: `${v.name} (legacy)`,
        },
      });
    }
  }
  console.log(
    `  resumen: ${family.variants.length} variantes en matriz · ${legacy.length} legacy desactivadas`,
  );
}

async function main() {
  console.log(`=== fotoimanes-packs-6-20260915 (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
  for (const family of [POLAROID, CUADRADOS]) {
    if (APPLY) {
      // Timeout extendido: ~30 round-trips por familia contra el pooler remoto
      // (us-east-2) superan los 5 s por defecto → P2028 (visto en STG 2026-09-15).
      await prisma.$transaction((tx) => migrateFamily(tx, family), {
        timeout: 60_000,
        maxWait: 15_000,
      });
    } else {
      await migrateFamily(prisma, family);
    }
  }
  console.log(
    `\n✓ DONE (${APPLY ? "aplicado" : "dry-run — revisa y corre con --apply"}). ` +
      `Verifica /producto/set-fotoimanes-polaroid y /producto/set-fotoimanes-cuadrados.`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

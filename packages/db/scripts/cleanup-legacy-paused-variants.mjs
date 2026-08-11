/*
 * Limpieza de VARIANTES LEGACY PAUSADAS (2026-08-08, plan pre-producción Fase 6).
 *
 * Qué borra: variantes PAUSADAS (isActive=false, deletedAt=null) de productos
 * cuyo esquema activo ya no las incluye — son las series viejas que Lucy ve en
 * "Gestionar opciones y stock" y que NO deberían estar:
 *   - set-fotoimanes-cuadrados: series "Marco blanco/negro" y sets 6/9/12
 *     (57 pausadas; esquema activo = tamaño × cantidad 1..6 sin marco).
 *   - pack-vocales: series con tema Animales/Frutas/Profesiones
 *     (36 pausadas; esquema activo = tamaño × imán × idioma).
 *   - set-fotoimanes-polaroid: sets 6/9/12/20 con acabado
 *     (12 pausadas; esquema activo = 7.5×10 cantidad libre 1..10).
 *
 * Detección EXACTA por estado (no por patrón de SKU/nombre): variante pausada
 * y no archivada de esos 3 slugs. Las activas NO se tocan aunque compartan
 * prefijo de SKU con una pausada (ej. VOC-GRAN-MAG pausada vs VOC-GRAN-MAG-ES
 * activa).
 *
 * Regla de borrado (misma que purge-archived-test-junk.mjs): si la variante
 * tiene OrderItem (FK Restrict) NO se borra en duro — se archiva (soft delete:
 * deletedAt + isActive=false), que la hace desaparecer del admin igualmente
 * (listVariantsByProduct filtra deletedAt). CartItems e InventoryLogs de la
 * variante se borran en la misma transacción (sus FK son Restrict);
 * StockReservation cae por CASCADE y QuoteItem.variantId es SetNull.
 *
 * Uso:
 *   node scripts/cleanup-legacy-paused-variants.mjs            # DRY-RUN
 *   node scripts/cleanup-legacy-paused-variants.mjs --apply    # ejecuta
 *   node scripts/cleanup-legacy-paused-variants.mjs --apply --also-archived
 *     # además: hard delete de variantes ya ARCHIVADAS (deletedAt) de productos
 *     # vivos sin pedidos asociados — residuo de consolidaciones viejas que no
 *     # se ve en el admin pero sigue en DB (2026-08-08).
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

assertDestructiveAllowed("cleanup-legacy-paused-variants.mjs");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const ALSO_ARCHIVED = process.argv.includes("--also-archived");

const TARGET_PRODUCT_SLUGS = [
  "set-fotoimanes-cuadrados",
  "pack-vocales",
  "set-fotoimanes-polaroid",
];

async function main() {
  const where = ALSO_ARCHIVED
    ? {
        // Modo ampliado: legacy pausadas de los 3 slugs + TODA variante ya
        // archivada de producto vivo (residuo de consolidaciones viejas).
        OR: [
          {
            isActive: false,
            deletedAt: null,
            product: { slug: { in: TARGET_PRODUCT_SLUGS }, deletedAt: null },
          },
          { deletedAt: { not: null }, product: { deletedAt: null } },
        ],
      }
    : {
        isActive: false,
        deletedAt: null,
        product: { slug: { in: TARGET_PRODUCT_SLUGS }, deletedAt: null },
      };

  const variants = await prisma.productVariant.findMany({
    where,
    select: {
      id: true,
      sku: true,
      name: true,
      stock: true,
      deletedAt: true,
      product: { select: { slug: true } },
      _count: { select: { orderItems: true, cartItems: true, inventoryLogs: true } },
    },
    orderBy: [{ product: { slug: "asc" } }, { sku: "asc" }],
  });

  console.log(`\nVariantes legacy pausadas encontradas: ${variants.length}`);
  if (variants.length === 0) {
    console.log("Nada que hacer.");
    return;
  }

  const byProduct = new Map();
  for (const v of variants) {
    // Ya archivada Y con pedidos: no hay nada que hacer (no se puede hard-borrar
    // por la FK y ya está archivada) → se reporta y se salta.
    if (v.deletedAt !== null && v._count.orderItems > 0) continue;
    const hard = v._count.orderItems === 0;
    if (!byProduct.has(v.product.slug)) byProduct.set(v.product.slug, []);
    byProduct.get(v.product.slug).push({ ...v, hard });
  }

  let hardTotal = 0;
  let softTotal = 0;
  for (const [slug, list] of byProduct) {
    console.log(`\n── ${slug} (${list.length}) ──`);
    for (const v of list) {
      const action = v.hard
        ? v.deletedAt
          ? "HARD delete (archivada)"
          : "HARD delete"
        : "SOFT delete (tiene pedidos)";
      if (v.hard) hardTotal++;
      else softTotal++;
      console.log(
        `  ${action.padEnd(28)} ${v.sku.padEnd(26)} ${v.name}  (stock ${v.stock}, cartItems ${v._count.cartItems}, logs ${v._count.inventoryLogs})`,
      );
    }
  }
  const skipped = variants.length - hardTotal - softTotal;
  console.log(
    `\nResumen: ${hardTotal} hard delete, ${softTotal} soft delete (archivar)` +
      (skipped > 0 ? `, ${skipped} ya archivadas con pedidos (se quedan)` : "") +
      ".",
  );

  if (!APPLY) {
    console.log("\nDRY-RUN — nada se modificó. Corre con --apply para ejecutar.");
    return;
  }

  let done = 0;
  for (const v of variants) {
    // Ya archivada y con pedidos → nada que hacer.
    if (v.deletedAt !== null && v._count.orderItems > 0) continue;
    await prisma.$transaction(async (tx) => {
      if (v._count.orderItems > 0) {
        // Con pedidos: archivar (soft delete) — preserva la integridad de las órdenes.
        await tx.productVariant.update({
          where: { id: v.id },
          data: { deletedAt: new Date(), isActive: false },
        });
        return;
      }
      await tx.cartItem.deleteMany({ where: { variantId: v.id } });
      await tx.inventoryLog.deleteMany({ where: { variantId: v.id } });
      await tx.productVariant.delete({ where: { id: v.id } });
    });
    done++;
    if (done % 20 === 0) console.log(`  … ${done}/${hardTotal + softTotal}`);
  }
  console.log(`✓ Listo: ${done} variantes procesadas.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

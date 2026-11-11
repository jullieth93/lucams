#!/usr/bin/env node
/*
 * packs-volume-pricing-20261111.mjs — curva de volumen REAL en las familias por
 * packs (owner 2026-11-11, ADR-202).
 *
 * Qué hace:
 *   - Fotoimanes Polaroid (set-fotoimanes-polaroid) y Fotoimanes Cuadrados
 *     (set-fotoimanes-cuadrados): sus variantes pack (1/2/3/4 packs de 6) tenían
 *     precio estrictamente LINEAL (sin ahorro por llevar más) y la promo de
 *     Polaroid (−18%) vivía solo a nivel producto — al elegir 2+ packs el
 *     cliente perdía el descuento y veía el chip «Otras presentaciones con
 *     descuento…».
 *   - Aplica la curva de volumen aprobada por el owner: 2 packs −6 %, 3 packs
 *     −11 %, 4 packs −15 % sobre el precio por pack, redondeo a centenas. Las
 *     gemelas -NOMAG reciben el mismo precio (patrón histórico).
 *   - Polaroid: además escribe el compareAtPrice proporcional por presentación
 *     (compareAt del pack base × N packs) — la promo queda pareja en TODA la
 *     escala y cada presentación muestra su tachado (resolvePromoDisplay regla 1).
 *
 * Idempotente y seguro:
 *   - Lee el precio por pack de la variante base (mínimo photoSlots) de CADA
 *     grupo (tamaño × imán) en la BD destino — si el admin cambió precios, la
 *     curva se aplica sobre el dato vivo, no sobre el seed.
 *   - DRY-RUN por defecto (imprime la tabla antes/después); `--apply` escribe.
 *   - Segunda corrida: los precios ya curvados se recalculan idénticos (no-op).
 *
 * Uso (desde packages/db):
 *   npx dotenv -e ../../.env.local -- node scripts/one-shot/packs-volume-pricing-20261111.mjs
 *   npx dotenv -e ../../.env.stg   -- node scripts/one-shot/packs-volume-pricing-20261111.mjs --apply
 *   (PRD: mismo comando con el env de PRD + LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1)
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

assertDestructiveAllowed("one-shot/packs-volume-pricing-20261111.mjs");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const PACK_SIZE = 6;
/** Factor del precio por pack según packs de la presentación (owner 2026-11-11). */
const CURVE = { 2: 0.94, 3: 0.89, 4: 0.85 };
const PRODUCTS = [
  // Polaroid: promo pareja — el compareAt por pack sale del dato vivo
  // (variante base o, legado, el compareAt a nivel producto).
  { slug: "set-fotoimanes-polaroid", propagateCompareAt: true },
  { slug: "set-fotoimanes-cuadrados", propagateCompareAt: false },
];

/** Redondeo a centenas de pesos (centavos COP: múltiplos de 10 000). */
const round100 = (centavos) => Math.round(centavos / 10000) * 10000;

let updates = 0;

for (const cfg of PRODUCTS) {
  const product = await prisma.product.findFirst({
    where: { slug: cfg.slug, deletedAt: null },
    select: {
      id: true,
      name: true,
      basePrice: true,
      compareAtPrice: true,
      variants: {
        where: { deletedAt: null },
        select: { id: true, sku: true, name: true, price: true, compareAtPrice: true, attributes: true },
      },
    },
  });
  if (!product) {
    console.log(`! ${cfg.slug}: no encontrado — se omite`);
    continue;
  }
  console.log(`\n=== ${product.name} (${cfg.slug}) ===`);

  // Grupos por tamaño × imán (las gemelas -NOMAG comparten grupo por magnet).
  const groups = new Map();
  for (const v of product.variants) {
    const a = v.attributes ?? {};
    const photoSlots = typeof a.photoSlots === "number" ? a.photoSlots : null;
    if (!photoSlots || photoSlots % PACK_SIZE !== 0) continue;
    const key = `${a.sizeCm ?? ""}|${a.magnet ?? ""}`;
    const group = groups.get(key) ?? [];
    group.push({ ...v, packs: photoSlots / PACK_SIZE });
    groups.set(key, group);
  }

  for (const [key, list] of groups) {
    list.sort((a, b) => a.packs - b.packs);
    const base = list[0];
    if (!base || base.packs !== 1) {
      console.log(`  ! grupo [${key}]: sin presentación base de 1 pack — se omite`);
      continue;
    }
    const perPack = base.price ?? product.basePrice;
    const perPackCompareAt = cfg.propagateCompareAt
      ? (base.compareAtPrice ?? product.compareAtPrice ?? null)
      : null;
    console.log(`  Grupo [${key}] — base $${perPack / 100}/pack:`);

    for (const v of list) {
      const factor = CURVE[v.packs] ?? 1;
      const nextPrice = round100(perPack * v.packs * factor);
      const nextCompareAt = perPackCompareAt !== null ? perPackCompareAt * v.packs : null;
      // El compareAt de la base puede ser null en BD (la promo vivía a nivel
      // producto) — se escribe para que la presentación muestre su tachado.
      const compareApplies = cfg.propagateCompareAt && nextCompareAt !== null;
      const dirty =
        v.price !== nextPrice || (compareApplies && (v.compareAtPrice ?? null) !== nextCompareAt);
      if (!dirty) {
        console.log(`    = ${v.sku} (${v.packs} pack/s): $${nextPrice / 100} — ya alineado`);
        continue;
      }
      const caText = compareApplies ? ` · compareAt $${nextCompareAt / 100}` : "";
      console.log(
        `    ${APPLY ? "✎" : "?"} ${v.sku} (${v.packs} pack/s): $${(v.price ?? 0) / 100} → $${nextPrice / 100}${caText}`,
      );
      if (APPLY) {
        await prisma.productVariant.update({
          where: { id: v.id },
          data: {
            price: nextPrice,
            ...(compareApplies ? { compareAtPrice: nextCompareAt } : {}),
          },
        });
        updates++;
      }
    }
  }
}

console.log(
  `\n${APPLY ? `✓ ${updates} variantes actualizadas` : "DRY-RUN — nada escrito (pasa --apply)"}`,
);
await prisma.$disconnect();

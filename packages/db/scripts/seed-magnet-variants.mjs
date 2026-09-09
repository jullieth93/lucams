#!/usr/bin/env node
/*
 * seed-magnet-variants.mjs — "¿Con imán?" para TODOS los productos (regla Lucy
 * 2026-09-08b): todo producto cuyas variantes aún no declaran `magnet` recibe
 * el PAR Con imán / Sin imán:
 *   - cada variante existente pasa a declarar `magnet: true` (es lo que el
 *     producto siempre fue — imán — así que el attribute explicita, no cambia),
 *   - y se crea su gemela `magnet: false` (sku "<SKU>-NOMAG", nombre
 *     "<nombre> — Sin imán", MISMO precio de la original — default local; Lucy
 *     ajusta el precio por opción desde /admin/productos/[id]/variants, donde
 *     ¿Lleva imán? es campo first-class desde 2026-09-08b).
 *
 * PHOTO_PACK incluido desde 2026-09-08 (antes excluido deliberadamente): la
 * elección del cliente YA es entregable — el Estudio persiste `magnet` en el
 * canvasData del diseño (auto-save) y el carrito la incluye al resolver la
 * variante server-side (features/products/photo-pack-resolve.ts matchea por
 * photoSlots + sizeCm + magnet → exactamente UNA variante; el par Con/Sin imán
 * no vuelve ambiguo el match). Diseños viejos sin la clave resuelven a Con imán
 * (lo que el producto siempre fue). El Estudio muestra la elección como badge
 * read-only junto al stepper de fotos — la PDP es la única fuente de verdad.
 *
 * Idempotente: si el producto ya tiene ALGUNA variante con `magnet` declarado
 * se reporta y se SALTA entero (mezclas parciales las resuelve el admin a mano);
 * la gemela solo se crea si su SKU no existe (en ningún estado).
 *
 * Consumidores del dato (verificados antes de escribir):
 *   - PDP (variant-selector.tsx): `magnet` es dimensión visible "¿Con imán?"
 *     (Con imán primero/default); si las variantes solo difieren en magnet, la
 *     PDP preselecciona Con imán (conImanDefaultVariant).
 *   - Estudio: el merge de la variante sobre el schema lleva `magnet` (letter
 *     sets ya lo usan: letter-set-resolve.ts / ficha vs imán). En los packs de
 *     foto (PHOTO_PACK) el Estudio lo persiste en `canvasData.magnet` (auto-save)
 *     y lo muestra read-only junto al stepper de fotos (studio-photo-count-control).
 *   - Carrito (packs de foto): addPersonalizedToCart resuelve la variante desde
 *     el canvasData con photoSlots + sizeCm + magnet (photo-pack-resolve.ts).
 *   - Producción: production-spec.ts ramifica el armado por magnet !== false.
 *   - variantCoverSignature ignora `magnet` → las gemelas comparten las fotos
 *     de portada del diseño (no hay que subirlas dos veces).
 *
 * Uso:
 *   node scripts/seed-magnet-variants.mjs           # dry-run (default)
 *   node scripts/seed-magnet-variants.mjs --apply   # aplica
 * LOCAL solamente (desde packages/db):
 *   npx dotenv -e ../../.env.local -- node scripts/seed-magnet-variants.mjs --apply
 * PRD queda bloqueado por el env-guard; NO correr contra STG/PRD sin decisión
 * expresa del owner (los precios de la opción Sin imán son placeholder = precio
 * de la variante Con imán).
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

const APPLY = process.argv.includes("--apply");
assertDestructiveAllowed("seed-magnet-variants");

const prisma = new PrismaClient();

const SKU_SUFFIX = "-NOMAG";
const NAME_SUFFIX = " — Sin imán";

async function main() {
  const products = await prisma.product.findMany({
    where: { isActive: true, deletedAt: null },
    select: {
      id: true,
      slug: true,
      personalizationKind: true,
      variants: {
        where: { isActive: true, deletedAt: null },
        select: {
          id: true,
          name: true,
          sku: true,
          price: true,
          compareAtPrice: true,
          stock: true,
          isActive: true,
          attributes: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { slug: "asc" },
  });

  let magnetized = 0;
  let twinsCreated = 0;

  for (const p of products) {
    if (p.variants.length === 0) {
      console.log(`SKIP  ${p.slug}: sin variantes activas`);
      continue;
    }
    const declaresMagnet = p.variants.some((v) => v.attributes != null && "magnet" in v.attributes);
    if (declaresMagnet) {
      console.log(`OK    ${p.slug}: ya declara magnet (${p.variants.length} variantes)`);
      continue;
    }

    console.log(`\n== ${p.slug} [${p.personalizationKind}] — sembrar par Con/Sin imán`);
    for (const v of p.variants) {
      const attrs = v.attributes ?? {};
      // 1. La original explicita magnet:true (el producto siempre fue con imán).
      console.log(`${APPLY ? "WRITE" : "DRY "}  ${v.sku}: magnet → true`);
      magnetized++;
      if (APPLY) {
        await prisma.productVariant.update({
          where: { id: v.id },
          data: { attributes: { ...attrs, magnet: true } },
        });
      }

      // 2. Gemela Sin imán (mismo precio — Lucy lo ajusta en el admin).
      const twinSku = `${v.sku}${SKU_SUFFIX}`;
      if (twinSku.length > 80) {
        console.warn(`!!    ${v.sku}: SKU gemela >80 chars — se salta la creación`);
        continue;
      }
      const twinExists = await prisma.productVariant.findUnique({ where: { sku: twinSku } });
      if (twinExists) {
        console.log(`OK    ${twinSku}: ya existe — no se duplica`);
        continue;
      }
      console.log(
        `${APPLY ? "WRITE" : "DRY "}  ${twinSku}: crear "${v.name}${NAME_SUFFIX}" (magnet:false, mismo precio)`,
      );
      twinsCreated++;
      if (APPLY) {
        await prisma.productVariant.create({
          data: {
            productId: p.id,
            name: `${v.name}${NAME_SUFFIX}`,
            sku: twinSku,
            price: v.price,
            compareAtPrice: v.compareAtPrice,
            stock: v.stock,
            isActive: v.isActive,
            attributes: { ...attrs, magnet: false },
          },
        });
      }
    }
  }

  console.log(
    `\n${APPLY ? "Aplicado" : "Dry-run (sin escribir)"}: ${magnetized} variante(s) con magnet:true, ${twinsCreated} gemela(s) Sin imán.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

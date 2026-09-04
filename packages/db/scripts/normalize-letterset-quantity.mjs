#!/usr/bin/env node
/*
 * normalize-letterset-quantity.mjs — normaliza `attributes.quantity` en TODAS las
 * variantes de los sets de letras (feedback funcional de Lucy, 2026-09-03).
 *
 * Problema: en `abecedario-completo` solo ALGUNAS variantes traían `quantity`
 * (27 = español con Ñ / 26 = inglés) y el resto no (las 10×14 y la
 * "7×10 Sin imán Inglés" en STG/PRD) → al tener 2 valores, la PDP lo exponía
 * como dimensión elegible "Cantidad", una falsa elección: la cantidad del set
 * la DEFINE el idioma. Referencia de comportamiento correcto: `pack-vocales`
 * trae quantity=5 en todas sus variantes activas → un solo valor → no se muestra.
 *
 * Normalización (idempotente — solo escribe si el valor difiere):
 *   - abecedario-completo: quantity = 27 si language=es · 26 si language=en.
 *   - pack-vocales:        quantity = 5 en todas (las 5 vocales en ambos idiomas;
 *                          hoy solo les falta a las GRANDES inactivas — el
 *                          invariante debe valer aunque se re-activen).
 * Variantes sin `language` reconocido se reportan y se SALTAN (no se adivina).
 *
 * Consumidores del dato (verificados antes de escribir):
 *   - PDP (variant-selector.tsx): quantity↔language correlacionan 1:1 → la
 *     dimensión deja de ser selector y se describe como texto bajo "Idioma".
 *   - Ficha de taller (production-spec.ts): quantity = "piezas por pack" — el
 *     valor normalizado coincide con el que YA traían las variantes activas
 *     (27 fichas por set de abecedario), así que la ficha queda consistente.
 *   - variantCoverSignature ignora quantity → las fotos de portada por diseño
 *     no cambian de grupo.
 *
 * Uso:
 *   node scripts/normalize-letterset-quantity.mjs           # dry-run (default)
 *   node scripts/normalize-letterset-quantity.mjs --apply   # aplica
 * Con dotenv según ambiente (desde packages/db):
 *   npx dotenv -e ../../.env.local -- node scripts/normalize-letterset-quantity.mjs --apply
 *   npx dotenv -e ../../.env.stg   -- node scripts/normalize-letterset-quantity.mjs --apply
 * PRD queda bloqueado por el env-guard salvo intervención deliberada:
 *   LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 npx dotenv -e ../../.env.local.nube-backup \
 *     -- node scripts/normalize-letterset-quantity.mjs --apply
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

const APPLY = process.argv.includes("--apply");
assertDestructiveAllowed("normalize-letterset-quantity");

const prisma = new PrismaClient();

/** quantity objetivo por producto-set, en función de los attributes de la variante. */
const TARGETS = [
  {
    slug: "abecedario-completo",
    quantityFor: (attrs) => (attrs.language === "es" ? 27 : attrs.language === "en" ? 26 : null),
  },
  {
    slug: "pack-vocales",
    quantityFor: (attrs) => (attrs.language === "es" || attrs.language === "en" ? 5 : null),
  },
];

async function main() {
  let touched = 0;
  for (const { slug, quantityFor } of TARGETS) {
    const product = await prisma.product.findFirst({ where: { slug }, select: { id: true } });
    if (!product) {
      console.warn(`!! producto ${slug} no encontrado — se salta`);
      continue;
    }
    // TODAS las variantes del producto, activas o no (sin deletedAt en este modelo).
    const variants = await prisma.productVariant.findMany({
      where: { productId: product.id },
      select: { id: true, sku: true, isActive: true, attributes: true },
      orderBy: { sku: "asc" },
    });
    console.log(`\n== ${slug} (${variants.length} variantes)`);
    for (const v of variants) {
      const attrs = v.attributes ?? {};
      const target = quantityFor(attrs);
      if (target === null) {
        console.log(`SKIP  ${v.sku}: sin language reconocido → ${JSON.stringify(attrs)}`);
        continue;
      }
      if (attrs.quantity === target) {
        console.log(`OK    ${v.sku}: quantity=${target} ya correcto`);
        continue;
      }
      touched++;
      console.log(
        `${APPLY ? "WRITE" : "DRY "}  ${v.sku}${v.isActive ? "" : " (inactiva)"}: quantity ${attrs.quantity ?? "—"} → ${target}`,
      );
      if (APPLY) {
        await prisma.productVariant.update({
          where: { id: v.id },
          data: { attributes: { ...attrs, quantity: target } },
        });
      }
    }
  }
  console.log(`\n${APPLY ? "Aplicadas" : "Por aplicar (dry-run)"}: ${touched} variante(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

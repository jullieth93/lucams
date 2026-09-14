#!/usr/bin/env node
/*
 * normalize-variant-pack-size.mjs — normaliza photoSlots/quantity/nombre de las
 * variantes cuyo SKU termina en -N (tamaño del pack), tomando el SKU como fuente
 * de verdad. Hallazgo STG 2026-09-09 (datos editados a mano en pruebas de
 * usuario): FI-POL-75X10-10 decía "1 unidad" con photoSlots=12 y quantity=1,
 * FI-POL-75X10-1 y FI-CUAD-65-1 traían photoSlots=6, etc.
 *
 * Regla (idempotente — solo escribe si el valor difiere):
 *   - N = sufijo numérico del SKU (…-7, …-10; se ignora el sufijo -NOMAG de las
 *     gemelas Sin imán, que toman la N de su base).
 *   - photoSlots = N y quantity = N (los packs foto llevan ambos 1:1).
 *   - name: SOLO se corrige si el número del nombre contradice N (ej. "1 unidad"
 *     en la variante -10) → se reemplaza el número conservando el sustantivo del
 *     producto ("separador(es)", "unidad(es)") con su plural correcto.
 *   - Variantes cuyo SKU no termina en número (DEFAULT, tamaños, etc.) se SALTAN.
 *   - Sets de letras (letterCount) se SALTAN: su quantity lo fija el idioma
 *     (normalize-letterset-quantity.mjs), no el SKU.
 *
 * Consumidores del dato (verificados antes de escribir):
 *   - PDP (variant-selector.tsx): el stepper "Unidades" lee photoSlots/quantity
 *     de la variante → con la N corregida el rango y el precio son los reales.
 *   - Estudio: abre con N slots desde attributes.photoSlots (?variant= merge).
 *   - Carrito: photo-pack-resolve.ts resuelve la variante por photoSlots+sizeCm
 *     +magnet → la N correcta vuelve la resolución inequívoca.
 *   - variantCoverSignature ignora quantity/photoSlots → portadas intactas.
 *
 * Uso:
 *   node scripts/normalize-variant-pack-size.mjs           # dry-run (default)
 *   node scripts/normalize-variant-pack-size.mjs --apply   # aplica
 * Con dotenv según ambiente (desde packages/db):
 *   npx dotenv -e ../../.env.local -- node scripts/normalize-variant-pack-size.mjs --apply
 *   npx dotenv -e ../../.env.stg   -- node scripts/normalize-variant-pack-size.mjs --apply
 * PRD queda bloqueado por el env-guard salvo intervención deliberada.
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

const APPLY = process.argv.includes("--apply");
assertDestructiveAllowed("normalize-variant-pack-size");

const prisma = new PrismaClient();

const SKU_N = /-(?:DEFAULT-)?(\d+)(-NOMAG)?$/;
const NAME_N = /(\d+)\s+([a-záéíóú]+)/i;

/** Plural/singular español para los sustantivos del catálogo (unidad, separador, foto…). */
function withNumber(n, noun) {
  if (n === 1) return `1 ${noun.replace(/es$/, "").replace(/s$/, "")}`;
  return `${n} ${/s$/.test(noun) ? noun : noun + (/(?:[aeiou])$/.test(noun) ? "s" : "es")}`;
}

async function main() {
  const variants = await prisma.productVariant.findMany({
    where: { isActive: true, deletedAt: null, product: { isActive: true, deletedAt: null } },
    select: { id: true, sku: true, name: true, attributes: true, product: { select: { slug: true } } },
    orderBy: [{ product: { slug: "asc" } }, { sku: "asc" }],
  });

  let changed = 0;
  let skipped = 0;

  for (const v of variants) {
    const m = v.sku.match(SKU_N);
    const a = v.attributes ?? {};
    if (!m || a.letterCount != null || (a.photoSlots == null && a.quantity == null)) {
      skipped++;
      continue;
    }
    const n = Number(m[1]);

    const updates = {};
    if (a.photoSlots != null && a.photoSlots !== n) updates.photoSlots = n;
    if (a.quantity != null && a.quantity !== n) updates.quantity = n;

    // Renombrar SOLO si el número del nombre contradice la N del SKU. El número
    // del pack se busca en el segmento DESPUÉS de "·" (nunca en el tamaño
    // "7.5×10 cm"), conservando el sustantivo del producto con plural correcto.
    const countSeg = v.name.split("·").pop() ?? "";
    const nameM = countSeg.match(NAME_N);
    const rename =
      nameM && Number(nameM[1]) !== n
        ? v.name.replace(countSeg, countSeg.replace(NAME_N, () => withNumber(n, nameM[2])))
        : null;

    if (Object.keys(updates).length === 0 && !rename) {
      skipped++;
      continue;
    }

    changed++;
    console.log(
      `${APPLY ? "WRITE" : "DRY "}  ${v.product.slug} | ${v.sku} | "${v.name}" → "${rename ?? v.name}"` +
        (Object.keys(updates).length ? ` | attrs: ${JSON.stringify(updates)}` : ""),
    );

    if (APPLY) {
      await prisma.productVariant.update({
        where: { id: v.id },
        data: {
          ...(rename ? { name: rename } : {}),
          attributes: { ...a, ...updates },
        },
      });
    }
  }

  console.log(
    `\n${APPLY ? "Aplicado" : "Dry-run (sin escribir)"}: ${changed} variante(s) por normalizar, ${skipped} OK/saltadas.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

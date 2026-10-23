#!/usr/bin/env node
/*
 * frame-options-binary-20261022.mjs — reduce la paleta «Color de tarjeta» del
 * Estudio a BLANCO/NEGRO en 2 productos (decisión owner 2026-10-22):
 *
 *   - set-fotoimanes-polaroid   (Fotoimanes Polaroid Clásico)
 *   - tiras-magneticas-fotos    (Tiras Magnéticas)
 *
 * Resultado visible en el Estudio: «Sin Color» + Blanco + Negro + «Personalizado»
 * (esos dos botones son fijos del toolbar; acá solo cambian las opciones de
 * paleta). La paleta canónica completa (6 colores) sigue viva en
 * apps/web/features/personalization/frame-palette.ts y en los demás productos
 * con marcos (Cuadrados, etc.).
 *
 * Mecánica: FUSIONA el personalizationSchema (nunca reemplaza — bug 2026-09-15:
 * un replace borró frameOptions) escribiendo frameOptions: ["blanco","negro"].
 * NO toca variantes, precios ni otros productos. Idempotente (re-correr deja
 * el mismo valor).
 *
 * EXENCIÓN del env-guard (como republish-checkout-rural-copy-20261021): su caso
 * de uso ES correr contra los 3 ambientes incl. PRD — alinea el dato ya
 * desplegado con la decisión del owner. Protege con dry-run por defecto +
 * `--apply`. Allowlistado en lib/check-script-guards.mjs como PRD-deliberado.
 *
 * Uso (desde packages/db):
 *   npx dotenv -e ../../.env.local            -- node scripts/one-shot/frame-options-binary-20261022.mjs --apply
 *   npx dotenv -e ../../.env.stg              -- node scripts/one-shot/frame-options-binary-20261022.mjs --apply
 *   npx dotenv -e ../../.env.local.nube-backup -- node scripts/one-shot/frame-options-binary-20261022.mjs --apply
 */

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

// Misma paleta que apps/web/features/personalization/frame-palette.ts.
const FRAME_OPTIONS = ["blanco", "negro"];
const SLUGS = ["set-fotoimanes-polaroid", "tiras-magneticas-fotos"];

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY-RUN (sin cambios; --apply ejecuta) ===");
  let updated = 0;
  for (const slug of SLUGS) {
    const product = await prisma.product.findUnique({
      where: { slug },
      select: { id: true, name: true, personalizationSchema: true },
    });
    if (!product) {
      console.log(`⚠ Producto /${slug} no encontrado — omitido`);
      continue;
    }
    const schema =
      typeof product.personalizationSchema === "object" && product.personalizationSchema !== null
        ? product.personalizationSchema
        : {};
    const before = JSON.stringify(schema.frameOptions ?? null);
    const already =
      Array.isArray(schema.frameOptions) &&
      schema.frameOptions.length === FRAME_OPTIONS.length &&
      schema.frameOptions.every((id, i) => id === FRAME_OPTIONS[i]);
    console.log(`${already ? "~ ya estaba" : "→ actualizar"} ${product.name} (/${slug})`);
    console.log(`  ANTES   frameOptions=${before}`);
    console.log(`  DESPUÉS frameOptions=${JSON.stringify(FRAME_OPTIONS)}`);
    if (already) continue;
    if (APPLY) {
      await prisma.product.update({
        where: { id: product.id },
        // FUSIÓN, nunca replace: las demás claves del schema se conservan.
        data: { personalizationSchema: { ...schema, frameOptions: FRAME_OPTIONS } },
      });
      updated++;
    }
  }
  console.log(
    APPLY
      ? `\n✓ ${updated} productos actualizados (frameOptions = blanco/negro)`
      : `\n(dry-run) ${updated} escrituras simuladas — corre con --apply para ejecutar`,
  );
}

main()
  .catch((err) => {
    console.error("✗", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

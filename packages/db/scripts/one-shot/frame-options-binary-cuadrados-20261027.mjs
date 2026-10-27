#!/usr/bin/env node
/*
 * frame-options-binary-cuadrados-20261027.mjs — reduce la paleta «Color de
 * tarjeta» del Estudio a BLANCO/NEGRO en Fotoimanes Cuadrados (decisión owner
 * 2026-10-27), sumándolo a la reducción de Polaroid y Tiras del 2026-10-22
 * (frame-options-binary-20261022.mjs):
 *
 *   - set-fotoimanes-cuadrados   (Fotoimanes Cuadrados)
 *
 * Resultado visible en el Estudio: «Sin Color» + Blanco + Negro + «Personalizado»
 * (esos dos botones son fijos del toolbar; acá solo cambian las opciones de
 * paleta). La paleta canónica completa (6 colores) sigue viva en
 * apps/web/features/personalization/frame-palette.ts.
 *
 * También alinea la DESCRIPCIÓN pública del producto (el texto viejo prometía
 * «6 colores de marca» — regla de oro: ningún texto público promete lo que la
 * tienda no opera). Mismo copy que el seed canónico (seed-catalog-canonical.mjs).
 *
 * Mecánica: FUSIONA el personalizationSchema (nunca reemplaza — bug 2026-09-15:
 * un replace borró frameOptions) escribiendo frameOptions: ["blanco","negro"].
 * NO toca variantes, precios ni otros productos. Idempotente (re-correr deja
 * el mismo valor).
 *
 * Diseños existentes con un color pastel persistido (borderColor en el
 * canvasData) NO se migran: siguen renderizando igual en Estudio, carrito y
 * producción; en el toolbar pasan a anunciarse como «Personalizado #HEX».
 *
 * EXENCIÓN del env-guard (como frame-options-binary-20261022): su caso de uso
 * ES correr contra los 3 ambientes incl. PRD — alinea el dato ya desplegado
 * con la decisión del owner. Protege con dry-run por defecto + `--apply`.
 * Allowlistado en lib/check-script-guards.mjs como PRD-deliberado.
 *
 * Uso (desde packages/db):
 *   npx dotenv -e ../../.env.local             -- node scripts/one-shot/frame-options-binary-cuadrados-20261027.mjs --apply
 *   npx dotenv -e ../../.env.stg               -- node scripts/one-shot/frame-options-binary-cuadrados-20261027.mjs --apply
 *   npx dotenv -e ../../.env.local.nube-backup -- node scripts/one-shot/frame-options-binary-cuadrados-20261027.mjs --apply
 */

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

// Misma paleta que apps/web/features/personalization/frame-palette.ts.
const FRAME_OPTIONS = ["blanco", "negro"];
const SLUG = "set-fotoimanes-cuadrados";
// Mismo texto que seed-catalog-canonical.mjs (description de FI-CUAD-12).
const DESCRIPTION =
  "Fotoimanes cuadrados con tus fotos a sangre total (sin bordes). Si quieres, agrégale un marco de color en el Estudio: blanco, negro o el color exacto que quieras con «Personalizado». Elige el tamaño (4×4, 5×5 o 7×7 cm) y los packs: 1 pack = 6 unidades.";

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY-RUN (sin cambios; --apply ejecuta) ===");

  const product = await prisma.product.findUnique({
    where: { slug: SLUG },
    select: { id: true, name: true, description: true, personalizationSchema: true },
  });
  if (!product) {
    console.log(`⚠ Producto /${SLUG} no encontrado — omitido`);
    return;
  }

  const schema =
    typeof product.personalizationSchema === "object" && product.personalizationSchema !== null
      ? product.personalizationSchema
      : {};
  const paletteDone =
    Array.isArray(schema.frameOptions) &&
    schema.frameOptions.length === FRAME_OPTIONS.length &&
    schema.frameOptions.every((id, i) => id === FRAME_OPTIONS[i]);
  const descriptionDone = product.description === DESCRIPTION;

  console.log(`${paletteDone ? "~ paleta ya estaba" : "→ paleta por actualizar"} ${product.name} (/${SLUG})`);
  console.log(`  ANTES   frameOptions=${JSON.stringify(schema.frameOptions ?? null)}`);
  console.log(`  DESPUÉS frameOptions=${JSON.stringify(FRAME_OPTIONS)}`);
  console.log(`${descriptionDone ? "~ descripción ya estaba" : "→ descripción por actualizar"}`);
  if (!descriptionDone) {
    console.log(`  ANTES   ${JSON.stringify(product.description)}`);
    console.log(`  DESPUÉS ${JSON.stringify(DESCRIPTION)}`);
  }

  if (paletteDone && descriptionDone) return;
  if (APPLY) {
    await prisma.product.update({
      where: { id: product.id },
      // FUSIÓN, nunca replace: las demás claves del schema se conservan.
      data: {
        personalizationSchema: { ...schema, frameOptions: FRAME_OPTIONS },
        description: DESCRIPTION,
      },
    });
    console.log("\n✓ Producto actualizado (frameOptions = blanco/negro + descripción)");
  } else {
    console.log("\n(dry-run) corre con --apply para ejecutar");
  }
}

main()
  .catch((err) => {
    console.error("✗", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

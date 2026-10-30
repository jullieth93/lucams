#!/usr/bin/env node
/*
 * border-width-tiras-cuadrados-20261029.mjs — habilita el slider «Grosor del
 * borde» del Estudio (ADR-173) en los productos cuya familia lo soporta
 * (tarjeta simple = Cuadrados; tira photobooth = Tiras Magnéticas):
 *
 *   - tiras-magneticas-fotos   (Tiras Magnéticas)  — pedido owner 2026-10-29:
 *     «en Tiras no se ve la opción de grosor del borde, como sí se ve en
 *     Fotoimanes Cuadrado».
 *   - set-fotoimanes-cuadrados (Fotoimanes Cuadrados) — ya habilitado en las
 *     DBs (se activó a mano en /admin/productos la semana del 2026-10-26); se
 *     incluye para dejar el dato CANÓNICO y homologado (idempotente).
 *
 * Mecánica: FUSIONA el personalizationSchema (nunca reemplaza — bug histórico
 * 2026-09-15: un replace borró frameOptions) escribiendo
 * borderWidth {enabled, min, max, default} = {true, 1, 2.5, 1} (rango de la
 * jornada ADR-173; 1 = grosor histórico). NO toca variantes ni precios.
 *
 * El slider lo lee readBorderWidthConfig (features/personalization/schemas.ts)
 * y solo se muestra para las familias que lo consumen (isSimpleCard/isStrip en
 * studio-style-toolbar): Polaroid NO lo recibe (su marco es el formato, no un
 * borde escalar).
 *
 * Diseños existentes: sin borderWidthFactor en su canvasData → render histórico
 * intacto (retrocompat del ADR-173).
 *
 * EXENCIÓN del env-guard (mismo patrón que frame-options-binary-*): su caso de
 * uso ES correr contra los 3 ambientes incl. PRD — alinea el dato con la
 * decisión del owner. Dry-run por defecto + `--apply`. Allowlistado en
 * lib/check-script-guards.mjs como PRD-deliberado.
 *
 * Uso (desde packages/db):
 *   npx dotenv -e ../../.env.local             -- node scripts/one-shot/border-width-tiras-cuadrados-20261029.mjs --apply
 *   npx dotenv -e ../../.env.stg               -- node scripts/one-shot/border-width-tiras-cuadrados-20261029.mjs --apply
 *   npx dotenv -e ../../.env.local.nube-backup -- node scripts/one-shot/border-width-tiras-cuadrados-20261029.mjs --apply
 */

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

// Rango de la jornada ADR-173 (2026-10-26): factor sobre el grosor histórico.
const BORDER_WIDTH = { enabled: true, min: 1, max: 2.5, default: 1 };
const SLUGS = ["tiras-magneticas-fotos", "set-fotoimanes-cuadrados"];

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY-RUN (sin cambios; --apply ejecuta) ===");

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
    const current = schema.borderWidth ?? null;
    // Respeta un rango YA habilitado a mano por el admin (Cuadrados en STG/PRD
    // quedó con max 2 la semana del 2026-10-26): el one-shot solo habilita donde
    // falta; nunca pisa una configuración existente.
    const done = current?.enabled === true;

    console.log(
      `${done ? "~ ya habilitado (se conserva su rango)" : "→ por habilitar"} ${product.name} (/${slug}): borderWidth ${JSON.stringify(current)}${done ? "" : ` → ${JSON.stringify(BORDER_WIDTH)}`}`,
    );
    if (done) continue;
    if (APPLY) {
      await prisma.product.update({
        where: { id: product.id },
        // FUSIÓN, nunca replace: las demás claves del schema se conservan.
        data: { personalizationSchema: { ...schema, borderWidth: BORDER_WIDTH } },
      });
      console.log(`  ✓ actualizado`);
    }
  }

  if (!APPLY) console.log("\n(dry-run) corre con --apply para ejecutar");
}

main()
  .catch((err) => {
    console.error("✗", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

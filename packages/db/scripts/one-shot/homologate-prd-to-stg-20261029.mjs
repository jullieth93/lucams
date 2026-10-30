#!/usr/bin/env node
/*
 * homologate-prd-to-stg-20261029.mjs — homologación STG→PRD de los 3 drifts de
 * contenido detectados por la re-verificación del 2026-10-29 (diff por clave
 * natural sobre 05/06-homologacion). Decisión owner 2026-10-29: **STG manda**
 * (es donde se hicieron TODAS las pruebas; PRD tiene la transacción real, que
 * no se toca — esto es contenido/config, no operación).
 *
 *   1. Setting `LUCAMS_SHIPPING_ZONES`: PRD incluía «bosa» en Bogotá y STG no →
 *      PRD queda con la lista EXACTA de STG (14 localidades). Nueva versión
 *      publicada (historial intacto, revertible desde /admin/contenido).
 *   2. `set-fotoimanes-cuadrados` personalizationSchema.borderWidth.max: PRD
 *      2.5 → 2 (valor de STG, fusionado — nunca replace del schema).
 *   3. `DesignGalleryImage` S-128 (separadores-alargados): isActive true→false
 *      en PRD (inactiva en STG).
 *
 * Idempotente (re-correr deja el mismo estado). NO toca órdenes, customers,
 * stock ni precios.
 *
 * EXENCIÓN del env-guard: su caso de uso ES correr contra PRD (homologación
 * STG→PRD, ADR-126). Dry-run por defecto + `--apply`. Allowlistado en
 * lib/check-script-guards.mjs como PRD-deliberado.
 *
 * Uso (desde packages/db):
 *   npx dotenv -e ../../.env.local.nube-backup -- node scripts/one-shot/homologate-prd-to-stg-20261029.mjs --apply
 *
 * Tras aplicar: invalidar el caché CMS desde /admin/contenido (la setting de
 * zonas se lee con tag "cms", TTL 1 h).
 */

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

// Valor EXACTO leído de STG el 2026-10-29 (14 localidades de Bogotá, sin «bosa»).
const STG_ZONES =
  '{"11001":["chapinero","santa-fe","san-cristobal","tunjuelito","kennedy","fontibon","engativa","barrios-unidos","teusaquillo","los-martires","antonio-narino","puente-aranda","la-candelaria","rafael-uribe-uribe"]}';
const CUADRADOS_SLUG = "set-fotoimanes-cuadrados";
const STG_BORDER_WIDTH = { enabled: true, min: 1, max: 2, default: 1 };

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY-RUN (sin cambios; --apply ejecuta) ===");

  // 1. Setting LUCAMS_SHIPPING_ZONES → valor de STG (versión publicada nueva).
  const field = await prisma.cmsField.findFirst({
    where: { key: "LUCAMS_SHIPPING_ZONES", kind: "SETTING" },
    include: { publishedVersion: true },
  });
  if (!field) {
    console.log("⚠ LUCAMS_SHIPPING_ZONES no existe en este ambiente — omitida");
  } else {
    const current = field.publishedVersion?.body ?? field.body ?? "";
    if (current === STG_ZONES) {
      console.log("~ LUCAMS_SHIPPING_ZONES ya tiene el valor de STG");
    } else {
      console.log("→ LUCAMS_SHIPPING_ZONES: PRD tiene «bosa» de más; queda como STG (14 localidades)");
      if (APPLY) {
        const last = await prisma.cmsFieldVersion.findFirst({
          where: { fieldId: field.id },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        const version = await prisma.cmsFieldVersion.create({
          data: {
            fieldId: field.id,
            version: (last?.version ?? 0) + 1,
            title: field.publishedVersion?.title ?? null,
            body: STG_ZONES,
            metadata: field.publishedVersion?.metadata ?? {},
            publishedAt: new Date(),
            createdBy: "script:homologate-prd-to-stg-20261029",
          },
        });
        await prisma.cmsField.update({
          where: { id: field.id },
          data: { body: STG_ZONES, publishedVersionId: version.id, isPublished: true },
        });
        console.log(`  ✓ publicada como versión ${version.version}`);
      }
    }
  }

  // 2. Cuadrados borderWidth.max → 2 (STG), fusionado.
  const product = await prisma.product.findUnique({
    where: { slug: CUADRADOS_SLUG },
    select: { id: true, personalizationSchema: true },
  });
  if (!product) {
    console.log(`⚠ Producto /${CUADRADOS_SLUG} no encontrado — omitido`);
  } else {
    const schema =
      typeof product.personalizationSchema === "object" && product.personalizationSchema !== null
        ? product.personalizationSchema
        : {};
    const current = schema.borderWidth ?? null;
    const done =
      current?.enabled === true &&
      current?.min === STG_BORDER_WIDTH.min &&
      current?.max === STG_BORDER_WIDTH.max &&
      current?.default === STG_BORDER_WIDTH.default;
    if (done) {
      console.log("~ Cuadrados borderWidth ya es el de STG (max 2)");
    } else {
      console.log(
        `→ Cuadrados borderWidth: ${JSON.stringify(current)} → ${JSON.stringify(STG_BORDER_WIDTH)}`,
      );
      if (APPLY) {
        await prisma.product.update({
          where: { id: product.id },
          data: { personalizationSchema: { ...schema, borderWidth: STG_BORDER_WIDTH } },
        });
        console.log("  ✓ actualizado (fusionado)");
      }
    }
  }

  // 3. S-128 inactiva (como en STG).
  const img = await prisma.designGalleryImage.findFirst({
    where: { name: "S-128", tag: "separadores-alargados" },
    select: { id: true, isActive: true },
  });
  if (!img) {
    console.log("⚠ S-128 no encontrada — omitida");
  } else if (!img.isActive) {
    console.log("~ S-128 ya está inactiva");
  } else {
    console.log("→ S-128: isActive true → false (como STG)");
    if (APPLY) {
      await prisma.designGalleryImage.update({
        where: { id: img.id },
        data: { isActive: false },
      });
      console.log("  ✓ desactivada");
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

#!/usr/bin/env node
/*
 * sync-variant-magnet-attr-20261029.mjs — cierra el drift detectado por la
 * homologación STG↔PRD del 2026-10-29: la variante SEP-MAG-2X6-5 de
 * `separadores-magneticos` declara `magnet: true` en STG (referencia curada de
 * contenido) pero NO en PRD — sin el atributo, el desglose de la variante en
 * carrito/checkout/pedido no enuncia «Con imán» (describeVariantAttributes solo
 * lo emite con magnet === true).
 *
 * Mecánica: FUSIONA attributes (nunca reemplaza) escribiendo magnet: true solo
 * si la clave está ausente. Idempotente. No toca precio ni stock.
 *
 * EXENCIÓN del env-guard: su caso de uso ES correr contra PRD (sync de
 * contenido STG→PRD, ADR-126). Dry-run por defecto + `--apply`. Allowlistado
 * en lib/check-script-guards.mjs como PRD-deliberado.
 *
 * Uso (desde packages/db):
 *   npx dotenv -e ../../.env.local.nube-backup -- node scripts/one-shot/sync-variant-magnet-attr-20261029.mjs --apply
 */

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();
const SKU = "SEP-MAG-2X6-5";

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY-RUN (sin cambios; --apply ejecuta) ===");
  const variant = await prisma.productVariant.findUnique({
    where: { sku: SKU },
    select: { id: true, sku: true, attributes: true },
  });
  if (!variant) {
    console.log(`⚠ Variante ${SKU} no encontrada — omitida`);
    return;
  }
  const attrs =
    typeof variant.attributes === "object" && variant.attributes !== null
      ? variant.attributes
      : {};
  if (attrs.magnet === true) {
    console.log(`~ ${SKU} ya declara magnet: true — nada que hacer`);
    return;
  }
  console.log(`→ ${SKU}: ANTES attributes=${JSON.stringify(attrs)}`);
  console.log(`         DESPUÉS magnet: true (fusionado)`);
  if (APPLY) {
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { attributes: { ...attrs, magnet: true } },
    });
    console.log("✓ actualizada");
  } else {
    console.log("(dry-run) corre con --apply para ejecutar");
  }
}

main()
  .catch((err) => {
    console.error("✗", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

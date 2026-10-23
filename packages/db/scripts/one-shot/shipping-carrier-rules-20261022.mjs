#!/usr/bin/env node
/*
 * shipping-carrier-rules-20261022.mjs — siembra la setting SHIPPING_CARRIER_RULES
 * (global/comercio, CmsField kind SETTING) con la PRIMERA regla de peso por
 * transportadora (incidente real STG LCM-2026-0003):
 *
 *   { "transprensa": { "minWeightKg": 11, "maxWeightKg": null,
 *                      "note": "No opera envíos de menos de 11 kg" } }
 *
 * Por qué existe la regla: Aveonline NO reporta todas las restricciones del
 * carrier en la cotización — el mínimo de 11 kg de Transprensa solo se aplica
 * al generar la guía (generarGuia2). Con la regla, quoteShipping filtra la
 * oferta ANTES de mostrarla al cliente (features/checkout/service.ts) y el
 * pedido nunca queda atascado en "la guía no se pudo generar". La key es la
 * normalizada (normalizeCarrierKey: minúsculas, sin tildes ni símbolos).
 *
 * Mecánica: si el campo no existe lo crea y publica (mismo patrón que
 * sync-loyalty-settings-nomag-images-20261022: CmsField + CmsFieldVersion v1 +
 * publishedVersionId). Si YA existe, FUSIONA la regla en el JSON vigente
 * (nunca pisa reglas que el admin haya agregado desde /admin/envios).
 * Idempotente: re-correr deja el mismo valor.
 *
 * EXENCIÓN del env-guard (como frame-options-binary-20261022): su caso de uso
 * ES correr contra los 3 ambientes incl. PRD. Protege con dry-run por defecto
 * + `--apply`. Allowlistado en lib/check-script-guards.mjs como PRD-deliberado.
 *
 * OJO tras correrlo: como escribe directo en DB, el cache `cms` se invalida a
 * mano en /admin/contenido → «Actualizar caché de contenido» (o esperar el TTL).
 *
 * Uso (desde packages/db):
 *   npx dotenv -e ../../.env.local            -- node scripts/one-shot/shipping-carrier-rules-20261022.mjs --apply
 *   npx dotenv -e ../../.env.stg              -- node scripts/one-shot/shipping-carrier-rules-20261022.mjs --apply
 *   npx dotenv -e ../../.env.local.nube-backup -- node scripts/one-shot/shipping-carrier-rules-20261022.mjs --apply
 */

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

const SETTING_KEY = "SHIPPING_CARRIER_RULES";
const SEED_RULES = {
  transprensa: {
    minWeightKg: 11,
    maxWeightKg: null,
    note: "No opera envíos de menos de 11 kg",
  },
};

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY-RUN (sin cambios; --apply ejecuta) ===");

  const existing = await prisma.cmsField.findUnique({ where: { key: SETTING_KEY } });

  if (!existing) {
    console.log(`+ crear setting ${SETTING_KEY} con regla: ${JSON.stringify(SEED_RULES)}`);
    if (APPLY) {
      const section = await prisma.cmsSection.findFirst({
        where: { key: "comercio", page: { slug: "global" } },
        select: { id: true },
      });
      if (!section) throw new Error("No existe la sección global/comercio (corre migrate-cms-v2)");
      await prisma.$transaction(async (tx) => {
        const field = await tx.cmsField.create({
          data: {
            sectionId: section.id,
            key: SETTING_KEY,
            kind: "SETTING",
            label: "Reglas de peso por transportadora",
            helpText:
              'JSON por transportadora (key normalizada): { "transprensa": { "minWeightKg": 11, "maxWeightKg": null, "note": "…" } }. Las cotizaciones que violen la regla NO se ofrecen al cliente. Se gestiona desde Envíos (/admin/envios).',
            type: "TEXTAREA",
            category: "BUSINESS",
            body: JSON.stringify(SEED_RULES),
            metadata: {},
            sortOrder: 40,
            isPublished: true,
            createdBy: "system:shipping-carrier-rules-20261022",
          },
        });
        const v1 = await tx.cmsFieldVersion.create({
          data: {
            fieldId: field.id,
            version: 1,
            title: "Reglas de peso por transportadora",
            body: JSON.stringify(SEED_RULES),
            metadata: {},
            publishedAt: new Date(),
            createdBy: "system:shipping-carrier-rules-20261022",
          },
        });
        await tx.cmsField.update({
          where: { id: field.id },
          data: { publishedVersionId: v1.id },
        });
      });
      console.log("  ✓ setting creada y publicada");
    }
    return;
  }

  // Ya existe: fusionar la regla semilla sin pisar las del admin.
  let rules = {};
  try {
    rules = existing.body ? JSON.parse(existing.body) : {};
  } catch {
    console.warn(`⚠ body actual no es JSON válido (${existing.body}) — se reporta y no se toca`);
    return;
  }
  const missing = Object.keys(SEED_RULES).filter((k) => !(k in rules));
  if (missing.length === 0) {
    console.log(`~ ${SETTING_KEY} ya contiene la regla transprensa — nada que hacer`);
    return;
  }
  const merged = { ...rules };
  for (const k of missing) merged[k] = SEED_RULES[k];
  console.log(`→ fusionar regla(s) ${missing.join(", ")} en ${SETTING_KEY}`);
  console.log(`  ANTES   ${existing.body}`);
  console.log(`  DESPUÉS ${JSON.stringify(merged)}`);
  if (APPLY) {
    await prisma.$transaction(async (tx) => {
      const nextVersion = (await tx.cmsFieldVersion.count({ where: { fieldId: existing.id } })) + 1;
      const v = await tx.cmsFieldVersion.create({
        data: {
          fieldId: existing.id,
          version: nextVersion,
          title: existing.label,
          body: JSON.stringify(merged),
          metadata: existing.metadata ?? {},
          publishedAt: new Date(),
          createdBy: "system:shipping-carrier-rules-20261022",
        },
      });
      await tx.cmsField.update({
        where: { id: existing.id },
        data: { body: JSON.stringify(merged), isPublished: true, publishedVersionId: v.id },
      });
    });
    console.log("  ✓ regla fusionada y publicada");
  }
}

main()
  .catch((err) => {
    console.error("✗", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

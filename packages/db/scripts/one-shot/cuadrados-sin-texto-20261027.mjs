#!/usr/bin/env node
/*
 * cuadrados-sin-texto-20261027.mjs — la plantilla de Fotoimanes Cuadrados
 * (`cuadrados-foto-y-texto`) deja de traer capa de texto editable (decisión
 * owner 2026-10-27: un diseño cuadrado NO lleva texto).
 *
 * Contexto: el producto tiene allowText=false (el lienzo y producción nunca
 * dibujan el texto), pero la plantilla traía una capa `free_text` editable que
 * habilitaba la pestaña «Texto» de «Ajustar foto» y la pista «toca el texto» —
 * inconsistencia visible. El seed canónico (seed-templates.mjs) ya la declara
 * sin texto (blankCanvas includeText:false); este one-shot alinea las DBs
 * existentes (LOCAL/STG/PRD), donde el env-guard bloquea re-correr el seed.
 *
 * Mecánica (quirúrgica, NUNCA replace ciego):
 *   - Elimina las capas `type:"text"` del canvasData de la plantilla.
 *   - Si la foto (`p1`) conserva la geometría "con texto" (alto = stageH-140),
 *     la restaura a la geometría sin texto (alto = stageH-80, margen 40).
 *   - NO toca otros campos de la plantilla (nombre, previewUrl, estados admin).
 *
 * Los DISEÑOS existentes conservan su snapshot con la capa: queda inerte en
 * todas las superficies (render del lienzo, producción, pestaña Texto y pista
 * ya están gateados por allowText en código).
 *
 * Idempotente (re-correr informa "ya estaba"). Dry-run por defecto; `--apply`
 * ejecuta.
 *
 * EXENCIÓN del env-guard (como frame-options-binary-20261022): su caso de uso
 * ES correr contra los 3 ambientes incl. PRD — alinea el dato ya desplegado
 * con la decisión del owner. Allowlistado en lib/check-script-guards.mjs como
 * PRD-deliberado.
 *
 * Uso (desde packages/db):
 *   npx dotenv -e ../../.env.local             -- node scripts/one-shot/cuadrados-sin-texto-20261027.mjs --apply
 *   npx dotenv -e ../../.env.stg               -- node scripts/one-shot/cuadrados-sin-texto-20261027.mjs --apply
 *   npx dotenv -e ../../.env.local.nube-backup -- node scripts/one-shot/cuadrados-sin-texto-20261027.mjs --apply
 */

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

const TEMPLATE_SLUG = "cuadrados-foto-y-texto";
const PHOTO_MARGIN = 40; // blankCanvas: x/y = 40, alto sin texto = stageH - 80

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY-RUN (sin cambios; --apply ejecuta) ===");

  const tpl = await prisma.personalizationTemplate.findUnique({
    where: { slug: TEMPLATE_SLUG },
    select: { id: true, name: true, canvasData: true },
  });
  if (!tpl) {
    console.log(`⚠ Plantilla /${TEMPLATE_SLUG} no encontrada — omitida`);
    return;
  }

  const canvas =
    typeof tpl.canvasData === "object" && tpl.canvasData !== null ? tpl.canvasData : null;
  const layers = Array.isArray(canvas?.layers) ? canvas.layers : [];
  const stageH = canvas?.stage?.height ?? 600;
  const textLayers = layers.filter((l) => l?.type === "text");
  const photo = layers.find((l) => l?.type === "image-placeholder");
  const photoNeedsGeometry = photo && photo.height === stageH - 140; // geometría "con texto"

  if (textLayers.length === 0 && !photoNeedsGeometry) {
    console.log(`~ ya estaba ${tpl.name} (/${TEMPLATE_SLUG}) — sin capas de texto`);
    return;
  }

  console.log(`→ actualizar ${tpl.name} (/${TEMPLATE_SLUG})`);
  console.log(`  ANTES   capas de texto=${textLayers.map((l) => l.id).join(", ") || "ninguna"}`);
  console.log(
    `  DESPUÉS sin capas de texto${photoNeedsGeometry ? " + foto restaurada a margen uniforme" : ""}`,
  );

  if (APPLY) {
    const nextLayers = layers
      .filter((l) => l?.type !== "text")
      .map((l) =>
        l?.type === "image-placeholder" && l.height === stageH - 140
          ? { ...l, y: PHOTO_MARGIN, height: stageH - 2 * PHOTO_MARGIN }
          : l,
      );
    await prisma.personalizationTemplate.update({
      where: { id: tpl.id },
      data: { canvasData: { ...canvas, layers: nextLayers } },
    });
    console.log("\n✓ Plantilla actualizada (sin capa de texto)");
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

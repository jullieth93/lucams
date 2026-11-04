#!/usr/bin/env node
/*
 * tiras-nuevas-medidas-20261103.mjs — Tiras Magnéticas a sus medidas reales
 * VIGENTES (owner 2026-11-03):
 *
 *   - Tira de 3 fotos: 6.5×20 cm   → 5×15 cm   (celda 5×5 exacta, aspect 1:1)
 *   - Tira de 4 fotos: 6.5×26.5 cm → 5×16.5 cm (celda 5×4.125, aspect 1.2121)
 *
 * La tira de 4 queda con celda APAISADA (5×4.125 cm, aspect 1.2121): su
 * aspectRatio pasa de "1:1" a "5:4.125" — con "1:1" la celda física (1.2121)
 * superaría la tolerancia 0.05 del ruteo de plantillas y del chequeo 3b de
 * audit-storefront-consistency.mjs, y el 3D/WYSIWYG mentiría (lección
 * permanente del bug 2026-09-15: el aspect declara la CELDA FÍSICA).
 *
 * Qué actualiza (idempotente, FUSIONA JSON — nunca reemplaza schemas):
 *   1. Product.personalizationSchema.sizeCm → "5×15" (default = tira de 3).
 *   2. Variantes del producto: name y attributes.sizeCm con las medidas
 *      nuevas; aspectRatio por composición (3 fotos → "1:1", 4 → "5:4.125").
 *      Cubre cualquier variante gemela (-NOMAG) si existe.
 *   3. Plantillas photo-strip-3-fotos / photo-strip-4-fotos: nombre + canvasData
 *      al canónico de seed-templates.mjs (stage 400×400 y 400×330 a 80 px/cm,
 *      margen lateral 16px ≈ 2mm). El canvasData se ALINEA completo (mismo
 *      contrato que el upsert del seed) — es punto de partida de diseños
 *      NUEVOS; los diseños/pedidos existentes conservan su snapshot (se
 *      vendieron y producen con la medida vieja, como en el cambio 5×15→6.5×20
 *      del 2026-07-22).
 *   4. Copy: description/shortDescription/seoDescription del producto y
 *      richDescription/useCase de la categoría (reemplazo de las cadenas de
 *      medida viejas donde aparezcan).
 *   5. physicalSpecs del producto: reemplaza las medidas viejas en textos
 *      visibles (includes[], careInstructions) y ajusta widthCm/heightCm del
 *      empaque si calzan con la pieza vieja (7×20 → 6×17, margen ~0.5 cm; la
 *      tira de 4 con 16.5 cm sigue cabiendo). weightGrams NO se toca (queda
 *      conservador; la owner confirma el gramaje real del material nuevo).
 *      Solo reporta attributes._shipping de variantes si existe.
 *   6. SOLO REPORTA: ocurrencias de las medidas viejas en CmsField.body (el
 *      CMS se republica con historial vía su propio patrón).
 *
 * EXENCIÓN del env-guard (mismo patrón que frame-options-binary-*): su caso de
 * uso ES correr contra los 3 ambientes incl. PRD — alinea el dato con la
 * decisión del owner. Dry-run por defecto + `--apply`. Allowlistado en
 * lib/check-script-guards.mjs como PRD-deliberado.
 *
 * Uso (desde packages/db):
 *   npx dotenv -e ../../.env.local             -- node scripts/one-shot/tiras-nuevas-medidas-20261103.mjs --apply
 *   npx dotenv -e ../../.env.stg               -- node scripts/one-shot/tiras-nuevas-medidas-20261103.mjs --apply
 *   npx dotenv -e ../../.env.local.nube-backup -- node scripts/one-shot/tiras-nuevas-medidas-20261103.mjs --apply
 */

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

const PRODUCT_SLUG = "tiras-magneticas-fotos";
const OLD_SIZES = ["6.5×20", "6.5×26.5"];
const NEW_SIZE = { "6.5×20": "5×15", "6.5×26.5": "5×16.5" };

/** Reemplaza las medidas viejas en un texto; null si no hubo cambio. */
function replaceSizes(text) {
  if (typeof text !== "string") return null;
  let out = text;
  for (const [oldSize, newSize] of Object.entries(NEW_SIZE)) {
    out = out.split(oldSize).join(newSize);
  }
  return out === text ? null : out;
}

/** canvasData canónico de una celda de tira (espejo de seed-templates.mjs). */
function stripTemplateCanvas({ photoSlots, stageWidth, stageHeight }) {
  return {
    version: 1,
    photoSlots,
    stage: { width: stageWidth, height: stageHeight, dpiPreview: 90, dpiProduction: 300 },
    gridCols: 1,
    gridGap: 0,
    layers: [
      { id: "background", type: "background", color: "#FFFFFF" },
      { id: "card", type: "frame-card", fill: "#FFFFFF", cornerRadius: 0 },
      {
        id: "photo",
        type: "image-placeholder",
        x: 16,
        y: 0,
        width: stageWidth - 32,
        height: stageHeight,
        cornerRadius: 0,
        rotation: 0,
        label: "Foto de la tira",
      },
    ],
  };
}

const TEMPLATES = [
  {
    slug: "photo-strip-3-fotos",
    name: "Tira 3 fotos (5×15 cm)",
    canvasData: stripTemplateCanvas({ photoSlots: 3, stageWidth: 400, stageHeight: 400 }),
  },
  {
    slug: "photo-strip-4-fotos",
    name: "Tira 4 fotos (5×16.5 cm)",
    canvasData: stripTemplateCanvas({ photoSlots: 4, stageWidth: 400, stageHeight: 330 }),
  },
];

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY-RUN (sin cambios; --apply ejecuta) ===\n");

  const product = await prisma.product.findUnique({
    where: { slug: PRODUCT_SLUG },
    include: { variants: { where: { deletedAt: null } }, category: true },
  });
  if (!product) {
    console.log(`⚠ Producto /${PRODUCT_SLUG} no encontrado — nada que hacer`);
    return;
  }
  console.log(`Producto: ${product.name} (/${PRODUCT_SLUG})\n`);

  // ── 1. Schema del producto (FUSIÓN, nunca replace — bug histórico 2026-09-15) ──
  const schema =
    typeof product.personalizationSchema === "object" && product.personalizationSchema !== null
      ? product.personalizationSchema
      : {};
  if (schema.sizeCm !== "5×15") {
    console.log(`→ schema.sizeCm: ${JSON.stringify(schema.sizeCm)} → "5×15"`);
    if (APPLY) {
      await prisma.product.update({
        where: { id: product.id },
        data: { personalizationSchema: { ...schema, sizeCm: "5×15" } },
      });
    }
  } else {
    console.log(`~ schema.sizeCm ya es "5×15"`);
  }

  // ── 2. Variantes (incluye gemelas -NOMAG si existen) ──
  for (const v of product.variants) {
    const attrs = typeof v.attributes === "object" && v.attributes !== null ? v.attributes : {};
    const newAttrs = { ...attrs };
    const newName = replaceSizes(v.name) ?? v.name;
    let changed = newName !== v.name;

    if (typeof attrs.sizeCm === "string" && NEW_SIZE[attrs.sizeCm]) {
      newAttrs.sizeCm = NEW_SIZE[attrs.sizeCm];
      changed = true;
    }
    // Aspect de la CELDA FÍSICA por composición (tolerancia 0.05 del ruteo).
    const slots = Number(attrs.photoSlots);
    const wantAspect = slots >= 4 ? "5:4.125" : slots === 3 ? "1:1" : null;
    if (wantAspect && attrs.aspectRatio !== wantAspect) {
      newAttrs.aspectRatio = wantAspect;
      changed = true;
    }
    if (attrs._shipping) {
      console.log(
        `  ℹ ${v.sku}: _shipping ${JSON.stringify(attrs._shipping)} — SOLO REPORTE (dims del empaque; ajuste manual si aplica)`,
      );
    }
    if (!changed) {
      console.log(`~ ${v.sku}: "${v.name}" ya al día`);
      continue;
    }
    console.log(
      `→ ${v.sku}: "${v.name}" → "${newName}" | sizeCm ${attrs.sizeCm} → ${newAttrs.sizeCm} | aspectRatio ${attrs.aspectRatio} → ${newAttrs.aspectRatio}`,
    );
    if (APPLY) {
      await prisma.productVariant.update({
        where: { id: v.id },
        data: { name: newName, attributes: newAttrs },
      });
    }
  }

  // ── 3. Plantillas (nombre + canvasData canónico del seed) ──
  for (const tpl of TEMPLATES) {
    const existing = await prisma.personalizationTemplate.findUnique({
      where: { slug: tpl.slug },
    });
    if (!existing) {
      console.log(`⚠ Plantilla ${tpl.slug} no existe — la crea seed-templates.mjs`);
      continue;
    }
    // jsonb reordena las llaves → comparación SEMÁNTICA, no JSON.stringify.
    const cd = existing.canvasData ?? {};
    const photo = cd.layers?.find((l) => l.type === "image-placeholder") ?? {};
    const want = tpl.canvasData;
    const wantPhoto = want.layers.find((l) => l.type === "image-placeholder");
    const sameData =
      cd.photoSlots === want.photoSlots &&
      cd.gridCols === want.gridCols &&
      cd.gridGap === want.gridGap &&
      cd.stage?.width === want.stage.width &&
      cd.stage?.height === want.stage.height &&
      cd.layers?.length === want.layers.length &&
      photo.x === wantPhoto.x &&
      photo.y === wantPhoto.y &&
      photo.width === wantPhoto.width &&
      photo.height === wantPhoto.height;
    if (existing.name === tpl.name && sameData) {
      console.log(`~ plantilla ${tpl.slug} ya al día`);
      continue;
    }
    console.log(
      `→ plantilla ${tpl.slug}: "${existing.name}" → "${tpl.name}" | stage ${existing.canvasData?.stage?.width}×${existing.canvasData?.stage?.height} → ${tpl.canvasData.stage.width}×${tpl.canvasData.stage.height}`,
    );
    if (APPLY) {
      await prisma.personalizationTemplate.update({
        where: { id: existing.id },
        data: { name: tpl.name, canvasData: tpl.canvasData },
      });
    }
  }

  // ── 4. Copy del producto y de la categoría ──
  for (const field of ["description", "shortDescription", "seoDescription"]) {
    const next = replaceSizes(product[field]);
    if (!next) continue;
    console.log(`→ product.${field}: medidas viejas reemplazadas`);
    if (APPLY) {
      await prisma.product.update({ where: { id: product.id }, data: { [field]: next } });
    }
  }
  if (product.category) {
    for (const field of ["richDescription", "useCase"]) {
      const next = replaceSizes(product.category[field]);
      if (!next) continue;
      console.log(`→ category ${product.category.slug}.${field}: medidas viejas reemplazadas`);
      if (APPLY) {
        await prisma.category.update({
          where: { id: product.category.id },
          data: { [field]: next },
        });
      }
    }
  }

  // ── 5. physicalSpecs (textos visibles + dims del empaque que calzan con la pieza) ──
  if (product.physicalSpecs && typeof product.physicalSpecs === "object") {
    const specs = structuredClone(product.physicalSpecs);
    let specsChanged = false;
    if (Array.isArray(specs.includes)) {
      const next = specs.includes.map((item) =>
        typeof item === "string" ? (replaceSizes(item) ?? item) : item,
      );
      if (JSON.stringify(next) !== JSON.stringify(specs.includes)) {
        specs.includes = next;
        specsChanged = true;
      }
    }
    if (typeof specs.careInstructions === "string") {
      const next = replaceSizes(specs.careInstructions);
      if (next) {
        specs.careInstructions = next;
        specsChanged = true;
      }
    }
    // Empaque: 7×20 calzaba la pieza 6.5×20 con ~0.5 cm de margen. La pieza
    // nueva más larga es 5×16.5 → 6×17 conserva el mismo margen.
    if (specs.widthCm === 7 && specs.heightCm === 20) {
      specs.widthCm = 6;
      specs.heightCm = 17;
      specsChanged = true;
    }
    if (specsChanged) {
      console.log(
        `→ product.physicalSpecs: ${JSON.stringify(product.physicalSpecs)} → ${JSON.stringify(specs)}`,
      );
      console.log(`  (weightGrams ${specs.weightGrams} se CONSERVA — confirmar gramaje real)`);
      if (APPLY) {
        await prisma.product.update({
          where: { id: product.id },
          data: { physicalSpecs: specs },
        });
      }
    } else {
      console.log(`~ product.physicalSpecs sin medidas viejas`);
    }
  }

  // ── 6. SOLO REPORTE: CMS ──
  const cmsHits = await prisma.cmsField.findMany({
    where: {
      deletedAt: null,
      OR: OLD_SIZES.map((s) => ({ body: { contains: s } })),
    },
    select: { key: true },
  });
  for (const hit of cmsHits) {
    console.log(
      `  ℹ CMS ${hit.key} menciona una medida vieja — SOLO REPORTE (repúblicar con historial si aplica)`,
    );
  }

  console.log(APPLY ? "\n✓ Listo." : "\n(dry-run) corre con --apply para ejecutar");
}

main()
  .catch((err) => {
    console.error("✗", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/*
 * apply-tira-template-2026-07-22.mjs — Ola 4B (Lucy 2026-07-22).
 *
 * Aplica QUIRÚRGICAMENTE el rediseño de la plantilla `photo-strip-3-fotos` (Tira
 * Magnética 6.5×20) a la DB compartida, SIN correr seed-templates.mjs completo
 * (su lógica de soft-delete archivaría `foto-rectangular-simple` — riesgo
 * preexistente documentado en docs/STATE.md).
 *
 * Rediseño (misma definición exacta que seed-templates.mjs, Ola 3c):
 *   - UNA sola plantilla ("Clásica"), SIN texto.
 *   - Celda 390×400 = 1/3 exacto de la tira 6.5×20 cm (6.5×6.667 por celda).
 *   - Capa frame-card: el fondo de la tira toma canvasData.borderColor (el color
 *     elegido en el Estudio; blanco por defecto) — "el color llega al fin del papel".
 *   - Foto casi a sangre (x6 y6, 378×388): margen fino uniforme ~1 mm físico.
 *   - gridCols:1 + gridGap:0 → las 3 celdas se apilan pegadas = tira continua.
 *   - previewUrl: /templates/tira-clasica.svg (mockup nuevo en apps/web/public).
 *
 * Idempotente (upsert por slug). Transaccional. No toca NINGUNA otra plantilla.
 * Incluye verificación post-ejecución (SELECT fresco + asserts) y comprobación
 * del ruteo por aspect (|aspect_celda − aspect_variante| ≤ 0.05).
 *
 * Uso: pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/apply-tira-template-2026-07-22.mjs
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

const PRODUCT_SLUG = "tiras-magneticas-fotos";
const TEMPLATE_SLUG = "photo-strip-3-fotos";

// Definición EXACTA del rediseño (espejo de seed-templates.mjs → photo-strip-3-fotos).
const TEMPLATE = {
  kind: "PHOTO_PACK",
  name: "Clásica",
  order: 1,
  previewUrl: "/templates/tira-clasica.svg",
  canvasData: {
    version: 1,
    stage: { width: 390, height: 400, dpiPreview: 90, dpiProduction: 300 },
    gridCols: 1, // apilar las 3 fotos en vertical (la tira física es 1 columna)
    gridGap: 0, // celdas pegadas → la tira se lee como UNA pieza continua
    layers: [
      { id: "background", type: "background", color: "#FFFFFF" },
      // Fondo de la tira = color elegido en el Estudio (blanco por defecto).
      { id: "card", type: "frame-card", fill: "#FFFFFF", cornerRadius: 0 },
      // Foto casi a sangre: margen fino uniforme de color (~1.5% del ancho).
      {
        id: "photo",
        type: "image-placeholder",
        x: 6,
        y: 6,
        width: 378,
        height: 388,
        cornerRadius: 0,
        rotation: 0,
        label: "Foto de la tira",
      },
    ],
  },
};

function assert(cond, msg) {
  if (!cond) throw new Error(`VERIFICACIÓN FALLÓ: ${msg}`);
}

async function main() {
  const result = await prisma.$transaction(
    async (tx) => {
      const product = await tx.product.findFirst({
        where: { slug: PRODUCT_SLUG, deletedAt: null },
        select: { id: true, slug: true, personalizationSchema: true },
      });
      if (!product) throw new Error(`Producto '${PRODUCT_SLUG}' no encontrado`);

      const before = await tx.personalizationTemplate.findUnique({
        where: { slug: TEMPLATE_SLUG },
        select: { id: true, name: true, isActive: true, deletedAt: true, canvasData: true },
      });

      const template = await tx.personalizationTemplate.upsert({
        where: { slug: TEMPLATE_SLUG },
        update: {
          kind: TEMPLATE.kind,
          name: TEMPLATE.name,
          product: { connect: { id: product.id } },
          previewUrl: TEMPLATE.previewUrl,
          canvasData: TEMPLATE.canvasData,
          order: TEMPLATE.order,
          isActive: true,
          deletedAt: null,
          deletedBy: null,
        },
        create: {
          slug: TEMPLATE_SLUG,
          kind: TEMPLATE.kind,
          name: TEMPLATE.name,
          product: { connect: { id: product.id } },
          previewUrl: TEMPLATE.previewUrl,
          canvasData: TEMPLATE.canvasData,
          order: TEMPLATE.order,
          isActive: true,
        },
        select: { id: true, slug: true },
      });

      return { product, before, template, action: before ? "actualizada" : "creada" };
    },
    { timeout: 60000, maxWait: 15000 },
  );

  console.log(`✓ Plantilla ${TEMPLATE_SLUG} ${result.action} (id: ${result.template.id})`);
  if (result.before) {
    console.log(
      `  antes: name="${result.before.name}" isActive=${result.before.isActive} deletedAt=${result.before.deletedAt}`,
    );
  }

  // ── Verificación post-ejecución (SELECT fresco, fuera de la transacción) ──
  const check = await prisma.personalizationTemplate.findUnique({
    where: { slug: TEMPLATE_SLUG },
    select: {
      slug: true,
      name: true,
      kind: true,
      isActive: true,
      deletedAt: true,
      order: true,
      previewUrl: true,
      productId: true,
      canvasData: true,
    },
  });
  assert(check, "la plantilla no existe tras el upsert");
  const cd = check.canvasData;
  assert(check.name === "Clásica", `name esperado "Clásica", recibido "${check.name}"`);
  assert(check.isActive === true, "isActive !== true");
  assert(check.deletedAt === null, "deletedAt !== null");
  assert(check.productId === result.product.id, "productId no apunta a tiras-magneticas-fotos");
  assert(cd?.gridCols === 1, "canvasData.gridCols !== 1");
  assert(cd?.gridGap === 0, "canvasData.gridGap !== 0");
  assert(cd?.stage?.width === 390 && cd?.stage?.height === 400, "stage ≠ 390×400");
  assert(
    Array.isArray(cd?.layers) && cd.layers.some((l) => l.type === "frame-card"),
    "falta la capa frame-card",
  );
  assert(
    cd.layers.some((l) => l.type === "image-placeholder" && l.width === 378 && l.height === 388),
    "falta el image-placeholder 378×388",
  );
  assert(!cd.layers.some((l) => l.type === "text"), "la tira NO debe tener capas de texto");

  console.log("✓ SELECT post-ejecución verificado:");
  console.log(
    JSON.stringify(
      {
        slug: check.slug,
        name: check.name,
        kind: check.kind,
        isActive: check.isActive,
        deletedAt: check.deletedAt,
        order: check.order,
        previewUrl: check.previewUrl,
        productId: check.productId,
        stage: cd.stage,
        gridCols: cd.gridCols,
        gridGap: cd.gridGap,
        layers: cd.layers.map((l) => l.type),
      },
      null,
      2,
    ),
  );

  // ── Comprobación de ruteo (filtro de aspect del Estudio: |a − target| ≤ 0.05) ──
  const schema = result.product.personalizationSchema ?? {};
  const m =
    typeof schema.aspectRatio === "string" &&
    schema.aspectRatio.match(/^(\d+(?:\.\d+)?)\s*[:×x]\s*(\d+(?:\.\d+)?)$/i);
  const target = m ? parseFloat(m[1]) / parseFloat(m[2]) : null;
  const cellAspect = 390 / 400;
  if (target === null) {
    console.log(
      `⚠ aspectRatio de la variante/producto no parseable (${schema.aspectRatio}) — la red de seguridad productId muestra la plantilla igual.`,
    );
  } else {
    const delta = Math.abs(cellAspect - target);
    console.log(
      `✓ Ruteo: aspect celda ${cellAspect.toFixed(3)} vs aspect producto ${target.toFixed(3)} (Δ=${delta.toFixed(3)} ${delta <= 0.05 ? "≤ 0.05 → RUTEA" : "> 0.05 → red de seguridad productId"})`,
    );
  }
  console.log("Filas tocadas: 1 plantilla (upsert). Ninguna otra plantilla/producto modificada.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/*
 * Tiras Magnéticas → tamaño real 6.5×20 cm (Lucy 2026-07-22; antes 5×15).
 *
 * Actualiza producto + variante ÚNICA (FI-TIRA-01-DEFAULT):
 *   - description: 5×15 → 6.5×20.
 *   - personalizationSchema.sizeCm: "6.5×20". aspectRatio se MANTIENE "1:1":
 *     es el aspect de CADA celda de foto (3 celdas cuadradas 6.5×6.5 apiladas
 *     en 1 columna = tira 6.5×19.5 ≈ 6.5×20), y es la clave del ruteo de
 *     plantillas del Estudio (filtro |aspect−target| ≤ 0.05 sobre el stage).
 *     La plantilla photo-strip-3-fotos (stage 500×500, gridCols=1) sigue
 *     ruteando igual → SIN cambios de plantilla.
 *   - physicalSpecs: widthCm 6.5, heightCm 20, includes y weightGrams acordes
 *     (25 g para 75 cm² → 43 g para 130 cm², proporcional al área).
 *   - variant: name "6.5×20 cm · 3 fotos", attributes.sizeCm "6.5×20"
 *     (aspectRatio "1:1" por celda intacto). Precio/stock sin tocar.
 *
 * Idempotente (update plano por slug/SKU; re-run no cambia nada). Transaccional.
 * Uso: pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/tiras-magneticas-6-5x20-2026-07-22.mjs
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

const SLUG = "tiras-magneticas-fotos";
const VARIANT_SKU = "FI-TIRA-01-DEFAULT";
const OLD_SIZE = "5×15";
const NEW_SIZE = "6.5×20";

async function main() {
  const result = await prisma.$transaction(
    async (tx) => {
      const product = await tx.product.findFirst({
        where: { slug: SLUG, deletedAt: null },
        select: { id: true, description: true, personalizationSchema: true, physicalSpecs: true },
      });
      if (!product) throw new Error(`Producto '${SLUG}' no encontrado`);

      const schema = /** @type {Record<string, unknown>} */ (product.personalizationSchema ?? {});
      const specs = /** @type {Record<string, unknown>} */ (product.physicalSpecs ?? {});
      const description = product.description.replaceAll(OLD_SIZE, NEW_SIZE);

      const updated = await tx.product.update({
        where: { id: product.id },
        data: {
          description,
          personalizationSchema: { ...schema, sizeCm: NEW_SIZE },
          physicalSpecs: {
            ...specs,
            widthCm: 6.5,
            heightCm: 20,
            weightGrams: 43, // 25 g × (130 cm² / 75 cm²) ≈ 43 g
            includes: [`1 tira magnética ${NEW_SIZE} cm con 3 fotos`],
          },
        },
        select: { slug: true, description: true, personalizationSchema: true, physicalSpecs: true },
      });

      const variant = await tx.productVariant.findUnique({ where: { sku: VARIANT_SKU } });
      if (!variant) throw new Error(`Variante '${VARIANT_SKU}' no encontrada`);
      const attrs = /** @type {Record<string, unknown>} */ (variant.attributes ?? {});
      const updatedVariant = await tx.productVariant.update({
        where: { sku: VARIANT_SKU },
        data: {
          name: `${NEW_SIZE} cm · 3 fotos`,
          attributes: { ...attrs, sizeCm: NEW_SIZE },
        },
        select: { sku: true, name: true, attributes: true, price: true, isActive: true },
      });

      // Reporte de la plantilla (verificación de ruteo, sin tocarla).
      const tpl = await tx.personalizationTemplate.findFirst({
        where: { slug: "photo-strip-3-fotos" },
        select: { slug: true, isActive: true, canvasData: true },
      });
      return { updated, updatedVariant, tpl };
    },
    { timeout: 60000, maxWait: 15000 },
  );

  console.log("✓ producto:", result.updated.slug);
  console.log("  description:", result.updated.description);
  console.log("  schema:", JSON.stringify(result.updated.personalizationSchema));
  console.log("  specs:", JSON.stringify(result.updated.physicalSpecs));
  console.log("✓ variante:", result.updatedVariant.sku, "—", result.updatedVariant.name);
  console.log("  attributes:", JSON.stringify(result.updatedVariant.attributes));
  const stage = /** @type {any} */ (result.tpl?.canvasData)?.stage;
  console.log(
    `✓ plantilla ${result.tpl?.slug}: activa=${result.tpl?.isActive} stage=${stage?.width}×${stage?.height} (aspect ${stage ? stage.width / stage.height : "?"} = 1:1 por celda → ruteo intacto)`,
  );
  console.log("\n✓ DONE.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

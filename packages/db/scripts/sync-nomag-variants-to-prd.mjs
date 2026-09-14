/*
 * sync-nomag-variants-to-prd.mjs — lleva las gemelas "-NOMAG" de STG (validadas)
 * a PRD (decisión Lucy 2026-09-14: "las pruebas las hemos hecho en STG, entonces
 * sí iguala").
 *
 * Por qué NO se usa seed-magnet-variants.mjs para esto: ese seed crea las
 * gemelas con precio PLACEHOLDER (= precio Con imán); en STG Lucy ya ajustó el
 * precio real de cada opción Sin imán, así que la fuente correcta es STG tal cual.
 *
 * Qué hace:
 *   - Lee de STG TODAS las variantes sku LIKE '%-NOMAG' (precio, stock,
 *     attributes, isActive, deletedAt).
 *   - Crea en PRD las que FALTEN (por sku), mapeando el producto por slug y
 *     tomando las imágenes de la variante base PRD (sku con sufijo -MAG — las
 *     gemelas comparten portada por diseño: variantCoverSignature ignora magnet;
 *     las URLs de storage de STG no servirían en PRD).
 *   - Las que ya existen en PRD se reportan y NO se tocan (idempotente).
 *
 * Uso (el env-guard bloquea PRD como destino; esto es escritura deliberada en PRD):
 *   cd packages/db && LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 npx dotenv -e ../../.env.local.nube-backup -- node scripts/sync-nomag-variants-to-prd.mjs          # dry-run
 *   cd packages/db && LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 npx dotenv -e ../../.env.local.nube-backup -- node scripts/sync-nomag-variants-to-prd.mjs --apply
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

assertDestructiveAllowed("sync-nomag-variants-to-prd.mjs");

const APPLY = process.argv.includes("--apply");
const STG_ENV = new URL("../../../.env.stg", import.meta.url).pathname;
const PRD_ENV = new URL("../../../.env.local.nube-backup", import.meta.url).pathname;

function loadEnvFile(path) {
  const out = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    if (!/^[A-Z0-9_]+$/.test(key)) continue;
    let val = line.slice(idx + 1).trim();
    if (val.startsWith('"') || val.startsWith("'")) {
      const q = val[0];
      const end = val.indexOf(q, 1);
      val = end > 0 ? val.slice(1, end) : val.slice(1);
    }
    out[key] = val;
  }
  return out;
}

const stg = new PrismaClient({ datasources: { db: { url: loadEnvFile(STG_ENV).DIRECT_URL } } });
const prd = new PrismaClient(); // DIRECT_URL/DATABASE_URL del env del caller (PRD)

async function main() {
  const stgNomag = await stg.productVariant.findMany({
    where: { sku: { endsWith: "-NOMAG" } },
    select: {
      sku: true,
      name: true,
      price: true,
      stock: true,
      attributes: true,
      isActive: true,
      deletedAt: true,
      product: { select: { slug: true } },
    },
    orderBy: { sku: "asc" },
  });

  const prdProducts = await prd.product.findMany({ select: { id: true, slug: true } });
  const prodBySlug = new Map(prdProducts.map((p) => [p.slug, p.id]));
  const prdVariants = await prd.productVariant.findMany({
    select: { sku: true, images: true },
  });
  const prdSkuSet = new Set(prdVariants.map((v) => v.sku));
  const imagesBySku = new Map(prdVariants.map((v) => [v.sku, v.images]));

  const missing = [];
  const alreadyThere = [];
  for (const v of stgNomag) {
    if (prdSkuSet.has(v.sku)) alreadyThere.push(v.sku);
    else missing.push(v);
  }

  console.log(`\n=== sync-nomag-variants-to-prd (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
  console.log(`STG gemelas NOMAG: ${stgNomag.length} · ya en PRD: ${alreadyThere.length} · a crear: ${missing.length}`);
  for (const v of missing) {
    const baseSku = v.sku.replace(/-NOMAG$/, "-MAG");
    const baseImages = imagesBySku.get(baseSku) ?? [];
    console.log(
      `  + ${v.sku} · ${v.product.slug} · $${v.price} · stock ${v.stock} · ` +
        `${v.isActive ? "activa" : "inactiva"}${v.deletedAt ? "+archivada" : ""} · imgs=${baseImages.length} (de ${baseSku})`,
    );
  }
  if (missing.length === 0) {
    console.log("\nNada que sincronizar (idempotente ✓).");
    return;
  }

  if (!APPLY) {
    console.log("\nDRY-RUN (sin cambios). Para ejecutar: … --apply");
    return;
  }

  const result = await prd.$transaction(
    async (tx) => {
      let created = 0;
      for (const v of missing) {
        const productId = prodBySlug.get(v.product.slug);
        if (!productId) throw new Error(`Producto ${v.product.slug} no existe en PRD — abortando.`);
        const baseSku = v.sku.replace(/-NOMAG$/, "-MAG");
        const images = imagesBySku.get(baseSku) ?? [];
        await tx.productVariant.create({
          data: {
            productId,
            sku: v.sku,
            name: v.name,
            price: v.price,
            stock: v.stock,
            attributes: v.attributes ?? undefined,
            images,
            isActive: v.isActive,
            deletedAt: v.deletedAt,
            createdBy: "system:sync-nomag-variants-to-prd",
          },
        });
        created++;
      }
      return created;
    },
    // 30 inserts remotos no caben en el default de 5 s de las tx interactivas.
    { maxWait: 10_000, timeout: 180_000 },
  );

  console.log(`\n✓ Creadas ${result} gemelas -NOMAG en PRD (transacción única).`);
  const after = await prd.productVariant.count({ where: { sku: { endsWith: "-NOMAG" } } });
  console.log(`NOMAG en PRD ahora: ${after}`);
}

main()
  .catch((err) => {
    console.error("Error:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await stg.$disconnect();
    await prd.$disconnect();
  });

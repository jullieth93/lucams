/*
 * Homologación de catálogo desde PRD (N-20, auditoría 360°).
 *
 * Regla de negocio (decisión del orquestador, ratificable por Lucy):
 *   - PRD es la fuente de verdad COMERCIAL (curaduría de la operadora vía admin).
 *   - Las variantes gemelas "-NOMAG" (multi-unidad, seed-magnet-variants) son un
 *     BANCO DE VALIDACIÓN intencional que vive solo en LOCAL/STG hasta que Lucy
 *     decida si la oferta "Sin imán" llega a PRD — el script NO las toca.
 *   - PRD se lee y NUNCA se escribe.
 *
 * Qué hace: lee el estado (isActive, deletedAt) de TODOS los productos/variantes
 * de PRD y alinea el ambiente destino (LOCAL o STG) con esos estados:
 *   - Producto presente en PRD (por slug) → copia su isActive/deletedAt.
 *   - Variante presente en PRD (por sku) y NO "-NOMAG" → copia su isActive/deletedAt.
 *   - Filas del destino AUSENTES en PRD → solo las reporta (decisión humana).
 *
 * Uso:
 *   cd packages/db && npx dotenv -e ../../.env.local -- node scripts/homologate-catalog-from-prd.mjs          # dry-run
 *   cd packages/db && npx dotenv -e ../../.env.local -- node scripts/homologate-catalog-from-prd.mjs --apply
 * (PRD se lee vía ../../.env.local.nube-backup; el destino vía el -e indicado:
 *  env-guard permite LOCAL/STG y bloquea que el DESTINO sea PRD por accidente).
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

assertDestructiveAllowed("homologate-catalog-from-prd.mjs");

const APPLY = process.argv.includes("--apply");
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
    // Comillas: si el valor abre con comilla, se toma hasta su CIERRE (lo que
    // hace dotenv) — hay líneas del backup con texto suelto tras el cierre.
    if (val.startsWith('"') || val.startsWith("'")) {
      const q = val[0];
      const end = val.indexOf(q, 1);
      val = end > 0 ? val.slice(1, end) : val.slice(1);
    }
    out[key] = val;
  }
  return out;
}

const prdEnv = loadEnvFile(PRD_ENV);
const prd = new PrismaClient({ datasources: { db: { url: prdEnv.DIRECT_URL } } });
const target = new PrismaClient(); // el env cargado por dotenv del caller

const isNomag = (sku) => typeof sku === "string" && sku.toUpperCase().includes("NOMAG");

async function main() {
  // ── 1) Estado de PRD (lectura) ──
  const prdProducts = await prd.product.findMany({
    select: { slug: true, isActive: true, deletedAt: true },
  });
  const prdVariants = await prd.productVariant.findMany({
    select: { sku: true, isActive: true, deletedAt: true },
  });
  const prdProdBySlug = new Map(prdProducts.map((p) => [p.slug, p]));
  const prdVarBySku = new Map(prdVariants.map((v) => [v.sku, v]));

  // ── 2) Estado del destino ──
  const tgtProducts = await target.product.findMany({
    select: { id: true, slug: true, isActive: true, deletedAt: true },
  });
  const tgtVariants = await target.productVariant.findMany({
    select: { id: true, sku: true, isActive: true, deletedAt: true },
  });

  const prodUpdates = [];
  const varUpdates = [];
  const reportOnly = { products: [], variants: [] };
  let nomagSkipped = 0;

  for (const p of tgtProducts) {
    const src = prdProdBySlug.get(p.slug);
    if (!src) {
      reportOnly.products.push(p.slug);
      continue;
    }
    const same = p.isActive === src.isActive && Boolean(p.deletedAt) === Boolean(src.deletedAt);
    if (!same) {
      prodUpdates.push({
        id: p.id,
        slug: p.slug,
        from: `${p.isActive ? "activo" : "pausado"}${p.deletedAt ? "+archivado" : ""}`,
        to: `${src.isActive ? "activo" : "pausado"}${src.deletedAt ? "+archivado" : ""}`,
        isActive: src.isActive,
        deletedAt: src.deletedAt,
      });
    }
  }

  for (const v of tgtVariants) {
    if (isNomag(v.sku)) {
      nomagSkipped++;
      continue; // banco de validación intencional — nunca se toca
    }
    const src = prdVarBySku.get(v.sku);
    if (!src) {
      reportOnly.variants.push(v.sku);
      continue;
    }
    const same = v.isActive === src.isActive && Boolean(v.deletedAt) === Boolean(src.deletedAt);
    if (!same) {
      varUpdates.push({
        id: v.id,
        sku: v.sku,
        from: `${v.isActive ? "activa" : "pausada"}${v.deletedAt ? "+archivada" : ""}`,
        to: `${src.isActive ? "activa" : "pausada"}${src.deletedAt ? "+archivada" : ""}`,
        isActive: src.isActive,
        deletedAt: src.deletedAt,
      });
    }
  }

  console.log(`\n=== homologate-catalog-from-prd (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
  console.log(`PRD: ${prdProducts.length} productos, ${prdVariants.length} variantes (lectura).`);
  console.log(`NOMAG preservadas (banco de validación): ${nomagSkipped}`);
  console.log(`Productos a alinear: ${prodUpdates.length}`);
  for (const u of prodUpdates) console.log(`  ~ ${u.slug}: ${u.from} → ${u.to}`);
  console.log(`Variantes a alinear: ${varUpdates.length}`);
  const show = varUpdates.slice(0, 40);
  for (const u of show) console.log(`  ~ ${u.sku}: ${u.from} → ${u.to}`);
  if (varUpdates.length > show.length) console.log(`  … y ${varUpdates.length - show.length} más`);
  if (reportOnly.products.length)
    console.log(`Solo reporte (producto no existe en PRD): ${reportOnly.products.join(", ")}`);
  if (reportOnly.variants.length)
    console.log(
      `Solo reporte (variante no-NOMAG ausente en PRD): ${reportOnly.variants.join(", ")}`,
    );

  if (!APPLY) {
    console.log("\nDRY-RUN (sin cambios). Para ejecutar: … --apply");
    return;
  }

  const result = await target.$transaction(async (tx) => {
    let pCount = 0;
    let vCount = 0;
    for (const u of prodUpdates) {
      await tx.product.update({
        where: { id: u.id },
        data: { isActive: u.isActive, deletedAt: u.deletedAt },
      });
      pCount++;
    }
    for (const u of varUpdates) {
      await tx.productVariant.update({
        where: { id: u.id },
        data: { isActive: u.isActive, deletedAt: u.deletedAt },
      });
      vCount++;
    }
    return { pCount, vCount };
  });

  console.log(`\n✓ Homologado: ${result.pCount} productos, ${result.vCount} variantes alineadas con PRD.`);
  const after = await target.productVariant.groupBy({
    by: ["isActive"],
    _count: { _all: true },
    where: { deletedAt: null },
  });
  console.log(`Estado variantes destino (deletedAt null): ${JSON.stringify(after.map((a) => ({ isActive: a.isActive, n: a._count._all })))}`);
}

main()
  .catch((err) => {
    console.error("Error:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prd.$disconnect();
    await target.$disconnect();
  });

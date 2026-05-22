/*
 * cleanup-slugs.mjs — ONE-SHOT 2026-05-18 (Lucy)
 *
 * Barrida del catálogo: slugs que tienen sufijos numéricos (-x12, -100,
 * -20x20, -6cm, -15x15) cuando esa info ya vive en variants. El slug
 * debe representar la FAMILIA abstracta, no una variante específica.
 *
 * También: anglicismos → español (Lucams es Colombia).
 *
 * Cada rename:
 *   1. UPDATE Product.slug
 *   2. Agrega entry a apps/web/lib/product-redirects.ts (301 viejo → nuevo)
 *
 * Idempotente: si el slug nuevo ya existe, skip.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();
const __dirname = dirname(fileURLToPath(import.meta.url));

const RENAMES = [
  // Sufijos numéricos residuales (la cantidad/tamaño vive en variants)
  { from: "set-12-fotoimanes-cuadrados", to: "set-fotoimanes-cuadrados", reason: "residuo -12-" },
  { from: "mini-calendarios-x10", to: "mini-calendarios", reason: "cantidad en variant" },
  {
    from: "pack-empresarial-mixto-100",
    to: "pack-empresarial-mixto",
    reason: "cantidad en variant",
  },
  { from: "recuerdos-bautizo-x12", to: "recuerdos-bautizo", reason: "cantidad en variant" },
  { from: "recuerdos-cumpleanos-x20", to: "recuerdos-cumpleanos", reason: "cantidad en variant" },
  { from: "recuerdos-graduacion-x20", to: "recuerdos-graduacion", reason: "cantidad en variant" },
  { from: "set-4-notas-magneticas", to: "set-notas-magneticas", reason: "cantidad en variant" },

  // Tamaños embebidos en slug (el tamaño vive en variants)
  { from: "cuadro-15x15-con-foto", to: "cuadro-con-foto", reason: "tamaño en variant" },
  {
    from: "cuadro-frase-personalizada-20x20",
    to: "cuadro-con-frase",
    reason: "tamaño en variant + simplificar",
  },
  {
    from: "imanes-publicitarios-circulares-6cm",
    to: "imanes-publicitarios-circulares",
    reason: "tamaño en variant",
  },
  {
    from: "imanes-publicitarios-rectos-7x5",
    to: "imanes-publicitarios-rectangulares",
    reason: "tamaño + es-CO",
  },

  // Anglicismos → español (Colombia)
  {
    from: "set-glass-magnets-personalizados",
    to: "set-imanes-vidrio",
    reason: "anglicismo → es-CO",
  },
];

console.log("=== cleanup-slugs (2026-05-18) ===\n");

const newRedirects = {};
let renamed = 0;

for (const r of RENAMES) {
  // Idempotencia: si el slug nuevo ya existe, skip
  const existingNew = await prisma.product.findFirst({
    where: { slug: r.to, deletedAt: null },
    select: { id: true },
  });
  if (existingNew) {
    console.log(`  · ${r.to} ya existe → skip ${r.from}`);
    continue;
  }
  const existingOld = await prisma.product.findFirst({
    where: { slug: r.from, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!existingOld) {
    console.log(`  ⚠️  ${r.from} no existe → skip`);
    continue;
  }
  await prisma.product.update({
    where: { id: existingOld.id },
    data: { slug: r.to },
  });
  console.log(`  ✓ ${r.from} → ${r.to}  (${r.reason})`);
  newRedirects[r.from] = r.to;
  renamed++;
}

console.log(`\n${renamed} slug(s) renombrado(s).`);

if (renamed === 0) {
  console.log("Nada que actualizar en product-redirects.ts.");
  await prisma.$disconnect();
  process.exit(0);
}

// Actualizar product-redirects.ts agregando nuevos entries (preservando existentes).
const redirectsFile = join(__dirname, "../../../apps/web/lib/product-redirects.ts");
const content = readFileSync(redirectsFile, "utf-8");
const startMarker = "export const PRODUCT_REDIRECTS: Record<string, string> = {";
const endMarker = "};";
const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker, startIdx);
if (startIdx === -1 || endIdx === -1) {
  console.error("No se pudo parsear product-redirects.ts — abortando.");
  await prisma.$disconnect();
  process.exit(1);
}

const existingBlock = content.substring(startIdx + startMarker.length, endIdx);
const existingPairs = {};
for (const match of existingBlock.matchAll(/"([^"]+)":\s*"([^"]+)"/g)) {
  existingPairs[match[1]] = match[2];
}
const merged = { ...existingPairs, ...newRedirects };
const sortedKeys = Object.keys(merged).sort();
const newBlock = sortedKeys.map((k) => `  "${k}": "${merged[k]}",`).join("\n");
const newContent =
  content.substring(0, startIdx + startMarker.length) +
  "\n" +
  newBlock +
  "\n" +
  content.substring(endIdx);
writeFileSync(redirectsFile, newContent);
console.log(`Actualizado apps/web/lib/product-redirects.ts (+${renamed} entries).`);

await prisma.$disconnect();

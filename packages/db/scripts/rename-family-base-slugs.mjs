/*
 * rename-family-base-slugs.mjs — ONE-SHOT 2026-05-18 (Lucy)
 *
 * Tras la consolidación de familias (M.3.b.CAT.2), los productos base
 * quedaron con slugs sucios — eran el slug del primer producto del array,
 * que incluía la cantidad por defecto. Ej:
 *   - "set-12-fotoimanes-polaroid"  → debería ser "set-fotoimanes-polaroid"
 *   - "big-box-dia-mama"            → debería ser "box-dia-mama"
 *   - "rutina-infantil-7-actividades" → debería ser "rutina-infantil-magnetica"
 *
 * Este script:
 *   1. Renombra el slug del producto base a uno limpio (sin sufijos
 *      numéricos ni indicadores de variante por defecto).
 *   2. Agrega el slug viejo a apps/web/lib/product-redirects.ts para que
 *      proxy.ts haga 301 desde el slug viejo al nuevo.
 *   3. NO toca variants — siguen apuntando al mismo productId.
 *
 * Idempotente: si el slug ya está limpio, no toca nada.
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
  { from: "set-12-fotoimanes-polaroid", to: "set-fotoimanes-polaroid" },
  { from: "big-box-dia-mama", to: "box-dia-mama" },
  { from: "rutina-infantil-7-actividades", to: "rutina-infantil-magnetica" },
];

console.log("=== rename-family-base-slugs (2026-05-18) ===\n");

let renamed = 0;
const newRedirects = {};

for (const { from, to } of RENAMES) {
  const existingNew = await prisma.product.findFirst({
    where: { slug: to, deletedAt: null },
    select: { id: true },
  });
  if (existingNew) {
    console.log(`  · ${to} ya existe → skip ${from}`);
    continue;
  }
  const existingOld = await prisma.product.findFirst({
    where: { slug: from, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!existingOld) {
    console.log(`  ⚠️  ${from} no existe → skip`);
    continue;
  }
  await prisma.product.update({
    where: { id: existingOld.id },
    data: { slug: to },
  });
  console.log(`  ✓ ${from} → ${to} (${existingOld.name})`);
  newRedirects[from] = to;
  renamed++;
}

console.log(`\n${renamed} producto(s) renombrado(s).`);

if (renamed === 0) {
  console.log("Nada que actualizar en product-redirects.ts.");
  await prisma.$disconnect();
  process.exit(0);
}

// Actualizar apps/web/lib/product-redirects.ts: agregar entries con
// redirect simple (sin variant), preservando el mapping existente.
const redirectsFile = join(__dirname, "../../../apps/web/lib/product-redirects.ts");
const content = readFileSync(redirectsFile, "utf-8");

// Buscar el bloque del objeto y reconstruirlo agregando los nuevos.
const startMarker = "export const PRODUCT_REDIRECTS: Record<string, string> = {";
const endMarker = "};";
const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker, startIdx);
if (startIdx === -1 || endIdx === -1) {
  console.error("No se pudo parsear product-redirects.ts — abortando edición.");
  await prisma.$disconnect();
  process.exit(1);
}

// Extraer el objeto actual como string + parsear entries existentes.
const existingBlock = content.substring(startIdx + startMarker.length, endIdx);
const existingPairs = {};
for (const match of existingBlock.matchAll(/"([^"]+)":\s*"([^"]+)"/g)) {
  existingPairs[match[1]] = match[2];
}

// Mergear con los nuevos. Los nuevos toman precedencia si conflicto.
const merged = { ...existingPairs, ...newRedirects };

// Reconstruir el bloque. Ordenar alfabéticamente para diff limpio.
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

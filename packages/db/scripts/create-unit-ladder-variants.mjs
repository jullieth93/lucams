/*
 * create-unit-ladder-variants.mjs (2026-09-14) — RESTAURACIÓN de las escaleras
 * de UNIDADES 1 en 1 de las familias de fotoimanes sueltos (decisión del owner
 * 2026-09-14: "restaurar históricas").
 *
 * Contexto: el stepper "Unidades" de la PDP salta entre los photoSlots que
 * EXISTEN como variante ACTIVA (variant-selector.tsx, diseño intencional).
 * Polaroid tenía la escalera 2–9 con precios graduados ($22.000…$33.000) y
 * Cuadrados 2–6 ($17.600…$24.000), pero quedaron soft-eliminadas en limpiezas
 * previas → polaroid saltaba de 1 a 10 y cuadrados no mostraba stepper.
 *
 * Qué hace (idempotente, dry-run por defecto):
 *   1. REACTIVA las variantes históricas conservando sus precios graduados
 *      (EXCEPCIÓN documentada: FI-POL-75X10-2 traía $34.900 — el precio del
 *      pack de 10, anomalía de datos → se corrige a $20.200, interpolación del
 *      paso de la escalera, aprobado por el owner) y normaliza sus attributes
 *      al schema actual (agrega magnet:true; quantity = photoSlots — la misma
 *      variante traía quantity:12 por error).
 *   2. CREA las variantes que faltan para completar cada escalera 1–10:
 *      cuadrados 7–10 (continúa el último paso histórico de +$1.500:
 *      $25.500/$27.000/$28.500/$30.000) y TODAS las gemelas "— Sin imán"
 *      (-NOMAG, paridad ADR-099) con precio espejo de su Con imán.
 *   3. NUNCA pisa variantes activas (1 y 10 de polaroid, 1 de cuadrados).
 *   4. Cierra con el reporte de coherencia de cada escalera (monotonía y $/u).
 *      Los precios quedan editables por variante desde /admin/productos.
 *
 * Guardarraíles (patrón N-06): DRY-RUN por defecto; `--apply` ejecuta;
 * env-guard fail-closed; backup JSON de las filas reactivadas en tmp/backups.
 *
 * Uso:
 *   cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/create-unit-ladder-variants.mjs          # DRY-RUN
 *   cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/create-unit-ladder-variants.mjs --apply  # ejecuta
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

assertDestructiveAllowed("create-unit-ladder-variants.mjs");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const HERE = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(HERE, "..", "..", "..", "tmp", "backups");

/**
 * Plan de restauración por familia. Precios en CENTAVOS COP.
 * - reactivate: SKUs históricos a reactivar (precio propio conservado salvo fix).
 * - priceFix: correcciones de anomalías aprobadas por el owner.
 * - createMag: variantes Con imán nuevas (sku → precio), continuación de la escala.
 */
const PLANS = [
  {
    productSlug: "set-fotoimanes-polaroid",
    skuBase: "FI-POL-75X10",
    sizeCm: "7.5×10",
    aspectRatio: "3:4",
    extraAttrs: { shape: "rectangle" },
    reactivate: [2, 3, 4, 5, 6, 7, 8, 9],
    priceFix: { 2: 2020000 }, // traía $34.900 (el precio del pack de 10) — anomalía
    createMag: {}, // 1 y 10 ya existen activos
  },
  {
    productSlug: "set-fotoimanes-cuadrados",
    skuBase: "FI-CUAD-65",
    sizeCm: "6.5×6.5",
    aspectRatio: "1:1",
    extraAttrs: { shape: "rectangle", frameStyle: "blanco" },
    reactivate: [2, 3, 4, 5, 6],
    priceFix: {},
    createMag: { 7: 2550000, 8: 2700000, 9: 2850000, 10: 3000000 }, // +$1.500 (último paso histórico)
  },
];

const pesos = (cents) => `$${(cents / 100).toLocaleString("es-CO")}`;

async function main() {
  console.log(`=== create-unit-ladder-variants (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);
  const backup = { reactivated: [], created: [] };
  let touched = 0;

  for (const plan of PLANS) {
    const product = await prisma.product.findUnique({
      where: { slug: plan.productSlug },
      select: { id: true, name: true },
    });
    if (!product) {
      console.log(`⚠ Producto ${plan.productSlug} no existe en este ambiente — se omite`);
      continue;
    }
    console.log(`── ${product.name} (/${plan.productSlug})`);

    const attrsFor = (n, magnet) => ({
      ...plan.extraAttrs,
      magnet,
      sizeCm: plan.sizeCm,
      quantity: n,
      photoSlots: n,
      aspectRatio: plan.aspectRatio,
    });

    // ── 1. Reactivar históricas (precio propio; fix solo el aprobado) ──
    const finalMagPrice = new Map(); // n → precio final (para espejar NOMAG)
    for (const n of plan.reactivate) {
      const sku = `${plan.skuBase}-${n}`;
      const v = await prisma.productVariant.findFirst({ where: { sku } });
      if (!v) {
        console.log(`  ⚠ ${sku} no existe (se esperaba histórica) — se creará como nueva`);
        plan.createMag[n] = n * 990000; // fallback de emergencia, reportado
        continue;
      }
      const fix = plan.priceFix[n];
      const price = fix ?? v.price;
      finalMagPrice.set(n, price);
      const fixes = [fix != null ? `precio ${pesos(v.price)} → ${pesos(fix)} (anomalía)` : null]
        .filter(Boolean)
        .join("; ");
      if (!v.deletedAt && v.isActive && !fix) {
        console.log(`  · ${sku} ya activa (${pesos(v.price)})`);
        continue;
      }
      console.log(
        `  ${APPLY ? "↻" : "→"} ${sku} reactivada · ${pesos(price)}${fixes ? ` · ${fixes}` : ""} · attrs normalizados`,
      );
      backup.reactivated.push(v);
      if (APPLY) {
        await prisma.productVariant.update({
          where: { id: v.id },
          data: {
            deletedAt: null,
            isActive: true,
            price,
            attributes: attrsFor(n, true),
          },
        });
      }
      touched++;
    }

    // ── 2. Crear las que faltan (Con imán nuevas + todas las Sin imán) ──
    const allSizes = new Set([...plan.reactivate, ...Object.keys(plan.createMag).map(Number)]);
    // Stock de referencia: variante de 1 unidad del mismo imantado.
    const refStock = async (magnet) =>
      (
        await prisma.productVariant.findFirst({
          where: { sku: `${plan.skuBase}-1${magnet ? "" : "-NOMAG"}` },
          select: { stock: true },
        })
      )?.stock ?? 100;

    for (const n of [...allSizes].sort((a, b) => a - b)) {
      // Con imán nueva (si aplica).
      if (plan.createMag[n] != null) {
        const sku = `${plan.skuBase}-${n}`;
        const existing = await prisma.productVariant.findFirst({ where: { sku } });
        if (existing) {
          console.log(`  · ${sku} ya existe (no se toca)`);
          finalMagPrice.set(n, existing.price);
        } else {
          const price = plan.createMag[n];
          finalMagPrice.set(n, price);
          const name = `${plan.sizeCm} cm · ${n} unidades`;
          console.log(`  ${APPLY ? "+" : "→"} ${sku} NUEVA · ${name} · ${pesos(price)}`);
          if (APPLY) {
            await prisma.productVariant.create({
              data: {
                productId: product.id,
                sku,
                name,
                attributes: attrsFor(n, true),
                price,
                stock: await refStock(true),
                isActive: true,
              },
            });
          }
          touched++;
        }
      }
      // Gemela Sin imán (precio espejo).
      const nomagSku = `${plan.skuBase}-${n}-NOMAG`;
      const nomag = await prisma.productVariant.findFirst({ where: { sku: nomagSku } });
      const mirrorPrice = finalMagPrice.get(n) ?? plan.createMag[n];
      if (nomag) {
        if (nomag.deletedAt || !nomag.isActive) {
          console.log(`  ${APPLY ? "↻" : "→"} ${nomagSku} reactivada · ${pesos(nomag.price)}`);
          backup.reactivated.push(nomag);
          if (APPLY) {
            await prisma.productVariant.update({
              where: { id: nomag.id },
              data: { deletedAt: null, isActive: true, attributes: attrsFor(n, false) },
            });
          }
          touched++;
        } else {
          console.log(`  · ${nomagSku} ya activa`);
        }
        continue;
      }
      const name = `${plan.sizeCm} cm · ${n} unidades — Sin imán`;
      console.log(`  ${APPLY ? "+" : "→"} ${nomagSku} NUEVA · ${name} · ${pesos(mirrorPrice)} (espejo)`);
      if (APPLY) {
        await prisma.productVariant.create({
          data: {
            productId: product.id,
            sku: nomagSku,
            name,
            attributes: attrsFor(n, false),
            price: mirrorPrice,
            stock: await refStock(false),
            isActive: true,
          },
        });
      }
      touched++;
    }

    // ── 3. Reporte de coherencia de la escalera final ──
    if (APPLY) {
      const all = await prisma.productVariant.findMany({
        where: { productId: product.id, deletedAt: null, isActive: true },
        select: { price: true, attributes: true },
      });
      const ladder = all
        .filter((v) => v.attributes?.magnet === true)
        .map((v) => ({ n: v.attributes?.photoSlots ?? 0, price: v.price ?? 0 }))
        .filter((v) => v.n > 0)
        .sort((a, b) => a.n - b.n);
      console.log("  Escalera final (Con imán):");
      let prev = null;
      for (const { n, price } of ladder) {
        const flag = prev && price < prev.price ? "  ⚠ NO monótona" : "";
        console.log(`    ${n} unid. → ${pesos(price)} (${pesos(Math.round(price / n))}/u)${flag}`);
        prev = { price };
      }
    }
    console.log("");
  }

  if (APPLY && backup.reactivated.length > 0) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const file = join(BACKUP_DIR, `unit-ladder-restore-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(backup, null, 2));
    console.log(`Backup de filas reactivadas: ${file}`);
  }
  console.log(
    APPLY
      ? `✓ ${touched} variantes reactivadas/creadas.`
      : `DRY-RUN: ${touched} variantes a reactivar/crear (--apply para ejecutar).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

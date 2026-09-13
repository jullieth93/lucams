#!/usr/bin/env node
/*
 * ARCHIVADO en one-shot/ (N-06, 2026-09-12): one-shot ya aplicado; se
 * conserva como referencia y para rerun DELIBERADO (ver lib/env-guard.mjs).
 * fix-tiras-stg-2026-09-07.mjs — corrige el catálogo de "Tiras Magnéticas" en STG
 * (autorizado por Lucy, 2026-09-07).
 *
 * Problema (verificado en vivo 2026-09-07): en STG la única variante activa de
 * `tiras-magneticas-fotos` era FI-TIRA-01-DEFAULT = "Pack 5 Tiras de 4 fotos" con
 * attributes {photoSlots:20, quantity:5, ...} → el Estudio pedía 20 fotos con
 * "1 unidad" (bug grave). El catálogo correcto (ya en PRD y LOCAL) son DOS
 * variantes de 1 unidad cada una:
 *
 *   - FI-TIRA-01-DEFAULT → "Tira de 3 fotos · 6.5×20 cm"
 *       attributes {sizeCm:"6.5×20", quantity:1, photoSlots:3, aspectRatio:"1:1"}
 *       price 1_900_000 (centavos COP), activa.
 *   - FI-TIRA-4FOTOS → "Tira de 4 fotos · 6.5×26.5 cm" (si no existe, se crea)
 *       attributes {sizeCm:"6.5×26.5", quantity:1, photoSlots:4, aspectRatio:"3:4"}
 *       price 2_400_000, reactivada (isActive=true, deletedAt=null).
 *
 * Además: cualquier OTRA variante del producto que quede activa con
 * attributes.quantity > 1 se desactiva (el invariante del catálogo correcto es
 * que no haya variantes activas de pack >1 unidad).
 *
 * Idempotente: solo escribe cuando algo difiere; los attributes se MERGEAN con
 * los existentes (conserva claves como frameOptions), no se reemplazan a ciegas.
 *
 * GUARD DE AMBIENTE: a diferencia del env-guard genérico (que también permite
 * hosts locales), este script SOLO acepta el proyecto STG de Supabase
 * (ref mjbdiqdkykhsixvqlrrp) como destino de escritura — el fix no aplica a
 * LOCAL ni a PRD. LOCAL se verifica aparte, solo lectura.
 *
 * Uso (desde packages/db):
 *   npx dotenv -e ../../.env.stg -- node scripts/one-shot/fix-tiras-stg-2026-09-07.mjs           # dry-run
 *   npx dotenv -e ../../.env.stg -- node scripts/one-shot/fix-tiras-stg-2026-09-07.mjs --apply  # aplica
 */

import { PrismaClient } from "@prisma/client";
import { checkDestructiveAllowed } from "../lib/env-guard.mjs";

const APPLY = process.argv.includes("--apply");

const STG_REF = "mjbdiqdkykhsixvqlrrp"; // debe coincidir con lib/env-guard.mjs

function assertStgOnly(scriptName) {
  // Primero la guarda genérica (bloquea PRD y remotos desconocidos, con bypass
  // documentado para operaciones destructivas deliberadas)...
  checkDestructiveAllowed(scriptName);
  // ...y después la regla estricta de ESTE script: escritura solo contra STG.
  const urls = [process.env.DIRECT_URL, process.env.DATABASE_URL].filter(Boolean);
  if (!urls.some((u) => u.includes(STG_REF))) {
    console.error(
      `[env-guard] ${scriptName}: BLOQUEADO — este script solo puede escribir en el ` +
        `proyecto STG de Supabase (ref ${STG_REF}) y ninguna de las URLs de conexión ` +
        `apunta a él. Verificá que invocás con: npx dotenv -e ../../.env.stg -- ...`,
    );
    process.exit(1);
  }
  console.log(`[env-guard] ${scriptName}: destino verificado = STG (${STG_REF}).`);
}

assertStgOnly("fix-tiras-stg-2026-09-07");

const prisma = new PrismaClient();

const PRODUCT_SLUG = "tiras-magneticas-fotos";

/** Attributes objetivo: se MERGEAN sobre los existentes de cada variante. */
const TARGETS = {
  "FI-TIRA-01-DEFAULT": {
    name: "Tira de 3 fotos · 6.5×20 cm",
    forceName: true, // su nombre actual ("Pack 5 Tiras…") es parte del bug → renombrar
    price: 1_900_000,
    isActive: true,
    clearDeletedAt: true,
    attrs: { sizeCm: "6.5×20", quantity: 1, photoSlots: 3, aspectRatio: "1:1" },
  },
  "FI-TIRA-4FOTOS": {
    name: "Tira de 4 fotos · 6.5×26.5 cm", // solo se usa al crear o si el nombre está vacío
    forceName: false,
    price: 2_400_000,
    isActive: true,
    clearDeletedAt: true,
    attrs: { sizeCm: "6.5×26.5", quantity: 1, photoSlots: 4, aspectRatio: "3:4" },
  },
};

function fmtVariant(v) {
  const flags = [v.isActive ? "activa" : "INACTIVA", v.deletedAt ? "deletedAt set" : null]
    .filter(Boolean)
    .join(", ");
  return `${v.sku} | "${v.name}" | price=${v.price ?? "—"} | ${flags} | attrs=${JSON.stringify(v.attributes)}`;
}

async function loadCatalog() {
  const product = await prisma.product.findFirst({
    where: { slug: PRODUCT_SLUG },
    select: { id: true, name: true },
  });
  if (!product) {
    console.error(`!! producto ${PRODUCT_SLUG} no encontrado en STG — abortando.`);
    process.exit(1);
  }
  const variants = await prisma.productVariant.findMany({
    where: { productId: product.id },
    select: {
      id: true,
      sku: true,
      name: true,
      price: true,
      isActive: true,
      deletedAt: true,
      attributes: true,
    },
    orderBy: { sku: "asc" },
  });
  return { product, variants };
}

async function main() {
  console.log(`\n### MODO: ${APPLY ? "APPLY (escribe)" : "DRY-RUN (solo lectura)"}\n`);

  const { product, variants: before } = await loadCatalog();
  console.log(`== ANTES — ${PRODUCT_SLUG} (${product.name}): ${before.length} variante(s)`);
  for (const v of before) console.log(`  ${fmtVariant(v)}`);

  let writes = 0;

  // --- 1) Asegurar las dos variantes objetivo ---------------------------------
  for (const [sku, target] of Object.entries(TARGETS)) {
    const existing = before.find((v) => v.sku === sku);
    if (!existing) {
      writes++;
      console.log(
        `\n${APPLY ? "WRITE" : "DRY "}  ${sku}: NO EXISTE → crear con name="${target.name}", ` +
          `price=${target.price}, attrs=${JSON.stringify(target.attrs)}`,
      );
      if (APPLY) {
        await prisma.productVariant.create({
          data: {
            productId: product.id,
            sku,
            name: target.name,
            price: target.price,
            isActive: true,
            attributes: target.attrs,
          },
        });
      }
      continue;
    }

    const attrs = { ...(existing.attributes ?? {}), ...target.attrs };
    const data = {};
    if (target.forceName ? existing.name !== target.name : !existing.name) data.name = target.name;
    if (existing.price !== target.price) data.price = target.price;
    if (existing.isActive !== target.isActive) data.isActive = target.isActive;
    if (target.clearDeletedAt && existing.deletedAt) data.deletedAt = null;
    if (JSON.stringify(existing.attributes ?? {}) !== JSON.stringify(attrs))
      data.attributes = attrs;

    if (Object.keys(data).length === 0) {
      console.log(`\nOK    ${sku}: ya cumple el estado objetivo`);
      continue;
    }
    writes++;
    console.log(
      `\n${APPLY ? "WRITE" : "DRY "}  ${sku}:` +
        Object.entries(data)
          .map(([k, val]) => ` ${k} → ${JSON.stringify(val)}`)
          .join(";"),
    );
    if (APPLY) {
      await prisma.productVariant.update({ where: { id: existing.id }, data });
    }
  }

  // --- 2) Invariante: ninguna OTRA variante activa con quantity > 1 -----------
  for (const v of before) {
    if (TARGETS[v.sku]) continue;
    const qty = v.attributes?.quantity;
    if (v.isActive && !v.deletedAt && typeof qty === "number" && qty > 1) {
      writes++;
      console.log(
        `\n${APPLY ? "WRITE" : "DRY "}  ${v.sku} (otra variante): desactivar — es activa con quantity=${qty} ` +
          `(el catálogo correcto no tiene packs >1)`,
      );
      if (APPLY) {
        await prisma.productVariant.update({ where: { id: v.id }, data: { isActive: false } });
      }
    } else if (v.isActive && !v.deletedAt) {
      console.log(
        `\nNOTA  ${v.sku}: otra variante activa con quantity=${qty ?? "—"} → se deja tal cual (no es pack >1)`,
      );
    }
  }

  // --- 3) Estado DESPUÉS -------------------------------------------------------
  const { variants: after } = await loadCatalog();
  console.log(`\n== DESPUÉS — ${PRODUCT_SLUG}: ${after.length} variante(s)`);
  for (const v of after) console.log(`  ${fmtVariant(v)}`);

  const bad = after.filter(
    (v) =>
      v.isActive &&
      !v.deletedAt &&
      typeof v.attributes?.quantity === "number" &&
      v.attributes.quantity > 1,
  );
  if (!APPLY) {
    if (bad.length > 0) {
      console.log(
        `\nNota (dry-run): el invariante aún no cumple en DB (${bad.map((v) => v.sku).join(", ")} activa(s) con quantity>1) — se corregiría al aplicar.`,
      );
    }
  } else if (bad.length > 0) {
    console.error(
      `\n!! INVARIANTE ROTO: variantes activas con quantity>1: ${bad.map((v) => v.sku).join(", ")}`,
    );
    process.exitCode = 1;
  } else {
    console.log("\nInvariante OK: ninguna variante activa con quantity>1.");
  }

  console.log(
    `\n${APPLY ? "Escrituras aplicadas" : "Cambios que aplicaría (dry-run)"}: ${writes}.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

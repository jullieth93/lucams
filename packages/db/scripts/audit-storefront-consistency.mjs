/*
 * audit-storefront-consistency.mjs (2026-09-14) — barrido global admin↔PDP↔Estudio
 * (SOLO LECTURA). Cubre las clases de bugs del paquete 2026-09-14:
 *
 *   1. ESCALERAS: photoSlots no monótonos en precio (packs de tamaño variable).
 *   2. PROMO: drift entre product.compareAtPrice (denormalizado, lo usan las
 *      cards) y las compareAtPrice de las variantes (lo usa la PDP).
 *   3. COBERTURA DE PLANTILLA: variante/producto cuyo aspectRatio NO matchea
 *      ninguna plantilla ACTIVA (tolerancia 0.05, regla template-visibility)
 *      → el Estudio caería al canvas cuadrado de respaldo (bug "Alargados").
 *   4. SANIDAD DE PLANTILLAS ACTIVAS: nombres duplicados dentro del mismo
 *      producto o preview placeholder (/brand/lucams-logo.png).
 *
 * Uso: cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/audit-storefront-consistency.mjs
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();
const pesos = (c) => `$${(c / 100).toLocaleString("es-CO")}`;

function parseAspect(s) {
  const m = typeof s === "string" ? s.trim().match(/^(\d+(?:\.\d+)?)\s*[:×x]\s*(\d+(?:\.\d+)?)$/i) : null;
  if (!m) return null;
  const h = parseFloat(m[2]);
  return h === 0 ? null : parseFloat(m[1]) / h;
}

let issues = 0;
const flag = (msg) => {
  console.log(`  ⚠ ${msg}`);
  issues++;
};

const products = await prisma.product.findMany({
  where: { deletedAt: null, isActive: true },
  orderBy: { name: "asc" },
  include: {
    variants: { where: { deletedAt: null, isActive: true }, orderBy: { createdAt: "asc" } },
  },
});

console.log(`Productos activos: ${products.length}\n`);

for (const p of products) {
  console.log(`── ${p.name} (/${p.slug}) [${p.personalizationKind}]`);
  const schema = p.personalizationSchema ?? {};

  // 1. Escaleras (por imantado)
  for (const magnet of [true, false]) {
    const ladder = p.variants
      .filter((v) => (v.attributes?.magnet ?? null) === magnet)
      .map((v) => ({ n: v.attributes?.photoSlots ?? 0, price: v.price ?? p.basePrice, sku: v.sku }))
      .filter((v) => v.n > 0)
      .sort((a, b) => a.n - b.n);
    for (let i = 1; i < ladder.length; i++) {
      if (ladder[i].price < ladder[i - 1].price) {
        flag(
          `escalera NO monótona (${magnet ? "Con" : "Sin"} imán): ${ladder[i - 1].n} unid. ${pesos(ladder[i - 1].price)} > ${ladder[i].n} unid. ${pesos(ladder[i].price)}`,
        );
      }
    }
  }

  // 2. Promo: denormalizado vs variantes
  const cheapest = p.variants
    .filter((v) => v.price != null)
    .sort((a, b) => a.price - b.price)[0];
  const denorm = p.compareAtPrice ?? null;
  const variantPromos = p.variants.filter(
    (v) => v.compareAtPrice != null && v.compareAtPrice > (v.price ?? p.basePrice),
  );
  if (denorm != null && variantPromos.length === 0) {
    // 2026-09-15 — la PDP ya muestra la promo a nivel PRODUCTO (fallback de
    // resolvePromoDisplay con chip/tachado según cubra el precio mostrado), así que
    // ya no es inconsistencia: queda como nota informativa (modelo "promo de familia").
    console.log(
      `  · nota: promo solo a nivel producto (${pesos(denorm)}) — card y PDP la muestran (fallback 2026-09-15); si la promo es por opción, curar compareAtPrice en la variante`,
    );
  }
  if (denorm == null && variantPromos.length > 0) {
    flag(`${variantPromos.length} variante(s) con promo pero product.compareAtPrice es null (correr syncProductBasePrice)`);
  }
  if (cheapest && denorm != null && cheapest.compareAtPrice !== denorm) {
    console.log(
      `  · nota: compareAt denormalizado (${pesos(denorm)}) ≠ de la variante más barata (${cheapest.sku}: ${cheapest.compareAtPrice ? pesos(cheapest.compareAtPrice) : "null"})`,
    );
  }

  // 3. Cobertura de plantilla por aspect
  if (p.personalizationKind !== "NONE" && p.personalizationKind !== "TEXT_ONLY") {
    const templates = await prisma.personalizationTemplate.findMany({
      where: {
        kind: p.personalizationKind,
        isActive: true,
        deletedAt: null,
        OR: [{ productId: p.id }, { productId: null }],
      },
    });
    const aspects = new Set(
      [schema.aspectRatio, ...p.variants.map((v) => v.attributes?.aspectRatio)].filter(Boolean),
    );
    for (const a of aspects) {
      const target = parseAspect(a);
      if (target == null) continue;
      const match = templates.some((t) => {
        const st = t.canvasData?.stage;
        if (!st?.width || !st?.height) return true; // sin stage parseable → permitida (curaduría manda)
        return Math.abs(st.width / st.height - target) <= 0.05;
      });
      if (!match) flag(`aspect ${a} SIN plantilla activa que matchee → Estudio cae al canvas cuadrado`);
    }

    // 3b. Consistencia FÍSICA de la celda (bug 2026-09-15 — tira 4 fotos: aspectRatio
    // "3:4" con sizeCm 6.5×26.5 → el 3D inflaba la pieza 1.3× y el WYSIWYG mentía): en
    // piezas de N celdas apiladas (photoSlots>1 y quantity=1 → el sizeCm describe la
    // PIEZA ENTERA 1-columna, no una unidad del pack — distingue tiras de polaroid),
    // el aspect físico por celda = (w/h del sizeCm) × photoSlots debe cuadrar con el
    // aspectRatio declarado (±0.05, misma tolerancia del ruteo de plantillas).
    for (const v of p.variants) {
      const a = v.attributes ?? {};
      const slots = Number(a.photoSlots);
      const piece = parseAspect(a.sizeCm);
      const declared = parseAspect(a.aspectRatio);
      if (!slots || slots <= 1 || a.quantity !== 1 || piece == null || declared == null) continue;
      const cellAspect = piece * slots;
      if (Math.abs(cellAspect - declared) > 0.05) {
        flag(
          `variante ${v.sku}: aspectRatio "${a.aspectRatio}" contradice la física (celda = ${cellAspect.toFixed(2)} de ${a.sizeCm} ÷ ${slots}) → 3D/WYSIWYG distorsionado`,
        );
      }
    }

    // 4. Sanidad de plantillas activas del producto
    const own = templates.filter((t) => t.productId === p.id);
    const names = new Map();
    for (const t of own) {
      names.set(t.name, (names.get(t.name) ?? 0) + 1);
      if (t.previewUrl?.includes("lucams-logo")) {
        flag(`plantilla activa "${t.name}" (${t.slug}) con preview placeholder (lucams-logo)`);
      }
    }
    for (const [name, count] of names) {
      if (count > 1) flag(`${count} plantillas activas con el MISMO nombre "${name}"`);
    }
  }
  console.log("");
}

console.log(issues === 0 ? "✓ Sin inconsistencias." : `✗ ${issues} inconsistencia(s) encontrada(s).`);
process.exitCode = issues === 0 ? 0 : 1;
await prisma.$disconnect();

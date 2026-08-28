/*
 * Fotoimanes Cuadrados → tamaños 6.5×6.5, 8×8 y 10×10 (Lucy 2026-07-22).
 *
 *   1) PAUSA las 12 variantes 7.5×10 (isActive=false, NO se borran: carritos y
 *      cotizaciones históricas conservan su referencia y Lucy las ve "Pausada"
 *      en /admin/productos — reversible). La polaroid 7.5×10 ya cubre ese tamaño.
 *   2) CREA las matrices 8×8 y 10×10 × marco(blanco/negro) × cantidad 1–6 (24
 *      variantes), con el MISMO patrón de attributes que las 6.5×6.5 (frameStyle
 *      incluido, aspectRatio "1:1" — los 3 tamaños son cuadrados).
 *
 * Precios: derivados de la curva existente por ÁREA (misma que usó
 * extend-variant-dims-2026-07-22.mjs para crear 6.5×6.5 y 7.5×10):
 *   unit(q) = a + b/q  →  total(q) = q·a + b
 *   a(A) = 1417 + (250/24)·(A−25)      [calce exacto sobre 5×5 y 7×7]
 *   b(A) = 12800 + (2200/24)·(A−25)
 *   8×8 (64 cm²):   a≈1823.25, b=16375 · 10×10 (100 cm²): a≈2198.25, b=19675
 * Totales redondeados a $100 (como las matrices anteriores). El marco NO cambia
 * el precio (es solo el color de impresión). Lucy los ajusta después en admin.
 *
 * Plantilla del Estudio: sin cambios — los 3 tamaños son 1:1 y las variantes
 * 6.5×6.5 ya rutean hoy (filtro de aspect |a−1| ≤ 0.05 sobre el stage).
 *
 * Idempotente (upsert por SKU; en update NO pisa el precio — respeta admin).
 * Re-run seguro: el filtro de pausa es por sizeCm "7.5×10", no "todo lo activo".
 * Transaccional. Uso:
 *   pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/fotoimanes-cuadrados-8x8-10x10-2026-07-22.mjs
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

// Curva por área (ver header). total en PESOS, redondeado a $100.
const aPorArea = (A) => 1417 + (250 / 24) * (A - 25);
const bPorArea = (A) => 12800 + (2200 / 24) * (A - 25);
const totalPesos = (A, q) => Math.round((q * aPorArea(A) + bPorArea(A)) / 100) * 100;

const QTYS = [1, 2, 3, 4, 5, 6];
const FRAMES = [
  { key: "BLA", value: "blanco", label: "Marco blanco" },
  { key: "NEG", value: "negro", label: "Marco negro" },
];
const NEW_SIZES = [
  { key: "8X8", sizeCm: "8×8", area: 64 },
  { key: "10X10", sizeCm: "10×10", area: 100 },
];

/** Upsert de variante por SKU (SKU único global). En update NO pisa el precio (respeta admin). */
async function upsertVariant(tx, { productId, sku, name, price, attributes }) {
  const found = await tx.productVariant.findFirst({ where: { sku } });
  if (found) {
    await tx.productVariant.update({
      where: { id: found.id },
      data: { productId, name, attributes, isActive: true, deletedAt: null },
    });
    return { action: "~", sku, priceNote: "precio respetado" };
  }
  await tx.productVariant.create({
    data: { productId, sku, name, attributes, price, stock: 100, isActive: true },
  });
  return { action: "+", sku, priceNote: `$${(price / 100).toLocaleString("es-CO")}` };
}

async function main() {
  // Tabla de precios ANTES de tocar la DB (va también al reporte).
  console.log("Tabla de precios derivados (totales COP por cantidad):");
  console.log("  tamaño   área    " + QTYS.map((q) => `q${q}`.padStart(8)).join(""));
  for (const s of NEW_SIZES) {
    console.log(
      `  ${s.sizeCm.padEnd(8)}${String(s.area).padEnd(7)}` +
        QTYS.map((q) => `$${totalPesos(s.area, q).toLocaleString("es-CO")}`.padStart(8)).join(""),
    );
  }
  console.log("  (referencia curva actual: 6.5×6.5 q1 $16.000 → q6 $24.000)\n");

  const product = await prisma.product.findFirst({
    where: { slug: "set-fotoimanes-cuadrados", deletedAt: null },
    select: { id: true, slug: true },
  });
  if (!product) throw new Error("Producto 'set-fotoimanes-cuadrados' no encontrado");

  const results = await prisma.$transaction(
    async (tx) => {
      const out = [];

      // 1) Pausar las 7.5×10 activas (12: 2 marcos × 6 cantidades). Filtro por
      //    sizeCm en JS para que un re-run NO pause variantes de otros tamaños.
      const activeNow = await tx.productVariant.findMany({
        where: { productId: product.id, deletedAt: null, isActive: true },
        select: { id: true, sku: true, attributes: true },
      });
      const oldIds = activeNow
        .filter((v) => /** @type {any} */ (v.attributes)?.sizeCm === "7.5×10")
        .map((v) => v.id);
      if (oldIds.length > 0) {
        const paused = await tx.productVariant.updateMany({
          where: { id: { in: oldIds } },
          data: { isActive: false },
        });
        out.push({
          action: "⊘",
          sku: `(${oldIds.length} variantes 7.5×10)`,
          priceNote: `pausadas: ${paused.count}`,
        });
      } else {
        out.push({ action: "=", sku: "(variantes 7.5×10)", priceNote: "ya estaban pausadas" });
      }

      // 2) Matrices nuevas: tamaño × marco × cantidad (2×2×6 = 24, matriz completa
      //    → la PDP no muestra chips deshabilitados).
      for (const s of NEW_SIZES) {
        for (const f of FRAMES) {
          for (const qty of QTYS) {
            out.push(
              await upsertVariant(tx, {
                productId: product.id,
                sku: `FI-CUAD-${s.key}-${f.key}-${qty}`,
                name: `${s.sizeCm} cm · ${f.label} · ${qty} ${qty === 1 ? "unidad" : "unidades"}`,
                price: totalPesos(s.area, qty) * 100, // centavos
                // MISMO patrón de attributes que las 6.5×6.5 existentes.
                attributes: {
                  shape: "rectangle",
                  sizeCm: s.sizeCm,
                  quantity: qty,
                  photoSlots: qty,
                  aspectRatio: "1:1",
                  frameStyle: f.value,
                },
              }),
            );
          }
        }
      }
      return out;
    },
    { timeout: 60000, maxWait: 15000 },
  );

  console.log("Cambios aplicados (transacción única):");
  for (const r of results) console.log(`  ${r.action} ${r.sku} — ${r.priceNote}`);

  // Verificación post-commit: activas por tamaño.
  const active = await prisma.productVariant.findMany({
    where: { productId: product.id, deletedAt: null, isActive: true },
    select: { attributes: true },
  });
  const bySize = {};
  for (const v of active) {
    const s = /** @type {any} */ (v.attributes)?.sizeCm ?? "?";
    bySize[s] = (bySize[s] ?? 0) + 1;
  }
  console.log("\nVerificación post-commit — variantes ACTIVAS por tamaño:", JSON.stringify(bySize));
  console.log("✓ DONE.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

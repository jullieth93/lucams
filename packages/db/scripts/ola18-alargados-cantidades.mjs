/*
 * Ola 18 (Lucy 2026-07-26) — Alargados: variantes de CANTIDAD (1–6) para homogeneizar
 * con Magnéticos.
 *
 * Lucy: "En Separadores de Libros, Magnéticos tiene cantidad (+/−) y tamaño (chips);
 * Alargados no tiene cantidad y el tamaño se ve diferente. Homogenizar ambas cosas."
 *
 * Con variantes qty 1..6 por tamaño, el VariantSelector pasa SOLO al modo multi-dim
 * (Tamaño = chips · Cantidad = stepper +/− con "$X c/u · Total") — el MISMO modo
 * visual de Magnéticos, sin tocar código.
 *
 * Estructura (espejo de separadores-libros):
 *   - qty 1: variantes YA EXISTENTES (SEP-ALG-15, SEP-ALG-12) — solo se renombran al
 *     patrón de Magnéticos y se normalizan sus attributes (precio $4.000 intacto).
 *   - qty 2..6: variantes nuevas, precio LINEAL $4.000 c/u (el admin ajusta el precio
 *     de packs desde el panel cuando defina el descuento por volumen — el script NO
 *     pisa precios en re-runs).
 *
 * Idempotente: upsert por sku; updates NO pisan price.
 *
 * Uso: pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/ola18-alargados-cantidades.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SIZES = [
  { key: "15", sizeCm: "4×15", aspectRatio: "4:15", existingSku: "SEP-ALG-15" },
  { key: "12", sizeCm: "4×12", aspectRatio: "4:12", existingSku: "SEP-ALG-12" },
];
const UNIT_CENTS = 4000 * 100; // $4.000 c/u — lineal; el admin define descuentos.
const QTYS = [1, 2, 3, 4, 5, 6];

async function main() {
  const product = await prisma.product.findFirst({ where: { slug: "separadores-alargados" } });
  if (!product)
    throw new Error("Producto separadores-alargados no encontrado (corre ola17 primero)");

  for (const size of SIZES) {
    for (const qty of QTYS) {
      const name = `Alargado · ${qty} separador${qty > 1 ? "es" : ""} · ${size.sizeCm} cm`;
      const attributes = {
        shape: "rectangle",
        sizeCm: size.sizeCm,
        quantity: qty,
        photoSlots: qty,
        aspectRatio: size.aspectRatio,
        variantShape: "alargado",
      };
      const sku = qty === 1 ? size.existingSku : `${size.existingSku}-${qty}`;
      const found = await prisma.productVariant.findFirst({ where: { sku } });
      if (found) {
        await prisma.productVariant.update({
          where: { id: found.id },
          data: { productId: product.id, name, attributes, isActive: true, deletedAt: null },
        });
        console.log(`  ~ ${sku} (${name}) actualizada (precio respetado)`);
      } else {
        await prisma.productVariant.create({
          data: {
            productId: product.id,
            sku,
            name,
            attributes,
            price: UNIT_CENTS * qty,
            stock: 100,
            isActive: true,
          },
        });
        console.log(
          `  + ${sku} (${name}) — $${((UNIT_CENTS * qty) / 100).toLocaleString("es-CO")}`,
        );
      }
    }
  }
  console.log("Listo: Ola 18 aplicada (Alargados con cantidades 1–6, modo visual = Magnéticos).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

#!/usr/bin/env node
/* SELECT de solo lectura para verificación del catálogo de tiras (STG o LOCAL). */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PRODUCT_SLUG = "tiras-magneticas-fotos";

async function main() {
  const product = await prisma.product.findFirst({
    where: { slug: PRODUCT_SLUG },
    select: { id: true, name: true },
  });
  if (!product) {
    console.error(`producto ${PRODUCT_SLUG} no encontrado`);
    process.exit(1);
  }
  const variants = await prisma.productVariant.findMany({
    where: { productId: product.id },
    select: {
      sku: true,
      name: true,
      price: true,
      isActive: true,
      deletedAt: true,
      attributes: true,
    },
    orderBy: { sku: "asc" },
  });
  console.log(`${PRODUCT_SLUG}: ${variants.length} variante(s)`);
  for (const v of variants) {
    console.log(
      `  ${v.sku} | "${v.name}" | price=${v.price} | ${v.isActive ? "activa" : "inactiva"}` +
        `${v.deletedAt ? " | deletedAt=" + v.deletedAt.toISOString() : ""} | attrs=${JSON.stringify(v.attributes)}`,
    );
  }
  const bad = variants.filter(
    (v) =>
      v.isActive &&
      !v.deletedAt &&
      typeof v.attributes?.quantity === "number" &&
      v.attributes.quantity > 1,
  );
  console.log(
    bad.length === 0
      ? "OK: sin variantes activas con quantity>1"
      : `FALLO: ${bad.map((v) => v.sku).join(", ")}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

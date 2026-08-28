/*
 * Ola 4 (Lucy 2026-07-23) — TIRA photobooth como UNA pieza continua.
 *
 * La plantilla `photo-strip-3-fotos` traía la foto con 6px de aire en los 4 lados
 * (x6 y6 378×388) → las 3 celdas apiladas mostraban 12px de tarjeta ENTRE fotos
 * ("aire", no se leía como una sola tira). Nueva ventana: sangre VERTICAL (y0,
 * alto completo 400) → las fotos de celdas vecinas SE TOCAN (gap 0 real). Los
 * lados quedan con 12px (≈2mm) de tarjeta y el borde EXTERIOR (arriba/abajo) lo
 * aplica el código por posición de celda (stripPhotoRect, first/last 12px).
 *
 * SOLO toca el canvasData de la plantilla (1 fila). Los diseños existentes (24)
 * conservan su snapshot propio — no se re-renderizan.
 *
 * Uso:  pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/ola4-tira-continua-2026-07-23.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SLUG = "photo-strip-3-fotos";
const NEW_PHOTO = { x: 12, y: 0, width: 366, height: 400 };

async function main() {
  const tpl = await prisma.personalizationTemplate.findUnique({ where: { slug: SLUG } });
  if (!tpl) throw new Error(`No existe la plantilla ${SLUG}`);
  const cd = tpl.canvasData;
  const ph = cd?.layers?.find((l) => l.type === "image-placeholder");
  console.log("Antes:", JSON.stringify(ph));

  const same =
    ph &&
    ph.x === NEW_PHOTO.x &&
    ph.y === NEW_PHOTO.y &&
    ph.width === NEW_PHOTO.width &&
    ph.height === NEW_PHOTO.height;
  if (same) {
    console.log("Ya estaba aplicada (idempotente). 0 filas tocadas.");
    return;
  }

  const layers = cd.layers.map((l) =>
    l.type === "image-placeholder" ? { ...l, ...NEW_PHOTO } : l,
  );
  await prisma.personalizationTemplate.update({
    where: { slug: SLUG },
    data: { canvasData: { ...cd, layers } },
  });
  console.log("Después:", JSON.stringify({ ...ph, ...NEW_PHOTO }));
  console.log("Listo: 1 fila actualizada (PersonalizationTemplate.photo-strip-3-fotos).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

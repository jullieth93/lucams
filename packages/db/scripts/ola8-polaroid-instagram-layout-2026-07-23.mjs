/*
 * Ola 8 (Lucy 2026-07-23) — Polaroid Instagram: más aire entre líneas de texto.
 *
 * La plantilla `photo-pack-polaroid-instagram` tenía likes/caption/hashtags muy
 * amontonados bajo la foto (y 492/510/531). Se re-ubican con más respiro para
 * que se lea como un post real de Instagram.
 *
 * Solo toca el canvasData de la plantilla. Los diseños existentes conservan su
 * snapshot propio.
 *
 * Uso:  pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/ola8-polaroid-instagram-layout-2026-07-23.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SLUG = "photo-pack-polaroid-instagram";
const TEXT_Y = {
  user_name: 30,
  likes_count: 500,
  caption: 524,
  hashtags: 548,
};

async function main() {
  const tpl = await prisma.personalizationTemplate.findUnique({ where: { slug: SLUG } });
  if (!tpl) throw new Error(`No existe la plantilla ${SLUG}`);
  const cd = tpl.canvasData;

  const textLayers = cd?.layers?.filter((l) => l.type === "text");
  console.log(
    "Antes:",
    JSON.stringify(textLayers?.map((l) => ({ id: l.id, y: l.y, text: l.text }))),
  );

  const layers = cd.layers.map((l) => {
    if (l.type !== "text") return l;
    const targetY = TEXT_Y[l.id];
    if (targetY === undefined || l.y === targetY) return l;
    return { ...l, y: targetY };
  });

  const same = layers.every((l, i) => JSON.stringify(l) === JSON.stringify(cd.layers[i]));
  if (same) {
    console.log("Ya estaba aplicada (idempotente). 0 filas tocadas.");
    return;
  }

  await prisma.personalizationTemplate.update({
    where: { slug: SLUG },
    data: { canvasData: { ...cd, layers } },
  });

  console.log(
    "Después:",
    JSON.stringify(
      layers
        .filter((l) => l.type === "text")
        .map((l) => ({ id: l.id, y: l.y, text: l.text })),
    ),
  );
  console.log("Listo: 1 fila actualizada (PersonalizationTemplate.photo-pack-polaroid-instagram).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

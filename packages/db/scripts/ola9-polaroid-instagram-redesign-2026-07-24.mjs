/*
 * Ola 16 (Lucy 2026-07-24) — Polaroid Instagram: rediseño más fiel a un post real.
 *
 * Re-layout de la plantilla `photo-pack-polaroid-instagram`:
 *   - Borde degradado estilo Instagram y tarjeta blanca interior.
 *   - Cabecera con avatar más grande (username y=35, location y=52).
 *   - Foto agrandada: x=15 y=70 420×400.
 *   - Pie re-espaciado (likes y=520, caption y=542, hashtags y=560) acorde al nuevo
 *     chrome SVG: iconos de acción en y=484, comentarios horneados en y=576.
 *
 * Solo toca el canvasData de la plantilla (capas text). Los drafts/cotizaciones
 * existentes conservan su snapshot propio.
 *
 * Uso:  pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/ola9-polaroid-instagram-redesign-2026-07-24.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SLUG = "photo-pack-polaroid-instagram";

// Definición COMPLETA de las capas text (mismo shape que el helper text() del seed).
// OJO: la `y` de Konva es el CENTRO vertical del texto (el renderer resta fontSize/2).
const TEXT_LAYERS = [
  {
    id: "user_name",
    type: "text",
    x: 68,
    y: 35,
    text: "@tu_usuario",
    fontFamily: "Inter",
    fontSize: 16,
    fill: "#262626",
    fontWeight: "bold",
    align: "left",
    editable: true,
  },
  {
    id: "location",
    type: "text",
    x: 68,
    y: 52,
    text: "Bogotá, Colombia",
    fontFamily: "Inter",
    fontSize: 12,
    fill: "#8E8E8E",
    fontWeight: "normal",
    align: "left",
    editable: true,
  },
  {
    id: "likes_count",
    type: "text",
    x: 22,
    y: 520,
    text: "362 me gusta",
    fontFamily: "Inter",
    fontSize: 15,
    fill: "#262626",
    fontWeight: "bold",
    align: "left",
    editable: true,
  },
  {
    id: "caption",
    type: "text",
    x: 22,
    y: 542,
    text: "Tu título acá",
    fontFamily: "Inter",
    fontSize: 16,
    fill: "#262626",
    fontWeight: "bold",
    align: "left",
    editable: true,
  },
  {
    id: "hashtags",
    type: "text",
    x: 22,
    y: 560,
    text: "#mirecuerdo #lucamsshop",
    fontFamily: "Inter",
    fontSize: 13,
    fill: "#00376B",
    fontWeight: "normal",
    align: "left",
    editable: true,
  },
];

async function main() {
  const tpl = await prisma.personalizationTemplate.findUnique({ where: { slug: SLUG } });
  if (!tpl) throw new Error(`No existe la plantilla ${SLUG}`);
  const cd = tpl.canvasData;

  console.log(
    "Antes:",
    JSON.stringify(
      cd?.layers
        ?.filter((l) => l.type === "text")
        .map((l) => ({ id: l.id, x: l.x, y: l.y, fontSize: l.fontSize })),
    ),
  );

  // Reemplaza las capas text existentes por el set Ola 9 (conserva background,
  // image-placeholder y asset tal cual, en su orden). Idempotente: si las 5
  // capas ya están con estos valores exactos, no escribe.
  const nonText = cd.layers.filter((l) => l.type !== "text");
  const newLayers = [...nonText, ...TEXT_LAYERS];

  const same = JSON.stringify(newLayers) === JSON.stringify(cd.layers);
  if (same) {
    console.log("Ya estaba aplicada (idempotente). 0 filas tocadas.");
    return;
  }

  await prisma.personalizationTemplate.update({
    where: { slug: SLUG },
    data: { canvasData: { ...cd, layers: newLayers } },
  });

  console.log(
    "Después:",
    JSON.stringify(
      newLayers
        .filter((l) => l.type === "text")
        .map((l) => ({ id: l.id, x: l.x, y: l.y, fontSize: l.fontSize })),
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

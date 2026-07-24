/*
 * Ola 9 (Lucy 2026-07-24) — Polaroid Instagram: rediseño con referencia del diseñador.
 *
 * Re-layout completo de la plantilla `photo-pack-polaroid-instagram` siguiendo la
 * referencia `apps/web/public/templates/ig.svg`:
 *   - Cabecera alineada al avatar (username sube de y=30 a y=9, fontSize 20).
 *   - NUEVO texto editable `location` ("Bogotá, Colombia") bajo el username.
 *   - Pie re-espaciado (likes y=501, caption y=525, hashtags y=549) acorde al nuevo
 *     chrome SVG: corazón rojo relleno + acciones en y=461, comentarios/fecha
 *     horneados DENTRO del canvas (antes "Agrega un comentario..." caía a y=600,
 *     cortado por el borde del stage).
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
    x: 64,
    y: 20,
    text: "@tu_usuario",
    fontFamily: "Inter",
    fontSize: 20,
    fill: "#262626",
    fontWeight: "bold",
    align: "left",
    editable: true,
  },
  {
    id: "location",
    type: "text",
    x: 64,
    y: 42,
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
    x: 25,
    y: 512,
    text: "362 me gusta",
    fontFamily: "Inter",
    fontSize: 17,
    fill: "#262626",
    fontWeight: "bold",
    align: "left",
    editable: true,
  },
  {
    id: "caption",
    type: "text",
    x: 25,
    y: 537,
    text: "Tu título acá",
    fontFamily: "Inter",
    fontSize: 18,
    fill: "#262626",
    fontWeight: "bold",
    align: "left",
    editable: true,
  },
  {
    id: "hashtags",
    type: "text",
    x: 25,
    y: 559,
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

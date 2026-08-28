/*
 * Cobertura de tags para el recomendador "¿Te ayudamos a elegir?" (2026-07-22).
 *
 * Mecanismo real del scoring (apps/web/lib/catalog.ts recommendProducts, decisión 6.2):
 *   +3 por cada ocasión que matchea vía pivot ProductOcasionTag → OcasionTag.slug
 *   +2 si Product.idealFor contiene un TOKEN del vocabulario controlado por destinatario
 *      (DESTINATARIO_KEYWORDS: personal/coleccionable · pareja/romantico/aniversario ·
 *      familiar/familia/hogar · amigo/amistad · empresarial/corporativo/empresa/negocio ·
 *      nino/infantil/bebe · adolescente/joven — comparación por token exacto sin tildes)
 *   precio = filtro duro; personalización = +1; featured = +0.5; corte score > 2.
 *
 * Este script ALINEA LOS DATOS a ese mecanismo, SOLO ADITIVO (nunca quita tags que
 * Lucy haya puesto a mano):
 *   1. Inserta links ProductOcasionTag faltantes (skipDuplicates) con rationale.
 *   2. Anexa a Product.idealFor las frases faltantes que contienen los tokens exactos.
 *
 * Idempotente: re-ejecutar no duplica links ni entradas de idealFor.
 *
 * Uso:
 *   node scripts/tag-recommender-coverage.mjs
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

// productSlug → [[ocasionSlug, rationale], ...]  (SOLO se añaden los que falten)
const OCASION_LINKS = {
  "separadores-libros": [
    ["cumpleanos", "Separador con foto personalizado, detalle de cumpleaños para lectores"],
    ["dia-madre", "Separadores con foto familiar, regalo útil para mamás lectoras"],
    ["para-mi-mismo", "Uso personal para marcar lecturas con tus fotos"],
    ["amor-y-amistad", "Detalle pequeño y personal para regalar en Amor y Amistad"],
  ],
  "abecedario-completo": [
    ["dia-nino", "Juego educativo estrella para el Día del Niño"],
    ["cumpleanos", "Regalo educativo para cumpleaños infantiles"],
    ["navidad", "Regalo educativo de Navidad para niños en edad preescolar"],
  ],
  "pack-vocales": [
    ["dia-nino", "Primeras vocales en fichas kawaii, ideal Día del Niño"],
    ["cumpleanos", "Detalle educativo para cumpleaños de preescolar"],
  ],
  "nombre-personalizado": [
    ["dia-nino", "Nombre magnético para el cuarto, regalo de Día del Niño"],
    ["cumpleanos", "Detalle personalizado con el nombre del cumpleañero/a"],
    ["baby-shower", "Nombre del bebé en fichas kawaii, regalo de baby shower"],
    ["bautizo", "Detalle personalizado con el nombre del bebé para el bautizo"],
  ],
  "set-fotoimanes-polaroid": [
    ["dia-madre", "Fotos de la familia en formato polaroid para mamá"],
    ["aniversario", "Recopilación de fotos de pareja en imanes para aniversario"],
  ],
  "set-fotoimanes-cuadrados": [["dia-madre", "Set de imanes con fotos familiares para mamá"]],
  "calendario-mes-a-mes-fotos": [
    [
      "cumpleanos",
      "Calendario con 12 fotos de la familia, regalo de cumpleaños para papás y abuelos",
    ],
  ],
};

// productSlug → frases a ANEXAR en idealFor (tokens del vocabulario controlado en negrita
// conceptual: amigo/personal/coleccionable · infantil/nino/bebe/familiar · pareja/aniversario/adolescente)
const IDEAL_FOR_ADD = {
  "separadores-libros": [
    "regalo para un amigo lector",
    "uso personal de lectura",
    "coleccionable para lectores",
  ],
  "abecedario-completo": [
    "juguete infantil educativo",
    "aprender a leer niño preescolar",
    "actividad familiar en casa",
  ],
  "pack-vocales": ["refuerzo infantil de lectura", "juguete para niño que aprende a leer"],
  "nombre-personalizado": [
    "decoración infantil del cuarto",
    "regalo para bebé",
    "regalo personalizado para niño",
  ],
  "set-fotoimanes-polaroid": [
    "regalo de aniversario para tu pareja",
    "decoración cuarto adolescente",
  ],
  "calendario-mes-a-mes-fotos": ["regalo familiar para los abuelos"],
};

async function main() {
  console.log("=== tag-recommender-coverage (aditivo, idempotente) ===\n");

  // Resolver ocasiones de una vez (falla rápido si un slug no existe/inactivo).
  const ocasiones = await prisma.ocasionTag.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, slug: true },
  });
  const ocasionId = new Map(ocasiones.map((o) => [o.slug, o.id]));

  for (const [slug, links] of Object.entries(OCASION_LINKS)) {
    const product = await prisma.product.findFirst({
      where: { slug, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!product) {
      console.log(`  ⚠ ${slug}: producto no encontrado/inactivo → skip`);
      continue;
    }
    for (const [ocSlug] of links) {
      if (!ocasionId.has(ocSlug)) throw new Error(`OcasionTag '${ocSlug}' no existe/inactivo`);
    }
    const res = await prisma.productOcasionTag.createMany({
      data: links.map(([ocSlug, rationale]) => ({
        productId: product.id,
        ocasionTagId: ocasionId.get(ocSlug),
        rationale,
      })),
      skipDuplicates: true,
    });
    console.log(
      `  ${slug.padEnd(28)} ocasiones: +${res.count} nuevas (${links.map(([s]) => s).join(", ")})`,
    );
  }

  console.log("");
  for (const [slug, additions] of Object.entries(IDEAL_FOR_ADD)) {
    const product = await prisma.product.findFirst({
      where: { slug, deletedAt: null, isActive: true },
      select: { id: true, idealFor: true },
    });
    if (!product) {
      console.log(`  ⚠ ${slug}: producto no encontrado/inactivo → skip idealFor`);
      continue;
    }
    const current = Array.isArray(product.idealFor) ? product.idealFor : [];
    const missing = additions.filter((a) => !current.includes(a));
    if (missing.length === 0) {
      console.log(`  ${slug.padEnd(28)} idealFor: ya completo (${current.length} entradas)`);
      continue;
    }
    await prisma.product.update({
      where: { id: product.id },
      data: { idealFor: [...current, ...missing] },
    });
    console.log(`  ${slug.padEnd(28)} idealFor: +${missing.length} (${missing.join(" · ")})`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

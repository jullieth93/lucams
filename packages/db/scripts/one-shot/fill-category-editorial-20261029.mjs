#!/usr/bin/env node
/*
 * fill-category-editorial-20261029.mjs — llena richDescription + useCase de las
 * 3 categorías raíz que los tienen VACÍOS (calendarios, foto-imanes,
 * juegos-aprendizaje). `separadores` ya está completa (referencia de tono).
 *
 * Por qué existe: auditoría SEO 2026-10-28 (tmp/seo-audit, E18) — las páginas de
 * categoría quedan como grid puro sin contenido editorial; richDescription
 * alimenta la sección "Sobre {categoría}" del storefront y la meta description
 * de subcategorías, y useCase orienta al comprador.
 *
 * Reglas:
 *   - NUNCA pisa un campo que ya tenga contenido (convención "nunca pisa
 *     ediciones" — solo escribe donde el campo es null o cadena vacía).
 *   - Idempotente: re-correrlo es no-op.
 *   - Textos basados SOLO en datos reales del catálogo PRD (tamaños, material,
 *     tiempos de producción/envío, festivos, empaque). Propuesta y fuentes en
 *     tmp/seo-audit/category-content-proposal.md.
 *
 * Uso (desde packages/db):
 *   npx dotenv -e ../../.env.stg   -- node scripts/one-shot/fill-category-editorial-20261029.mjs           # dry-run
 *   npx dotenv -e ../../.env.stg   -- node scripts/one-shot/fill-category-editorial-20261029.mjs --apply   # STG
 *   npx dotenv -e ../../.env.local -- node scripts/one-shot/fill-category-editorial-20261029.mjs --apply   # PRD (env-guard pide LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1)
 *
 * OJO: el storefront cachea catálogo (tag `catalog`) — tras aplicar, la página
 * de categoría refleja el texto al revalidar (o antes si se invalida a mano).
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

const APPLY = process.argv.includes("--apply");
// --force: sobrescribe campos ya llenos (solo para corregir lo que ESTE script escribió;
// el default sigue siendo nunca pisar contenido existente).
const FORCE = process.argv.includes("--force");
if (APPLY) assertDestructiveAllowed("fill-category-editorial-20261029.mjs");

const CONTENT = {
  calendarios: {
    useCase:
      "Ideal para organizar el año en la nevera, regalos de fin de año y familias que quieren ver sus fotos favoritas todos los días.",
    richDescription:
      "El Calendario Magnético Lucams convierte tus fotos favoritas en un año completo de recuerdos: son 12 tarjetas mensuales de 7.5×10 cm, cada una con tu foto arriba y el mes abajo en lettering grande, con los festivos de Colombia ya marcados. Lo diseñas tú en minutos en el Estudio: subes las 12 fotos (una por mes), eliges el año y listo. Lo producimos a mano en Bogotá y lo despachamos en máximo 2 días hábiles; llega en empaque de regalo, así que sirve tanto para tu casa como para regalar listo. Es el regalo perfecto de fin de año: para abuelos que quieren ver a los nietos todos los meses, parejas que celebran su año juntos o mamás que organizan la familia con estilo. Enviamos a toda Colombia y en Bogotá, con Envío Lucams (localidades habilitadas), puedes recibirlo el mismo día del despacho.",
  },
  "foto-imanes": {
    useCase:
      "Ideal para decorar la nevera con tus fotos favoritas, regalos personalizados para parejas y amigos, y recuerdos de matrimonios, bautizos y cumpleaños.",
    richDescription:
      "Los Fotoimanes Lucams convierten tus fotos en imanes de nevera con acabado profesional: impresión en alta resolución sobre PET laminado mate, firmes en la nevera o cualquier superficie metálica. Tres formatos para elegir: Polaroid (6×8 cm, con los bordes blancos icónicos), Cuadrados (4×4, 5×5 o 7×7 cm, a sangre total o con marco blanco, negro o del color exacto que quieras) y Tiras estilo photobooth (6.5×20 o 6.5×26.5 cm, con 3 o 4 fotos apiladas sobre el fondo que elijas). Todo lo diseñas tú en el Estudio: subes tus fotos, las ajustas y ves el resultado antes de pedir. Los fotoimanes se venden por packs de 6 unidades e incluyen sticker kawaii y tarjeta de agradecimiento; los producimos a mano en Bogotá y los despachamos en máximo 2 días hábiles. Son el recuerdo favorito para matrimonios, bautizos, baby showers y cumpleaños, y un regalo personalizado que sí emociona. Envíos a toda Colombia.",
  },
  "juegos-aprendizaje": {
    useCase:
      "Ideal para niños que están aprendiendo a leer, padres y docentes que buscan material didáctico magnético, y decoración educativa del cuarto de los peques.",
    richDescription:
      "Los Juegos de Aprendizaje Lucams hacen que aprender a leer sea un juego: fichas magnéticas con diseños kawaii pensadas para las manos más pequeñas. El Abecedario Completo trae las 27 letras del español (incluye la Ñ) o las 26 del inglés, cada una con su animalito kawaii (A de Ave, B de Burro…) — perfecto para formar palabras en la nevera o decorar el cuarto. El Pack de Vocales reúne las 5 vocales en fichas que los niños personalizan con colores en el Estudio, eligiendo su tema favorito (animales, frutas o profesiones) e idioma. Ambos se producen en PET laminado mate, disponibles con o sin imán, y salen de nuestro taller de Bogotá en máximo 1 día hábil. Son el regalo útil para baby showers, primeros cumpleaños y maestras de preescolar: un juguete educativo hecho a mano en Colombia que decora mientras enseña.",
  },
};

const prisma = new PrismaClient();

function targetRef() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
  if (/127\.0\.0\.1|localhost/.test(url)) return "LOCAL (127.0.0.1)";
  const m = url.match(/db\.([a-z0-9]+)\.supabase\.co|postgres\.([a-z0-9]+)@/);
  return m ? `Supabase ref ${m[1] ?? m[2]}` : "host desconocido";
}

console.log(`=== fill-category-editorial-20261029 — ${APPLY ? "APLICANDO" : "DRY-RUN"} ===`);
console.log(`Destino: ${targetRef()}\n`);

let updated = 0;
let skipped = 0;

for (const [slug, fields] of Object.entries(CONTENT)) {
  const cat = await prisma.category.findUnique({
    where: { slug },
    select: { slug: true, richDescription: true, useCase: true, deletedAt: true },
  });
  if (!cat || cat.deletedAt) {
    console.log(`✗ ${slug}: categoría no encontrada o borrada — se omite`);
    skipped++;
    continue;
  }
  const patch = {};
  if (FORCE || !cat.richDescription?.trim()) patch.richDescription = fields.richDescription;
  if (FORCE || !cat.useCase?.trim()) patch.useCase = fields.useCase;
  const keys = Object.keys(patch);
  if (keys.length === 0) {
    console.log(`= ${slug}: ya tiene contenido — no se pisa`);
    skipped++;
    continue;
  }
  console.log(
    `${APPLY ? "✓" : "→"} ${slug}: ${APPLY ? "se llenaron" : "se llenarían"} ${keys.join(", ")}`,
  );
  if (APPLY) {
    await prisma.category.update({ where: { slug }, data: patch });
    updated++;
  }
}

console.log(
  `\nResumen: ${APPLY ? `${updated} actualizadas` : `${Object.keys(CONTENT).length - skipped} por actualizar`}, ${skipped} intactas.`,
);
await prisma.$disconnect();

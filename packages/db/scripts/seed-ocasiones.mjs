/*
 * Seed de OcasionTag — PLAN_CATALOG_V2 decisiones 1.5 + 2.10 + 3.4.
 *
 * 15 tags transversales por ocasión que cruzan categorías. Mercado colombiano.
 * Cada uno con descripción semántica (alimenta bot AI Fase 5+) + monthHint
 * (mes destacado para auto-rotación menú header) + suggestedQuantityRange
 * (bot recomienda variant según ocasión).
 *
 * Idempotente: upsert por slug. Re-ejecutar actualiza name/description/etc.
 * NO pisa la relación ProductOcasionTag (esa la maneja seed-catalog-v2.mjs).
 *
 * N-06 (2026-09-12): DRY-RUN por defecto (`--apply` ejecuta) + env-guard
 * fail-closed (bloquea PRD/remotos no reconocidos). El update sí alinea
 * name/description/monthHint/order y reactiva (isActive:true) — es el
 * comportamiento canónico declarado; si Lucy desactiva una ocasión en el
 * admin y no quiere que el seed la reactive, debe sacarla de este archivo.
 *
 * Uso (vía Makefile — el target pasa --apply):
 *   make seed-ocasiones
 * Directo:
 *   node scripts/seed-ocasiones.mjs            # DRY-RUN
 *   node scripts/seed-ocasiones.mjs --apply    # aplica
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

// Guarda de ambiente: upsert de ocasiones — bloquea PRD/remotos no STG.
assertDestructiveAllowed("seed-ocasiones.mjs");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

console.log(`=== seed-ocasiones (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

// 15 ocasiones — orden de aparición en menú "Por ocasión ▾".
// monthHint: mes en que se celebra fuertemente en Colombia (auto-rotación).
// suggestedQuantityRange: rango típico de unidades (bot lo usa para sugerir variant).
const ocasiones = [
  {
    slug: "cumpleanos",
    name: "Cumpleaños",
    description:
      "Regalos y recordatorios personalizados con foto para cumpleaños en Colombia: fotoimanes Polaroid, cuadrados, tiras estilo photobooth y separadores hechos a mano. Ideales como sorpresa para invitados o detalle especial con nombre y fotos favoritas. Para mesas de dulces y fiestas infantiles se suelen pedir packs de 12 a 30 unidades; desde 25 unidades puedes configurar precios escalonados en Empresas y eventos. Preparación en 2 días hábiles y envío a Bogotá y más de 1.100 destinos.",
    monthHint: null, // todo el año
    suggestedQuantityRange: { min: 10, ideal: 20, max: 40 },
    order: 1,
  },
  {
    slug: "matrimonio",
    name: "Matrimonio",
    description:
      "Recordatorios de matrimonio personalizados en Colombia: fotoimanes Polaroid, cuadrados, tiras magnéticas y separadores con las fotos de los novios y la fecha de la boda. Un detalle duradero que tus invitados conservan en la nevera o en sus libros, impreso en calidad fotográfica laminada 300 DPI. En bodas es habitual pedir entre 30 y 150+ unidades con muestra digital previa y precios por volumen desde 25 unidades en Empresas y eventos.",
    monthHint: null,
    suggestedQuantityRange: { min: 30, ideal: 80, max: 150 },
    order: 2,
  },
  {
    slug: "bautizo",
    name: "Bautizo",
    description:
      "Recordatorios de bautizo personalizados en Colombia con la foto del bebé, su nombre y la fecha en fotoimanes Polaroid, cuadrados o separadores magnéticos. Diséñalos en vivo en nuestro Estudio con marcos suaves y acabado fotográfico laminado 300 DPI. Para celebraciones íntimas suele elegirse entre 12 y 30 unidades, con preparación en 2 días hábiles y envío asegurado a toda Colombia.",
    monthHint: null,
    suggestedQuantityRange: { min: 12, ideal: 20, max: 30 },
    order: 3,
  },
  {
    slug: "baby-shower",
    name: "Baby Shower",
    description:
      "Recuerdos personalizados para baby shower en Colombia: fotoimanes Polaroid, cuadrados, tiras fotográficas y separadores hechos a mano para celebrar la llegada del bebé. Personaliza cada detalle en vivo con fotos de ecografía, nombre o diseño especial y vista previa 3D antes de comprar. Se suelen elegir entre 12 y 30 unidades (o precios escalonados desde 25 unidades en Empresas y eventos), con envío a más de 1.100 destinos.",
    monthHint: null,
    suggestedQuantityRange: { min: 12, ideal: 25, max: 50 },
    order: 4,
  },
  {
    slug: "grado",
    name: "Grado",
    description:
      "Recordatorios y regalos de grado personalizados en Colombia: fotoimanes con la foto del graduado, tiras magnéticas estilo photobooth, calendarios y separadores para libros. Personalízalos en minutos con título, fecha y colores favoritos en impresión fotográfica laminada 300 DPI. Perfectos para grados de colegio o universidad desde 6 unidades hasta pedidos grupales con tarifa preferencial desde 25 unidades en Empresas y eventos.",
    monthHint: 11,
    suggestedQuantityRange: { min: 12, ideal: 25, max: 50 },
    order: 5,
  },
  {
    slug: "quinceanera",
    name: "Quinceañera",
    description:
      "Recordatorios personalizados para 15 años en Colombia: fotoimanes Polaroid, cuadrados, tiras estilo photobooth y separadores con las fotos de la sesión y el color de tu fiesta. Un recuerdo diferente que tus invitados sí guardan, impreso en calidad fotográfica laminada 300 DPI. Para fiestas de quinceañera se acostumbran packs de 30 a 80+ unidades con muestra digital y tarifas por volumen desde 25 unidades en Empresas y eventos.",
    monthHint: null,
    suggestedQuantityRange: { min: 30, ideal: 60, max: 120 },
    order: 6,
  },
  {
    slug: "aniversario",
    name: "Aniversario",
    description:
      "Regalos personalizados de aniversario en Colombia hechos con tus mejores fotos: Fotoimanes Polaroid, Cuadrados, Tiras Magnéticas estilo photobooth y Calendario Set 12 Tarjetas. Diseña tu regalo en vivo en el Estudio con vista previa 3D y elige acabado con imán o sin imán. Hechos a mano en Colombia con preparación en 2 días hábiles y envío a Bogotá y todo el país.",
    monthHint: null,
    suggestedQuantityRange: { min: 1, ideal: 6, max: 12 },
    order: 7,
  },
  {
    slug: "dia-madre",
    name: "Día de la Madre",
    description:
      "Regalos personalizados para el Día de la Madre en Colombia: fotoimanes Polaroid y cuadrados con fotos en familia, Tiras Magnéticas y Calendario mes a mes de 12 tarjetas. Sube tus fotos desde el celular en nuestro Estudio de personalización y revisa cómo queda antes de pedirlo. Impresión fotográfica laminada 300 DPI, hechos a mano en Colombia con envío a más de 1.100 destinos.",
    monthHint: 5,
    suggestedQuantityRange: { min: 1, ideal: 1, max: 6 },
    order: 8,
  },
  {
    slug: "dia-padre",
    name: "Día del Padre",
    description:
      "Regalos personalizados para el Día del Padre en Colombia con sus fotos favoritas: Fotoimanes Cuadrados, Polaroid, Tiras Magnéticas, Separadores para libros y Calendario 12 tarjetas. Personalízalos en vivo en pocos minutos en el Estudio con calidad fotográfica laminada 300 DPI. Hechos a mano en Colombia con preparación en 2 días hábiles y envío a Bogotá y todo el país.",
    monthHint: 6,
    suggestedQuantityRange: { min: 1, ideal: 1, max: 6 },
    order: 9,
  },
  {
    slug: "dia-nino",
    name: "Día del Niño",
    description:
      "Regalos didácticos y personalizados para el Día del Niño en Colombia: Abecedario Completo con animales kawaii, Pack Vocales en español o inglés y fotoimanes para decorar. Disponibles en versión con imán o sin imán, impresos en calidad fotográfica laminada 300 DPI para aprender jugando en casa o en el colegio. Hechos a mano en Colombia con envío a más de 1.100 destinos.",
    monthHint: 4,
    suggestedQuantityRange: { min: 1, ideal: 1, max: 4 },
    order: 10,
  },
  {
    slug: "amor-y-amistad",
    name: "Amor y Amistad",
    description:
      "Detalles personalizados para Amor y Amistad en Colombia: Fotoimanes Polaroid, Cuadrados, Tiras Magnéticas estilo photobooth y Separadores Magnéticos con tus fotos favoritas. Diseña tu regalo en vivo en el Estudio eligiendo marcos y colores, con vista previa 3D antes de confirmar. Hechos a mano en Colombia con preparación en 2 días hábiles y envío nacional.",
    monthHint: 9,
    suggestedQuantityRange: { min: 1, ideal: 1, max: 6 },
    order: 11,
  },
  {
    slug: "halloween",
    name: "Halloween",
    description:
      "Recuerdos y detalles personalizados para Halloween en Colombia: fotoimanes, tiras estilo photobooth y separadores para libros con tus fotos de disfraces o temáticas de octubre. Personalízalos en vivo en nuestro Estudio con marcos de color y acabado fotográfico laminado 300 DPI. Ideales para fiestas en casa, colegios o eventos corporativos con tarifas por volumen desde 25 unidades en Empresas y eventos.",
    monthHint: 10,
    suggestedQuantityRange: { min: 1, ideal: 4, max: 12 },
    order: 12,
  },
  {
    slug: "navidad",
    name: "Navidad",
    description:
      "Regalos y decoración personalizada para Navidad en Colombia: Bola Navideña Personalizada dúplex de 8 cm con foto, Calendario Set 12 Tarjetas para el nuevo año y fotoimanes. Personaliza cada pieza en vivo en el Estudio con plantillas navideñas o tus propias fotos y vista previa 3D. Hechos a mano en Colombia con preparación en 2 días hábiles, opción por volumen para empresas desde 25 unidades y envío nacional.",
    monthHint: 12,
    suggestedQuantityRange: { min: 1, ideal: 6, max: 20 },
    order: 13,
  },
  {
    slug: "ano-nuevo",
    name: "Año Nuevo",
    description:
      "Regalos personalizados para recibir el Año Nuevo en Colombia: Calendario Set 12 Tarjetas con tus fotos y festivos de Colombia marcados, fotoimanes y separadores para nuevos propósitos. Elige el año y tus 12 fotos en el Estudio en vivo, en versión con imán para nevera o sin imán. Hechos a mano en Colombia con impresión fotográfica laminada 300 DPI y envío a más de 1.100 destinos.",
    monthHint: 1,
    suggestedQuantityRange: { min: 1, ideal: 2, max: 12 },
    order: 14,
  },
  {
    slug: "empresarial",
    name: "Empresarial",
    description:
      "Regalos corporativos y merchandising magnético personalizado en Colombia para empresas, marcas y eventos: fotoimanes, calendarios, tiras, separadores y bolas navideñas con tu logotipo. Configura tu proyecto desde 25 hasta más de 5.000 unidades en Empresas y eventos (/empresas-y-eventos) con tarifas escalonadas, validación de muestra digital previa, propuesta formal y envío asegurado a todo el país.",
    monthHint: null,
    suggestedQuantityRange: { min: 25, ideal: 100, max: 500 },
    order: 15,
  },
  {
    slug: "para-mi-mismo",
    name: "Para mí mismo",
    description:
      "Detalles personalizados para tu espacio, tus fotos y tus lecturas en Colombia: Separadores Magnéticos y Largos para libros, Fotoimanes Polaroid, Tiras Magnéticas y Calendario 12 tarjetas. Sube tus recuerdos favoritos o elige diseños del catálogo en nuestro Estudio con vista previa 3D e impresión fotográfica laminada 300 DPI. Hechos a mano en Colombia con envío rápido a Bogotá y todo el país.",
    monthHint: null,
    suggestedQuantityRange: { min: 1, ideal: 4, max: 12 },
    order: 16,
  },
];

async function main() {
  let created = 0;
  let updated = 0;

  for (const oc of ocasiones) {
    const existing = await prisma.ocasionTag.findUnique({ where: { slug: oc.slug } });
    if (existing) {
      updated++;
      if (APPLY) {
        await prisma.ocasionTag.update({
          where: { slug: oc.slug },
          data: {
            name: oc.name,
            description: oc.description,
            monthHint: oc.monthHint,
            suggestedQuantityRange: oc.suggestedQuantityRange,
            order: oc.order,
            isActive: true,
          },
        });
      }
    } else {
      created++;
      if (APPLY) {
        await prisma.ocasionTag.create({
          data: {
            slug: oc.slug,
            name: oc.name,
            description: oc.description,
            monthHint: oc.monthHint,
            suggestedQuantityRange: oc.suggestedQuantityRange,
            order: oc.order,
            isActive: true,
          },
        });
      }
    }
  }

  console.log(
    APPLY
      ? `✓ ${created} ocasiones creadas, ${updated} actualizadas.`
      : `DRY-RUN · ${created} ocasiones se crearían, ${updated} se actualizarían.`,
  );
  console.log(`Total OcasionTag declarados: ${ocasiones.length}.`);
  if (!APPLY) console.log("Para ejecutar: node scripts/seed-ocasiones.mjs --apply");
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

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
 * Uso (vía Makefile):
 *   make seed-ocasiones
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

console.log("=== seed-ocasiones ===\n");

// 15 ocasiones — orden de aparición en menú "Por ocasión ▾".
// monthHint: mes en que se celebra fuertemente en Colombia (auto-rotación).
// suggestedQuantityRange: rango típico de unidades (bot lo usa para sugerir variant).
const ocasiones = [
  {
    slug: "cumpleanos",
    name: "Cumpleaños",
    description:
      "El cumpleaños es ocasión clave para regalos personalizados en Colombia. " +
      "Lo común es regalar imanes con foto del cumpleañero/a + nombre + edad. " +
      "Recuerdos para invitados (mesa de dulces, sorpresas) varían según la edad: " +
      "infantil suele ser x20-x30, adulto puede ser x12-x20 más selectos. " +
      "Cumpleaños premium o de adulto mayor admite Cuadros con Foto + Box Pareja.",
    monthHint: null, // todo el año
    suggestedQuantityRange: { min: 10, ideal: 20, max: 40 },
    order: 1,
  },
  {
    slug: "matrimonio",
    name: "Matrimonio",
    description:
      "Bodas en Colombia mueven volumen alto de recordatorios para invitados. " +
      "Mínimo común x30, promedio x50-80, bodas grandes hasta x150+. Los novios " +
      "buscan diseño elegante: floral, minimal o tema personalizado. Box Pareja y " +
      "Glass Magnets premium funcionan como regalo para padrinos o pareja misma. " +
      "Cuadros con foto del compromiso son detalle especial para padres.",
    monthHint: null,
    suggestedQuantityRange: { min: 30, ideal: 80, max: 150 },
    order: 2,
  },
  {
    slug: "bautizo",
    name: "Bautizo",
    description:
      "Bautizos en Colombia (tradición católica fuerte) suelen ser celebración íntima " +
      "con 15-30 invitados. Recordatorios con foto del bebé + fecha + nombres de padres " +
      "y padrinos. Diseño tierno, pastel, motivo religioso (ángel, cruz, paloma). " +
      "Recordatorios suelen ser x12-x20 según asistentes.",
    monthHint: null,
    suggestedQuantityRange: { min: 12, ideal: 20, max: 30 },
    order: 3,
  },
  {
    slug: "baby-shower",
    name: "Baby Shower",
    description:
      "Baby shower previo al nacimiento, 15-30 invitadas típicamente. Diseños " +
      "kawaii con animalitos, nubes, lunas. Recordatorios x12-x25 ideal. " +
      "Box Recién Nacido es regalo principal de la anfitriona.",
    monthHint: null,
    suggestedQuantityRange: { min: 12, ideal: 25, max: 50 },
    order: 4,
  },
  {
    slug: "grado",
    name: "Grado",
    description:
      "Graduaciones (colegio, técnico, universitario) en Colombia se concentran en " +
      "Noviembre-Diciembre y Junio-Julio. Recordatorios x20-x30 con foto del/la " +
      "graduado/a + título obtenido + año. Cuadros con frase motivacional + foto " +
      "son regalo común para los padres.",
    monthHint: 11,
    suggestedQuantityRange: { min: 12, ideal: 25, max: 50 },
    order: 5,
  },
  {
    slug: "quinceanera",
    name: "Quinceañera",
    description:
      "Celebración 15 años — fiesta grande tradición latina. Recordatorios x30-x80 " +
      "con foto de la quinceañera + fecha + tema de la fiesta. Diseño glamoroso, " +
      "rosa, dorado, perlado.",
    monthHint: null,
    suggestedQuantityRange: { min: 30, ideal: 60, max: 120 },
    order: 6,
  },
  {
    slug: "aniversario",
    name: "Aniversario",
    description:
      "Aniversarios de matrimonio o noviazgo. Regalo íntimo, no recordatorio masivo. " +
      "Fotoimanes Corazón + Cuadros con Foto + Box Pareja son top. Glass Magnets " +
      "premium para aniversarios significativos (5, 10, 25 años).",
    monthHint: null,
    suggestedQuantityRange: { min: 1, ideal: 6, max: 12 },
    order: 7,
  },
  {
    slug: "dia-madre",
    name: "Día de la Madre",
    description:
      "Día de la Madre en Colombia se celebra el segundo domingo de Mayo. " +
      "Pico de ventas anual junto con Navidad. Box Día de la Madre + Cuadros con " +
      "Foto + Fotoimanes Corazón son los top sellers. Anticipar producción 2-3 " +
      "semanas antes del segundo domingo de Mayo.",
    monthHint: 5,
    suggestedQuantityRange: { min: 1, ideal: 1, max: 6 },
    order: 8,
  },
  {
    slug: "dia-padre",
    name: "Día del Padre",
    description:
      "Día del Padre en Colombia: tercer domingo de Junio. Box Día del Padre + " +
      "Cuadros con Frase + Imanes Publicitarios para emprendedores. Volumen menor " +
      "que Día Madre pero igual relevante.",
    monthHint: 6,
    suggestedQuantityRange: { min: 1, ideal: 1, max: 6 },
    order: 9,
  },
  {
    slug: "dia-nino",
    name: "Día del Niño",
    description:
      "Día del Niño en Colombia: último sábado de Abril. Coleccionables temáticos " +
      "(Pokémon, Disney, animalitos kawaii) + Juegos y Aprendizaje. Regalos para " +
      "niños 4-12 años.",
    monthHint: 4,
    suggestedQuantityRange: { min: 1, ideal: 1, max: 4 },
    order: 10,
  },
  {
    slug: "amor-y-amistad",
    name: "Amor y Amistad",
    description:
      "Amor y Amistad en Colombia: tercer sábado de Septiembre (equivalente local " +
      "a San Valentín). Detalles de pareja, amigos cercanos. Fotoimanes Corazón + " +
      "Cuadros con Foto + Cajas Regalo + Glass Magnets son top. Volumen medio.",
    monthHint: 9,
    suggestedQuantityRange: { min: 1, ideal: 1, max: 6 },
    order: 11,
  },
  {
    slug: "halloween",
    name: "Halloween",
    description:
      "Halloween (31 Octubre) creciente en Colombia, sobre todo entre familias " +
      "jóvenes y empresas. Coleccionables temáticos (calaveras, fantasmas, dulces). " +
      "Ediciones limitadas de Octubre.",
    monthHint: 10,
    suggestedQuantityRange: { min: 1, ideal: 4, max: 12 },
    order: 12,
  },
  {
    slug: "navidad",
    name: "Navidad",
    description:
      "Navidad: pico anual de ventas junto con Día de la Madre. Edición Navidad " +
      "Kawaii + Calendarios año nuevo + Cajas Regalo + Recordatorios cena familiar. " +
      "Anticipar producción desde primera semana de Noviembre. Cierre catálogo " +
      "navideño 20 Diciembre para garantizar entrega antes de 24-25.",
    monthHint: 12,
    suggestedQuantityRange: { min: 1, ideal: 6, max: 20 },
    order: 13,
  },
  {
    slug: "ano-nuevo",
    name: "Año Nuevo",
    description:
      "Año Nuevo + propósitos. Calendarios año nuevo (Foto-Mes, Floral, Mini para " +
      "regalar) son el producto principal. Volumen medio Enero (resagados que no " +
      "compraron antes de Diciembre).",
    monthHint: 1,
    suggestedQuantityRange: { min: 1, ideal: 2, max: 12 },
    order: 14,
  },
  {
    slug: "empresarial",
    name: "Empresarial",
    description:
      "Eventos corporativos, lanzamientos, regalos para clientes/empleados. " +
      "Imanes Publicitarios + Pack Empresarial Mixto + Cuadros con Frase. Volumen " +
      "alto (x50, x100, x200) con descuento por cantidad. Flujo separado vía " +
      "/mayorista con cotización personalizada por WhatsApp.",
    monthHint: null,
    suggestedQuantityRange: { min: 50, ideal: 100, max: 500 },
    order: 15,
  },
  {
    slug: "para-mi-mismo",
    name: "Para mí mismo",
    description:
      "Cliente que se autorregala. Organización (Planners, Notas), Coleccionables " +
      "temáticos (Universos, Lucams propios), Separadores Magnéticos para lectura. " +
      "Volumen bajo por compra pero alta tasa de recurrencia.",
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
      updated++;
    } else {
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
      created++;
    }
  }

  console.log(`✓ ${created} ocasiones creadas, ${updated} actualizadas.`);
  console.log(`Total OcasionTag activos: ${ocasiones.length}.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

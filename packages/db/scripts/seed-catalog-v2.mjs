/*
 * seed-catalog-v2 — Aplica el delta del PLAN_CATALOG_V2 sobre el catálogo
 * existente generado por seed-products.mjs.
 *
 * Cambios aplicados (idempotentes, safe re-run):
 *
 * 1. Nueva categoría raíz: "Separadores Magnéticos" (decisión 1.2).
 * 2. Sub-categorías jerárquicas (decisión 1.3) — usa Category.parentId.
 *    Cada categoría padre tiene 4-10 sub-cats.
 * 3. Sub-cats estacionales con activeFrom/Until cuando aplique (decisión 2.9).
 * 4. 12 productos placeholder isActive:false en sub-cats nuevas (decisión 2.4).
 * 5. Enriquecimiento de productos existentes con richDescription + idealFor +
 *    physicalSpecs por defecto basado en categoría (decisión 2.10 + 4.1).
 * 6. Coleccionables uniformes — variants quantity x4/x6/x9 si faltan (decisión 3.5).
 * 7. ProductOcasionTag — links default basados en categoría (decisión 1.5).
 *    Lucy puede afinar después desde /admin/ocasiones.
 *
 * NO toca: orders existentes, customers, carts, designs.
 * NO pisa: descripciones manuales editadas por Lucy (solo si campo está vacío).
 *
 * Uso (vía Makefile):
 *   make seed-catalog-v2
 *
 * Pre-requisito: ejecutar antes `make seed-products` + `make seed-ocasiones`.
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

console.log("=== seed-catalog-v2 (PLAN_CATALOG_V2 delta) ===\n");

// ─────────────────────── helpers ───────────────────────

const UNSPLASH = (id, w = 800) =>
  `https://images.unsplash.com/photo-${id}?w=${w}&q=85&auto=format&fit=crop`;

async function upsertCategoryWithParent(slug, name, parentSlug, fields = {}) {
  let parentId = null;
  if (parentSlug) {
    const parent = await prisma.category.findUnique({ where: { slug: parentSlug } });
    if (!parent) {
      console.warn(`  ⚠ Padre '${parentSlug}' no existe; sub-cat '${slug}' creada como raíz.`);
    } else {
      parentId = parent.id;
    }
  }
  const existing = await prisma.category.findUnique({ where: { slug } });
  if (existing) {
    await prisma.category.update({
      where: { slug },
      data: { name, parentId, ...fields },
    });
    return { action: "updated", id: existing.id };
  }
  const created = await prisma.category.create({
    data: { slug, name, parentId, ...fields },
  });
  return { action: "created", id: created.id };
}

async function upsertOcasionLink(productSlug, ocasionSlug, rationale) {
  const product = await prisma.product.findUnique({ where: { slug: productSlug } });
  if (!product) return false;
  const ocasion = await prisma.ocasionTag.findUnique({ where: { slug: ocasionSlug } });
  if (!ocasion) return false;
  await prisma.productOcasionTag.upsert({
    where: {
      productId_ocasionTagId: {
        productId: product.id,
        ocasionTagId: ocasion.id,
      },
    },
    update: { rationale },
    create: {
      productId: product.id,
      ocasionTagId: ocasion.id,
      rationale,
    },
  });
  return true;
}

// ─────────────────────── 1. NUEVA CATEGORÍA RAÍZ ───────────────────────

const SEPARADORES_CATEGORY = {
  slug: "separadores",
  name: "Separadores Magnéticos",
  description:
    "Separadores magnéticos para marcar páginas en libros y agendas. Acabado durable, " +
    "diseños propios kawaii + temáticas de universos populares + personalizables con tu foto o frase.",
  richDescription:
    "Los **Separadores Magnéticos Lucams** son la mejor herramienta para quienes leen en serio: " +
    "se enganchan a la página con un imán suave que no daña el papel, son durables (PET laminado), " +
    "y vienen en diseños hermosos. Ofrecemos colecciones temáticas (frases motivacionales, " +
    "animalitos kawaii, plantas, comida bonita) + universos pop (Harry Potter, Anime, Disney) " +
    "+ opción de personalizarlos con tu propia foto o frase favorita. " +
    "Set de 4, 6 o 10 unidades según tu nivel de lectura.",
  useCase:
    "Ideal para lectores ávidos, estudiantes, regalos para alguien que ama leer, " +
    "decoración de bibliotecas personales.",
  image: UNSPLASH("1481627834876-b7833e8f5570"),
  order: 9,
  isActive: true,
  visibleFilters: ["sub_categoria", "precio", "ocasion"],
  defaultSort: "featured",
};

// ─────────────────────── 2. SUB-CATEGORÍAS POR CATEGORÍA RAÍZ ───────────────────────
// Decisión 1.3. Total esperado ~50 sub-cats.

const SUBCATEGORIES = [
  // ─── Fotoimanes (5 sub-cats por FORMA) ───
  { parent: "foto-imanes", slug: "fotoimanes-polaroid", name: "Polaroid", order: 1 },
  { parent: "foto-imanes", slug: "fotoimanes-cuadrados", name: "Cuadrados", order: 2 },
  { parent: "foto-imanes", slug: "fotoimanes-circulares", name: "Circulares", order: 3 },
  { parent: "foto-imanes", slug: "fotoimanes-corazon", name: "Corazón", order: 4 },
  { parent: "foto-imanes", slug: "fotoimanes-vidrio", name: "Vidrio", order: 5 },

  // ─── Recuerdos (7 sub-cats por EVENTO) ───
  { parent: "recuerdos", slug: "recuerdos-cumpleanos", name: "Cumpleaños", order: 1 },
  { parent: "recuerdos", slug: "recuerdos-bautizo", name: "Bautizo", order: 2 },
  { parent: "recuerdos", slug: "recuerdos-grado", name: "Grado", order: 3 },
  { parent: "recuerdos", slug: "recuerdos-matrimonio", name: "Matrimonio", order: 4 },
  { parent: "recuerdos", slug: "recuerdos-quinceanera", name: "Quinceañera", order: 5 },
  { parent: "recuerdos", slug: "recuerdos-primer-ano", name: "Primer Año", order: 6 },
  {
    parent: "recuerdos",
    slug: "recuerdos-baby-shower",
    name: "Baby Shower",
    order: 7,
    isActive: false, // placeholder hasta tener producto (decisión 2.9)
  },

  // ─── Calendarios (4 sub-cats) ───
  { parent: "calendarios", slug: "calendarios-foto-mes", name: "Foto-Mes", order: 1 },
  { parent: "calendarios", slug: "calendarios-foto-planner", name: "Foto + Planner", order: 2 },
  { parent: "calendarios", slug: "calendarios-floral", name: "Floral", order: 3 },
  { parent: "calendarios", slug: "calendarios-mini-regalo", name: "Mini para regalar", order: 4 },

  // ─── Publicitarios B2B (5 sub-cats) ───
  {
    parent: "publicitarios",
    slug: "publicitarios-rectangulares",
    name: "Rectangulares",
    order: 1,
  },
  { parent: "publicitarios", slug: "publicitarios-circulares", name: "Circulares", order: 2 },
  { parent: "publicitarios", slug: "publicitarios-troquelados", name: "Troquelados", order: 3 },
  {
    parent: "publicitarios",
    slug: "publicitarios-tarjeta-presentacion",
    name: "Tarjeta Presentación",
    order: 4,
  },
  { parent: "publicitarios", slug: "publicitarios-pack-mixto", name: "Pack Mixto", order: 5 },

  // ─── Organización (2 sub-cats — Separadores movidos a categoría 9) ───
  { parent: "organizate", slug: "organizate-planners", name: "Planners", order: 1 },
  { parent: "organizate", slug: "organizate-notas", name: "Notas", order: 2 },

  // ─── Cajas Regalo (3 sub-cats por DESTINATARIO) ───
  { parent: "regalos-personalizados", slug: "cajas-pareja", name: "Pareja", order: 1 },
  {
    parent: "regalos-personalizados",
    slug: "cajas-recien-nacido",
    name: "Recién Nacido",
    order: 2,
  },
  { parent: "regalos-personalizados", slug: "cajas-sorpresa", name: "Sorpresa", order: 3 },

  // ─── De Temporada (7 sub-cats estacionales, varias inactivas) ───
  { parent: "de-temporada", slug: "temporada-dia-madre", name: "Día de la Madre", order: 1 },
  { parent: "de-temporada", slug: "temporada-dia-padre", name: "Día del Padre", order: 2 },
  {
    parent: "de-temporada",
    slug: "temporada-dia-nino",
    name: "Día del Niño",
    order: 3,
    isActive: false,
  },
  {
    parent: "de-temporada",
    slug: "temporada-amor-amistad",
    name: "Amor y Amistad",
    order: 4,
    isActive: false,
  },
  {
    parent: "de-temporada",
    slug: "temporada-halloween",
    name: "Halloween",
    order: 5,
    isActive: false,
  },
  { parent: "de-temporada", slug: "temporada-navidad", name: "Navidad", order: 6 },
  {
    parent: "de-temporada",
    slug: "temporada-ano-nuevo",
    name: "Año Nuevo",
    order: 7,
    isActive: false,
  },

  // ─── Cuadros y Decoración (4 sub-cats) ───
  { parent: "cuadros-decoracion", slug: "cuadros-foto", name: "Cuadros con Foto", order: 1 },
  { parent: "cuadros-decoracion", slug: "cuadros-frase", name: "Cuadros con Frase", order: 2 },
  { parent: "cuadros-decoracion", slug: "cuadros-triple", name: "Triple Foto", order: 3 },
  { parent: "cuadros-decoracion", slug: "cuadros-marcos", name: "Marcos", order: 4 },

  // ─── Separadores Magnéticos (9 sub-cats — categoría 9) ───
  { parent: "separadores", slug: "separadores-frases", name: "Frases", order: 1 },
  { parent: "separadores", slug: "separadores-animalitos", name: "Animalitos", order: 2 },
  { parent: "separadores", slug: "separadores-plantas", name: "Plantas y naturaleza", order: 3 },
  { parent: "separadores", slug: "separadores-comida", name: "Comida bonita", order: 4 },
  {
    parent: "separadores",
    slug: "separadores-harry-potter",
    name: "Harry Potter",
    order: 5,
    isActive: false,
  },
  { parent: "separadores", slug: "separadores-anime", name: "Anime", order: 6, isActive: false },
  { parent: "separadores", slug: "separadores-disney", name: "Disney", order: 7, isActive: false },
  {
    parent: "separadores",
    slug: "separadores-personalizables-foto",
    name: "Personalizables con foto",
    order: 8,
    isActive: false,
  },
  {
    parent: "separadores",
    slug: "separadores-personalizables-frase",
    name: "Personalizables con frase",
    order: 9,
    isActive: false,
  },

  // ─── Coleccionables (14 sub-cats por TEMÁTICA — 6 Lucams + 8 Universos) ───
  {
    parent: "coleccionables",
    slug: "coleccionables-ciudades",
    name: "Ciudades Colombia",
    order: 1,
  },
  {
    parent: "coleccionables",
    slug: "coleccionables-comida-co",
    name: "Comida Colombiana",
    order: 2,
  },
  {
    parent: "coleccionables",
    slug: "coleccionables-frases",
    name: "Frases Motivacionales",
    order: 3,
  },
  {
    parent: "coleccionables",
    slug: "coleccionables-animalitos",
    name: "Animalitos Kawaii",
    order: 4,
  },
  { parent: "coleccionables", slug: "coleccionables-viajes", name: "Viajes LATAM", order: 5 },
  { parent: "coleccionables", slug: "coleccionables-mood", name: "Mood Emociones", order: 6 },
  {
    parent: "coleccionables",
    slug: "coleccionables-harry-potter",
    name: "Harry Potter",
    order: 7,
    isActive: false,
  },
  {
    parent: "coleccionables",
    slug: "coleccionables-pokemon",
    name: "Pokémon",
    order: 8,
    isActive: false,
  },
  {
    parent: "coleccionables",
    slug: "coleccionables-star-wars",
    name: "Star Wars",
    order: 9,
    isActive: false,
  },
  {
    parent: "coleccionables",
    slug: "coleccionables-marvel",
    name: "Marvel",
    order: 10,
    isActive: false,
  },
  {
    parent: "coleccionables",
    slug: "coleccionables-dc",
    name: "DC",
    order: 11,
    isActive: false,
  },
  {
    parent: "coleccionables",
    slug: "coleccionables-disney",
    name: "Disney/Pixar",
    order: 12,
    isActive: false,
  },
  {
    parent: "coleccionables",
    slug: "coleccionables-anime",
    name: "Anime Retro",
    order: 13,
    isActive: false,
  },
  {
    parent: "coleccionables",
    slug: "coleccionables-cartoons",
    name: "Cartoons 90s",
    order: 14,
    isActive: false,
  },

  // ─── Juegos y Aprendizaje (4 sub-cats) ───
  { parent: "juegos-aprendizaje", slug: "juegos-abecedario", name: "Abecedario", order: 1 },
  { parent: "juegos-aprendizaje", slug: "juegos-numeros", name: "Números", order: 2 },
  { parent: "juegos-aprendizaje", slug: "juegos-rutina", name: "Rutina diaria", order: 3 },
  { parent: "juegos-aprendizaje", slug: "juegos-emociones", name: "Emociones", order: 4 },
];

// ─────────────────────── 3. DEFAULT OCASIÓN LINKS POR CATEGORÍA ───────────────────────
// Lucy puede afinar después desde /admin/ocasiones.
// El slug de producto debe matchear los del seed-products.mjs existente.

const PRODUCT_OCASION_LINKS = [
  // ─── Fotoimanes (cumpleaños + para-mi-mismo + matrimonio para Corazón) ───
  {
    product: "set-12-fotoimanes-polaroid",
    ocasion: "cumpleanos",
    rationale: "Polaroid set con tus fotos: regalo o autorregalo para celebrar momentos.",
  },
  {
    product: "set-12-fotoimanes-polaroid",
    ocasion: "para-mi-mismo",
    rationale: "Decora tu nevera con polaroids de tus mejores momentos.",
  },
  {
    product: "set-12-fotoimanes-cuadrados",
    ocasion: "cumpleanos",
    rationale: "Fotoimanes cuadrados ideales para regalo cumpleañero/a.",
  },
  {
    product: "set-12-fotoimanes-cuadrados",
    ocasion: "para-mi-mismo",
    rationale: "Set personal para refrigerador familiar.",
  },
  {
    product: "set-fotoimanes-circulares",
    ocasion: "cumpleanos",
    rationale: "Circulares modernos para regalo.",
  },
  {
    product: "set-fotoimanes-corazon",
    ocasion: "matrimonio",
    rationale: "Heart-shape ideal para invitados de matrimonio o pareja.",
  },
  {
    product: "set-fotoimanes-corazon",
    ocasion: "aniversario",
    rationale: "Símbolo de amor para celebrar aniversarios.",
  },
  {
    product: "set-fotoimanes-corazon",
    ocasion: "dia-madre",
    rationale: "Regalo emotivo para Día de la Madre.",
  },
  {
    product: "set-fotoimanes-corazon",
    ocasion: "amor-y-amistad",
    rationale: "Símbolo de afecto para Amor y Amistad.",
  },
  {
    product: "set-glass-magnets-personalizados",
    ocasion: "matrimonio",
    rationale: "Premium glass: padrinos o regalo significativo.",
  },
  {
    product: "set-glass-magnets-personalizados",
    ocasion: "aniversario",
    rationale: "Acabado premium para aniversarios importantes.",
  },
  {
    product: "set-glass-magnets-personalizados",
    ocasion: "para-mi-mismo",
    rationale: "Pieza decorativa premium.",
  },

  // ─── Recuerdos (cada uno tiene su ocasión natural) ───
  {
    product: "recuerdos-cumpleanos-x20",
    ocasion: "cumpleanos",
    rationale: "Recordatorios diseñados específicamente para mesa de cumpleaños.",
  },
  {
    product: "recuerdos-bautizo-x12",
    ocasion: "bautizo",
    rationale: "Recordatorios temáticos para invitados de bautizo.",
  },
  {
    product: "recuerdos-graduacion-x20",
    ocasion: "grado",
    rationale: "Recordatorios diseñados para graduación con foto + año.",
  },
  {
    product: "recuerdos-matrimonio",
    ocasion: "matrimonio",
    rationale: "Recordatorios elegantes para invitados de boda.",
  },
  {
    product: "mi-primer-anito",
    ocasion: "cumpleanos",
    rationale: "Diseño tierno para primer cumpleaños del/la bebé.",
  },
  {
    product: "recuerdos-quinceanera",
    ocasion: "quinceanera",
    rationale: "Recordatorios para celebración 15 años.",
  },

  // ─── Calendarios (año nuevo + para-mi-mismo + dia-madre/padre) ───
  {
    product: "calendario-mes-a-mes-fotos",
    ocasion: "ano-nuevo",
    rationale: "Calendario foto-mes para el año nuevo.",
  },
  {
    product: "calendario-mes-a-mes-fotos",
    ocasion: "navidad",
    rationale: "Regalo navideño con valor emocional duradero.",
  },
  {
    product: "calendario-mes-a-mes-fotos",
    ocasion: "dia-madre",
    rationale: "Foto familiar mes a mes — regalo emotivo.",
  },
  {
    product: "calendario-foto-hero-planner",
    ocasion: "ano-nuevo",
    rationale: "Planner mensual con foto hero.",
  },
  {
    product: "calendario-floral-mes-a-mes",
    ocasion: "ano-nuevo",
    rationale: "Calendario floral año nuevo.",
  },
  {
    product: "mini-calendarios-x10",
    ocasion: "ano-nuevo",
    rationale: "Minis para regalar a colegas / amigos en año nuevo.",
  },
  {
    product: "mini-calendarios-x10",
    ocasion: "empresarial",
    rationale: "Regalo corporativo año nuevo.",
  },

  // ─── Publicitarios B2B (empresarial) ───
  {
    product: "imanes-publicitarios-rectos-7x5",
    ocasion: "empresarial",
    rationale: "Imanes publicitarios para marca corporativa.",
  },
  {
    product: "imanes-publicitarios-circulares-6cm",
    ocasion: "empresarial",
    rationale: "Imanes circulares para branding.",
  },
  {
    product: "imanes-publicitarios-troquelados",
    ocasion: "empresarial",
    rationale: "Troquelados con forma personalizada.",
  },
  {
    product: "iman-tarjeta-presentacion",
    ocasion: "empresarial",
    rationale: "Tarjeta de presentación magnética.",
  },
  {
    product: "pack-empresarial-mixto-100",
    ocasion: "empresarial",
    rationale: "Pack mixto x100 para eventos corporativos.",
  },

  // ─── Organización (para-mi-mismo + empresarial planners) ───
  {
    product: "planner-semanal-magnetico",
    ocasion: "para-mi-mismo",
    rationale: "Planner semanal para tu nevera.",
  },
  {
    product: "planner-mensual-magnetico",
    ocasion: "para-mi-mismo",
    rationale: "Planner mensual para organizar tu mes.",
  },
  {
    product: "mini-planner-magnetico",
    ocasion: "para-mi-mismo",
    rationale: "Planner diario compacto.",
  },
  {
    product: "planner-mensual-con-foto",
    ocasion: "para-mi-mismo",
    rationale: "Planner con tu foto personal.",
  },
  {
    product: "planner-mensual-con-foto",
    ocasion: "dia-madre",
    rationale: "Regalo organizativo con foto familiar.",
  },
  {
    product: "set-4-notas-magneticas",
    ocasion: "para-mi-mismo",
    rationale: "Notas magnéticas para to-do list.",
  },
  {
    product: "pack-separadores-libros",
    ocasion: "para-mi-mismo",
    rationale: "Separadores para tus lecturas favoritas.",
  },

  // ─── Cajas Regalo (aniversario, matrimonio, baby-shower, navidad) ───
  {
    product: "box-para-pareja",
    ocasion: "aniversario",
    rationale: "Box temática para aniversario de pareja.",
  },
  {
    product: "box-para-pareja",
    ocasion: "matrimonio",
    rationale: "Regalo significativo para los novios.",
  },
  { product: "box-para-pareja", ocasion: "amor-y-amistad", rationale: "Box para amor y amistad." },
  {
    product: "box-recien-nacido",
    ocasion: "baby-shower",
    rationale: "Box completa para baby shower.",
  },
  {
    product: "caja-lucams-sorpresa",
    ocasion: "para-mi-mismo",
    rationale: "Sorpréndete con la caja Lucams.",
  },
  {
    product: "caja-lucams-sorpresa",
    ocasion: "cumpleanos",
    rationale: "Regalo sorpresa para cumpleañero/a.",
  },

  // ─── De Temporada ───
  {
    product: "big-box-dia-mama",
    ocasion: "dia-madre",
    rationale: "Box dedicada exclusivamente al Día de la Madre.",
  },
  { product: "box-dia-papa", ocasion: "dia-padre", rationale: "Box dedicada al Día del Padre." },
  { product: "edicion-navidad-kawaii", ocasion: "navidad", rationale: "Edición limitada Navidad." },

  // ─── Cuadros y Decoración ───
  {
    product: "cuadro-15x15-con-foto",
    ocasion: "aniversario",
    rationale: "Cuadro con foto para conmemorar fechas.",
  },
  {
    product: "cuadro-15x15-con-foto",
    ocasion: "dia-madre",
    rationale: "Cuadro con foto familiar — regalo emotivo.",
  },
  {
    product: "cuadro-15x15-con-foto",
    ocasion: "matrimonio",
    rationale: "Cuadro de momento especial de matrimonio.",
  },
  {
    product: "cuadro-15x15-con-foto",
    ocasion: "grado",
    rationale: "Cuadro de graduación para regalo a los padres.",
  },
  {
    product: "cuadro-3-fotos",
    ocasion: "aniversario",
    rationale: "Triple foto para historia de pareja.",
  },
  { product: "cuadro-3-fotos", ocasion: "dia-madre", rationale: "Cuadro triple foto familiar." },
  {
    product: "cuadro-frase-personalizada-20x20",
    ocasion: "dia-padre",
    rationale: "Frase motivacional para Día del Padre.",
  },
  {
    product: "cuadro-frase-personalizada-20x20",
    ocasion: "empresarial",
    rationale: "Frase corporativa para oficina.",
  },
  {
    product: "marcos-magneticos-cuadrados",
    ocasion: "para-mi-mismo",
    rationale: "Marcos para tus fotos físicas.",
  },

  // ─── Coleccionables ───
  {
    product: "pack-imanes-ciudades-colombia",
    ocasion: "para-mi-mismo",
    rationale: "Coleccionable Ciudades Colombia.",
  },
  {
    product: "pack-comida-colombiana",
    ocasion: "para-mi-mismo",
    rationale: "Coleccionable Comida Colombiana.",
  },
  {
    product: "pack-frases-motivacionales",
    ocasion: "para-mi-mismo",
    rationale: "Frases motivacionales para tu día a día.",
  },
  {
    product: "pack-animalitos-kawaii",
    ocasion: "dia-nino",
    rationale: "Animalitos kawaii para regalar a niños.",
  },
  {
    product: "pack-animalitos-kawaii",
    ocasion: "cumpleanos",
    rationale: "Coleccionable cumpleaños infantil.",
  },
  { product: "pack-viajes-latam", ocasion: "para-mi-mismo", rationale: "Para amantes de viajar." },
  {
    product: "pack-mood-emociones",
    ocasion: "para-mi-mismo",
    rationale: "Mood emociones para tu refrigerador.",
  },

  // ─── Juegos y Aprendizaje ───
  {
    product: "abecedario-magnetico",
    ocasion: "dia-nino",
    rationale: "Aprendizaje del abecedario.",
  },
  { product: "set-fichas-numeros", ocasion: "dia-nino", rationale: "Aprendizaje de números." },
  {
    product: "rutina-infantil-7-actividades",
    ocasion: "dia-nino",
    rationale: "Rutina diaria para niños.",
  },
  {
    product: "planner-emociones-kids",
    ocasion: "dia-nino",
    rationale: "Planner de emociones para niños.",
  },
];

// ─────────────────────── 4. PRODUCTOS PLACEHOLDER (decisión 2.4) ───────────────────────
// 12 productos placeholder isActive:false para sub-cats nuevas.
// Lucy los activa 1 a 1 cuando tenga thumbnail IA + content listo.

const PLACEHOLDER_PRODUCTS = [
  // Recuerdos
  {
    slug: "recuerdos-baby-shower",
    sku: "EVT-BABY-V0",
    name: "Recuerdos Baby Shower",
    categorySlug: "recuerdos-baby-shower",
    description: "Recordatorios magnéticos para baby shower (placeholder).",
    basePrice: 350000,
    personalizationKind: "EVENT_FAVOR",
  },
  // De Temporada
  {
    slug: "edicion-dia-nino",
    sku: "SEA-NINO-V0",
    name: "Edición Día del Niño",
    categorySlug: "temporada-dia-nino",
    description: "Edición limitada Día del Niño Colombia (placeholder).",
    basePrice: 280000,
    personalizationKind: "NONE",
  },
  {
    slug: "edicion-amor-amistad",
    sku: "SEA-AYA-V0",
    name: "Edición Amor y Amistad",
    categorySlug: "temporada-amor-amistad",
    description: "Edición limitada Amor y Amistad (placeholder).",
    basePrice: 290000,
    personalizationKind: "NONE",
  },
  {
    slug: "edicion-halloween",
    sku: "SEA-HALLO-V0",
    name: "Edición Halloween",
    categorySlug: "temporada-halloween",
    description: "Coleccionable temático Halloween (placeholder).",
    basePrice: 250000,
    personalizationKind: "NONE",
  },
  {
    slug: "edicion-ano-nuevo",
    sku: "SEA-ANEW-V0",
    name: "Edición Año Nuevo",
    categorySlug: "temporada-ano-nuevo",
    description: "Edición limitada Año Nuevo + propósitos (placeholder).",
    basePrice: 280000,
    personalizationKind: "NONE",
  },
  // Coleccionables Universos (8)
  {
    slug: "coleccionables-harry-potter",
    sku: "COL-HP-V0",
    name: "Pack Harry Potter",
    categorySlug: "coleccionables-harry-potter",
    description: "Coleccionable temático Harry Potter (placeholder).",
    basePrice: 350000,
    personalizationKind: "NONE",
    premadeSurcharge: 15,
  },
  {
    slug: "coleccionables-pokemon",
    sku: "COL-POKE-V0",
    name: "Pack Pokémon",
    categorySlug: "coleccionables-pokemon",
    description: "Coleccionable temático Pokémon (placeholder).",
    basePrice: 350000,
    personalizationKind: "NONE",
    premadeSurcharge: 15,
  },
  {
    slug: "coleccionables-star-wars",
    sku: "COL-SW-V0",
    name: "Pack Star Wars",
    categorySlug: "coleccionables-star-wars",
    description: "Coleccionable temático Star Wars (placeholder).",
    basePrice: 350000,
    personalizationKind: "NONE",
    premadeSurcharge: 15,
  },
  {
    slug: "coleccionables-marvel",
    sku: "COL-MARV-V0",
    name: "Pack Marvel",
    categorySlug: "coleccionables-marvel",
    description: "Coleccionable temático Marvel (placeholder).",
    basePrice: 350000,
    personalizationKind: "NONE",
    premadeSurcharge: 15,
  },
  {
    slug: "coleccionables-dc",
    sku: "COL-DC-V0",
    name: "Pack DC",
    categorySlug: "coleccionables-dc",
    description: "Coleccionable temático DC Comics (placeholder).",
    basePrice: 350000,
    personalizationKind: "NONE",
    premadeSurcharge: 15,
  },
  {
    slug: "coleccionables-disney",
    sku: "COL-DSNY-V0",
    name: "Pack Disney/Pixar",
    categorySlug: "coleccionables-disney",
    description: "Coleccionable temático Disney/Pixar (placeholder).",
    basePrice: 350000,
    personalizationKind: "NONE",
    premadeSurcharge: 15,
  },
  {
    slug: "coleccionables-anime",
    sku: "COL-ANIM-V0",
    name: "Pack Anime Retro",
    categorySlug: "coleccionables-anime",
    description: "Coleccionable Anime Retro 90s-2000s (placeholder).",
    basePrice: 350000,
    personalizationKind: "NONE",
    premadeSurcharge: 15,
  },
  {
    slug: "coleccionables-cartoons",
    sku: "COL-CART-V0",
    name: "Pack Cartoons 90s",
    categorySlug: "coleccionables-cartoons",
    description: "Coleccionable Cartoons 90s (placeholder).",
    basePrice: 350000,
    personalizationKind: "NONE",
    premadeSurcharge: 15,
  },
];

// ─────────────────────── 5. ENRIQUECIMIENTO DE PRODUCTOS EXISTENTES ───────────────────────
// Solo aplica defaults inteligentes a productos que NO tengan los campos.
// Si Lucy ya editó manualmente, NO pisamos.

const DEFAULT_PHYSICAL_SPECS_BY_KIND = {
  PHOTO_PACK: {
    material: "PET laminado mate",
    thicknessMm: 3,
    magnetType: "FRIDGE",
    weightGrams: 30,
    packaging: "STANDARD_BAG",
    includes: [
      "Imanes según cantidad seleccionada",
      "Sticker Lucams kawaii",
      "Tarjeta de agradecimiento",
    ],
    careInstructions: "Limpieza con paño seco. No exponer a calor extremo.",
    countryOfOrigin: "CO",
  },
  EVENT_FAVOR: {
    material: "PET laminado mate",
    thicknessMm: 3,
    magnetType: "FRIDGE",
    weightGrams: 25,
    packaging: "BULK_BOX",
    includes: [
      "Recordatorios magnéticos personalizados",
      "Empaque para distribución",
      "Tarjeta del evento opcional",
    ],
    careInstructions: "Limpieza con paño seco. Resistente al agua.",
    countryOfOrigin: "CO",
  },
  CALENDAR_PHOTO_MONTH: {
    material: "PET laminado mate",
    thicknessMm: 4,
    magnetType: "FRIDGE",
    weightGrams: 120,
    packaging: "GIFT_BOX",
    includes: ["12 paneles foto-mes magnéticos", "Marco base magnético", "Empaque regalo"],
    careInstructions: "Limpieza con paño seco. No doblar paneles.",
    countryOfOrigin: "CO",
  },
  CALENDAR_PHOTO_HERO: {
    material: "PET laminado mate",
    thicknessMm: 4,
    magnetType: "FRIDGE",
    weightGrams: 100,
    packaging: "GIFT_BOX",
    includes: ["Calendario con foto principal", "Planner mensual magnético", "Marcador incluido"],
    careInstructions: "Limpieza con paño seco.",
    countryOfOrigin: "CO",
  },
  BUSINESS_LOGO: {
    material: "PET laminado mate",
    thicknessMm: 3,
    magnetType: "FRIDGE",
    weightGrams: 20,
    packaging: "BULK_BOX",
    includes: ["Imanes con logo corporativo según cantidad", "Empaque corporativo"],
    careInstructions: "Resistente al uso comercial. Limpieza con paño húmedo.",
    countryOfOrigin: "CO",
  },
  CUSTOM_DECOR: {
    material: "PET laminado mate + accesorios premium",
    thicknessMm: 3,
    magnetType: "FRIDGE",
    weightGrams: 200,
    packaging: "GIFT_BOX",
    includes: [
      "Producto principal personalizado",
      "Accesorios temáticos según diseño",
      "Empaque regalo premium",
    ],
    careInstructions: "Limpieza con paño seco.",
    countryOfOrigin: "CO",
  },
  PHOTO_GRID: {
    material: "PET laminado mate",
    thicknessMm: 4,
    magnetType: "FRIDGE",
    weightGrams: 80,
    packaging: "GIFT_BOX",
    includes: ["Grid de 3 fotos magnéticas", "Marco base", "Empaque regalo"],
    careInstructions: "Limpieza con paño seco. No doblar.",
    countryOfOrigin: "CO",
  },
  TEXT_ONLY: {
    material: "PET laminado mate",
    thicknessMm: 4,
    magnetType: "FRIDGE",
    weightGrams: 60,
    packaging: "GIFT_BOX",
    includes: ["Cuadro magnético con frase personalizada", "Marco base", "Empaque regalo"],
    careInstructions: "Limpieza con paño seco.",
    countryOfOrigin: "CO",
  },
  NONE: {
    material: "PET laminado mate",
    thicknessMm: 3,
    magnetType: "FRIDGE",
    weightGrams: 30,
    packaging: "STANDARD_BAG",
    includes: ["Productos según cantidad seleccionada", "Sticker Lucams"],
    careInstructions: "Limpieza con paño seco.",
    countryOfOrigin: "CO",
  },
};

const DEFAULT_PRODUCTION_DAYS_BY_KIND = {
  PHOTO_PACK: 3,
  EVENT_FAVOR: 5,
  CALENDAR_PHOTO_MONTH: 4,
  CALENDAR_PHOTO_HERO: 4,
  BUSINESS_LOGO: 4,
  CUSTOM_DECOR: 5,
  PHOTO_GRID: 3,
  TEXT_ONLY: 3,
  NONE: 1, // decisión 4.8 — Coleccionables/Juegos ya stock
};

// ─────────────────────── EJECUCIÓN ───────────────────────

async function step1_NewCategory() {
  console.log("Paso 1 — Crear categoría Separadores Magnéticos...");
  const result = await upsertCategoryWithParent(
    SEPARADORES_CATEGORY.slug,
    SEPARADORES_CATEGORY.name,
    null,
    {
      description: SEPARADORES_CATEGORY.description,
      richDescription: SEPARADORES_CATEGORY.richDescription,
      useCase: SEPARADORES_CATEGORY.useCase,
      image: SEPARADORES_CATEGORY.image,
      order: SEPARADORES_CATEGORY.order,
      isActive: SEPARADORES_CATEGORY.isActive,
      visibleFilters: SEPARADORES_CATEGORY.visibleFilters,
      defaultSort: SEPARADORES_CATEGORY.defaultSort,
    },
  );
  console.log(`  ✓ Separadores ${result.action}.\n`);
}

async function step2_SubCategories() {
  console.log("Paso 2 — Sub-categorías jerárquicas...");
  let created = 0;
  let updated = 0;
  for (const sub of SUBCATEGORIES) {
    const fields = {
      order: sub.order,
      isActive: sub.isActive !== undefined ? sub.isActive : true,
    };
    const result = await upsertCategoryWithParent(sub.slug, sub.name, sub.parent, fields);
    if (result.action === "created") created++;
    else updated++;
  }
  console.log(
    `  ✓ ${created} sub-cats creadas, ${updated} actualizadas (total: ${SUBCATEGORIES.length}).\n`,
  );
}

async function step3_PlaceholderProducts() {
  console.log("Paso 3 — Productos placeholder (isActive:false)...");
  let created = 0;
  let updated = 0;
  for (const p of PLACEHOLDER_PRODUCTS) {
    const subCategory = await prisma.category.findUnique({
      where: { slug: p.categorySlug },
    });
    if (!subCategory) {
      console.warn(`  ⚠ Sub-cat '${p.categorySlug}' no existe — placeholder ${p.slug} omitido.`);
      continue;
    }
    const existing = await prisma.product.findUnique({ where: { slug: p.slug } });
    if (existing) {
      // No tocar si ya existe (Lucy puede haberlo activado).
      updated++;
      continue;
    }
    await prisma.product.create({
      data: {
        slug: p.slug,
        sku: p.sku,
        name: p.name,
        description: p.description,
        basePrice: p.basePrice,
        categoryId: subCategory.id,
        personalizationKind: p.personalizationKind,
        isActive: false, // placeholder
        isPersonalizable: p.personalizationKind !== "NONE",
        premadeSurcharge: p.premadeSurcharge || 0,
        images: [UNSPLASH("1607082348824-0a96f2a4b9da")], // placeholder Unsplash
        productionDays: DEFAULT_PRODUCTION_DAYS_BY_KIND[p.personalizationKind] || 3,
        physicalSpecs:
          DEFAULT_PHYSICAL_SPECS_BY_KIND[p.personalizationKind] ||
          DEFAULT_PHYSICAL_SPECS_BY_KIND.NONE,
        idealFor: ["regalo", "coleccionable"],
        // Default variant para que CartItem pueda referenciar
        variants: {
          create: [
            {
              sku: `${p.sku}-DEFAULT`,
              name: "Default",
              price: p.basePrice,
              attributes: {},
              isActive: false,
            },
          ],
        },
      },
    });
    created++;
  }
  console.log(`  ✓ ${created} placeholders creados, ${updated} ya existentes.\n`);
}

async function step4_EnrichExistingProducts() {
  console.log("Paso 4 — Enriquecer productos existentes con defaults...");
  const products = await prisma.product.findMany({ where: { deletedAt: null } });
  let enriched = 0;
  for (const product of products) {
    const updates = {};
    if (!product.physicalSpecs || Object.keys(product.physicalSpecs).length === 0) {
      updates.physicalSpecs =
        DEFAULT_PHYSICAL_SPECS_BY_KIND[product.personalizationKind] ||
        DEFAULT_PHYSICAL_SPECS_BY_KIND.NONE;
    }
    if (product.productionDays === 3 && product.personalizationKind === "NONE") {
      // Decisión 4.8: NONE → 1 día
      updates.productionDays = 1;
    }
    if (!product.idealFor || (Array.isArray(product.idealFor) && product.idealFor.length === 0)) {
      // Defaults razonables por kind
      const defaults = {
        PHOTO_PACK: ["regalo personalizado", "decoración nevera", "recuerdo familiar"],
        EVENT_FAVOR: ["recordatorio para invitados", "detalle evento"],
        CALENDAR_PHOTO_MONTH: ["regalo año nuevo", "organización personal"],
        CALENDAR_PHOTO_HERO: ["regalo año nuevo", "planner familiar"],
        BUSINESS_LOGO: ["marketing corporativo", "regalo empresarial"],
        CUSTOM_DECOR: ["decoración hogar", "regalo especial"],
        PHOTO_GRID: ["decoración con fotos", "regalo familiar"],
        TEXT_ONLY: ["frase decorativa", "regalo motivacional"],
        NONE: ["coleccionable", "decoración"],
      };
      updates.idealFor = defaults[product.personalizationKind] || ["regalo"];
    }
    if (Object.keys(updates).length > 0) {
      await prisma.product.update({ where: { id: product.id }, data: updates });
      enriched++;
    }
  }
  console.log(
    `  ✓ ${enriched} productos enriquecidos con defaults (skip si ya tenían contenido manual).\n`,
  );
}

async function step5_OcasionLinks() {
  console.log("Paso 5 — Links Product ↔ OcasionTag...");
  let linked = 0;
  let skipped = 0;
  for (const link of PRODUCT_OCASION_LINKS) {
    const ok = await upsertOcasionLink(link.product, link.ocasion, link.rationale);
    if (ok) linked++;
    else skipped++;
  }
  console.log(
    `  ✓ ${linked} links creados/actualizados, ${skipped} omitidos (producto u ocasión no existe).\n`,
  );
}

async function step6_MoveSeparadoresProduct() {
  console.log("Paso 6 — Migrar pack-separadores-libros a categoría Separadores...");
  const product = await prisma.product.findUnique({ where: { slug: "pack-separadores-libros" } });
  if (!product) {
    console.log("  - pack-separadores-libros no existe; skip.");
    return;
  }
  // Reasignar a sub-categoría "Frases" de Separadores (más representativa)
  const frases = await prisma.category.findUnique({ where: { slug: "separadores-frases" } });
  if (!frases) {
    console.warn("  ⚠ Sub-cat separadores-frases no existe; skip.");
    return;
  }
  if (product.categoryId !== frases.id) {
    await prisma.product.update({
      where: { id: product.id },
      data: { categoryId: frases.id },
    });
    console.log("  ✓ pack-separadores-libros movido a Separadores › Frases.\n");
  } else {
    console.log("  - pack-separadores-libros ya está en Separadores › Frases.\n");
  }
}

async function main() {
  await step1_NewCategory();
  await step2_SubCategories();
  await step3_PlaceholderProducts();
  await step4_EnrichExistingProducts();
  await step5_OcasionLinks();
  await step6_MoveSeparadoresProduct();

  // Resumen final
  const cats = await prisma.category.count({ where: { deletedAt: null } });
  const subCats = await prisma.category.count({
    where: { deletedAt: null, parentId: { not: null } },
  });
  const products = await prisma.product.count({ where: { deletedAt: null } });
  const ocasiones = await prisma.ocasionTag.count({ where: { deletedAt: null } });
  const links = await prisma.productOcasionTag.count();

  console.log("=== Estado final del catálogo ===");
  console.log(`  Categorías (raíz + sub): ${cats}`);
  console.log(`  Sub-categorías:          ${subCats}`);
  console.log(`  Productos:               ${products}`);
  console.log(`  Ocasiones:               ${ocasiones}`);
  console.log(`  Links Producto↔Ocasión:  ${links}`);
  console.log("");
  console.log("✅ seed-catalog-v2 completado.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

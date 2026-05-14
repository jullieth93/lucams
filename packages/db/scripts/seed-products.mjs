/*
 * Script de seed para catálogo demo (categorías + productos + reseñas).
 *
 * Sub-bloque M.1.c (2026-05-13): catálogo realineado a 9 categorías + 49
 * productos con `personalizationKind` asignado según experiencia de
 * personalización requerida.
 *
 * Cambios vs versión 2026-05-12:
 *   - 9 categorías (eran 8). `mayorista` → `publicitarios` (ahora visible);
 *     `recuerdos-eventos` → `recuerdos`; `decora-espacio` → `cuadros-decoracion`;
 *     `pequenes` → `juegos-aprendizaje`; `regalos-corazon` → `regalos-personalizados`.
 *     Categoría nueva: `coleccionables` (diseños propios temáticos).
 *   - Cada producto declara `personalizationKind` (enum del schema).
 *   - 49 productos (eran 37).
 *
 * Imágenes: URLs Unsplash hot-linked (`images.unsplash.com` whitelisted
 * en next.config.ts). Cuando Lucy suba foto real desde admin, reemplaza
 * el array `Product.images` en DB.
 *
 * Variante "Default" por producto (CartItem/OrderItem requieren variantId
 * y no hay UI de variantes admin todavía).
 *
 * Idempotente: upsert por SKU. Re-ejecutar no duplica. Productos cuyo SKU
 * desaparece del seed se archivan (slug/sku suffix --legacy-XXX + deletedAt).
 *
 * Uso (vía Makefile):
 *   make seed-products
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

console.log("=== seed-products ===");
console.log("");

// ─────────── Categorías (9) ───────────
// Slugs estables. Cambiar un slug significa archivar la categoría vieja
// (esto lo hace automáticamente el bloque legacy más abajo).

const categoriesData = [
  {
    slug: "foto-imanes",
    name: "Packs de Fotos Magnéticas",
    description:
      "Imanes con tus fotos favoritas. Polaroids, cuadrados, circulares, corazones, glass-magnets. El core de Lucams.",
    order: 1,
    isActive: true,
  },
  {
    slug: "recuerdos",
    name: "Recuerdos Magnéticos",
    description:
      "Detalles personalizados para bodas, baby showers, cumpleaños, graduaciones y quinceañeras. Empaque incluido.",
    order: 2,
    isActive: true,
  },
  {
    slug: "calendarios",
    name: "Calendarios Magnéticos",
    description:
      "Calendarios anuales con 12 fotos (una por mes) o foto-hero. Para la nevera, el escritorio o de regalo.",
    order: 3,
    isActive: true,
  },
  {
    slug: "publicitarios",
    name: "Imanes Publicitarios",
    description:
      "Imanes para tu marca, evento corporativo o campaña. Tu logo + datos de contacto. Mínimo 50 unidades.",
    order: 4,
    isActive: true,
  },
  {
    slug: "organizate",
    name: "Organización y Planificación",
    description:
      "Planners semanales, mensuales y notas magnéticas borrables. Para tu día a día sobre la nevera.",
    order: 5,
    isActive: true,
  },
  {
    slug: "regalos-personalizados",
    name: "Regalos Personalizados",
    description:
      "Cajas y kits temáticos para regalar con cariño. Día de la madre, aniversarios, recién nacidos, parejas.",
    order: 6,
    isActive: true,
  },
  {
    slug: "cuadros-decoracion",
    name: "Cuadros y Decoración",
    description:
      "Cuadros magnéticos con fotos, frases personalizadas y marcos. Para personalizar la nevera y más allá.",
    order: 7,
    isActive: true,
  },
  {
    slug: "coleccionables",
    name: "Imanes Coleccionables",
    description:
      "Diseños propios temáticos: ciudades de Colombia, comida típica, frases motivacionales, animalitos. No personalizable, pero coleccionable.",
    order: 8,
    isActive: true,
  },
  {
    slug: "juegos-aprendizaje",
    name: "Juegos y Aprendizaje Magnéticos",
    description:
      "Abecedario, números, rutinas y planners de emociones para que los peques jueguen y aprendan.",
    order: 9,
    isActive: true,
  },
];

console.log("Creando/actualizando categorías...");
const categoryIds = {};
for (const c of categoriesData) {
  const cat = await prisma.category.upsert({
    where: { slug: c.slug },
    update: {
      name: c.name,
      description: c.description,
      order: c.order,
      isActive: c.isActive,
      deletedAt: null,
    },
    create: { ...c },
  });
  categoryIds[c.slug] = cat.id;
  console.log(`  ✓ ${c.name} (${cat.isActive ? "activa" : "oculta"})`);
}
console.log("");

// ─────────── Productos (49) ───────────
//
// `personalizationKind` por producto declara qué experiencia carga
// el Estudio. Posibles valores (enum Prisma):
//   PHOTO_PACK            — N fotos libres, posiciones flexibles en canvas
//   PHOTO_GRID            — N fotos en grid fijo (ej. 2×3, 3×4)
//   CALENDAR_PHOTO_MONTH  — 12 fotos (una por mes) + año
//   CALENDAR_PHOTO_HERO   — 1 foto hero + planner/datos
//   EVENT_FAVOR           — texto evento + foto opcional + plantilla
//   BUSINESS_LOGO         — logo + datos contacto (B2B)
//   CUSTOM_DECOR          — composición libre foto/frase
//   TEXT_ONLY             — solo texto (frases motivacionales)
//   NONE                  — NO personalizable (coleccionables, planners genéricos)
//
// `personalizationSchema` agrega config específica del kind (slots de fotos,
// aspect ratio, etc.). Se lee en /estudio/[slug] para configurar canvas.

const UNSPLASH = (id) => `https://images.unsplash.com/photo-${id}?w=800&q=80&fit=crop`;

const productsData = [
  // ────────────────────── foto-imanes (8) ──────────────────────
  {
    slug: "set-6-fotoimanes-polaroid-grande",
    sku: "FI-POL-G-6",
    name: "Set 6 Foto-imanes Polaroid Grande",
    description:
      "Set de 6 imanes con tus fotos en formato polaroid grande (7×9 cm). Impresión alta resolución, acabado mate, base magnética premium. Diseñas en vivo en el Estudio.",
    basePrice: 3500000,
    compareAtPrice: 4500000,
    categorySlug: "foto-imanes",
    isPersonalizable: true,
    isFeatured: true,
    personalizationKind: "PHOTO_PACK",
    personalizationSchema: { photoSlots: 6, aspectRatio: "7:9", allowText: true, sizeCm: "7×9" },
    images: [UNSPLASH("1606498679340-0aec3185edbd"), UNSPLASH("1502920917128-1aa500764cbd")],
  },
  {
    slug: "set-9-fotoimanes-polaroid-color",
    sku: "FI-POL-C-9",
    name: "Set 9 Foto-imanes Polaroid Color",
    description:
      "Set de 9 imanes polaroid color (6×8 cm) con bordes blancos clásicos. Ideal para cubrir la nevera con recuerdos. Grid 3×3 sugerido.",
    basePrice: 4500000,
    categorySlug: "foto-imanes",
    isPersonalizable: true,
    personalizationKind: "PHOTO_GRID",
    personalizationSchema: { photoSlots: 9, gridCols: 3, gridRows: 3, aspectRatio: "6:8", sizeCm: "6×8" },
    images: [UNSPLASH("1502920917128-1aa500764cbd")],
  },
  {
    slug: "set-12-fotoimanes-polaroid",
    sku: "FI-POL-12",
    name: "Set 12 Foto-imanes Polaroid",
    description:
      "12 imanes polaroid 6×8 cm con tus fotos. El pack ideal para llenar la nevera con un año entero de recuerdos.",
    basePrice: 4500000,
    categorySlug: "foto-imanes",
    isPersonalizable: true,
    personalizationKind: "PHOTO_PACK",
    personalizationSchema: { photoSlots: 12, aspectRatio: "6:8", allowText: true, sizeCm: "6×8" },
    images: [UNSPLASH("1530541930197-ff16ac917b0e")],
  },
  {
    slug: "set-12-fotoimanes-cuadrados",
    sku: "FI-CUAD-12",
    name: "Set 12 Foto-imanes Cuadrados",
    description:
      "Doce imanes cuadrados 5×5 cm con tus fotos. Formato minimalista, sin bordes, ideal para galerías de recuerdos extensas.",
    basePrice: 4500000,
    categorySlug: "foto-imanes",
    isPersonalizable: true,
    personalizationKind: "PHOTO_PACK",
    personalizationSchema: { photoSlots: 12, aspectRatio: "1:1", sizeCm: "5×5" },
    images: [UNSPLASH("1554080353-a576cf803bda")],
  },
  {
    slug: "set-20-mini-polaroids",
    sku: "FI-MINI-20",
    name: "Set 20 Mini Polaroids",
    description:
      "20 imanes mini polaroid 4×5 cm. Para mostrar TODOS tus momentos sin saturar la nevera.",
    basePrice: 5800000,
    categorySlug: "foto-imanes",
    isPersonalizable: true,
    personalizationKind: "PHOTO_PACK",
    personalizationSchema: { photoSlots: 20, aspectRatio: "4:5", sizeCm: "4×5" },
    images: [UNSPLASH("1502920917128-1aa500764cbd")],
  },
  {
    slug: "set-fotoimanes-circulares",
    sku: "FI-CIRC-6",
    name: "Set Foto-imanes Circulares",
    description:
      "Set de 6 imanes circulares 6 cm con tus fotos. Forma distinta para destacar entre los rectangulares clásicos.",
    basePrice: 3500000,
    categorySlug: "foto-imanes",
    isPersonalizable: true,
    personalizationKind: "PHOTO_PACK",
    personalizationSchema: { photoSlots: 6, aspectRatio: "1:1", shape: "circle", sizeCm: "6" },
    images: [UNSPLASH("1551836022-d5d88e9218df")],
  },
  {
    slug: "set-fotoimanes-corazon",
    sku: "FI-COR-6",
    name: "Set Foto-imanes Corazón",
    description:
      "Set de 6 imanes en forma de corazón con tus fotos. Súper kawaii para regalo de aniversario o día especial.",
    basePrice: 3500000,
    categorySlug: "foto-imanes",
    isPersonalizable: true,
    isFeatured: true,
    personalizationKind: "PHOTO_PACK",
    personalizationSchema: { photoSlots: 6, shape: "heart", sizeCm: "6×6" },
    images: [UNSPLASH("1518621736915-f3b1c41bfd00")],
  },
  {
    slug: "set-glass-magnets-personalizados",
    sku: "FI-GLASS-6",
    name: "Set Glass-Magnets Personalizados",
    description:
      "6 imanes con frente de vidrio premium 3 cm. Lupa natural que magnifica tu foto. El detalle gourmet del catálogo.",
    basePrice: 2500000,
    categorySlug: "foto-imanes",
    isPersonalizable: true,
    personalizationKind: "PHOTO_PACK",
    personalizationSchema: { photoSlots: 6, shape: "circle", finish: "glass", sizeCm: "3" },
    images: [UNSPLASH("1604782206219-3b9576575203")],
  },

  // ────────────────────── recuerdos (6) ──────────────────────
  {
    slug: "recuerdos-cumpleanos-x20",
    sku: "EVT-CUMP-20",
    name: "Recuerdos de Cumpleaños x20",
    description:
      "Kit de 20 imanes personalizados para cumpleaños. Nombre, edad y motivo de la fiesta. Empaque individual incluido.",
    basePrice: 11500000,
    categorySlug: "recuerdos",
    isPersonalizable: true,
    personalizationKind: "EVENT_FAVOR",
    personalizationSchema: { quantity: 20, eventFields: ["name", "age", "date"], allowPhoto: true },
    images: [UNSPLASH("1530103862676-de8c9debad1d")],
  },
  {
    slug: "recuerdos-bautizo-x12",
    sku: "EVT-BAUT-12",
    name: "Recuerdos de Bautizo x12",
    description:
      "12 imanes personalizados para bautizo. Diseño tierno con nombre del bebé, fecha y motivo religioso. Empaque incluido.",
    basePrice: 9000000,
    categorySlug: "recuerdos",
    isPersonalizable: true,
    personalizationKind: "EVENT_FAVOR",
    personalizationSchema: { quantity: 12, eventFields: ["babyName", "date", "venue"], allowPhoto: true },
    images: [UNSPLASH("1525258946800-98cfd641d0de")],
  },
  {
    slug: "recuerdos-graduacion-x20",
    sku: "EVT-GRAD-20",
    name: "Recuerdos de Graduación x20",
    description:
      "20 imanes personalizados con birrete, diploma y fecha. El recordatorio perfecto para tus invitados de graduación.",
    basePrice: 9000000,
    categorySlug: "recuerdos",
    isPersonalizable: true,
    personalizationKind: "EVENT_FAVOR",
    personalizationSchema: { quantity: 20, eventFields: ["graduateName", "degree", "date"], allowPhoto: true },
    images: [UNSPLASH("1523580494863-6f3031224c94")],
  },
  {
    slug: "recuerdos-matrimonio",
    sku: "EVT-MAT-VAR",
    name: "Recuerdos de Matrimonio",
    description:
      "Imanes para invitados de matrimonio. Diseño elegante con tus nombres, fecha y motivo floral. Cotización por cantidad.",
    basePrice: 3000000,
    categorySlug: "recuerdos",
    isPersonalizable: true,
    isFeatured: true,
    personalizationKind: "EVENT_FAVOR",
    personalizationSchema: { eventFields: ["coupleNames", "date", "venue"], allowPhoto: true, minQuantity: 30 },
    images: [UNSPLASH("1519741497674-611481863552")],
  },
  {
    slug: "mi-primer-anito",
    sku: "EVT-ANITO",
    name: "Mi Primer Añito",
    description:
      "Recuerdos personalizados para el primer cumpleaños. Diseño dulce con la foto del bebé, nombre y fecha.",
    basePrice: 4500000,
    categorySlug: "recuerdos",
    isPersonalizable: true,
    personalizationKind: "EVENT_FAVOR",
    personalizationSchema: { quantity: 20, eventFields: ["babyName", "birthDate"], allowPhoto: true },
    images: [UNSPLASH("1525258946800-98cfd641d0de")],
  },
  {
    slug: "recuerdos-quinceanera",
    sku: "EVT-QUINCE-20",
    name: "Recuerdos de Quinceañera",
    description:
      "20 imanes personalizados con la foto de los XV. Marco floral, fecha y nombre. Recordatorio único para el día especial.",
    basePrice: 11500000,
    categorySlug: "recuerdos",
    isPersonalizable: true,
    personalizationKind: "EVENT_FAVOR",
    personalizationSchema: { quantity: 20, eventFields: ["quinceaneraName", "date"], allowPhoto: true },
    images: [UNSPLASH("1525258946800-98cfd641d0de")],
  },

  // ────────────────────── calendarios (4) ──────────────────────
  {
    slug: "calendario-mes-a-mes-fotos",
    sku: "CAL-FOT-12",
    name: "Calendario Mes a Mes con 12 Fotos",
    description:
      "Calendario magnético anual con una foto distinta por mes. 12 imanes intercambiables A4. Subes las 12 fotos en el Estudio.",
    basePrice: 4500000,
    compareAtPrice: 5500000,
    categorySlug: "calendarios",
    isPersonalizable: true,
    isFeatured: true,
    personalizationKind: "CALENDAR_PHOTO_MONTH",
    personalizationSchema: { photoSlots: 12, year: 2026, monthLabels: true },
    images: [UNSPLASH("1606166187734-a4cb74079037")],
  },
  {
    slug: "calendario-foto-hero-planner",
    sku: "CAL-HERO",
    name: "Calendario Foto-Hero + Planner",
    description:
      "Calendario A3 magnético con una foto hero grande arriba + planner mensual borrable abajo. Lo mejor de los dos mundos.",
    basePrice: 4200000,
    categorySlug: "calendarios",
    isPersonalizable: true,
    personalizationKind: "CALENDAR_PHOTO_HERO",
    personalizationSchema: { photoSlots: 1, layout: "hero-top", plannerType: "monthly" },
    images: [UNSPLASH("1577563908411-5077b6dc7624")],
  },
  {
    slug: "calendario-floral-mes-a-mes",
    sku: "CAL-FLOR",
    name: "Calendario Floral Mes a Mes",
    description:
      "Calendario A4 magnético con ilustración floral original por mes. Sin personalización pero precioso para regalo.",
    basePrice: 4800000,
    categorySlug: "calendarios",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1606166187734-a4cb74079037")],
  },
  {
    slug: "mini-calendarios-x10",
    sku: "CAL-MINI-10",
    name: "Mini Calendarios para Regalar x10",
    description:
      "10 mini calendarios magnéticos 5×7 cm. Perfectos como detalle para clientes o invitados. Diseño kawaii Lucams.",
    basePrice: 700000,
    categorySlug: "calendarios",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1606166187734-a4cb74079037")],
  },

  // ────────────────────── publicitarios (5) ──────────────────────
  {
    slug: "imanes-publicitarios-rectos-7x5",
    sku: "B2B-REC-7x5",
    name: "Imanes Publicitarios Rectos 7×5 cm",
    description:
      "Imanes publicitarios rectangulares 7×5 cm. Tu logo + datos de contacto. Mínimo 50 unidades. Cotización al instante.",
    basePrice: 180000,
    categorySlug: "publicitarios",
    isPersonalizable: true,
    personalizationKind: "BUSINESS_LOGO",
    personalizationSchema: { shape: "rectangle", sizeCm: "7×5", minQuantity: 50, fields: ["logo", "phone", "email", "website"] },
    images: [UNSPLASH("1606166187734-a4cb74079037")],
  },
  {
    slug: "imanes-publicitarios-circulares-6cm",
    sku: "B2B-CIRC-6",
    name: "Imanes Publicitarios Circulares 6 cm",
    description:
      "Imanes publicitarios circulares 6 cm. Mínimo 50 unidades. Tu marca + frase corta.",
    basePrice: 200000,
    categorySlug: "publicitarios",
    isPersonalizable: true,
    personalizationKind: "BUSINESS_LOGO",
    personalizationSchema: { shape: "circle", sizeCm: "6", minQuantity: 50, fields: ["logo", "tagline"] },
    images: [UNSPLASH("1606166187734-a4cb74079037")],
  },
  {
    slug: "imanes-publicitarios-troquelados",
    sku: "B2B-TROQ",
    name: "Imanes Publicitarios Troquelados",
    description:
      "Imanes con forma personalizada (silueta del logo, motivo de marca, etc.). Mínimo 50 unidades. Cotización personalizada.",
    basePrice: 250000,
    categorySlug: "publicitarios",
    isPersonalizable: true,
    personalizationKind: "BUSINESS_LOGO",
    personalizationSchema: { shape: "custom", minQuantity: 50, requiresVectorFile: true },
    images: [UNSPLASH("1606166187734-a4cb74079037")],
  },
  {
    slug: "iman-tarjeta-presentacion",
    sku: "B2B-TARJ",
    name: "Imán Tarjeta de Presentación",
    description:
      "Tarjeta de presentación magnética 9×5 cm. Reemplaza la tradicional — se queda en la nevera del cliente. Mínimo 100 unidades.",
    basePrice: 250000,
    categorySlug: "publicitarios",
    isPersonalizable: true,
    personalizationKind: "BUSINESS_LOGO",
    personalizationSchema: { shape: "rectangle", sizeCm: "9×5", minQuantity: 100, fields: ["name", "title", "phone", "email", "company"] },
    images: [UNSPLASH("1606166187734-a4cb74079037")],
  },
  {
    slug: "pack-empresarial-mixto-100",
    sku: "B2B-MIX-100",
    name: "Pack Empresarial Mixto 100 unidades",
    description:
      "100 imanes mixtos (50 rectos + 50 circulares) con tu marca. Ideal para ferias, eventos o repartir en tienda física.",
    basePrice: 380000,
    categorySlug: "publicitarios",
    isPersonalizable: true,
    personalizationKind: "BUSINESS_LOGO",
    personalizationSchema: { quantity: 100, mix: ["rect-7x5", "circle-6"], fields: ["logo", "phone", "social"] },
    images: [UNSPLASH("1606166187734-a4cb74079037")],
  },

  // ────────────────────── organizate (6) ──────────────────────
  {
    slug: "planner-semanal-magnetico",
    sku: "ORG-SEM",
    name: "Planner Semanal Magnético",
    description:
      "Planner semanal A4 magnético borrable. Diseño kawaii con espacios para cada día, prioridades y notas. Marcador incluido.",
    basePrice: 3200000,
    categorySlug: "organizate",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1506784983877-45594efa4cbe")],
  },
  {
    slug: "planner-mensual-magnetico",
    sku: "ORG-MES",
    name: "Planner Mensual Magnético",
    description:
      "Planner mensual A3 magnético borrable. Vista completa del mes, espacios para metas y eventos. Marcador incluido.",
    basePrice: 3600000,
    categorySlug: "organizate",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1483546363825-7ebf25fb7513")],
  },
  {
    slug: "mini-planner-magnetico",
    sku: "ORG-MINI",
    name: "Mini Planner Magnético",
    description:
      "Mini planner 15×20 cm para puerta de nevera. Lista de tareas del día con casillas magnéticas borrables.",
    basePrice: 3000000,
    categorySlug: "organizate",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1499678329028-101435549a4e")],
  },
  {
    slug: "planner-mensual-con-foto",
    sku: "ORG-PLAN-FOT",
    name: "Planner Mensual con Foto",
    description:
      "Planner mensual A3 magnético con tu foto personalizada en el header. Borrable y reutilizable. Marcador incluido.",
    basePrice: 4200000,
    categorySlug: "organizate",
    isPersonalizable: true,
    personalizationKind: "CALENDAR_PHOTO_HERO",
    personalizationSchema: { photoSlots: 1, layout: "header", plannerType: "monthly" },
    images: [UNSPLASH("1577563908411-5077b6dc7624")],
  },
  {
    slug: "set-4-notas-magneticas",
    sku: "ORG-NOT-4",
    name: "Set 4 Notas Magnéticas",
    description:
      "4 notas magnéticas (10×15 cm) borrables. Diseños kawaii Lucams: lista, recordatorios, mood, mini-meta. Marcador incluido.",
    basePrice: 3000000,
    categorySlug: "organizate",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1517842645767-c639042777db")],
  },
  {
    slug: "pack-separadores-libros",
    sku: "ORG-SEP-6",
    name: "Pack Separadores de Libros Magnéticos",
    description:
      "6 separadores magnéticos para libros. Diseños mapache + frases kawaii. No se caen, no rompen páginas.",
    basePrice: 1800000,
    categorySlug: "organizate",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1544716278-ca5e3f4abd8c")],
  },

  // ────────────────────── regalos-personalizados (5) ──────────────────────
  {
    slug: "big-box-dia-mama",
    sku: "REG-BB-MAMA",
    name: "Big Box Día de la Madre",
    description:
      "Caja temática con set de fotoimanes + planner + nota personalizada + empaque premium. El regalo del año.",
    basePrice: 6800000,
    categorySlug: "regalos-personalizados",
    isPersonalizable: true,
    isFeatured: true,
    personalizationKind: "CUSTOM_DECOR",
    personalizationSchema: {
      photoSlots: 6,
      allowText: true,
      includesNote: true,
      shape: "rectangle",
      sizeCm: "5×5",
      finish: "matte",
      cornerRadiusPx: 32,
    },
    images: [UNSPLASH("1549465220-1a8b9238cd48")],
  },
  {
    slug: "mini-box-dia-mama",
    sku: "REG-MB-MAMA",
    name: "Mini Box Día de la Madre",
    description:
      "Versión mini del Big Box. Set de fotoimanes + nota personalizada en caja kraft. Detalle dulce.",
    basePrice: 4500000,
    categorySlug: "regalos-personalizados",
    isPersonalizable: true,
    personalizationKind: "CUSTOM_DECOR",
    personalizationSchema: {
      photoSlots: 4,
      allowText: true,
      includesNote: true,
      shape: "rectangle",
      sizeCm: "5×5",
      finish: "matte",
      cornerRadiusPx: 32,
    },
    images: [UNSPLASH("1513201099705-a9746e1e201f")],
  },
  {
    slug: "box-para-pareja",
    sku: "REG-PAR",
    name: "Box Para Pareja",
    description:
      "Caja con set de imanes corazón + nota + frase personalizada. Aniversario, San Valentín o sólo porque sí.",
    basePrice: 5500000,
    categorySlug: "regalos-personalizados",
    isPersonalizable: true,
    personalizationKind: "CUSTOM_DECOR",
    personalizationSchema: {
      photoSlots: 6,
      shape: "heart",
      allowText: true,
      includesNote: true,
      sizeCm: "5×6",
      finish: "glossy",
    },
    images: [UNSPLASH("1518621736915-f3b1c41bfd00")],
  },
  {
    slug: "box-recien-nacido",
    sku: "REG-BABY",
    name: "Box Recién Nacido",
    description:
      "Caja con recordatorios magnéticos del bebé + planner de rutina + caja kraft tierna. Detalle único para baby shower o nacimiento.",
    basePrice: 5500000,
    categorySlug: "regalos-personalizados",
    isPersonalizable: true,
    personalizationKind: "EVENT_FAVOR",
    personalizationSchema: { quantity: 12, eventFields: ["babyName", "birthDate", "weight"], allowPhoto: true },
    images: [UNSPLASH("1525258946800-98cfd641d0de")],
  },
  {
    slug: "caja-lucams-sorpresa",
    sku: "REG-MYST",
    name: "Caja Lucams Sorpresa",
    description:
      "Mystery box: te enviamos un set de imanes Lucams sorpresa por COP 25.000. Curaduría a mano. No personalizable.",
    basePrice: 2500000,
    categorySlug: "regalos-personalizados",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1607344645866-009c320b63e0")],
  },

  // ────────────────────── cuadros-decoracion (4) ──────────────────────
  {
    slug: "cuadro-15x15-con-foto",
    sku: "DEC-CUAD-15",
    name: "Cuadro 15×15 cm con Foto",
    description:
      "Cuadro magnético 15×15 cm con tu foto. Marco fino brand-purple. Composición libre en canvas.",
    basePrice: 2700000,
    categorySlug: "cuadros-decoracion",
    isPersonalizable: true,
    personalizationKind: "CUSTOM_DECOR",
    personalizationSchema: {
      photoSlots: 1,
      sizeCm: "15×15",
      allowText: true,
      shape: "rectangle",
      finish: "glossy",
      cornerRadiusPx: 20,
    },
    images: [UNSPLASH("1513519245088-0e12902e5a38")],
  },
  {
    slug: "cuadro-3-fotos",
    sku: "DEC-CUAD-3F",
    name: "Cuadro para 3 Fotos",
    description:
      "Cuadro magnético con 3 espacios para fotos en grid horizontal. Tu trío favorito en una sola pieza.",
    basePrice: 4000000,
    categorySlug: "cuadros-decoracion",
    isPersonalizable: true,
    personalizationKind: "PHOTO_GRID",
    personalizationSchema: { photoSlots: 3, gridCols: 3, gridRows: 1, sizeCm: "30×10" },
    images: [UNSPLASH("1547119957-637f8679db1e")],
  },
  {
    slug: "cuadro-frase-personalizada-20x20",
    sku: "DEC-FRASE-20",
    name: "Cuadro Frase Personalizada 20×20",
    description:
      "Cuadro magnético 20×20 cm con tu frase favorita. Tipografías kawaii, colores brand. Sin fotos, solo texto.",
    basePrice: 3200000,
    categorySlug: "cuadros-decoracion",
    isPersonalizable: true,
    personalizationKind: "TEXT_ONLY",
    personalizationSchema: { sizeCm: "20×20", maxChars: 80, fontOptions: ["fredoka", "baloo", "inter"] },
    images: [UNSPLASH("1513519245088-0e12902e5a38")],
  },
  {
    slug: "marcos-magneticos-cuadrados",
    sku: "DEC-MARC-2",
    name: "Marcos Magnéticos Cuadrados (pack 2)",
    description:
      "2 marcos magnéticos cuadrados 8×8 cm. Cambias la foto cuando quieras (foto física, no impresa). Sin personalización inicial.",
    basePrice: 1400000,
    categorySlug: "cuadros-decoracion",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1493663284031-b7e3aefcae8e")],
  },

  // ────────────────────── coleccionables (6) ──────────────────────
  // Diseños propios genéricos — cero riesgo licencia. Lucy elige cantidad
  // y combinación, no personaliza el contenido del diseño.
  {
    slug: "pack-imanes-ciudades-colombia",
    sku: "COL-CIUD-CO",
    name: "Pack Imanes Ciudades de Colombia",
    description:
      "8 imanes con ilustraciones kawaii de Bogotá, Medellín, Cali, Cartagena, Barranquilla, Bucaramanga, Pereira y Santa Marta. Diseño propio Lucams.",
    basePrice: 3800000,
    categorySlug: "coleccionables",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1518453096828-3c4e3b3e94c5")],
  },
  {
    slug: "pack-comida-colombiana",
    sku: "COL-COMIDA-CO",
    name: "Pack Imanes Comida Colombiana",
    description:
      "8 imanes con ilustraciones kawaii: ajiaco, bandeja paisa, arepa, buñuelo, lechona, sancocho, chocolate y obleas. Tributo dulce a la cocina.",
    basePrice: 3800000,
    categorySlug: "coleccionables",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1565299624946-b28f40a0ae38")],
  },
  {
    slug: "pack-frases-motivacionales",
    sku: "COL-FRASES",
    name: "Pack Frases Motivacionales",
    description:
      "6 imanes con frases motivacionales kawaii ('Tú puedes', 'Hoy es tu día', 'Respira', 'Brilla', 'Eres suficiente', 'Sigue'). Diseño propio.",
    basePrice: 2800000,
    categorySlug: "coleccionables",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1530989054533-9c3e6daa5b9e")],
  },
  {
    slug: "pack-animalitos-kawaii",
    sku: "COL-ANIM",
    name: "Pack Animalitos Kawaii",
    description:
      "8 imanes con animalitos kawaii ilustrados a mano: mapache, gato, perro, panda, conejo, oso, zorro y unicornio. Aptos para neveras infantiles.",
    basePrice: 3800000,
    categorySlug: "coleccionables",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1546182990-dffeafbe841d")],
  },
  {
    slug: "pack-viajes-latam",
    sku: "COL-VIAJES",
    name: "Pack Viajes Latam",
    description:
      "6 imanes con destinos icónicos ilustrados: Cartagena, Machu Picchu, Buenos Aires, Río de Janeiro, Ciudad de México y Cusco. Para soñar el próximo viaje.",
    basePrice: 3200000,
    categorySlug: "coleccionables",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1488646953014-85cb44e25828")],
  },
  {
    slug: "pack-mood-emociones",
    sku: "COL-MOOD",
    name: "Pack Mood y Emociones",
    description:
      "10 imanes con caritas kawaii expresando emociones (feliz, triste, enojado, cansado, motivado, etc.). Para marcar cómo estás cada día.",
    basePrice: 3200000,
    categorySlug: "coleccionables",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1503454537195-1dcabb73ffb9")],
  },

  // ────────────────────── juegos-aprendizaje (5) ──────────────────────
  {
    slug: "abecedario-magnetico",
    sku: "KID-ABC",
    name: "Abecedario Magnético",
    description:
      "37 fichas magnéticas con las letras del alfabeto (incluye Ñ). Diseño colorido kawaii. Aprende jugando sobre la nevera.",
    basePrice: 5800000,
    categorySlug: "juegos-aprendizaje",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1471107340929-a87cd0f5b5f3")],
  },
  {
    slug: "set-fichas-numeros",
    sku: "KID-NUM",
    name: "Set Fichas Magnéticas — Los Números",
    description:
      "Set de fichas con números 0-9 + signos matemáticos (+, −, ×, ÷, =). Para sumar, restar y aprender jugando.",
    basePrice: 7200000,
    categorySlug: "juegos-aprendizaje",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1503676260728-1c00da094a0b")],
  },
  {
    slug: "rutina-infantil-7-actividades",
    sku: "KID-RUT-7",
    name: "Crea tu Rutina Infantil (7 actividades)",
    description:
      "7 fichas magnéticas con actividades del día (cepillarse, comer, jugar, leer...). Para que los peques sigan su rutina con autonomía.",
    basePrice: 2700000,
    categorySlug: "juegos-aprendizaje",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1503454537195-1dcabb73ffb9")],
  },
  {
    slug: "rutina-infantil-xl-9",
    sku: "KID-RUT-9",
    name: "Crea tu Rutina Infantil XL (9 actividades)",
    description:
      "Versión XL con 9 actividades más completas. Mañana, tarde y noche cubiertas. Magnético borrable.",
    basePrice: 3600000,
    categorySlug: "juegos-aprendizaje",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1471107340929-a87cd0f5b5f3")],
  },
  {
    slug: "planner-emociones-kids",
    sku: "KID-EMO",
    name: "Planner de Emociones Kids",
    description:
      "Planner magnético para que los peques aprendan a identificar y expresar sus emociones. 8 caritas magnéticas + espacios diarios.",
    basePrice: 2700000,
    categorySlug: "juegos-aprendizaje",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1503454537195-1dcabb73ffb9")],
  },
];

// Pre-cleanup: si hay productos viejos cuyos SKU NO están en el seed
// nuevo, renombramos slug/sku con suffix "--legacy-XXX" y soft-deletamos.
// Libera las unique constraints sin destruir data. Si Lucy quiere
// recuperar uno, su row sigue en DB, solo invisible.
const targetSkus = new Set(productsData.map((p) => p.sku));
const legacyProducts = await prisma.product.findMany({
  where: { deletedAt: null, sku: { notIn: Array.from(targetSkus) } },
  select: { id: true, slug: true, sku: true, name: true },
});
if (legacyProducts.length > 0) {
  console.log(`Archivando ${legacyProducts.length} producto(s) legacy...`);
  for (const lp of legacyProducts) {
    const suffix = `--legacy-${lp.id.slice(-6)}`;
    await prisma.product.update({
      where: { id: lp.id },
      data: {
        slug: lp.slug.endsWith(suffix) ? lp.slug : `${lp.slug}${suffix}`,
        sku: lp.sku.endsWith(suffix.toUpperCase().replace(/-/g, ""))
          ? lp.sku
          : `${lp.sku}--LEG-${lp.id.slice(-6).toUpperCase()}`,
        isActive: false,
        deletedAt: new Date(),
      },
    });
    console.log(`  ↳ ${lp.name} archivado`);
  }
  console.log("");
}

// Similar para categorías: si una categoría existente NO está en el seed
// nuevo, archivarla. Pero antes verificar que no tenga productos activos.
const targetCatSlugs = new Set(categoriesData.map((c) => c.slug));
const legacyCats = await prisma.category.findMany({
  where: { deletedAt: null, slug: { notIn: Array.from(targetCatSlugs) } },
  select: { id: true, slug: true, name: true, _count: { select: { products: { where: { deletedAt: null } } } } },
});
if (legacyCats.length > 0) {
  console.log(`Categorías legacy encontradas: ${legacyCats.length}`);
  for (const lc of legacyCats) {
    if (lc._count.products > 0) {
      console.log(`  ⚠ ${lc.name} tiene ${lc._count.products} productos activos — NO archivando`);
      continue;
    }
    const suffix = `--legacy-${lc.id.slice(-6)}`;
    await prisma.category.update({
      where: { id: lc.id },
      data: {
        slug: lc.slug.endsWith(suffix) ? lc.slug : `${lc.slug}${suffix}`,
        isActive: false,
        deletedAt: new Date(),
      },
    });
    console.log(`  ↳ ${lc.name} archivada`);
  }
  console.log("");
}

console.log("Creando/actualizando productos...");
const productIdsBySlug = {};
for (const p of productsData) {
  const categoryId = categoryIds[p.categorySlug];
  if (!categoryId) {
    console.error(`  ✗ Categoría no encontrada: ${p.categorySlug}`);
    continue;
  }
  const { categorySlug, ...rest } = p;
  // Upsert por SKU (no por slug) — los SKUs son la clave estable del
  // catálogo. Si Lucy cambia el slug pero mantiene el SKU, lo
  // actualizamos. Si introduce SKU nuevo, creamos producto nuevo.
  const product = await prisma.product.upsert({
    where: { sku: p.sku },
    update: {
      ...rest,
      categoryId,
      isActive: true,
      deletedAt: null,
    },
    create: {
      ...rest,
      categoryId,
      isActive: true,
    },
  });
  productIdsBySlug[p.slug] = product.id;

  // Variante default — CartItem/OrderItem requieren variantId.
  const variantSku = `${p.sku}-DEFAULT`;
  await prisma.productVariant.upsert({
    where: { sku: variantSku },
    update: { deletedAt: null, name: "Default" },
    create: {
      productId: product.id,
      name: "Default",
      sku: variantSku,
      price: null,
      stock: 0,
      attributes: {},
    },
  });

  console.log(`  ✓ ${p.name}  [${p.personalizationKind}]  (${p.sku})`);
}
console.log("");

// ─────────── Reseñas demo ───────────
//
// 24 reseñas distribuidas: 3-5 en productos featured, 1-2 en otros,
// algunas sin reseñas (mostrar empty state). Snapshot de authorName +
// authorCity para mostrar en UI sin tener Customer real.

const reviewsData = [
  // featured: set-6-fotoimanes-polaroid-grande (5 reseñas)
  { productSlug: "set-6-fotoimanes-polaroid-grande", rating: 5, comment: "¡Llegaron preciosos! La calidad de impresión es brutal y los imanes agarran fuerte. Mi nevera está ahora llena de recuerdos del viaje a Cartagena.", authorName: "María C.", authorCity: "Bogotá", featured: true, isApproved: true },
  { productSlug: "set-6-fotoimanes-polaroid-grande", rating: 5, comment: "Personalización súper fácil, llegó en 4 días. Vino con un empaque kawaii precioso, parece regalo de marca grande.", authorName: "Ana S.", authorCity: "Medellín", featured: true, isApproved: true },
  { productSlug: "set-6-fotoimanes-polaroid-grande", rating: 5, comment: "Lo regalé a mi mamá y lloró de la emoción. Las fotos de la familia perfectas, los colores vibrantes. 10/10.", authorName: "Daniela R.", authorCity: "Cali", isApproved: true },
  { productSlug: "set-6-fotoimanes-polaroid-grande", rating: 4, comment: "Calidad excelente. El único detalle es que el empaque exterior llegó un poco golpeado pero los imanes intactos. Recomendados.", authorName: "Carolina P.", authorCity: "Barranquilla", isApproved: true },
  { productSlug: "set-6-fotoimanes-polaroid-grande", rating: 5, comment: "Compré 3 sets para regalar a mis hermanas. Todas felices. Volveré por más.", authorName: "Luisa M.", authorCity: "Bucaramanga", isApproved: true },

  // featured: set-fotoimanes-corazon
  { productSlug: "set-fotoimanes-corazon", rating: 5, comment: "Regalo de aniversario perfecto. Mi novio quedó enamorado.", authorName: "Sofía V.", authorCity: "Pereira", featured: true, isApproved: true },
  { productSlug: "set-fotoimanes-corazon", rating: 5, comment: "Adorables. Los corazones tienen un acabado mate súper bonito.", authorName: "Valentina G.", authorCity: "Manizales", isApproved: true },

  // featured: recuerdos-matrimonio
  { productSlug: "recuerdos-matrimonio", rating: 5, comment: "Los entregamos en nuestra boda y los invitados los aman. Calidad insuperable.", authorName: "Andrés & Laura", authorCity: "Cartagena", featured: true, isApproved: true },
  { productSlug: "recuerdos-matrimonio", rating: 5, comment: "Lucy nos asesoró por WhatsApp con el diseño, súper paciente. Llegaron antes de lo prometido.", authorName: "Pablo H.", authorCity: "Bogotá", isApproved: true },
  { productSlug: "recuerdos-matrimonio", rating: 4, comment: "Hermosos. Sugerencia: tener opción de varios diseños base para elegir.", authorName: "Camila T.", authorCity: "Medellín", isApproved: true },

  // featured: calendario-mes-a-mes-fotos
  { productSlug: "calendario-mes-a-mes-fotos", rating: 5, comment: "Lo mejor para el escritorio. Cambio el imán cada mes y siempre veo una foto distinta. Lo amo.", authorName: "Juan D.", authorCity: "Bogotá", featured: true, isApproved: true },
  { productSlug: "calendario-mes-a-mes-fotos", rating: 5, comment: "Regalo de Navidad para mi familia, todos lo aman. Volveré el próximo año.", authorName: "Patricia M.", authorCity: "Ibagué", isApproved: true },
  { productSlug: "calendario-mes-a-mes-fotos", rating: 5, comment: "La idea de cambiar foto cada mes es genial. Súper original.", authorName: "Rocío F.", authorCity: "Cali", isApproved: true },

  // featured: big-box-dia-mama
  { productSlug: "big-box-dia-mama", rating: 5, comment: "Mi mamá lloró. Vale cada peso. El empaque ya es regalo en sí mismo.", authorName: "Laura B.", authorCity: "Bogotá", featured: true, isApproved: true },
  { productSlug: "big-box-dia-mama", rating: 5, comment: "Detalle súper completo, mi suegra encantada. Llegó perfecto.", authorName: "Manuela O.", authorCity: "Medellín", isApproved: true },
  { productSlug: "big-box-dia-mama", rating: 5, comment: "Coordinaron entrega para el día exacto del día de la madre. Excelente servicio.", authorName: "Lucas H.", authorCity: "Bogotá", isApproved: true },

  // otros con 1-2 reseñas
  { productSlug: "set-9-fotoimanes-polaroid-color", rating: 5, comment: "Súper coloridos, la nevera quedó hermosa.", authorName: "Karen P.", authorCity: "Cúcuta", isApproved: true },
  { productSlug: "set-12-fotoimanes-cuadrados", rating: 5, comment: "Minimalista, justo lo que buscaba. Calidad top.", authorName: "Felipe R.", authorCity: "Bogotá", isApproved: true },
  { productSlug: "set-20-mini-polaroids", rating: 4, comment: "20 mini polaroids = mucho amor. Solo recomiendo subir fotos de buena resolución.", authorName: "Sara N.", authorCity: "Medellín", isApproved: true },
  { productSlug: "planner-semanal-magnetico", rating: 5, comment: "El borrado funciona perfecto, marcador incluido genial.", authorName: "Catalina E.", authorCity: "Bogotá", isApproved: true },
  { productSlug: "planner-mensual-con-foto", rating: 5, comment: "La foto en el header le da personalidad propia. Lo amo.", authorName: "Daniel Q.", authorCity: "Cali", isApproved: true },
  { productSlug: "abecedario-magnetico", rating: 5, comment: "Mis peques juegan horas con esto. Aprenden y se entretienen.", authorName: "Mariana L.", authorCity: "Pereira", isApproved: true },
  { productSlug: "rutina-infantil-7-actividades", rating: 5, comment: "Mi hijo ya sigue su rutina solo en las mañanas. Cambio enorme.", authorName: "Andrea K.", authorCity: "Bogotá", isApproved: true },
  { productSlug: "cuadro-3-fotos", rating: 5, comment: "El detalle de los marcos es precioso. Tres recuerdos en una pieza.", authorName: "Esteban M.", authorCity: "Medellín", isApproved: true },

  // coleccionables: dejamos sin reseña featured (catálogo nuevo, sin compras todavía)
  { productSlug: "pack-imanes-ciudades-colombia", rating: 5, comment: "Compré el de ciudades y me encantó. Bogotá quedó adorable.", authorName: "Tatiana W.", authorCity: "Bogotá", isApproved: true },
  { productSlug: "pack-frases-motivacionales", rating: 5, comment: "Los pegué en mi escritorio. Cada mañana me motivan. Diseño hermoso.", authorName: "Camilo V.", authorCity: "Bogotá", isApproved: true },
];

console.log("Creando/actualizando reseñas demo...");
let reviewsCreated = 0;
for (const r of reviewsData) {
  const productId = productIdsBySlug[r.productSlug];
  if (!productId) continue;
  // Sin unique constraint en (productId, authorName, createdAt) — re-run
  // duplicaría. Para idempotencia chequeamos manualmente por (productId,
  // authorName, comment) que es razonablemente único en demo.
  const existing = await prisma.review.findFirst({
    where: { productId, comment: r.comment, authorName: r.authorName },
    select: { id: true },
  });
  if (existing) {
    await prisma.review.update({
      where: { id: existing.id },
      data: {
        rating: r.rating,
        authorCity: r.authorCity ?? null,
        featured: r.featured ?? false,
        isApproved: r.isApproved,
        deletedAt: null,
      },
    });
  } else {
    await prisma.review.create({
      data: {
        productId,
        rating: r.rating,
        comment: r.comment,
        authorName: r.authorName,
        authorCity: r.authorCity ?? null,
        featured: r.featured ?? false,
        isApproved: r.isApproved,
        images: [],
      },
    });
    reviewsCreated++;
  }
}
console.log(`  ✓ ${reviewsCreated} reseñas nuevas (idempotente)`);
console.log("");

const totalCategories = await prisma.category.count({ where: { deletedAt: null } });
const totalProducts = await prisma.product.count({ where: { deletedAt: null } });
const totalReviews = await prisma.review.count({ where: { deletedAt: null } });

// Breakdown por personalizationKind
const byKind = await prisma.product.groupBy({
  by: ["personalizationKind"],
  where: { deletedAt: null },
  _count: { _all: true },
});

console.log(
  `Total en DB: ${totalCategories} categorías, ${totalProducts} productos, ${totalReviews} reseñas.`,
);
console.log("");
console.log("Distribución por kind:");
for (const k of byKind.sort((a, b) => b._count._all - a._count._all)) {
  console.log(`  ${k.personalizationKind.padEnd(22)} ${k._count._all}`);
}
console.log("");
console.log("Listo. Ve a /admin/productos o /admin/categorias.");

await prisma.$disconnect();
process.exit(0);

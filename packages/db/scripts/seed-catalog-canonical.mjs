/*
 * Seed CANÓNICO del catálogo (categorías + productos + variantes declarados).
 *
 * N-06 (2026-09-12): nace del split de seed-products.mjs, que mezclaba seed
 * canónico y fixtures demo y era CRÍTICO de correr: en update pisaba
 * price/basePrice/images editados en el admin, archivaba productos/categorías
 * no declarados en cada corrida, y resucitaba las reseñas demo aprobadas.
 * Reglas de este script (auditoría 360° CF-09):
 *
 *   - DRY-RUN por defecto; `--apply` ejecuta. Env-guard fail-closed
 *     (lib/env-guard.mjs) — bloquea PRD y cualquier destino no reconocido.
 *   - UPDATE de producto NUNCA toca: basePrice/compareAtPrice (precio),
 *     images, isActive, deletedAt, isFeatured (merchandising del admin). Solo
 *     alinea contenido/estructura: slug, name, description, categoryId,
 *     isPersonalizable, personalizationKind, personalizationSchema.
 *   - UPDATE de categoría: name/description/order (no isActive/deletedAt).
 *   - UPDATE de variante: productId/name/attributes (no price ni estados).
 *   - SIN resurrección: nada inactivo/soft-deleted se reactiva al re-correr.
 *   - SIN reseñas: las 26 reseñas demo viven en seed-demo-reviews.mjs.
 *   - SIN barrido por defecto: archivar productos/categorías/variantes NO
 *     declarados es opt-in con `--prune` (dry-run solo los lista; con
 *     --apply exige confirmación interactiva del destino).
 *   - --apply corre en UNA transacción (all-or-nothing), conteos antes/después.
 *
 * Mantiene del seed original las reglas de naming ADR-036 y la nota H11
 * (stock made-to-order de productos personalizables — ver más abajo).
 *
 * Uso (vía Makefile — el target ya pasa --apply):
 *   make seed-products
 * Directo:
 *   node scripts/seed-catalog-canonical.mjs                    # DRY-RUN
 *   node scripts/seed-catalog-canonical.mjs --apply            # siembra/alinea
 *   node scripts/seed-catalog-canonical.mjs --prune            # lista archivables
 *   node scripts/seed-catalog-canonical.mjs --apply --prune    # + archiva (pide confirmación)
 */

import { PrismaClient } from "@prisma/client";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";
import { confirmTargetInteractive } from "./lib/confirm-target.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

// Guarda de ambiente: siembra/alinea el catálogo — bloquea PRD/remotos no STG.
assertDestructiveAllowed("seed-catalog-canonical.mjs");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const PRUNE = process.argv.includes("--prune");

// Campos que el update SÍ alinea (whitelist — todo lo demás es del admin).
// Nunca incluir precio/imágenes/estado/merchandising acá (ver header).
const PRODUCT_UPDATE_FIELDS = [
  "slug",
  "name",
  "description",
  "isPersonalizable",
  "personalizationKind",
  "personalizationSchema",
];
const CATEGORY_UPDATE_FIELDS = ["name", "description", "order"];
const VARIANT_UPDATE_FIELDS = ["name", "attributes"];

// Comparación tolerante a orden de llaves para diffs del dry-run.
const sameValue = (a, b) => {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === "object" || typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
};

/** Campos de la whitelist que difieren entre la fila existente y lo declarado. */
function changedFields(existing, declared, fields) {
  return fields.filter((f) => !sameValue(existing[f], declared[f]));
}

// Auditoría v3 · H11 — los productos PERSONALIZABLES son "hechos a pedido": no
// llevan inventario de unidades terminadas (se fabrican por orden). Stock
// made-to-order amplio para que no salgan "Agotado" (la saga descuenta de un
// buffer holgado). Si Lucy quiere limitar una edición, ajusta desde el admin.
const MADE_TO_ORDER_STOCK = 100_000;

// ─────────── Categorías (9) ───────────
// Slugs estables. Cambiar un slug significa archivar la categoría vieja
// (esto lo hace automáticamente el bloque legacy más abajo).

// 10 categorías. Naming rules (M.3.b.CAT.10, 2026-05-14):
//  - Display name corto, sin redundancias (no "Magnéticos" si la categoría
//    ya está dentro de tienda de imanes magnéticos).
//  - Sustantivos sobre verbos (Organización > Organízate).
//  - "Cajas Regalo" separado conceptual de "De Temporada":
//    · Cajas Regalo = año-redondo (pareja, baby, sorpresa)
//    · De Temporada = estacional (Día Madre/Padre, Navidad, San Valentín)
const categoriesData = [
  {
    slug: "foto-imanes",
    name: "Fotoimanes",
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
    name: "Organización",
    description:
      "Planners semanales, mensuales y notas magnéticas borrables. Para tu día a día sobre la nevera.",
    order: 5,
    isActive: true,
  },
  {
    slug: "regalos-personalizados",
    name: "Cajas Regalo",
    description:
      "Cajas y kits temáticos para regalar con cariño. Pareja, recién nacido, sorpresa Lucams.",
    order: 6,
    isActive: true,
  },
  {
    slug: "de-temporada",
    name: "De Temporada",
    description:
      "Ediciones especiales por fechas del año: Día de la Madre, Día del Padre, Navidad, San Valentín. Stock limitado por campaña.",
    order: 7,
    isActive: true,
  },
  {
    slug: "cuadros-decoracion",
    name: "Cuadros y Decoración",
    description:
      "Cuadros magnéticos con fotos, frases personalizadas y marcos. Para personalizar la nevera y más allá.",
    order: 8,
    isActive: true,
  },
  {
    slug: "coleccionables",
    name: "Imanes Coleccionables",
    description:
      "Diseños propios temáticos: ciudades de Colombia, comida típica, frases motivacionales, animalitos. Coleccionable, no personalizable.",
    order: 9,
    isActive: true,
  },
  {
    slug: "juegos-aprendizaje",
    name: "Juegos y Aprendizaje",
    description:
      "Abecedario, números, rutinas y planners de emociones para que los peques jueguen y aprendan.",
    order: 10,
    isActive: true,
  },
];

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
  // Base de familia Polaroid — variants creados por consolidate-product-families
  // se preservan acá con SKUs explícitos (FI-POL-12-V1..V4). El upsert por SKU
  // los encuentra y no duplica. Naming aplicado: producto base sin cantidad ni
  // tamaño en el nombre.
  {
    slug: "set-12-fotoimanes-polaroid",
    sku: "FI-POL-12",
    name: "Fotoimanes Polaroid",
    description:
      "Fotoimanes con tus fotos en formato polaroid clásico. Bordes blancos icónicos, impresión alta resolución, acabado mate. Elige cantidad y tamaño en el selector.",
    basePrice: 4500000,
    compareAtPrice: 5500000,
    categorySlug: "foto-imanes",
    isPersonalizable: true,
    isFeatured: true,
    personalizationKind: "PHOTO_PACK",
    personalizationSchema: { photoSlots: 12, aspectRatio: "6:8", allowText: true, sizeCm: "6×8" },
    images: [UNSPLASH("1530541930197-ff16ac917b0e"), UNSPLASH("1502920917128-1aa500764cbd")],
    variants: [
      {
        sku: "FI-POL-12-V1",
        name: "Set 6 unidades · 7×9 cm",
        price: 3500000,
        attributes: { photoSlots: 6, sizeCm: "7×9", aspectRatio: "7:9" },
      },
      {
        sku: "FI-POL-12-V2",
        name: "Set 9 unidades · 6×8 cm",
        price: 4500000,
        attributes: { photoSlots: 9, sizeCm: "6×8", aspectRatio: "6:8" },
      },
      {
        sku: "FI-POL-12-V3",
        name: "Set 12 unidades · 6×8 cm",
        price: 4500000,
        attributes: { photoSlots: 12, sizeCm: "6×8", aspectRatio: "6:8" },
      },
      {
        sku: "FI-POL-12-V4",
        name: "Set 20 mini · 4×5 cm",
        price: 5800000,
        attributes: { photoSlots: 20, sizeCm: "4×5", aspectRatio: "4:5" },
      },
    ],
  },
  {
    slug: "set-12-fotoimanes-cuadrados",
    sku: "FI-CUAD-12",
    name: "Fotoimanes Cuadrados",
    description:
      "Fotoimanes cuadrados 5×5 cm con tus fotos. Formato minimalista, sin bordes. Ideal para galerías extensas. Elige cantidad en el selector.",
    basePrice: 4500000,
    categorySlug: "foto-imanes",
    isPersonalizable: true,
    personalizationKind: "PHOTO_PACK",
    personalizationSchema: {
      photoSlots: 12,
      aspectRatio: "1:1",
      sizeCm: "5×5",
      shape: "rectangle",
    },
    images: [UNSPLASH("1554080353-a576cf803bda")],
    // Variants modulares: Cantidad (6/9/12) × Tamaño (4×4 / 5×5 / 7×7).
    // Pricing unitario por tamaño: 4×4 $4k / 5×5 $4.5k / 7×7 $6k.
    variants: [
      // ── 4×4 cm ──
      {
        sku: "FI-CUAD-12-V11",
        name: "6 unidades · 4×4 cm",
        price: 2400000,
        attributes: { photoSlots: 6, sizeCm: "4×4", aspectRatio: "1:1", shape: "rectangle" },
      },
      {
        sku: "FI-CUAD-12-V12",
        name: "9 unidades · 4×4 cm",
        price: 3600000,
        attributes: { photoSlots: 9, sizeCm: "4×4", aspectRatio: "1:1", shape: "rectangle" },
      },
      {
        sku: "FI-CUAD-12-V13",
        name: "12 unidades · 4×4 cm",
        price: 4800000,
        attributes: { photoSlots: 12, sizeCm: "4×4", aspectRatio: "1:1", shape: "rectangle" },
      },
      // ── 5×5 cm ──
      {
        sku: "FI-CUAD-12-V21",
        name: "6 unidades · 5×5 cm",
        price: 2700000,
        attributes: { photoSlots: 6, sizeCm: "5×5", aspectRatio: "1:1", shape: "rectangle" },
      },
      {
        sku: "FI-CUAD-12-V22",
        name: "9 unidades · 5×5 cm",
        price: 4000000,
        attributes: { photoSlots: 9, sizeCm: "5×5", aspectRatio: "1:1", shape: "rectangle" },
      },
      {
        sku: "FI-CUAD-12-V23",
        name: "12 unidades · 5×5 cm",
        price: 5400000,
        attributes: { photoSlots: 12, sizeCm: "5×5", aspectRatio: "1:1", shape: "rectangle" },
      },
      // ── 7×7 cm ──
      {
        sku: "FI-CUAD-12-V31",
        name: "6 unidades · 7×7 cm",
        price: 3600000,
        attributes: { photoSlots: 6, sizeCm: "7×7", aspectRatio: "1:1", shape: "rectangle" },
      },
      {
        sku: "FI-CUAD-12-V32",
        name: "9 unidades · 7×7 cm",
        price: 5400000,
        attributes: { photoSlots: 9, sizeCm: "7×7", aspectRatio: "1:1", shape: "rectangle" },
      },
      {
        sku: "FI-CUAD-12-V33",
        name: "12 unidades · 7×7 cm",
        price: 7200000,
        attributes: { photoSlots: 12, sizeCm: "7×7", aspectRatio: "1:1", shape: "rectangle" },
      },
    ],
  },
  {
    slug: "set-fotoimanes-circulares",
    sku: "FI-CIRC-6",
    name: "Fotoimanes Circulares",
    description:
      "Fotoimanes circulares 6 cm con tus fotos. Forma distinta para destacar entre los rectangulares clásicos. Elige la cantidad.",
    basePrice: 3500000,
    categorySlug: "foto-imanes",
    isPersonalizable: true,
    personalizationKind: "PHOTO_PACK",
    personalizationSchema: { photoSlots: 6, aspectRatio: "1:1", shape: "circle", sizeCm: "6" },
    images: [UNSPLASH("1551836022-d5d88e9218df")],
    // Variants modulares: Cantidad (6/9/12) × Diámetro (5 / 6 / 8 cm).
    variants: [
      // ── 5 cm ──
      {
        sku: "FI-CIRC-6-V11",
        name: "6 unidades · 5 cm diámetro",
        price: 3000000,
        attributes: { photoSlots: 6, sizeCm: "5", aspectRatio: "1:1", shape: "circle" },
      },
      {
        sku: "FI-CIRC-6-V12",
        name: "9 unidades · 5 cm diámetro",
        price: 4200000,
        attributes: { photoSlots: 9, sizeCm: "5", aspectRatio: "1:1", shape: "circle" },
      },
      {
        sku: "FI-CIRC-6-V13",
        name: "12 unidades · 5 cm diámetro",
        price: 5400000,
        attributes: { photoSlots: 12, sizeCm: "5", aspectRatio: "1:1", shape: "circle" },
      },
      // ── 6 cm ──
      {
        sku: "FI-CIRC-6-V21",
        name: "6 unidades · 6 cm diámetro",
        price: 3500000,
        attributes: { photoSlots: 6, sizeCm: "6", aspectRatio: "1:1", shape: "circle" },
      },
      {
        sku: "FI-CIRC-6-V22",
        name: "9 unidades · 6 cm diámetro",
        price: 4800000,
        attributes: { photoSlots: 9, sizeCm: "6", aspectRatio: "1:1", shape: "circle" },
      },
      {
        sku: "FI-CIRC-6-V23",
        name: "12 unidades · 6 cm diámetro",
        price: 6000000,
        attributes: { photoSlots: 12, sizeCm: "6", aspectRatio: "1:1", shape: "circle" },
      },
      // ── 8 cm ──
      {
        sku: "FI-CIRC-6-V31",
        name: "6 unidades · 8 cm diámetro",
        price: 4500000,
        attributes: { photoSlots: 6, sizeCm: "8", aspectRatio: "1:1", shape: "circle" },
      },
      {
        sku: "FI-CIRC-6-V32",
        name: "9 unidades · 8 cm diámetro",
        price: 6300000,
        attributes: { photoSlots: 9, sizeCm: "8", aspectRatio: "1:1", shape: "circle" },
      },
      {
        sku: "FI-CIRC-6-V33",
        name: "12 unidades · 8 cm diámetro",
        price: 8000000,
        attributes: { photoSlots: 12, sizeCm: "8", aspectRatio: "1:1", shape: "circle" },
      },
    ],
  },
  {
    slug: "set-fotoimanes-corazon",
    sku: "FI-COR-6",
    name: "Fotoimanes Corazón",
    description:
      "Fotoimanes en forma de corazón con tus fotos. Súper kawaii para regalo de aniversario o día especial. Elige cantidad y tamaño.",
    basePrice: 3500000,
    categorySlug: "foto-imanes",
    isPersonalizable: true,
    isFeatured: true,
    personalizationKind: "PHOTO_PACK",
    personalizationSchema: { photoSlots: 6, shape: "heart", sizeCm: "6×6" },
    images: [UNSPLASH("1518621736915-f3b1c41bfd00")],
    // M.3.b.UX.v13 (Lucy 2026-05-15) — Variants modulares 2 dimensiones:
    // Cantidad (4/6/9) × Tamaño (5×5 / 6×6 / 8×8) = 9 combinaciones.
    // Pricing: precio_unitario × cantidad. Unitario por tamaño:
    //   5×5: $5.500  → packs $22k / $33k / $50k
    //   6×6: $6.500  → packs $26k / $39k / $58k
    //   8×8: $8.500  → packs $34k / $51k / $76k
    variants: [
      // ── 5×5 cm ──
      {
        sku: "FI-COR-6-V11",
        name: "4 corazones · 5×5 cm",
        price: 2200000,
        attributes: { photoSlots: 4, sizeCm: "5×5", shape: "heart" },
      },
      {
        sku: "FI-COR-6-V12",
        name: "6 corazones · 5×5 cm",
        price: 3300000,
        attributes: { photoSlots: 6, sizeCm: "5×5", shape: "heart" },
      },
      {
        sku: "FI-COR-6-V13",
        name: "9 corazones · 5×5 cm",
        price: 5000000,
        attributes: { photoSlots: 9, sizeCm: "5×5", shape: "heart" },
      },
      // ── 6×6 cm ──
      {
        sku: "FI-COR-6-V21",
        name: "4 corazones · 6×6 cm",
        price: 2600000,
        attributes: { photoSlots: 4, sizeCm: "6×6", shape: "heart" },
      },
      {
        sku: "FI-COR-6-V22",
        name: "6 corazones · 6×6 cm",
        price: 3900000,
        attributes: { photoSlots: 6, sizeCm: "6×6", shape: "heart" },
      },
      {
        sku: "FI-COR-6-V23",
        name: "9 corazones · 6×6 cm",
        price: 5800000,
        attributes: { photoSlots: 9, sizeCm: "6×6", shape: "heart" },
      },
      // ── 8×8 cm ──
      {
        sku: "FI-COR-6-V31",
        name: "4 corazones · 8×8 cm",
        price: 3400000,
        attributes: { photoSlots: 4, sizeCm: "8×8", shape: "heart" },
      },
      {
        sku: "FI-COR-6-V32",
        name: "6 corazones · 8×8 cm",
        price: 5100000,
        attributes: { photoSlots: 6, sizeCm: "8×8", shape: "heart" },
      },
      {
        sku: "FI-COR-6-V33",
        name: "9 corazones · 8×8 cm",
        price: 7600000,
        attributes: { photoSlots: 9, sizeCm: "8×8", shape: "heart" },
      },
    ],
  },
  {
    slug: "set-glass-magnets-personalizados",
    sku: "FI-GLASS-6",
    name: "Glass Magnets",
    description:
      "Imanes con frente de vidrio premium 3 cm. Lupa natural que magnifica tu foto. El detalle gourmet del catálogo.",
    basePrice: 2500000,
    categorySlug: "foto-imanes",
    isPersonalizable: true,
    personalizationKind: "PHOTO_PACK",
    personalizationSchema: { photoSlots: 6, shape: "circle", finish: "glass", sizeCm: "3" },
    images: [UNSPLASH("1604782206219-3b9576575203")],
    variants: [
      {
        sku: "FI-GLASS-6-V1",
        name: "Set 6 unidades · 3 cm",
        price: 2500000,
        attributes: { photoSlots: 6, sizeCm: "3", shape: "circle", finish: "glass" },
      },
      {
        sku: "FI-GLASS-6-V2",
        name: "Set 12 unidades · 3 cm",
        price: 4600000,
        attributes: { photoSlots: 12, sizeCm: "3", shape: "circle", finish: "glass" },
      },
    ],
  },

  // ────────────────────── recuerdos (6) ──────────────────────
  // Naming: "Recuerdos de [Evento]" sin sufijo de cantidad — la cantidad
  // es variant. Slug histórico se conserva para SEO (proxy.ts redirige).
  {
    slug: "recuerdos-cumpleanos-x20",
    sku: "EVT-CUMP-20",
    name: "Recuerdos de Cumpleaños",
    description:
      "Imanes personalizados para cumpleaños. Nombre, edad y motivo de la fiesta. Empaque individual incluido. Elige la cantidad según invitados.",
    basePrice: 11500000,
    categorySlug: "recuerdos",
    isPersonalizable: true,
    personalizationKind: "EVENT_FAVOR",
    personalizationSchema: { quantity: 20, eventFields: ["name", "age", "date"], allowPhoto: true },
    images: [UNSPLASH("1530103862676-de8c9debad1d")],
    variants: [
      {
        sku: "EVT-CUMP-20-V1",
        name: "x12 invitados",
        price: 7200000,
        attributes: { quantity: 12 },
      },
      {
        sku: "EVT-CUMP-20-V2",
        name: "x20 invitados",
        price: 11500000,
        attributes: { quantity: 20 },
      },
      {
        sku: "EVT-CUMP-20-V3",
        name: "x30 invitados",
        price: 16500000,
        attributes: { quantity: 30 },
      },
    ],
  },
  {
    slug: "recuerdos-bautizo-x12",
    sku: "EVT-BAUT-12",
    name: "Recuerdos de Bautizo",
    description:
      "Imanes personalizados para bautizo. Diseño tierno con nombre del bebé, fecha y motivo religioso. Empaque incluido.",
    basePrice: 9000000,
    categorySlug: "recuerdos",
    isPersonalizable: true,
    personalizationKind: "EVENT_FAVOR",
    personalizationSchema: {
      quantity: 12,
      eventFields: ["babyName", "date", "venue"],
      allowPhoto: true,
    },
    images: [UNSPLASH("1525258946800-98cfd641d0de")],
    variants: [
      {
        sku: "EVT-BAUT-12-V1",
        name: "x12 invitados",
        price: 9000000,
        attributes: { quantity: 12 },
      },
      {
        sku: "EVT-BAUT-12-V2",
        name: "x20 invitados",
        price: 14500000,
        attributes: { quantity: 20 },
      },
    ],
  },
  {
    slug: "recuerdos-graduacion-x20",
    sku: "EVT-GRAD-20",
    name: "Recuerdos de Graduación",
    description:
      "Imanes personalizados con birrete, diploma y fecha. El recordatorio perfecto para los invitados de graduación.",
    basePrice: 9000000,
    categorySlug: "recuerdos",
    isPersonalizable: true,
    personalizationKind: "EVENT_FAVOR",
    personalizationSchema: {
      quantity: 20,
      eventFields: ["graduateName", "degree", "date"],
      allowPhoto: true,
    },
    images: [UNSPLASH("1523580494863-6f3031224c94")],
    variants: [
      {
        sku: "EVT-GRAD-20-V1",
        name: "x12 invitados",
        price: 5800000,
        attributes: { quantity: 12 },
      },
      {
        sku: "EVT-GRAD-20-V2",
        name: "x20 invitados",
        price: 9000000,
        attributes: { quantity: 20 },
      },
      {
        sku: "EVT-GRAD-20-V3",
        name: "x30 invitados",
        price: 13000000,
        attributes: { quantity: 30 },
      },
    ],
  },
  {
    slug: "recuerdos-matrimonio",
    sku: "EVT-MAT-VAR",
    name: "Recuerdos de Matrimonio",
    description:
      "Imanes para invitados de matrimonio. Diseño elegante con sus nombres, fecha y motivo floral. Mínimo 30 unidades.",
    basePrice: 9000000,
    categorySlug: "recuerdos",
    isPersonalizable: true,
    isFeatured: true,
    personalizationKind: "EVENT_FAVOR",
    personalizationSchema: {
      eventFields: ["coupleNames", "date", "venue"],
      allowPhoto: true,
      minQuantity: 30,
    },
    images: [UNSPLASH("1519741497674-611481863552")],
    variants: [
      {
        sku: "EVT-MAT-VAR-V1",
        name: "x30 invitados",
        price: 9000000,
        attributes: { quantity: 30 },
      },
      {
        sku: "EVT-MAT-VAR-V2",
        name: "x50 invitados",
        price: 14000000,
        attributes: { quantity: 50 },
      },
      {
        sku: "EVT-MAT-VAR-V3",
        name: "x80 invitados",
        price: 21500000,
        attributes: { quantity: 80 },
      },
    ],
  },
  {
    slug: "mi-primer-anito",
    sku: "EVT-ANITO",
    name: "Recuerdos Mi Primer Año",
    description:
      "Recuerdos personalizados para el primer cumpleaños. Diseño dulce con la foto del bebé, nombre y fecha.",
    basePrice: 4500000,
    categorySlug: "recuerdos",
    isPersonalizable: true,
    personalizationKind: "EVENT_FAVOR",
    personalizationSchema: {
      quantity: 20,
      eventFields: ["babyName", "birthDate"],
      allowPhoto: true,
    },
    images: [UNSPLASH("1525258946800-98cfd641d0de")],
    variants: [
      { sku: "EVT-ANITO-V1", name: "x12 invitados", price: 3000000, attributes: { quantity: 12 } },
      { sku: "EVT-ANITO-V2", name: "x20 invitados", price: 4500000, attributes: { quantity: 20 } },
    ],
  },
  {
    slug: "recuerdos-quinceanera",
    sku: "EVT-QUINCE-20",
    name: "Recuerdos de Quinceañera",
    description:
      "Imanes personalizados con la foto de los XV. Marco floral, fecha y nombre. Recordatorio único para el día especial.",
    basePrice: 11500000,
    categorySlug: "recuerdos",
    isPersonalizable: true,
    personalizationKind: "EVENT_FAVOR",
    personalizationSchema: {
      quantity: 20,
      eventFields: ["quinceaneraName", "date"],
      allowPhoto: true,
    },
    images: [UNSPLASH("1525258946800-98cfd641d0de")],
    variants: [
      {
        sku: "EVT-QUINCE-20-V1",
        name: "x12 invitados",
        price: 7200000,
        attributes: { quantity: 12 },
      },
      {
        sku: "EVT-QUINCE-20-V2",
        name: "x20 invitados",
        price: 11500000,
        attributes: { quantity: 20 },
      },
    ],
  },

  // ────────────────────── calendarios (4) ──────────────────────
  {
    slug: "calendario-mes-a-mes-fotos",
    sku: "CAL-FOT-12",
    name: "Calendario Foto-Mes",
    description:
      "Calendario magnético anual con una foto distinta por mes. 12 imanes intercambiables A4. Subís las 12 fotos en el Estudio.",
    basePrice: 4500000,
    compareAtPrice: 5500000,
    categorySlug: "calendarios",
    isPersonalizable: true,
    isFeatured: true,
    personalizationKind: "CALENDAR_PHOTO_MONTH",
    personalizationSchema: { photoSlots: 12, year: 2026, monthLabels: true },
    images: [UNSPLASH("1577563908411-5077b6dc7624")],
  },
  {
    slug: "calendario-foto-hero-planner",
    sku: "CAL-HERO",
    name: "Calendario Foto + Planner",
    description:
      "Calendario A3 magnético con una foto grande arriba + planner mensual borrable abajo. Lo mejor de los dos mundos.",
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
    name: "Calendario Floral",
    description:
      "Calendario A4 magnético con ilustración floral original por mes. Sin personalización, precioso para regalo.",
    basePrice: 4800000,
    categorySlug: "calendarios",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1577563908411-5077b6dc7624")],
  },
  {
    slug: "mini-calendarios-x10",
    sku: "CAL-MINI-10",
    name: "Mini Calendarios para Regalar",
    description:
      "Mini calendarios magnéticos 5×7 cm. Perfectos como detalle para clientes o invitados. Diseño kawaii Lucams. Elige la cantidad.",
    basePrice: 700000,
    categorySlug: "calendarios",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1577563908411-5077b6dc7624")],
    variants: [
      { sku: "CAL-MINI-10-V1", name: "x10 unidades", price: 700000, attributes: { quantity: 10 } },
      { sku: "CAL-MINI-10-V2", name: "x20 unidades", price: 1300000, attributes: { quantity: 20 } },
    ],
  },

  // ────────────────────── publicitarios (5) ──────────────────────
  // Naming singular ("Imán Publicitario X") — el plural era inconsistente
  // con "Imán Tarjeta de Presentación".
  {
    slug: "imanes-publicitarios-rectos-7x5",
    sku: "B2B-REC-7x5",
    name: "Imán Publicitario Rectangular",
    description:
      "Imanes publicitarios rectangulares con tu logo + datos de contacto. Mínimo 50 unidades. Elige el tamaño.",
    basePrice: 180000,
    categorySlug: "publicitarios",
    isPersonalizable: true,
    personalizationKind: "BUSINESS_LOGO",
    personalizationSchema: {
      shape: "rectangle",
      sizeCm: "7×5",
      minQuantity: 50,
      fields: ["logo", "phone", "email", "website"],
    },
    images: [UNSPLASH("1577563908411-5077b6dc7624")],
    variants: [
      {
        sku: "B2B-REC-7x5-V1",
        name: "5×3 cm",
        price: 140000,
        attributes: { sizeCm: "5×3", shape: "rectangle" },
      },
      {
        sku: "B2B-REC-7x5-V2",
        name: "7×5 cm",
        price: 180000,
        attributes: { sizeCm: "7×5", shape: "rectangle" },
      },
      {
        sku: "B2B-REC-7x5-V3",
        name: "9×6 cm",
        price: 230000,
        attributes: { sizeCm: "9×6", shape: "rectangle" },
      },
    ],
  },
  {
    slug: "imanes-publicitarios-circulares-6cm",
    sku: "B2B-CIRC-6",
    name: "Imán Publicitario Circular",
    description:
      "Imanes publicitarios circulares con tu marca y frase corta. Mínimo 50 unidades. Elige el diámetro.",
    basePrice: 200000,
    categorySlug: "publicitarios",
    isPersonalizable: true,
    personalizationKind: "BUSINESS_LOGO",
    personalizationSchema: {
      shape: "circle",
      sizeCm: "6",
      minQuantity: 50,
      fields: ["logo", "tagline"],
    },
    images: [UNSPLASH("1577563908411-5077b6dc7624")],
    variants: [
      {
        sku: "B2B-CIRC-6-V1",
        name: "5 cm de diámetro",
        price: 170000,
        attributes: { sizeCm: "5", shape: "circle" },
      },
      {
        sku: "B2B-CIRC-6-V2",
        name: "6 cm de diámetro",
        price: 200000,
        attributes: { sizeCm: "6", shape: "circle" },
      },
      {
        sku: "B2B-CIRC-6-V3",
        name: "8 cm de diámetro",
        price: 260000,
        attributes: { sizeCm: "8", shape: "circle" },
      },
    ],
  },
  {
    slug: "imanes-publicitarios-troquelados",
    sku: "B2B-TROQ",
    name: "Imán Publicitario Troquelado",
    description:
      "Imanes con forma personalizada (silueta del logo, motivo de marca, etc.). Mínimo 50 unidades. Cotización custom.",
    basePrice: 250000,
    categorySlug: "publicitarios",
    isPersonalizable: true,
    personalizationKind: "BUSINESS_LOGO",
    personalizationSchema: { shape: "custom", minQuantity: 50, requiresVectorFile: true },
    images: [UNSPLASH("1577563908411-5077b6dc7624")],
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
    personalizationSchema: {
      shape: "rectangle",
      sizeCm: "9×5",
      minQuantity: 100,
      fields: ["name", "title", "phone", "email", "company"],
    },
    images: [UNSPLASH("1577563908411-5077b6dc7624")],
  },
  {
    slug: "pack-empresarial-mixto-100",
    sku: "B2B-MIX-100",
    name: "Pack Empresarial Mixto",
    description:
      "Imanes mixtos (rectos + circulares) con tu marca. Ideal para ferias, eventos o repartir en tienda física. Elige el volumen.",
    basePrice: 380000,
    categorySlug: "publicitarios",
    isPersonalizable: true,
    personalizationKind: "BUSINESS_LOGO",
    personalizationSchema: {
      quantity: 100,
      mix: ["rect-7x5", "circle-6"],
      fields: ["logo", "phone", "social"],
    },
    images: [UNSPLASH("1577563908411-5077b6dc7624")],
    variants: [
      {
        sku: "B2B-MIX-100-V1",
        name: "x50 unidades mixtas",
        price: 200000,
        attributes: { quantity: 50 },
      },
      {
        sku: "B2B-MIX-100-V2",
        name: "x100 unidades mixtas",
        price: 380000,
        attributes: { quantity: 100 },
      },
      {
        sku: "B2B-MIX-100-V3",
        name: "x200 unidades mixtas",
        price: 700000,
        attributes: { quantity: 200 },
      },
    ],
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
    name: "Planner Diario Magnético",
    description:
      "Planner diario 15×20 cm para puerta de nevera. Lista de tareas con casillas magnéticas borrables. Marcador incluido.",
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
    name: "Notas Magnéticas",
    description:
      "Notas magnéticas (10×15 cm) borrables. Diseños kawaii Lucams: lista, recordatorios, mood, mini-meta. Marcador incluido. Elige cuántas quieres.",
    basePrice: 3000000,
    categorySlug: "organizate",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1517842645767-c639042777db")],
    variants: [
      { sku: "ORG-NOT-4-V1", name: "Set 4 notas", price: 3000000, attributes: { quantity: 4 } },
      { sku: "ORG-NOT-4-V2", name: "Set 8 notas", price: 5500000, attributes: { quantity: 8 } },
      { sku: "ORG-NOT-4-V3", name: "Set 12 notas", price: 7800000, attributes: { quantity: 12 } },
    ],
  },
  {
    slug: "pack-separadores-libros",
    sku: "ORG-SEP-6",
    name: "Separadores Magnéticos",
    description:
      "Separadores magnéticos para libros. Diseños mapache + frases kawaii. No se caen, no rompen páginas. Elige la cantidad.",
    basePrice: 1800000,
    categorySlug: "organizate",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1544716278-ca5e3f4abd8c")],
    variants: [
      {
        sku: "ORG-SEP-6-V1",
        name: "Set 4 separadores",
        price: 1300000,
        attributes: { quantity: 4 },
      },
      {
        sku: "ORG-SEP-6-V2",
        name: "Set 6 separadores",
        price: 1800000,
        attributes: { quantity: 6 },
      },
      {
        sku: "ORG-SEP-6-V3",
        name: "Set 10 separadores",
        price: 2800000,
        attributes: { quantity: 10 },
      },
    ],
  },

  // ────────────────────── regalos-personalizados (3) ──────────────────────
  // Cajas Regalo año-redondo. Día Madre/Padre + Navidad están en "de-temporada".
  {
    slug: "box-para-pareja",
    sku: "REG-PAR",
    name: "Box Para Pareja",
    description:
      "Caja con set de imanes corazón + nota + frase personalizada. Aniversario o sólo porque sí.",
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
    personalizationSchema: {
      quantity: 12,
      eventFields: ["babyName", "birthDate", "weight"],
      allowPhoto: true,
    },
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

  // ────────────────────── de-temporada (3) ──────────────────────
  // Ediciones estacionales por fechas del año. Stock por campaña.
  {
    slug: "big-box-dia-mama",
    sku: "REG-BB-MAMA",
    name: "Box Día de la Madre",
    description:
      "Caja temática para Día de la Madre con set de fotoimanes + planner + nota personalizada + empaque premium. Elige Big o Mini según presupuesto.",
    basePrice: 6800000,
    categorySlug: "de-temporada",
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
    // Variants V1 (Big) + V2 (Mini) creados por consolidate-product-families
    variants: [
      {
        sku: "REG-BB-MAMA-V1",
        name: "Big · 6 fotos + planner",
        price: 6800000,
        attributes: { photoSlots: 6, sizeCm: "5×5" },
      },
      {
        sku: "REG-BB-MAMA-V2",
        name: "Mini · 4 fotos + nota",
        price: 4500000,
        attributes: { photoSlots: 4, sizeCm: "5×5" },
      },
    ],
  },
  {
    slug: "box-dia-papa",
    sku: "SEA-BB-PAPA",
    name: "Box Día del Padre",
    description:
      "Caja temática para Día del Padre con set de fotoimanes + planner + tarjeta personalizada. Elige Big o Mini según presupuesto.",
    basePrice: 6800000,
    categorySlug: "de-temporada",
    isPersonalizable: true,
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
    images: [UNSPLASH("1517457373958-b7bdd4587205")],
    variants: [
      {
        sku: "SEA-BB-PAPA-V1",
        name: "Big · 6 fotos + planner",
        price: 6800000,
        attributes: { photoSlots: 6, sizeCm: "5×5" },
      },
      {
        sku: "SEA-BB-PAPA-V2",
        name: "Mini · 4 fotos + nota",
        price: 4500000,
        attributes: { photoSlots: 4, sizeCm: "5×5" },
      },
    ],
  },
  {
    slug: "edicion-navidad-kawaii",
    sku: "SEA-NAV-8",
    name: "Edición Navidad Kawaii",
    description:
      "Set de 8 imanes con ilustraciones navideñas kawaii (mapache navideño, regalitos, copo de nieve, galletita, árbol, calcetín, muñeco de nieve, estrella). Diseño propio Lucams. Disponible noviembre–enero.",
    basePrice: 4200000,
    categorySlug: "de-temporada",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1542838132-92c53300491e")],
  },

  // ────────────────────── cuadros-decoracion (4) ──────────────────────
  {
    slug: "cuadro-15x15-con-foto",
    sku: "DEC-CUAD-15",
    name: "Cuadro con Foto",
    description:
      "Cuadro magnético con tu foto. Marco fino brand-purple. Composición libre en canvas. Elige el tamaño.",
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
    variants: [
      {
        sku: "DEC-CUAD-15-V1",
        name: "15×15 cm",
        price: 2700000,
        attributes: { sizeCm: "15×15", shape: "rectangle" },
      },
      {
        sku: "DEC-CUAD-15-V2",
        name: "20×20 cm",
        price: 3900000,
        attributes: { sizeCm: "20×20", shape: "rectangle" },
      },
      {
        sku: "DEC-CUAD-15-V3",
        name: "30×30 cm",
        price: 5800000,
        attributes: { sizeCm: "30×30", shape: "rectangle" },
      },
    ],
  },
  {
    slug: "cuadro-3-fotos",
    sku: "DEC-CUAD-3F",
    name: "Cuadro Triple Foto",
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
    name: "Cuadro con Frase",
    description:
      "Cuadro magnético con tu frase favorita. Tipografías kawaii, colores brand. Sin fotos, solo texto. Elige el tamaño.",
    basePrice: 3200000,
    categorySlug: "cuadros-decoracion",
    isPersonalizable: true,
    personalizationKind: "TEXT_ONLY",
    personalizationSchema: {
      sizeCm: "20×20",
      maxChars: 80,
      fontOptions: ["fredoka", "baloo", "inter"],
    },
    images: [UNSPLASH("1513519245088-0e12902e5a38")],
    variants: [
      { sku: "DEC-FRASE-20-V1", name: "15×15 cm", price: 2400000, attributes: { sizeCm: "15×15" } },
      { sku: "DEC-FRASE-20-V2", name: "20×20 cm", price: 3200000, attributes: { sizeCm: "20×20" } },
      { sku: "DEC-FRASE-20-V3", name: "30×30 cm", price: 4800000, attributes: { sizeCm: "30×30" } },
    ],
  },
  {
    slug: "marcos-magneticos-cuadrados",
    sku: "DEC-MARC-2",
    name: "Marcos Magnéticos",
    description:
      "Marcos magnéticos cuadrados 8×8 cm. Cambiás la foto cuando quieras (foto física, no impresa). Elige la cantidad.",
    basePrice: 1400000,
    categorySlug: "cuadros-decoracion",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1493663284031-b7e3aefcae8e")],
    variants: [
      { sku: "DEC-MARC-2-V1", name: "Set 2 marcos", price: 1400000, attributes: { quantity: 2 } },
      { sku: "DEC-MARC-2-V2", name: "Set 4 marcos", price: 2600000, attributes: { quantity: 4 } },
      { sku: "DEC-MARC-2-V3", name: "Set 6 marcos", price: 3600000, attributes: { quantity: 6 } },
    ],
  },

  // ────────────────────── coleccionables (6) ──────────────────────
  // Diseños propios — sin "Pack" en el nombre (el set viene implícito).
  {
    slug: "pack-imanes-ciudades-colombia",
    sku: "COL-CIUD-CO",
    name: "Ciudades de Colombia",
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
    name: "Comida Colombiana",
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
    name: "Frases Motivacionales",
    description:
      "6 imanes con frases kawaii ('Tú puedes', 'Hoy es tu día', 'Respira', 'Brilla', 'Eres suficiente', 'Sigue'). Diseño propio.",
    basePrice: 2800000,
    categorySlug: "coleccionables",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1530989054533-9c3e6daa5b9e")],
  },
  {
    slug: "pack-animalitos-kawaii",
    sku: "COL-ANIM",
    name: "Animalitos Kawaii",
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
    name: "Viajes Latam",
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
    name: "Mood y Emociones",
    description:
      "10 imanes con caritas kawaii expresando emociones (feliz, triste, enojado, cansado, motivado, etc.). Para marcar cómo estás cada día.",
    basePrice: 3200000,
    categorySlug: "coleccionables",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1503454537195-1dcabb73ffb9")],
  },

  // ────────────────────── juegos-aprendizaje (4) ──────────────────────
  // KID-RUT-9 archivado por consolidate-product-families (variant V2 de KID-RUT-7).
  {
    slug: "abecedario-magnetico",
    sku: "KID-ABC",
    name: "Abecedario Magnético",
    description:
      "37 fichas magnéticas con las letras del alfabeto (incluye Ñ). Diseño colorido kawaii. Aprenden jugando sobre la nevera.",
    basePrice: 5800000,
    categorySlug: "juegos-aprendizaje",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1471107340929-a87cd0f5b5f3")],
  },
  {
    slug: "set-fichas-numeros",
    sku: "KID-NUM",
    name: "Números Magnéticos",
    description:
      "Fichas con números 0-9 + signos matemáticos (+, −, ×, ÷, =). Para sumar, restar y aprender jugando.",
    basePrice: 7200000,
    categorySlug: "juegos-aprendizaje",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1503676260728-1c00da094a0b")],
  },
  {
    slug: "rutina-infantil-7-actividades",
    sku: "KID-RUT-7",
    name: "Rutina Infantil Magnética",
    description:
      "Fichas magnéticas con actividades del día (cepillarse, comer, jugar, leer...). Para que los peques sigan su rutina con autonomía. Elige cuántas actividades.",
    basePrice: 2700000,
    categorySlug: "juegos-aprendizaje",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1503454537195-1dcabb73ffb9")],
    // Variants V1 (estándar 7) + V2 (XL 9) creados por consolidate-product-families.
    variants: [
      {
        sku: "KID-RUT-7-V1",
        name: "Estándar · 7 actividades",
        price: 2700000,
        attributes: { quantity: 7 },
      },
      {
        sku: "KID-RUT-7-V2",
        name: "XL · 9 actividades",
        price: 3600000,
        attributes: { quantity: 9 },
      },
    ],
  },
  {
    slug: "planner-emociones-kids",
    sku: "KID-EMO",
    name: "Planner de Emociones",
    description:
      "Planner magnético para que los peques aprendan a identificar y expresar sus emociones. 8 caritas magnéticas + espacios diarios.",
    basePrice: 2700000,
    categorySlug: "juegos-aprendizaje",
    isPersonalizable: false,
    personalizationKind: "NONE",
    images: [UNSPLASH("1503454537195-1dcabb73ffb9")],
  },
];


// ─────────────────────────────────────────────────────────────────────────────
//  EJECUCIÓN — dry-run imprime el plan; --apply aplica en transacción única
// ─────────────────────────────────────────────────────────────────────────────

const stats = {
  categories: { create: 0, update: 0, noop: 0 },
  products: { create: 0, update: 0, noop: 0 },
  variants: { create: 0, update: 0, noop: 0 },
  pruned: { products: 0, categories: 0, variants: 0 },
};

const targetSkus = new Set(productsData.map((p) => p.sku));
const targetCatSlugs = new Set(categoriesData.map((c) => c.slug));

/** Whitelist de campos con valores definidos (undefined no se escribe ni se compara). */
const pickDefined = (obj, fields) =>
  Object.fromEntries(fields.filter((f) => obj[f] !== undefined).map((f) => [f, obj[f]]));

async function run(db, write) {
  // ─────────── 1. Categorías ───────────
  console.log("Categorías:");
  const categoryIds = {};
  for (const c of categoriesData) {
    const existing = await db.category.findUnique({ where: { slug: c.slug } });
    if (!existing) {
      stats.categories.create++;
      console.log(`  + ${c.name} (nueva)`);
      if (write) {
        const created = await db.category.create({ data: { ...c } });
        categoryIds[c.slug] = created.id;
      }
      continue;
    }
    categoryIds[c.slug] = existing.id;
    const changed = changedFields(existing, c, CATEGORY_UPDATE_FIELDS);
    if (changed.length === 0) {
      stats.categories.noop++;
    } else {
      stats.categories.update++;
      console.log(`  ~ ${c.name} (alinea: ${changed.join(", ")})`);
      if (write) {
        await db.category.update({
          where: { id: existing.id },
          data: pickDefined(c, CATEGORY_UPDATE_FIELDS),
        });
      }
    }
  }

  // ─────────── 2. Productos + variantes ───────────
  console.log("\nProductos:");
  for (const p of productsData) {
    const categoryId = categoryIds[p.categorySlug];
    if (!categoryId && write) {
      console.error(`  ✗ Categoría no encontrada: ${p.categorySlug} — ${p.slug} omitido`);
      continue;
    }
    // `variants` no es columna del modelo Product — se procesa aparte abajo.
    const { categorySlug, variants: declaredVariants, ...rest } = p;
    // Upsert por SKU (clave estable del catálogo): si Lucy cambia el slug pero
    // mantiene el SKU, se alinea; SKU nuevo → producto nuevo.
    const existing = await db.product.findUnique({ where: { sku: p.sku } });
    let productId = null;
    if (!existing) {
      stats.products.create++;
      console.log(`  + ${p.name}  [${p.personalizationKind}]  (${p.sku}, nuevo)`);
      if (write) {
        const created = await db.product.create({
          data: { ...rest, categoryId, isActive: true },
        });
        productId = created.id;
      }
    } else {
      productId = existing.id;
      const declared = pickDefined(rest, PRODUCT_UPDATE_FIELDS);
      const changed = changedFields(existing, declared, Object.keys(declared));
      const catChanged = categoryId && existing.categoryId !== categoryId;
      if (changed.length === 0 && !catChanged) {
        stats.products.noop++;
      } else {
        stats.products.update++;
        console.log(
          `  ~ ${p.name}  (${p.sku}; alinea: ${[...changed, ...(catChanged ? ["categoryId"] : [])].join(", ")})`,
        );
        if (write) {
          await db.product.update({
            where: { id: existing.id },
            data: { ...declared, ...(catChanged ? { categoryId } : {}) },
          });
        }
      }
    }

    // ── Variantes ──
    if (Array.isArray(declaredVariants) && declaredVariants.length > 0) {
      const declaredSkus = new Set(declaredVariants.map((v) => v.sku));
      for (const v of declaredVariants) {
        const existingV = await db.productVariant.findUnique({ where: { sku: v.sku } });
        if (!existingV) {
          stats.variants.create++;
          if (write && productId) {
            await db.productVariant.create({
              data: {
                productId,
                name: v.name,
                sku: v.sku,
                price: v.price ?? null,
                stock: p.isPersonalizable ? MADE_TO_ORDER_STOCK : 0,
                attributes: v.attributes ?? {},
              },
            });
          }
        } else {
          const declaredV = pickDefined(v, VARIANT_UPDATE_FIELDS);
          const changedV = changedFields(existingV, declaredV, Object.keys(declaredV));
          const ownerChanged = productId && existingV.productId !== productId;
          if (changedV.length === 0 && !ownerChanged) {
            stats.variants.noop++;
          } else {
            stats.variants.update++;
            if (write) {
              await db.productVariant.update({
                where: { id: existingV.id },
                data: { ...declaredV, ...(ownerChanged ? { productId } : {}) },
              });
            }
          }
        }
        // H11 — sube a made-to-order las variantes de personalizables que quedaron
        // en stock 0 (nunca BAJA un stock deliberado > 0). Solo en --apply.
        if (write && p.isPersonalizable) {
          await db.productVariant.updateMany({
            where: { sku: v.sku, stock: 0 },
            data: { stock: MADE_TO_ORDER_STOCK },
          });
        }
      }
      // Variantes huérfanas (ya no declaradas) → solo se archivan con --prune.
      if (productId) {
        const orphans = await db.productVariant.findMany({
          where: { productId, sku: { notIn: Array.from(declaredSkus) }, deletedAt: null },
          select: { id: true, sku: true, name: true },
        });
        for (const o of orphans) {
          stats.pruned.variants++;
          console.log(
            `    ⊘ variante huérfana ${o.sku} (${o.name}) → ${PRUNE ? "archivar" : "(--prune para archivar)"}`,
          );
          if (write && PRUNE) {
            await db.productVariant.update({
              where: { id: o.id },
              data: { deletedAt: new Date(), name: `${o.name} (legacy)` },
            });
          }
        }
      }
    } else {
      // Legacy: variante "Default" única (CartItem/OrderItem requieren variantId).
      // Si quedó archivada NO se resucita: el admin la reactiva si la quiere.
      const variantSku = `${p.sku}-DEFAULT`;
      const existingV = await db.productVariant.findUnique({ where: { sku: variantSku } });
      if (!existingV) {
        stats.variants.create++;
        if (write && productId) {
          await db.productVariant.create({
            data: {
              productId,
              name: "Default",
              sku: variantSku,
              price: null,
              stock: p.isPersonalizable ? MADE_TO_ORDER_STOCK : 0,
              attributes: {},
            },
          });
        }
      } else {
        stats.variants.noop++;
      }
      if (write && p.isPersonalizable) {
        await db.productVariant.updateMany({
          where: { sku: variantSku, stock: 0 },
          data: { stock: MADE_TO_ORDER_STOCK },
        });
      }
    }
  }

  // ─────────── 3. Barrido de NO declarados (opt-in --prune) ───────────
  // Renombra slug/sku con suffix "--legacy-XXX" y soft-deleta: libera las
  // unique constraints sin destruir data (recuperable a mano desde la DB).
  console.log("\nNo declarados en el seed:");
  const legacyProducts = await db.product.findMany({
    where: { deletedAt: null, sku: { notIn: Array.from(targetSkus) } },
    select: { id: true, slug: true, sku: true, name: true },
  });
  if (legacyProducts.length === 0) console.log("  (ningún producto fuera del seed)");
  for (const lp of legacyProducts) {
    stats.pruned.products++;
    console.log(`  ⊘ ${lp.name} (${lp.sku}) → ${PRUNE ? "archivar" : "(--prune para archivar)"}`);
    if (write && PRUNE) {
      const suffix = `--legacy-${lp.id.slice(-6)}`;
      await db.product.update({
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
    }
  }
  const legacyCats = await db.category.findMany({
    where: { deletedAt: null, slug: { notIn: Array.from(targetCatSlugs) } },
    select: {
      id: true,
      slug: true,
      name: true,
      _count: { select: { products: { where: { deletedAt: null } } } },
    },
  });
  if (legacyCats.length === 0) console.log("  (ninguna categoría fuera del seed)");
  for (const lc of legacyCats) {
    if (lc._count.products > 0) {
      console.log(`  ⚠ ${lc.name} tiene ${lc._count.products} productos vivos — NO se archiva`);
      continue;
    }
    stats.pruned.categories++;
    console.log(`  ⊘ ${lc.name} (/${lc.slug}) → ${PRUNE ? "archivar" : "(--prune para archivar)"}`);
    if (write && PRUNE) {
      const suffix = `--legacy-${lc.id.slice(-6)}`;
      await db.category.update({
        where: { id: lc.id },
        data: {
          slug: lc.slug.endsWith(suffix) ? lc.slug : `${lc.slug}${suffix}`,
          isActive: false,
          deletedAt: new Date(),
        },
      });
    }
  }
}

export async function main() {
  console.log(
    `=== seed-catalog-canonical (${APPLY ? "APPLY" : "DRY-RUN"}${PRUNE ? " + prune" : ""}) ===\n`,
  );
  const before = {
    categories: await prisma.category.count({ where: { deletedAt: null } }),
    products: await prisma.product.count({ where: { deletedAt: null } }),
    variants: await prisma.productVariant.count({ where: { deletedAt: null } }),
  };
  console.log(
    `Antes: ${before.categories} categorías · ${before.products} productos · ${before.variants} variantes (vivos)\n`,
  );

  if (APPLY && PRUNE) {
    // El barrido archiva lo que Lucy pudo haber creado a mano — confirmación humana.
    await confirmTargetInteractive(
      "seed-catalog-canonical.mjs",
      "alinear el catálogo y ARCHIVAR productos/categorías/variantes no declarados (--prune)",
    );
  }

  if (APPLY) {
    await prisma.$transaction(async (tx) => run(tx, true), {
      timeout: 180000,
      maxWait: 15000,
    });
  } else {
    await run(prisma, false);
  }

  console.log("\n────────────────────────────────────────");
  const fmt = (s) => `+${s.create} nuevos · ~${s.update} alineados · =${s.noop} sin cambios`;
  console.log(`Categorías: ${fmt(stats.categories)}`);
  console.log(`Productos:  ${fmt(stats.products)}`);
  console.log(`Variantes:  ${fmt(stats.variants)}`);
  if (stats.pruned.products + stats.pruned.categories + stats.pruned.variants > 0) {
    console.log(
      `No declarados: ${stats.pruned.products} productos · ${stats.pruned.categories} categorías · ${stats.pruned.variants} variantes ${PRUNE ? "(archivados)" : "(intactos — --prune para archivar)"}`,
    );
  }

  if (APPLY) {
    const after = {
      categories: await prisma.category.count({ where: { deletedAt: null } }),
      products: await prisma.product.count({ where: { deletedAt: null } }),
      variants: await prisma.productVariant.count({ where: { deletedAt: null } }),
    };
    console.log(
      `\nDespués: ${after.categories} categorías · ${after.products} productos · ${after.variants} variantes (vivos)`,
    );
    console.log("✓ Catálogo canónico aplicado (transacción única).");
  } else {
    console.log(
      "\nDRY-RUN (sin cambios). Para ejecutar: node scripts/seed-catalog-canonical.mjs --apply",
    );
    console.log("(En --apply también se normaliza el stock made-to-order H11 de personalizables.)");
  }
}

// Auto-ejecución solo cuando se invoca directo (seed-products.mjs importa main()).
const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

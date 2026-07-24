/*
 * Script de seed para plantillas del Estudio de Personalización.
 *
 * Sub-bloque M.3.b.A2 (2026-05-13) — paradigma pacdora: cada plantilla
 * usa un archivo SVG profesional en `apps/web/public/templates/` como
 * capa visual encima del image-placeholder. El SVG tiene área transparente
 * central donde se ve la foto del cliente.
 *
 * Layer ordering (back → front):
 *   1. background       — color sólido del stage completo
 *   2. image-placeholder — foto cliente (DEBAJO, visible por el hueco transparente)
 *   3. asset            — SVG/PNG mockup con transparencia (define el "look")
 *   4. text             — caption/nombres/datos editables
 *
 * Los 10 slugs activos coinciden con M.3.b.A (mismas slugs, mejor look visual).
 * Las plantillas M.1.d (no presentes) se soft-deletean en cada corrida.
 *
 * Idempotente: upsert por slug. Re-correr no duplica.
 *
 * Uso: make seed-templates
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

console.log("=== seed-templates (M.3.b.A2 asset paradigm) ===");
console.log("");

const UNSPLASH = (id) => `https://images.unsplash.com/photo-${id}?w=600&q=80&fit=crop`;

// ──────────── Brand tokens ────────────

const BRAND = {
  purple: "#7C6AAD",
  purpleDark: "#3D2E5C",
  purpleLight: "#A8A0CE",
  turquoise: "#5DD9D1",
  pink: "#E85B9F",
  pinkLight: "#FFB8D9",
  coral: "#F58A6F",
  yellow: "#FFD93D",
  cream: "#FFF8F0",
  gold: "#D4AF37",
  goldLight: "#F5E6A8",
  greenSage: "#B5C9A8",
  blushDeep: "#C97B89",
};

// ──────────── Canvas helpers ────────────

function background(color, label = "background") {
  return { id: label, type: "background", color };
}

function photoSlot({ id, x, y, width, height, cornerRadius = 0, rotation = 0, label }) {
  return {
    id,
    type: "image-placeholder",
    x,
    y,
    width,
    height,
    cornerRadius,
    rotation,
    label: label ?? `Foto ${id.replace(/\D/g, "")}`,
  };
}

function text({
  id,
  x,
  y,
  text: t,
  fontFamily = "Fredoka",
  fontSize = 48,
  fill = BRAND.purpleDark,
  editable = false,
  fontWeight = "normal",
  align = "center",
}) {
  return {
    id,
    type: "text",
    x,
    y,
    text: t,
    fontFamily,
    fontSize,
    fill,
    fontWeight,
    align,
    editable,
  };
}

function stage(width = 1080, height = 1080) {
  return { width, height, dpiPreview: 90, dpiProduction: 300 };
}

/**
 * M.3.b.A2 — Asset layer: renderea un SVG/PNG de `public/templates/` como
 * capa visual. El SVG tiene transparencia central donde se ve la foto del
 * cliente que está en el image-placeholder DEBAJO.
 */
function asset({ id, src, x = 0, y = 0, width, height, rotation = 0, opacity = 1 }) {
  return {
    id,
    type: "asset",
    src,
    x,
    y,
    width,
    height,
    rotation,
    opacity,
  };
}

// ──────────── Plantillas activas (M.3.b.CAT.11, 2026-05-14; Ola 3, 2026-07-22) ────────────
//
// Estrategia aprobada con Lucy (sesión 2026-05-14):
//   - Borrar las 11 plantillas mediocres pre-existentes (todas excepto la que
//     usaba `ig_post.svg`).
//   - Mantener 1 plantilla premium: "Polaroid Instagram" basada en `ig_post.svg`,
//     asignada al producto Fotoimanes Polaroid (SKU FI-POL-12) como plantilla
//     premium del catálogo.
//   - Crear 8 plantillas globales "Personalización Libre" — una por
//     kind personalizable — diseño minimalista intencional (canvas limpio +
//     image-placeholder + texto editable opcional) para clientes que prefieren
//     simplicidad sobre decoración. Cliente sube foto y/o agrega texto.
//     No es plantilla "transitoria" sino una opción legítima del catálogo
//     (decisión Lucy 2026-05-15: "lo básico no quiere decir malo").
//
// Ola 3 (Lucy 2026-07-22):
//   - "Polaroid Clásica" (tarjeta con franja gruesa, color de borde elegible +
//     mensaje editable) — 2 plantillas para la Polaroid, ambas en stage 450×600
//     (3:4, formato físico 7.5×10; el selector del Estudio las ofrece juntas).
//   - 2 plantillas de CARA para Separadores de Libros (cuadrado/rectangular),
//     una por forma — el Estudio crea 2 slots por unidad (2 caras) y producción
//     compone la tira desplegada.
//
// Las plantillas premium nuevas se irán agregando una a una en sesiones
// futuras, siguiendo la matriz "Estrategia de plantilla por tipo" de ADR-037.

const FOTOIMANES_POLAROID_SKU = "FI-POL-12";

const polaroidProduct = await prisma.product.findUnique({
  where: { sku: FOTOIMANES_POLAROID_SKU },
  select: { id: true },
});
if (!polaroidProduct) {
  console.error(`✗ Producto base Fotoimanes Polaroid (SKU=${FOTOIMANES_POLAROID_SKU}) no existe.`);
  console.error("  Ejecuta primero: make seed-products");
  await prisma.$disconnect();
  process.exit(1);
}

// Ola 2A — Tiras Magnéticas (producto OCULTO, creado por ola2a-tiras-magneticas.mjs). Si el
// producto aún no existe (DB fresca), su plantilla se omite sin romper el seed (idempotente).
const tirasProduct = await prisma.product.findUnique({
  where: { slug: "tiras-magneticas-fotos" },
  select: { id: true },
});

// Ola 3 — Separadores de Libros (2 caras por unidad): las plantillas de CARA (una por forma)
// se asignan a este producto. Si aún no existe, se omiten sin romper el seed.
const separadoresProduct = await prisma.product.findUnique({
  where: { slug: "separadores-libros" },
  select: { id: true },
});

// Ola 4 (Lucy 2026-07-23) — depuración de plantillas: las "Personalización Libre" que SÍ
// se usan dejan de ser GLOBALES y pasan a ser plantillas propias de su producto (nombre
// real, no genérico). Las que no aportan quedan con archive:true (isActive=false).
const cuadradosProduct = await prisma.product.findUnique({
  where: { slug: "set-fotoimanes-cuadrados" },
  select: { id: true },
});
const calendarioProduct = await prisma.product.findUnique({
  where: { slug: "calendario-mes-a-mes-fotos" },
  select: { id: true },
});

// Helper para canvas blanco con foto + texto editable opcional.
// Stage aspect ratio elegido por kind para encajar con producto físico típico.
function blankCanvas({ stageW, stageH, photoLabel = "Tu foto", includeText = false }) {
  const layers = [
    background("#FFFFFF"),
    photoSlot({
      id: "p1",
      x: 40,
      y: 40,
      width: stageW - 80,
      height: includeText ? stageH - 140 : stageH - 80,
      cornerRadius: 8,
      label: photoLabel,
    }),
  ];
  if (includeText) {
    layers.push(
      text({
        id: "free_text",
        x: stageW / 2,
        y: stageH - 60,
        text: "Escribe tu mensaje",
        fontFamily: "Fredoka",
        fontSize: 36,
        fill: BRAND.purpleDark,
        fontWeight: "bold",
        editable: true,
      }),
    );
  }
  return { version: 1, stage: stage(stageW, stageH), layers };
}

const templatesData = [
  // ════════════════════ Polaroid Clásica (Ola 3, Lucy 2026-07-22) ════════════════════
  //
  // La polaroid de toda la vida: tarjeta con el borde GRUESO abajo. El COLOR del
  // borde lo escoge el cliente en el Estudio (blanco/negro/pasteles — paleta
  // frame-palette via canvasData.borderColor → capa "frame-card") y el mensaje de
  // la franja es texto EDITABLE ("Escribe tu mensaje"). Stage 450×600 = 3:4, el
  // formato físico 7.5×10 cm (igual que la Instagram → el filtro de aspect las
  // muestra a las dos y el selector del Estudio ofrece ambas). Orden 1: es el
  // look por defecto del producto Polaroid.
  {
    slug: "photo-pack-polaroid-clasica",
    productId: polaroidProduct.id, // solo aparece en Fotoimanes Polaroid
    kind: "PHOTO_PACK",
    name: "Polaroid Clásica",
    order: 1,
    previewUrl: "/templates/polaroid_clasica.svg",
    canvasData: {
      version: 1,
      stage: stage(450, 600),
      layers: [
        background("#FFFFFF"),
        // Tarjeta de color a todo el stage (el cliente elige el color en el Estudio;
        // blanco por defecto). Esquinas suaves de la tarjeta física.
        { id: "card", type: "frame-card", fill: "#FFFFFF", cornerRadius: 18 },
        // Foto cuadrada arriba; abajo queda la franja gruesa (~30% de la tarjeta)
        // para el mensaje — la silueta clásica de la polaroid.
        photoSlot({ id: "p1", x: 28, y: 28, width: 394, height: 394, label: "Tu foto" }),
        text({
          id: "message",
          x: 225,
          y: 512,
          text: "Escribe tu mensaje",
          fontFamily: "Fredoka",
          fontSize: 34,
          fill: BRAND.purpleDark,
          editable: true,
        }),
      ],
    },
  },

  // ════════════════════ Plantilla premium #2 — Fotoimanes Polaroid (ig_post.svg) ════════════════════
  //
  // Ola 3 — stage RE-LAYOUT 450×600 (3:4): el formato físico de la Polaroid es
  // 7.5×10 cm; antes 400×580 y el filtro de aspect la dejaba FUERA del Estudio
  // cuando la variante declaraba otro aspect (bug "no deja escribir el texto":
  // sin plantilla visible no había capas de texto que editar).
  // Asset SVG con marco Instagram: avatar, username, iconos like/comment/share,
  // likes count, caption + hashtags. 4 zonas de texto editable.
  {
    slug: "photo-pack-polaroid-instagram",
    productId: polaroidProduct.id, // solo aparece en Fotoimanes Polaroid
    kind: "PHOTO_PACK",
    name: "Polaroid Instagram",
    order: 2,
    previewUrl: "/templates/ig_post_3x4.svg",
    canvasData: {
      version: 1,
      stage: stage(450, 600),
      layers: [
        background("#FFFFFF"),
        // Ventana de foto ALINEADA con la ventana transparente del marco ig_post_3x4.svg
        // (x25 y54 400×400, ver comentario del SVG). El asset 400×580 original
        // (ig_post.svg) queda solo para drafts viejos embebidos con ese stage.
        photoSlot({ id: "p1", x: 25, y: 54, width: 400, height: 400, label: "Tu foto" }),
        asset({
          id: "frame",
          src: "/templates/ig_post_3x4.svg",
          x: 0,
          y: 0,
          width: 450,
          height: 600,
        }),
        // 4 textos EDITABLES (Konva) — el marco SVG ya NO los hornea (evita doble-texto). Ubicados
        // en el chrome del marco: usuario en la cabecera, likes/título/hashtags bajo la foto.
        // Ola 8: más aire entre líneas para que se lea como un post real y no se vea amontonado.
        text({
          id: "user_name",
          x: 68,
          y: 30,
          text: "@tu_usuario",
          fontFamily: "Inter",
          fontSize: 21,
          fill: "#262626",
          fontWeight: "bold",
          align: "left",
          editable: true,
        }),
        text({
          id: "likes_count",
          x: 28,
          y: 500,
          text: "362 me gusta",
          fontFamily: "Inter",
          fontSize: 17,
          fill: "#262626",
          fontWeight: "bold",
          align: "left",
          editable: true,
        }),
        text({
          id: "caption",
          x: 25,
          y: 524,
          text: "Tu título acá",
          fontFamily: "Inter",
          fontSize: 19,
          fill: "#262626",
          fontWeight: "bold",
          align: "left",
          editable: true,
        }),
        text({
          id: "hashtags",
          x: 25,
          y: 548,
          text: "#mirecuerdo #lucamsshop",
          fontFamily: "Inter",
          fontSize: 13,
          fill: "#00376B",
          align: "left",
          editable: true,
        }),
      ],
    },
  },

  // ════════════════════ Separadores 2 caras (Ola 3, Lucy 2026-07-22) ════════════════════
  //
  // El separador físico es una TIRA doblada a la mitad: cada unidad tiene 2 caras con
  // imagen propia. La plantilla define UNA CARA (el Estudio crea 2 slots por unidad,
  // facesPerUnit=2 en el schema del producto, y producción compone la tira desplegada).
  // Una plantilla por forma, alineada al aspect de la cara física:
  //   - cuadrado    4×4.2 cm por cara (tira 8×4.2)  → stage 400×420
  //   - rectangular 6×2 cm por cara  (tira 12×2)   → stage 600×200
  // Foto a sangre (la cara se imprime entera); las esquinas REDONDAS del troquel las
  // da el cornerRadiusPx del producto (canvas + tira de producción), no la plantilla.
  ...(separadoresProduct
    ? [
        {
          slug: "separador-cuadrado-cara",
          productId: separadoresProduct.id,
          kind: "PHOTO_PACK",
          name: "Separador cuadrado (cara)",
          order: 1,
          previewUrl: "/templates/personalizacion-libre.svg",
          canvasData: {
            version: 1,
            stage: stage(400, 420),
            layers: [
              background("#FFFFFF"),
              photoSlot({ id: "p1", x: 0, y: 0, width: 400, height: 420, label: "Foto de la cara" }),
            ],
          },
        },
        {
          slug: "separador-rectangular-cara",
          productId: separadoresProduct.id,
          kind: "PHOTO_PACK",
          name: "Separador rectangular (cara)",
          order: 2,
          previewUrl: "/templates/personalizacion-libre.svg",
          canvasData: {
            version: 1,
            stage: stage(600, 200),
            layers: [
              background("#FFFFFF"),
              photoSlot({ id: "p1", x: 0, y: 0, width: 600, height: 200, label: "Foto de la cara" }),
            ],
          },
        },
      ]
    : []),

  // ════════════════════ Tira Magnética (photobooth) ════════════════════
  //
  // Ola 4 (Lucy 2026-07-23) — foto-rectangular-simple queda registrada pero ARCHIVADA:
  // su stage 3:4 (600×800) no calza con ninguna variante activa de Cuadrados (todas 1:1)
  // y el filtro de aspect ya la ocultaba del estudio. Se conserva en el seed con
  // archive:true para que el bloque de "legacy soft-delete" no la borre (deletedAt) en
  // un re-seed: la regla es ARCHIVAR, nunca borrar (sus 33 diseños conservan templateId).
  ...(cuadradosProduct
    ? [
        {
          slug: "foto-rectangular-simple",
          productId: cuadradosProduct.id,
          kind: "PHOTO_PACK",
          name: "Rectangular simple",
          order: 98,
          previewUrl: "/brand/lucams-logo.png",
          archive: true,
          canvasData: {
            version: 1,
            stage: stage(600, 800),
            layers: [
              background("#FFFFFF"),
              photoSlot({ id: "p1", x: 0, y: 0, width: 600, height: 800, label: "Tu foto" }),
            ],
          },
        },
      ]
    : []),

  // ════════════════════ Tira Magnética (photobooth) ════════════════════
  //
  // Ola 3c (Lucy 2026-07-22) — Tira Magnética REDISEÑADA al tamaño real 6.5×20 cm
  // (el producto lo actualiza el frente de datos). Referencia de Lucy: tira vertical
  // con 3 fotos APILADAS CASI A SANGRE, el fondo del color elegido visible solo como
  // margen fino y uniforme alrededor. UNA sola plantilla ("Clásica"), SIN texto.
  //
  // Paradigma slot-por-foto (1 foto por slot, gridCols=1): cada celda es 1/3 de la
  // tira → stage 390×400 (6.5 × 6.667 cm); las 3 celdas apiladas con gridGap=0 arman
  // la tira 6.5×20 continua. La celda trae capa "frame-card" (fondo = borderColor,
  // mismo mecanismo de la Polaroid Clásica). Ola 4 (Lucy 2026-07-23): la foto va a
  // sangre VERTICAL → las fotos se TOCAN (pieza continua); el color queda en los
  // lados (12px) y en el borde exterior first/last (12px, lo pone el código).
  ...(tirasProduct
    ? [
        {
          slug: "photo-strip-3-fotos",
          productId: tirasProduct.id,
          kind: "PHOTO_PACK",
          name: "Plantilla Tiras",
          order: 1,
          previewUrl: "/templates/tira-clasica.svg",
          canvasData: {
            version: 1,
            stage: stage(390, 400), // 1/3 de la tira 6.5×20 cm (celda 6.5×6.667)
            gridCols: 1, // apilar las 3 fotos en vertical (la tira física es 1 columna)
            gridGap: 0, // celdas pegadas → la tira se lee como UNA pieza continua
            layers: [
              background("#FFFFFF"),
              // Fondo de la tira = color elegido en el Estudio (blanco por defecto).
              // Sin esquinas redondeadas: la tira es una pieza continua (el troquel
              // exterior lo da el cornerRadiusPx del producto, no la plantilla).
              { id: "card", type: "frame-card", fill: "#FFFFFF", cornerRadius: 0 },
              // Ola 4 (Lucy 2026-07-23) — foto a sangre VERTICAL (y0, alto completo):
              // las fotos de celdas vecinas SE TOCAN (gap 0 real, tira de una pieza).
              // Los lados llevan 12px (~2mm) de color; el borde EXTERIOR (arriba/abajo)
              // lo aplica el código por posición (stripPhotoRect, first/last 12px).
              photoSlot({ id: "photo", x: 12, y: 0, width: 366, height: 400, label: "Foto de la tira" }),
            ],
          },
        },
      ]
    : []),
  // ════════════════════ Plantillas de producto (antes "Personalización Libre") ════════
  //
  // Ola 4 (Lucy 2026-07-23) — DEPURACIÓN: las "Personalización Libre" GLOBALES se
  // deprecaron. Las dos que SÍ se usan pasan a ser plantillas PROPIAS de su producto
  // (nombre real, preview real): el calendario y los cuadrados dejan de ofrecer una
  // plantilla genérica duplicada en otros productos (bug "aparecen 2 plantillas" en
  // separadores/tiras). El resto queda con archive:true (isActive=false) — ver la
  // lista y razones en scripts/ola4-depura-plantillas-2026-07-23.mjs.
  ...(cuadradosProduct
    ? [
        {
          slug: "libre-photo-pack",
          productId: cuadradosProduct.id,
          kind: "PHOTO_PACK",
          name: "Plantilla Cuadrado",
          order: 1,
          previewUrl: "/templates/personalizacion-libre.svg",
          // M.3.b.UX.v13 (Lucy 2026-05-15) — Stage cuadrado 600×600 para que el
          // shape físico (heart/circle/rect cuadrado) se vea proporcionado. Ola 4:
          // es la plantilla de los Fotoimanes Cuadrados 1:1 (sin borde → foto a
          // sangre total; con borde → franja uniforme, ver frame-palette).
          canvasData: blankCanvas({ stageW: 600, stageH: 600, includeText: true }),
        },
      ]
    : []),
  {
    slug: "libre-photo-grid",
    productId: null,
    kind: "PHOTO_GRID",
    name: "Personalización Libre",
    order: 99,
    previewUrl: "/templates/personalizacion-libre.svg",
    // Ola 4 — ARCHIVADA: ningún producto activo usa el kind PHOTO_GRID.
    archive: true,
    canvasData: blankCanvas({ stageW: 720, stageH: 720, includeText: false }),
  },
  ...(calendarioProduct
    ? [
        {
          slug: "libre-calendar-photo-month",
          productId: calendarioProduct.id,
          kind: "CALENDAR_PHOTO_MONTH",
          name: "Calendario mes a mes",
          order: 1,
          previewUrl: "/templates/calendar_month.svg",
          // Ola 2A (Lucy 2026-07-22) — tarjeta 7.5×10 (3:4): foto full-bleed 4:3 arriba (600×450),
          // espejo de la región CALENDAR_PHOTO de producción (1080×810 en página 1080×1440) para
          // que el encuadre del cliente mapee 1:1 al imprimir (WYSIWYG). Abajo queda la franja del
          // mes (lettering grande + grilla) que el compositor hornea en el PNG.
          canvasData: {
            version: 1,
            stage: stage(600, 800),
            layers: [
              background("#FFFFFF"),
              photoSlot({
                id: "p1",
                x: 0,
                y: 0,
                width: 600,
                height: 450,
                cornerRadius: 0,
                label: "Foto del mes",
              }),
            ],
          },
        },
      ]
    : []),
  {
    slug: "libre-calendar-photo-hero",
    productId: null,
    kind: "CALENDAR_PHOTO_HERO",
    name: "Personalización Libre",
    order: 99,
    previewUrl: "/templates/personalizacion-libre.svg",
    // Ola 4 — ARCHIVADA: ningún producto activo usa el kind CALENDAR_PHOTO_HERO.
    archive: true,
    canvasData: blankCanvas({
      stageW: 800,
      stageH: 600,
      photoLabel: "Foto hero",
      includeText: false,
    }),
  },
  {
    slug: "libre-event-favor",
    productId: null,
    kind: "EVENT_FAVOR",
    name: "Personalización Libre",
    order: 99,
    previewUrl: "/templates/personalizacion-libre.svg",
    // Ola 4 — ARCHIVADA: ningún producto activo usa el kind EVENT_FAVOR.
    archive: true,
    canvasData: blankCanvas({ stageW: 600, stageH: 800, includeText: true }),
  },
  {
    slug: "libre-business-logo",
    productId: null,
    kind: "BUSINESS_LOGO",
    name: "Personalización Libre",
    order: 99,
    previewUrl: "/templates/personalizacion-libre.svg",
    // Ola 4 — ARCHIVADA: ningún producto activo usa el kind BUSINESS_LOGO.
    archive: true,
    canvasData: blankCanvas({
      stageW: 700,
      stageH: 500,
      photoLabel: "Tu logo",
      includeText: true,
    }),
  },
  {
    slug: "libre-custom-decor",
    productId: null,
    kind: "CUSTOM_DECOR",
    name: "Personalización Libre",
    order: 99,
    previewUrl: "/templates/personalizacion-libre.svg",
    // Ola 4 — ARCHIVADA: ningún producto activo usa el kind CUSTOM_DECOR.
    archive: true,
    canvasData: blankCanvas({ stageW: 600, stageH: 800, includeText: true }),
  },
  {
    slug: "libre-text-only",
    productId: null,
    kind: "TEXT_ONLY",
    name: "Personalización Libre",
    order: 99,
    previewUrl: "/templates/personalizacion-libre.svg",
    // Ola 4 — ARCHIVADA: el producto TEXT_ONLY (nombre-personalizado) usa el
    // NameEditor (superficie "name"), que no carga plantillas.
    archive: true,
    canvasData: {
      version: 1,
      stage: stage(800, 800),
      layers: [
        background("#FFF8F0"),
        text({
          id: "main_text",
          x: 400,
          y: 400,
          text: "Tu frase acá",
          fontFamily: "Fredoka",
          fontSize: 80,
          fill: BRAND.purpleDark,
          fontWeight: "bold",
          editable: true,
        }),
      ],
    },
  },
];

// ──────────────────────────────────────────────────────────────────
//  Soft-delete plantillas legacy (no presentes en M.3.b.A2)
// ──────────────────────────────────────────────────────────────────

const PREMIUM_SLUGS = new Set(templatesData.map((t) => t.slug));

const legacy = await prisma.personalizationTemplate.findMany({
  where: { deletedAt: null, slug: { notIn: Array.from(PREMIUM_SLUGS) } },
  select: { id: true, slug: true, name: true },
});

if (legacy.length > 0) {
  console.log(`Soft-deleting ${legacy.length} plantillas legacy:`);
  for (const t of legacy) {
    await prisma.personalizationTemplate.update({
      where: { id: t.id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        deletedBy: "system:M.3.b.CAT.11-2026-05-14",
      },
    });
    console.log(`  - ${t.slug}`);
  }
  console.log("");
}

// ──────────────────────────────────────────────────────────────────
//  Upsert plantillas premium con asset paradigm
// ──────────────────────────────────────────────────────────────────

console.log(`Creando/actualizando ${templatesData.length} plantillas asset paradigm...`);
const byKind = {};
for (const t of templatesData) {
  // Ola 4 — `archive: true` → la plantilla queda registrada pero INACTIVA (isActive=false),
  // sin borrarla (los diseños viejos conservan su snapshot y su templateId).
  const active = t.archive !== true;
  // `product` es relación Prisma — usar connect/disconnect en lugar de productId directo.
  const productRelation = t.productId ? { connect: { id: t.productId } } : { disconnect: true };
  await prisma.personalizationTemplate.upsert({
    where: { slug: t.slug },
    update: {
      kind: t.kind,
      name: t.name,
      product: productRelation,
      previewUrl: t.previewUrl,
      canvasData: t.canvasData,
      order: t.order,
      isActive: active,
      deletedAt: null,
      deletedBy: null,
    },
    create: {
      kind: t.kind,
      name: t.name,
      slug: t.slug,
      ...(t.productId ? { product: { connect: { id: t.productId } } } : {}),
      previewUrl: t.previewUrl,
      canvasData: t.canvasData,
      order: t.order,
      isActive: active,
    },
  });
  byKind[t.kind] = (byKind[t.kind] ?? 0) + 1;
  const scope = t.productId ? "(producto-específico)" : "(global)";
  console.log(`  ✓ ${t.name}  [${t.kind}]  ${scope}${active ? "" : "  ⛔ ARCHIVADA"}`);
}

console.log("");
const total = await prisma.personalizationTemplate.count({ where: { deletedAt: null } });
const totalArchived = await prisma.personalizationTemplate.count({
  where: { deletedAt: { not: null } },
});
console.log(`Total activas: ${total} plantillas asset paradigm`);
console.log(`Total archivadas: ${totalArchived} legacy`);
console.log("");
console.log("Distribución por kind:");
for (const [kind, count] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${kind.padEnd(22)} ${count}`);
}
console.log("");
console.log("Listo. Próximo: M.3.b.B mockup contextual con sharp + 4 escenas.");

await prisma.$disconnect();
process.exit(0);

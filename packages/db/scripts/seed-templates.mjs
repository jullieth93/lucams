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

// ──────────── Plantillas activas (M.3.b.CAT.11, 2026-05-14) ────────────
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
  // ════════════════════ Plantilla premium #1 — Fotoimanes Polaroid (ig_post.svg) ════════════════════
  //
  // Aspect 400×580 (relación ~7:10) — encaja con variants Polaroid 7×9 cm, 6×8 cm.
  // Asset SVG con marco Instagram: avatar, username, iconos like/comment/share,
  // likes count, caption + hashtags. 4 zonas de texto editable.
  {
    slug: "photo-pack-polaroid-instagram",
    productId: polaroidProduct.id, // solo aparece en Fotoimanes Polaroid
    kind: "PHOTO_PACK",
    name: "Polaroid Instagram",
    order: 1,
    previewUrl: "/templates/ig_post.svg",
    canvasData: {
      version: 1,
      stage: stage(400, 580),
      layers: [
        background("#FFFFFF"),
        photoSlot({ id: "p1", x: 20, y: 50, width: 360, height: 380, label: "Tu foto" }),
        asset({
          id: "frame",
          src: "/templates/ig_post.svg",
          x: 0,
          y: 0,
          width: 400,
          height: 580,
        }),
        // 4 textos editables — replicando estructura ig_post.svg
        text({
          id: "user_name",
          x: 50,
          y: 25,
          text: "@tu_usuario",
          fontFamily: "Inter",
          fontSize: 20,
          fill: "#262626",
          fontWeight: "bold",
          align: "left",
          editable: true,
        }),
        text({
          id: "likes_count",
          x: 30,
          y: 475,
          text: "362 me gusta",
          fontFamily: "Inter",
          fontSize: 18,
          fill: "#262626",
          fontWeight: "bold",
          align: "left",
          editable: true,
        }),
        text({
          id: "caption",
          x: 15,
          y: 510,
          text: "Tu título acá",
          fontFamily: "Inter",
          fontSize: 20,
          fill: "#262626",
          fontWeight: "bold",
          align: "left",
          editable: true,
        }),
        text({
          id: "hashtags",
          x: 15,
          y: 545,
          text: "#mirecuerdo #lucamsshop",
          fontFamily: "Inter",
          fontSize: 16,
          fill: "#00376B",
          align: "left",
          editable: true,
        }),
      ],
    },
  },

  // ════════════════════ Plantillas globales "Personalización Libre" ════════════════════
  //
  // 8 plantillas, una por kind personalizable. Fallback funcional mientras
  // se regeneran las plantillas premium una a una. Cliente sube foto + texto
  // libre. NO tienen `productId` → globales, aparecen en cualquier producto
  // del kind que no tenga plantillas premium específicas.
  {
    slug: "libre-photo-pack",
    productId: null,
    kind: "PHOTO_PACK",
    name: "Personalización Libre",
    order: 99,
    previewUrl: "/templates/personalizacion-libre.svg",
    // M.3.b.UX.v13 (Lucy 2026-05-15) — Stage cuadrado 600×600 para que el
    // shape físico (heart/circle/rect cuadrado) se vea proporcionado. Para
    // products rect vertical (Polaroid 7×9), la plantilla Polaroid Instagram
    // tiene su propio stage 400×580 y NO usa este Libre.
    // includeText:true se mantiene → el text se renderea solo en rect
    // shapes (heart/circle lo skip en renderLayer "text" case).
    canvasData: blankCanvas({ stageW: 600, stageH: 600, includeText: true }),
  },
  {
    slug: "libre-photo-grid",
    productId: null,
    kind: "PHOTO_GRID",
    name: "Personalización Libre",
    order: 99,
    previewUrl: "/templates/personalizacion-libre.svg",
    canvasData: blankCanvas({ stageW: 720, stageH: 720, includeText: false }),
  },
  {
    slug: "libre-calendar-photo-month",
    productId: null,
    kind: "CALENDAR_PHOTO_MONTH",
    name: "Personalización Libre",
    order: 99,
    previewUrl: "/templates/personalizacion-libre.svg",
    canvasData: blankCanvas({
      stageW: 600,
      stageH: 800,
      photoLabel: "Foto del mes",
      includeText: false,
    }),
  },
  {
    slug: "libre-calendar-photo-hero",
    productId: null,
    kind: "CALENDAR_PHOTO_HERO",
    name: "Personalización Libre",
    order: 99,
    previewUrl: "/templates/personalizacion-libre.svg",
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
    canvasData: blankCanvas({ stageW: 600, stageH: 800, includeText: true }),
  },
  {
    slug: "libre-business-logo",
    productId: null,
    kind: "BUSINESS_LOGO",
    name: "Personalización Libre",
    order: 99,
    previewUrl: "/templates/personalizacion-libre.svg",
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
    canvasData: blankCanvas({ stageW: 600, stageH: 800, includeText: true }),
  },
  {
    slug: "libre-text-only",
    productId: null,
    kind: "TEXT_ONLY",
    name: "Personalización Libre",
    order: 99,
    previewUrl: "/templates/personalizacion-libre.svg",
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
      isActive: true,
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
      isActive: true,
    },
  });
  byKind[t.kind] = (byKind[t.kind] ?? 0) + 1;
  const scope = t.productId ? "(producto-específico)" : "(global)";
  console.log(`  ✓ ${t.name}  [${t.kind}]  ${scope}`);
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

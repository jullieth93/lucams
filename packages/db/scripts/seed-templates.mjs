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

// ──────────── 10 Plantillas Premium A++ (paradigma pacdora) ────────────

const templatesData = [
  // ════════════════════════ PHOTO_PACK (3) ════════════════════════

  {
    slug: "photo-pack-polaroid-romantica",
    kind: "PHOTO_PACK",
    name: "Polaroid Romántica",
    order: 1,
    previewUrl: "/templates/polaroid-romantica.svg",
    canvasData: {
      version: 1,
      stage: stage(720, 920),
      layers: [
        background("#FAF6F0"),
        // Foto cliente (DEBAJO del asset, se ve por el hueco)
        photoSlot({ id: "p1", x: 60, y: 60, width: 600, height: 680, label: "Tu foto" }),
        // Asset SVG: marco polaroid blanco con corners dorados + sombra
        asset({
          id: "frame",
          src: "/templates/polaroid-romantica.svg",
          x: 0,
          y: 0,
          width: 720,
          height: 920,
        }),
        // Caption editable (encima del asset)
        text({
          id: "caption",
          x: 360,
          y: 820,
          text: "Te amo · 2026",
          fontFamily: "Fredoka",
          fontSize: 38,
          fill: BRAND.purpleDark,
          editable: true,
        }),
      ],
    },
  },

  {
    slug: "photo-pack-cuadrado-minimal-art",
    kind: "PHOTO_PACK",
    name: "Cuadrado Minimal Art",
    order: 2,
    previewUrl: "/templates/cuadrado-minimal-art.svg",
    canvasData: {
      version: 1,
      stage: stage(1080, 1080),
      layers: [
        background("#FFFFFF"),
        photoSlot({
          id: "p1",
          x: 40,
          y: 40,
          width: 1000,
          height: 1000,
          cornerRadius: 32,
          label: "Tu foto",
        }),
        // Asset SVG: washi tape diagonal + sombra exterior
        asset({
          id: "frame",
          src: "/templates/cuadrado-minimal-art.svg",
          x: 0,
          y: 0,
          width: 1080,
          height: 1080,
        }),
      ],
    },
  },

  {
    slug: "photo-pack-corazon-vintage",
    kind: "PHOTO_PACK",
    name: "Corazón Vintage",
    order: 3,
    previewUrl: "/templates/corazon-vintage.svg",
    canvasData: {
      version: 1,
      stage: stage(1080, 1080),
      layers: [
        background(BRAND.blushDeep),
        // Foto DEBAJO del asset heart (se ve por dentro del corazón)
        photoSlot({
          id: "p1",
          x: 180,
          y: 240,
          width: 720,
          height: 600,
          cornerRadius: 24,
          label: "Tu foto",
        }),
        // Asset SVG: heart REAL + borde dorado + 4 flores en esquinas
        asset({
          id: "frame",
          src: "/templates/corazon-vintage.svg",
          x: 0,
          y: 0,
          width: 1080,
          height: 1080,
        }),
        // Caption editable encima del heart
        text({
          id: "caption",
          x: 540,
          y: 950,
          text: "Forever · 2026",
          fontFamily: "Fredoka",
          fontSize: 48,
          fill: "#FFFFFF",
          editable: true,
        }),
      ],
    },
  },

  // ════════════════════════ PHOTO_GRID (1) ════════════════════════

  {
    slug: "photo-grid-3x3-mood-board",
    kind: "PHOTO_GRID",
    name: "Mood Board 3×3",
    order: 4,
    previewUrl: "/templates/mood-board-3x3.svg",
    canvasData: {
      version: 1,
      stage: stage(1080, 1080),
      grid: { cols: 3, rows: 3 },
      layers: [
        background(BRAND.cream),
        // 9 slots de foto en grid 3×3
        ...Array.from({ length: 9 }).map((_, i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const cell = 320;
          const gap = 30;
          return photoSlot({
            id: `p${i + 1}`,
            x: gap + col * (cell + gap),
            y: gap + row * (cell + gap),
            width: cell,
            height: cell,
            cornerRadius: 12,
            label: `Foto ${i + 1}`,
          });
        }),
        // Asset SVG: washi tape en 3 esquinas + sombra suave
        asset({
          id: "frame",
          src: "/templates/mood-board-3x3.svg",
          x: 0,
          y: 0,
          width: 1080,
          height: 1080,
        }),
      ],
    },
  },

  // ════════════════════════ CALENDAR_PHOTO_MONTH (2) ════════════════════════

  {
    slug: "calendar-month-floral-2026",
    kind: "CALENDAR_PHOTO_MONTH",
    name: "Calendario Floral 2026",
    order: 5,
    previewUrl: "/templates/calendar-floral-2026.svg",
    canvasData: {
      version: 1,
      stage: stage(1080, 1400),
      monthsRequired: 12,
      perMonth: {
        layers: [
          background(BRAND.cream),
          photoSlot({
            id: "p1",
            x: 60,
            y: 220,
            width: 960,
            height: 720,
            cornerRadius: 16,
            label: "Foto del mes",
          }),
          // Asset SVG: banner floral + 5+ flores
          asset({
            id: "frame",
            src: "/templates/calendar-floral-2026.svg",
            x: 0,
            y: 0,
            width: 1080,
            height: 1400,
          }),
          text({
            id: "month-name",
            x: 540,
            y: 1020,
            text: "{month}",
            fontFamily: "Fredoka",
            fontSize: 64,
            fill: BRAND.purpleDark,
            fontWeight: "bold",
          }),
          text({
            id: "year",
            x: 540,
            y: 1100,
            text: "2026",
            fontFamily: "Baloo 2",
            fontSize: 36,
            fill: BRAND.purple,
          }),
        ],
      },
    },
  },

  {
    slug: "calendar-month-minimal-2026",
    kind: "CALENDAR_PHOTO_MONTH",
    name: "Calendario Minimal 2026",
    order: 6,
    previewUrl: "/templates/calendar-minimal-2026.svg",
    canvasData: {
      version: 1,
      stage: stage(1080, 1400),
      monthsRequired: 12,
      perMonth: {
        layers: [
          background("#FFFFFF"),
          photoSlot({
            id: "p1",
            x: 0,
            y: 0,
            width: 1080,
            height: 900,
            cornerRadius: 0,
            label: "Foto del mes",
          }),
          // Asset SVG: accent coral + bordes finos
          asset({
            id: "frame",
            src: "/templates/calendar-minimal-2026.svg",
            x: 0,
            y: 0,
            width: 1080,
            height: 1400,
          }),
          text({
            id: "month-name",
            x: 540,
            y: 1050,
            text: "{month}",
            fontFamily: "Inter",
            fontSize: 96,
            fill: "#1A1A1A",
            fontWeight: "bold",
          }),
          text({
            id: "year",
            x: 540,
            y: 1200,
            text: "2026",
            fontFamily: "Inter",
            fontSize: 32,
            fill: "#666666",
          }),
        ],
      },
    },
  },

  // ════════════════════════ EVENT_FAVOR (2) ════════════════════════

  {
    slug: "event-matrimonio-elegante",
    kind: "EVENT_FAVOR",
    name: "Matrimonio Elegante",
    order: 7,
    previewUrl: "/templates/matrimonio-elegante.svg",
    canvasData: {
      version: 1,
      stage: stage(800, 1000),
      layers: [
        background(BRAND.cream),
        photoSlot({
          id: "p1",
          x: 80,
          y: 80,
          width: 640,
          height: 560,
          cornerRadius: 8,
          label: "Foto pareja",
        }),
        // Asset SVG: laurel wreath dorado + divider art deco + corners
        asset({
          id: "frame",
          src: "/templates/matrimonio-elegante.svg",
          x: 0,
          y: 0,
          width: 800,
          height: 1000,
        }),
        text({
          id: "names",
          x: 400,
          y: 790,
          text: "{names}",
          fontFamily: "Baloo 2",
          fontSize: 56,
          fill: BRAND.purpleDark,
          editable: true,
        }),
        text({
          id: "date",
          x: 400,
          y: 880,
          text: "{date}",
          fontFamily: "Inter",
          fontSize: 28,
          fill: BRAND.purple,
          editable: true,
        }),
        text({
          id: "venue",
          x: 400,
          y: 940,
          text: "{venue}",
          fontFamily: "Inter",
          fontSize: 22,
          fill: BRAND.coral,
          editable: true,
        }),
      ],
    },
  },

  {
    slug: "event-cumpleanos-kawaii-pop",
    kind: "EVENT_FAVOR",
    name: "Cumpleaños Kawaii Pop",
    order: 8,
    previewUrl: "/templates/cumpleanos-kawaii-pop.svg",
    canvasData: {
      version: 1,
      stage: stage(800, 800),
      layers: [
        background(BRAND.yellow),
        photoSlot({
          id: "p1",
          x: 130,
          y: 110,
          width: 540,
          height: 380,
          cornerRadius: 16,
          label: "Foto celebrante",
        }),
        // Asset SVG: confetti mixto + burst rays + card blanca
        asset({
          id: "frame",
          src: "/templates/cumpleanos-kawaii-pop.svg",
          x: 0,
          y: 0,
          width: 800,
          height: 800,
        }),
        text({
          id: "celebrante",
          x: 400,
          y: 560,
          text: "{name}",
          fontFamily: "Fredoka",
          fontSize: 60,
          fill: BRAND.purple,
          fontWeight: "bold",
          editable: true,
        }),
        text({
          id: "edad",
          x: 400,
          y: 640,
          text: "{age} años ✨",
          fontFamily: "Fredoka",
          fontSize: 36,
          fill: BRAND.pink,
          editable: true,
        }),
        text({
          id: "fecha",
          x: 400,
          y: 720,
          text: "{date}",
          fontFamily: "Inter",
          fontSize: 24,
          fill: BRAND.purpleDark,
          editable: true,
        }),
      ],
    },
  },

  // ════════════════════════ CUSTOM_DECOR (1) ════════════════════════

  {
    slug: "decor-mama-dia-frase",
    kind: "CUSTOM_DECOR",
    name: "Día de la Madre — Frase",
    order: 9,
    previewUrl: "/templates/mama-dia-frase.svg",
    canvasData: {
      version: 1,
      stage: stage(1080, 1080),
      layers: [
        background("#FFE5EC"),
        photoSlot({
          id: "p1",
          x: 240,
          y: 100,
          width: 600,
          height: 600,
          cornerRadius: 300,
          label: "Foto con mamá",
        }),
        // Asset SVG: flores grandes + anillo decorativo + corazones
        asset({
          id: "frame",
          src: "/templates/mama-dia-frase.svg",
          x: 0,
          y: 0,
          width: 1080,
          height: 1080,
        }),
        text({
          id: "frase",
          x: 540,
          y: 830,
          text: "Mamá, te amo",
          fontFamily: "Fredoka",
          fontSize: 72,
          fill: BRAND.blushDeep,
          fontWeight: "bold",
          editable: true,
        }),
        text({
          id: "subfrase",
          x: 540,
          y: 920,
          text: "Gracias por todo ✨",
          fontFamily: "Baloo 2",
          fontSize: 32,
          fill: BRAND.purpleDark,
          editable: true,
        }),
      ],
    },
  },

  // ════════════════════════ PHOTO_PACK extra (Social Post Cuadrado) ════════════════════════

  // Aterrizado 2026-05-13: era "decor-marco-social-post" (CUSTOM_DECOR) — flotaba
  // suelto sin anclaje físico. Ahora plantilla del producto cuadrado 5×5 cm
  // (set-12-fotoimanes-cuadrados, aspectRatio 1:1).
  // Stage 590×590 px = 5×5 cm a 300 DPI exactos.
  {
    slug: "photo-pack-social-post-cuadrado",
    kind: "PHOTO_PACK",
    name: "Social Post Cuadrado",
    order: 4,
    previewUrl: "/templates/social-post-frame.svg",
    // El aspect ratio se calcula dinámicamente en listTemplatesForKind a partir
    // de canvasData.stage.width/height — no requiere campo adicional en schema.
    canvasData: {
      version: 1,
      stage: stage(590, 590),
      layers: [
        background("#FFFFFF"),
        // Foto cliente DEBAJO del asset (rectangular dentro del marco cuadrado)
        photoSlot({
          id: "p1",
          x: 0,
          y: 65,
          width: 590,
          height: 380,
          cornerRadius: 0,
          label: "Tu foto",
        }),
        // Asset SVG v5: marco social post cuadrado 590×590
        asset({
          id: "frame",
          src: "/templates/social-post-frame.svg",
          x: 0,
          y: 0,
          width: 590,
          height: 590,
        }),
        // 4 zonas editables — fontSizes aumentados para legibilidad a escala
        // del slot (slot 1/12 ≈ 200-250px de display, antes textos 12-13 px
        // se renderean a ~5px ilegibles). Ahora 28-32px → 11-13px renderado, legible.
        text({
          id: "user_name",
          x: 68,
          y: 35,
          text: "@tu_usuario",
          fontFamily: "Inter, sans-serif",
          fontSize: 28,
          fill: "#262626",
          fontWeight: "bold",
          align: "left",
          editable: true,
        }),
        text({
          id: "likes_count",
          x: 50,
          y: 478,
          text: "362 likes",
          fontFamily: "Inter, sans-serif",
          fontSize: 26,
          fill: "#262626",
          fontWeight: "bold",
          align: "left",
          editable: true,
        }),
        text({
          id: "title_caption",
          x: 22,
          y: 515,
          text: "Tu título acá",
          fontFamily: "Inter, sans-serif",
          fontSize: 28,
          fill: "#262626",
          fontWeight: "bold",
          align: "left",
          editable: true,
        }),
        text({
          id: "hashtags",
          x: 22,
          y: 548,
          text: "#mirecuerdo #lucamsshop",
          fontFamily: "Inter, sans-serif",
          fontSize: 22,
          fill: "#00376B", // azul Instagram hashtags
          align: "left",
          editable: true,
        }),
      ],
    },
  },

  // ════════════════════════ PHOTO_PACK extra (Baby Shower — generado vía Project) ════════════════════════

  // 2026-05-14 — primera plantilla generada vía Claude Project "Lucams SVG Designer".
  // Briefing: marco polaroid para baby shower con flores acuarela en esquinas +
  // ribbon blush abajo. Paleta blush/sage-green/cream/yellow.
  // Ajustes manuales aplicados: scattered-leaves + sparkles desplazadas a marcos
  // laterales para no tapar la foto del cliente.
  {
    slug: "photo-pack-baby-shower",
    kind: "PHOTO_PACK",
    name: "Baby Shower",
    order: 5,
    previewUrl: "/templates/photo-pack-baby-shower.svg",
    canvasData: {
      version: 1,
      stage: stage(720, 920),
      layers: [
        background("#FFFFFF"),
        photoSlot({
          id: "p1",
          x: 60,
          y: 60,
          width: 600,
          height: 620,
          cornerRadius: 12,
          label: "Foto del bebé",
        }),
        asset({
          id: "frame",
          src: "/templates/photo-pack-baby-shower.svg",
          x: 0,
          y: 0,
          width: 720,
          height: 920,
        }),
        // Zona reservada caption: (60, 720, 600, 80) — text overlay editable
        // (todavía no implementado en M.3.b.D, queda reservado)
      ],
    },
  },

  // ════════════════════════ BUSINESS_LOGO (1) ════════════════════════

  {
    slug: "business-corporativo-limpio",
    kind: "BUSINESS_LOGO",
    name: "Corporativo Limpio",
    order: 11,
    previewUrl: "/templates/business-corporativo.svg",
    canvasData: {
      version: 1,
      stage: stage(700, 500),
      layers: [
        background("#FFFFFF"),
        photoSlot({
          id: "logo",
          x: 80,
          y: 80,
          width: 280,
          height: 140,
          cornerRadius: 0,
          label: "Tu logo",
        }),
        // Asset SVG: accent turquoise + checkmark + líneas profesionales
        asset({
          id: "frame",
          src: "/templates/business-corporativo.svg",
          x: 0,
          y: 0,
          width: 700,
          height: 500,
        }),
        text({
          id: "phone",
          x: 470,
          y: 130,
          text: "{phone}",
          fontFamily: "Inter",
          fontSize: 22,
          fill: BRAND.purpleDark,
          editable: true,
          align: "left",
        }),
        text({
          id: "email",
          x: 470,
          y: 180,
          text: "{email}",
          fontFamily: "Inter",
          fontSize: 22,
          fill: BRAND.purpleDark,
          editable: true,
          align: "left",
        }),
        text({
          id: "web",
          x: 470,
          y: 230,
          text: "{website}",
          fontFamily: "Inter",
          fontSize: 22,
          fill: BRAND.purple,
          editable: true,
          align: "left",
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
        deletedBy: "system:M.3.b.A2-2026-05-13",
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
  await prisma.personalizationTemplate.upsert({
    where: { slug: t.slug },
    update: {
      kind: t.kind,
      name: t.name,
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
      previewUrl: t.previewUrl,
      canvasData: t.canvasData,
      order: t.order,
      isActive: true,
    },
  });
  byKind[t.kind] = (byKind[t.kind] ?? 0) + 1;
  console.log(`  ✓ ${t.name}  [${t.kind}]  (${t.slug}) → asset ${t.previewUrl}`);
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

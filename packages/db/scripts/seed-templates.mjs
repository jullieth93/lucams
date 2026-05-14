/*
 * Script de seed para plantillas del Estudio de Personalización.
 *
 * Sub-bloque M.3.b.A (2026-05-13) — refactor "menos plantillas pero de
 * altísimo valor". Reducimos de 30 → 10 plantillas premium A++ con SVG
 * enriquecido + tipografía + iconografía.
 *
 * Los 10 slugs activos (post M.3.b.A):
 *   PHOTO_PACK (3):
 *     - photo-pack-polaroid-romantica
 *     - photo-pack-cuadrado-minimal-art
 *     - photo-pack-corazon-vintage
 *   PHOTO_GRID (1):
 *     - photo-grid-3x3-mood-board
 *   CALENDAR_PHOTO_MONTH (2):
 *     - calendar-month-floral-2026
 *     - calendar-month-minimal-2026
 *   EVENT_FAVOR (2):
 *     - event-matrimonio-elegante
 *     - event-cumpleanos-kawaii-pop
 *   CUSTOM_DECOR (1):
 *     - decor-mama-dia-frase
 *   BUSINESS_LOGO (1):
 *     - business-corporativo-limpio
 *
 * Las 20 plantillas previas (slugs M.1.d) se soft-deletean:
 *   - deletedAt = new Date()
 *   - metadata.archivedReason = "M.3.b.A premium cleanup 2026-05-13"
 *   - isActive = false
 * Quedan disponibles para reactivación admin via /admin/contenido futuro.
 *
 * canvasData JSON sigue el formato V1 unitTemplate (1 imán):
 *   - stage: dimensiones canvas en px lógicos
 *   - layers[]: ordenadas back→front (background, shapes, image-placeholder, text)
 *
 * Convenciones de coords (confirmadas tras debug M.3.b 2026-05-13):
 *   - image-placeholder x/y son TOP-LEFT del slot
 *   - shape (rect/circle/heart) x/y son CENTER
 *   - text x/y son CENTER + align (default center)
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

console.log("=== seed-templates (M.3.b.A premium) ===");
console.log("");

const UNSPLASH = (id) => `https://images.unsplash.com/photo-${id}?w=600&q=80&fit=crop`;

// ──────────── Brand tokens (M.3.b.A enriched palette) ────────────

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
  // Premium accents M.3.b.A
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

function shape({
  id,
  kind,
  x,
  y,
  width,
  height,
  fill,
  stroke,
  strokeWidth = 0,
  cornerRadius = 0,
  rotation = 0,
}) {
  return { id, type: "shape", kind, x, y, width, height, fill, stroke, strokeWidth, cornerRadius, rotation };
}

function stage(width = 1080, height = 1080) {
  return { width, height, dpiPreview: 90, dpiProduction: 300 };
}

// ──────────── 10 Plantillas Premium A++ ────────────

const templatesData = [
  // ════════════════════════ PHOTO_PACK (3) ════════════════════════

  {
    slug: "photo-pack-polaroid-romantica",
    kind: "PHOTO_PACK",
    name: "Polaroid Romántica",
    order: 1,
    previewUrl: UNSPLASH("1518621736915-f3b1c41bfd00"),
    canvasData: {
      version: 1,
      stage: stage(720, 920),
      layers: [
        background("#FAF6F0"),
        // Frame dorado vintage (rect outer)
        shape({
          id: "frame-outer",
          kind: "rect",
          x: 360,
          y: 380,
          width: 660,
          height: 760,
          fill: "transparent",
          stroke: BRAND.gold,
          strokeWidth: 8,
          cornerRadius: 4,
        }),
        // Foto polaroid TOP-LEFT (60,60) size 600×680
        photoSlot({
          id: "p1",
          x: 60,
          y: 60,
          width: 600,
          height: 680,
          cornerRadius: 2,
          label: "Tu foto",
        }),
        // Caption editable en la franja inferior estilo polaroid
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
    previewUrl: UNSPLASH("1554080353-a576cf803bda"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1080),
      layers: [
        background("#FFFFFF"),
        // Foto fullbleed con leve cornerRadius
        photoSlot({
          id: "p1",
          x: 40,
          y: 40,
          width: 1000,
          height: 1000,
          cornerRadius: 32,
          label: "Tu foto",
        }),
      ],
    },
  },

  {
    slug: "photo-pack-corazon-vintage",
    kind: "PHOTO_PACK",
    name: "Corazón Vintage",
    order: 3,
    previewUrl: UNSPLASH("1518621736915-f3b1c41bfd00"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1080),
      layers: [
        background(BRAND.blushDeep),
        // Frame heart-ish con borde dorado (renderado como rect c/cornerRadius 50% por kind=circle)
        shape({
          id: "heart-frame",
          kind: "heart",
          x: 540,
          y: 540,
          width: 960,
          height: 960,
          fill: "#FFF1F4",
        }),
        // Foto dentro con cornerRadius alto = forma orgánica
        photoSlot({
          id: "p1",
          x: 180,
          y: 240,
          width: 720,
          height: 600,
          cornerRadius: 24,
          label: "Tu foto",
        }),
        // Texto debajo
        text({
          id: "caption",
          x: 540,
          y: 950,
          text: "Forever · 2026",
          fontFamily: "Fredoka",
          fontSize: 48,
          fill: BRAND.purpleDark,
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
    previewUrl: UNSPLASH("1502920917128-1aa500764cbd"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1080),
      grid: { cols: 3, rows: 3 },
      layers: [
        background(BRAND.cream),
        // Grid 3x3 con gaps suaves estilo Pinterest
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
      ],
    },
  },

  // ════════════════════════ CALENDAR_PHOTO_MONTH (2) ════════════════════════

  {
    slug: "calendar-month-floral-2026",
    kind: "CALENDAR_PHOTO_MONTH",
    name: "Calendario Floral 2026",
    order: 5,
    previewUrl: UNSPLASH("1606166187734-a4cb74079037"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1400),
      monthsRequired: 12,
      perMonth: {
        layers: [
          background(BRAND.cream),
          // Banda floral arriba (decorative shape)
          shape({
            id: "floral-banner",
            kind: "rect",
            x: 540,
            y: 100,
            width: 1080,
            height: 180,
            fill: BRAND.pinkLight,
          }),
          // Foto
          photoSlot({
            id: "p1",
            x: 60,
            y: 220,
            width: 960,
            height: 720,
            cornerRadius: 16,
            label: "Foto del mes",
          }),
          // Mes
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
    previewUrl: UNSPLASH("1606166187734-a4cb74079037"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1400),
      monthsRequired: 12,
      perMonth: {
        layers: [
          background("#FFFFFF"),
          // Foto fullbleed superior
          photoSlot({
            id: "p1",
            x: 0,
            y: 0,
            width: 1080,
            height: 900,
            cornerRadius: 0,
            label: "Foto del mes",
          }),
          // Mes en tipografía grande inferior
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
    previewUrl: UNSPLASH("1519741497674-611481863552"),
    canvasData: {
      version: 1,
      stage: stage(800, 1000),
      layers: [
        background(BRAND.cream),
        // Borde dorado elegante
        shape({
          id: "border",
          kind: "rect",
          x: 400,
          y: 500,
          width: 760,
          height: 960,
          fill: "transparent",
          stroke: BRAND.gold,
          strokeWidth: 3,
          cornerRadius: 0,
        }),
        // Foto pareja arriba
        photoSlot({
          id: "p1",
          x: 80,
          y: 80,
          width: 640,
          height: 560,
          cornerRadius: 8,
          label: "Foto pareja",
        }),
        // Línea decorativa
        shape({
          id: "divider",
          kind: "rect",
          x: 400,
          y: 720,
          width: 140,
          height: 2,
          fill: BRAND.gold,
        }),
        // Nombres pareja
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
        // Fecha
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
        // Lugar
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
    previewUrl: UNSPLASH("1530103862676-de8c9debad1d"),
    canvasData: {
      version: 1,
      stage: stage(800, 800),
      layers: [
        background(BRAND.yellow),
        // Confetti dots decorativos (puntos colorful)
        ...[
          { x: 100, y: 80, color: BRAND.pink },
          { x: 700, y: 100, color: BRAND.turquoise },
          { x: 650, y: 720, color: BRAND.purple },
          { x: 80, y: 700, color: BRAND.coral },
          { x: 400, y: 60, color: BRAND.pink },
        ].map((dot, i) => ({
          id: `confetti-${i}`,
          type: "shape",
          kind: "circle",
          x: dot.x,
          y: dot.y,
          width: 30,
          height: 30,
          fill: dot.color,
        })),
        // Tarjeta blanca interior
        shape({
          id: "card",
          kind: "rect",
          x: 400,
          y: 400,
          width: 660,
          height: 660,
          fill: "#FFFFFF",
          cornerRadius: 32,
        }),
        // Foto celebrante
        photoSlot({
          id: "p1",
          x: 130,
          y: 110,
          width: 540,
          height: 380,
          cornerRadius: 16,
          label: "Foto celebrante",
        }),
        // Nombre
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
        // Edad
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
        // Fecha
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
    previewUrl: UNSPLASH("1549465220-1a8b9238cd48"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1080),
      layers: [
        background("#FFE5EC"),
        // Foto circular grande
        photoSlot({
          id: "p1",
          x: 240,
          y: 100,
          width: 600,
          height: 600,
          cornerRadius: 300,
          label: "Foto con mamá",
        }),
        // Frase grande
        text({
          id: "frase",
          x: 540,
          y: 800,
          text: "Mamá, te amo",
          fontFamily: "Fredoka",
          fontSize: 72,
          fill: BRAND.blushDeep,
          fontWeight: "bold",
          editable: true,
        }),
        // Sub-frase
        text({
          id: "subfrase",
          x: 540,
          y: 900,
          text: "Gracias por todo ✨",
          fontFamily: "Baloo 2",
          fontSize: 32,
          fill: BRAND.purpleDark,
          editable: true,
        }),
        // Año pequeño
        text({
          id: "year",
          x: 540,
          y: 990,
          text: "2026",
          fontFamily: "Inter",
          fontSize: 24,
          fill: BRAND.purple,
        }),
      ],
    },
  },

  // ════════════════════════ BUSINESS_LOGO (1) ════════════════════════

  {
    slug: "business-corporativo-limpio",
    kind: "BUSINESS_LOGO",
    name: "Corporativo Limpio",
    order: 10,
    previewUrl: UNSPLASH("1606166187734-a4cb74079037"),
    canvasData: {
      version: 1,
      stage: stage(700, 500),
      layers: [
        background("#FFFFFF"),
        // Accent line vertical izquierda
        shape({
          id: "accent",
          kind: "rect",
          x: 6,
          y: 250,
          width: 12,
          height: 500,
          fill: BRAND.turquoise,
        }),
        // Logo cliente (image-placeholder pequeño)
        photoSlot({
          id: "logo",
          x: 80,
          y: 80,
          width: 280,
          height: 140,
          cornerRadius: 0,
          label: "Tu logo",
        }),
        // Datos contacto en columna derecha
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
        // Tagline en footer
        text({
          id: "tagline",
          x: 350,
          y: 420,
          text: "{tagline}",
          fontFamily: "Fredoka",
          fontSize: 18,
          fill: BRAND.coral,
          editable: true,
        }),
      ],
    },
  },
];

// ──────────────────────────────────────────────────────────────────
//  Soft-delete plantillas legacy (M.1.d) que no están en M.3.b.A
// ──────────────────────────────────────────────────────────────────

const PREMIUM_SLUGS = new Set(templatesData.map((t) => t.slug));

const legacy = await prisma.personalizationTemplate.findMany({
  where: { deletedAt: null, slug: { notIn: Array.from(PREMIUM_SLUGS) } },
  select: { id: true, slug: true, name: true },
});

if (legacy.length > 0) {
  console.log(`Soft-deleting ${legacy.length} plantillas legacy (M.1.d):`);
  for (const t of legacy) {
    await prisma.personalizationTemplate.update({
      where: { id: t.id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        deletedBy: "system:M.3.b.A-2026-05-13",
      },
    });
    console.log(`  - ${t.slug}`);
  }
  console.log("");
}

// ──────────────────────────────────────────────────────────────────
//  Upsert plantillas premium
// ──────────────────────────────────────────────────────────────────

console.log(`Creando/actualizando ${templatesData.length} plantillas premium A++...`);
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
  console.log(`  ✓ ${t.name}  [${t.kind}]  (${t.slug})`);
}

console.log("");
const total = await prisma.personalizationTemplate.count({ where: { deletedAt: null } });
const totalArchived = await prisma.personalizationTemplate.count({
  where: { deletedAt: { not: null } },
});
console.log(`Total activas: ${total} plantillas premium`);
console.log(`Total archivadas: ${totalArchived} legacy (recuperables vía admin)`);
console.log("");
console.log("Distribución por kind:");
for (const [kind, count] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${kind.padEnd(22)} ${count}`);
}
console.log("");
console.log("Listo. Próximo: M.3.b.B mockup contextual con sharp + 4 escenas.");

await prisma.$disconnect();
process.exit(0);

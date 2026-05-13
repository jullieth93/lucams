/*
 * Script de seed para plantillas iniciales del Estudio de Personalización.
 *
 * Sub-bloque M.1.d (2026-05-13): 30 plantillas base distribuidas por kind:
 *   - PHOTO_PACK              8 templates (Polaroid clásico/color, cuadrado mini,
 *                                          corazón vintage, circular floral, glass-magnet)
 *   - PHOTO_GRID              3 templates (Grid 3×3 minimal, 3×3 polaroid, 1×3 horizontal)
 *   - CALENDAR_PHOTO_MONTH    3 templates (Año floral, año minimal, año kawaii)
 *   - CALENDAR_PHOTO_HERO     2 templates (Hero clásico, hero + planner abajo)
 *   - EVENT_FAVOR             6 templates (Cumpleaños, bautizo, matrimonio,
 *                                          graduación, quinceañera, primer añito)
 *   - BUSINESS_LOGO           3 templates (Corporativo limpio, tarjeta minimal, evento)
 *   - CUSTOM_DECOR            3 templates (Mama día, parejas corazón, libre)
 *   - TEXT_ONLY               2 templates (Frase kawaii pastel, frase elegante)
 *
 * `canvasData` JSON sigue el formato del Estudio M.3 (react-konva):
 *   - stage: dimensiones canvas 1080×1080 (preview) → 6480×6480 al render 300 DPI
 *   - layers[]: capas ordenadas back→front
 *     - background: color sólido o gradient
 *     - image-placeholder: slot de foto del cliente (subido en estudio)
 *     - decoration: ilustración del template (frame, sticker, ornament)
 *     - text: texto editable o fijo según `editable: bool`
 *
 * `previewUrl` apunta a Unsplash temático MIENTRAS no haya thumbnails reales.
 * Cuando M.7 cierre, generamos renders reales del canvas y los subimos a
 * Supabase Storage bucket `design-previews`.
 *
 * Idempotente: upsert por slug.
 *
 * Uso: make seed-templates
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

console.log("=== seed-templates ===");
console.log("");

const UNSPLASH = (id) => `https://images.unsplash.com/photo-${id}?w=600&q=80&fit=crop`;

// ──────────── Canvas helpers ────────────
// Construyen `canvasData` JSON consumible por el editor M.3 (react-konva).

const BRAND = {
  purple: "#7C6AAD",
  purpleDark: "#3D2E5C",
  turquoise: "#5DD9D1",
  pink: "#E85B9F",
  coral: "#F58A6F",
  yellow: "#FFD93D",
  cream: "#FFF8F0",
};

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
    // El cliente arrastra una foto subida aquí. Mientras no hay foto, se
    // renderea un rect placeholder con la guía visual del slot.
  };
}

function text({ id, x, y, text: t, fontFamily = "Fredoka", fontSize = 48, fill = BRAND.purpleDark, editable = false, fontWeight = "normal", align = "center" }) {
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
    editable, // si true → el cliente puede cambiar el texto en el estudio
  };
}

function shape({ id, kind, x, y, width, height, fill, stroke, strokeWidth = 0, cornerRadius = 0, rotation = 0 }) {
  return { id, type: "shape", kind, x, y, width, height, fill, stroke, strokeWidth, cornerRadius, rotation };
}

function stage(width = 1080, height = 1080) {
  return { width, height, dpiPreview: 90, dpiProduction: 300 };
}

// ──────────── Templates ────────────

const templatesData = [
  // ──────── PHOTO_PACK (8) ────────
  {
    slug: "photo-pack-polaroid-clasico",
    kind: "PHOTO_PACK",
    name: "Polaroid Clásico",
    order: 1,
    previewUrl: UNSPLASH("1502920917128-1aa500764cbd"),
    canvasData: {
      version: 1,
      stage: stage(720, 920), // ratio polaroid 7:9
      layers: [
        background("#ffffff"),
        photoSlot({ id: "p1", x: 60, y: 60, width: 600, height: 700, cornerRadius: 0, label: "Tu foto" }),
        text({ id: "caption", x: 360, y: 820, text: "Tu mensaje aquí", fontSize: 40, fill: "#222", editable: true }),
      ],
    },
  },
  {
    slug: "photo-pack-polaroid-vintage",
    kind: "PHOTO_PACK",
    name: "Polaroid Vintage",
    order: 2,
    previewUrl: UNSPLASH("1518621736915-f3b1c41bfd00"),
    canvasData: {
      version: 1,
      stage: stage(720, 920),
      layers: [
        background("#F5EFE0"),
        photoSlot({ id: "p1", x: 60, y: 60, width: 600, height: 700, cornerRadius: 8, label: "Tu foto" }),
        text({ id: "caption", x: 360, y: 820, text: "Recuerdo · 2026", fontFamily: "Baloo 2", fontSize: 36, fill: "#5C3D2E", editable: true }),
      ],
    },
  },
  {
    slug: "photo-pack-cuadrado-minimal",
    kind: "PHOTO_PACK",
    name: "Cuadrado Minimalista",
    order: 3,
    previewUrl: UNSPLASH("1554080353-a576cf803bda"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1080),
      layers: [
        background("#FFFFFF"),
        photoSlot({ id: "p1", x: 40, y: 40, width: 1000, height: 1000, cornerRadius: 24, label: "Tu foto" }),
      ],
    },
  },
  {
    slug: "photo-pack-corazon-rosa",
    kind: "PHOTO_PACK",
    name: "Corazón Rosa",
    order: 4,
    previewUrl: UNSPLASH("1518621736915-f3b1c41bfd00"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1080),
      layers: [
        background(BRAND.pink),
        // Frame corazón decorativo
        shape({ id: "heart-frame", kind: "heart", x: 540, y: 540, width: 940, height: 940, fill: BRAND.cream }),
        photoSlot({ id: "p1", x: 200, y: 230, width: 680, height: 620, cornerRadius: 12, label: "Tu foto" }),
        text({ id: "caption", x: 540, y: 970, text: "Te amo", fontFamily: "Fredoka", fontSize: 56, fill: BRAND.purpleDark, editable: true }),
      ],
    },
  },
  {
    slug: "photo-pack-circular-floral",
    kind: "PHOTO_PACK",
    name: "Circular Floral",
    order: 5,
    previewUrl: UNSPLASH("1551836022-d5d88e9218df"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1080),
      layers: [
        background(BRAND.cream),
        // Frame circular con borde dorado
        shape({ id: "ring", kind: "circle", x: 540, y: 540, width: 980, height: 980, fill: "transparent", stroke: BRAND.coral, strokeWidth: 20 }),
        photoSlot({ id: "p1", x: 80, y: 80, width: 920, height: 920, cornerRadius: 460, label: "Tu foto" }),
      ],
    },
  },
  {
    slug: "photo-pack-glass-magnet",
    kind: "PHOTO_PACK",
    name: "Glass-Magnet Premium",
    order: 6,
    previewUrl: UNSPLASH("1604782206219-3b9576575203"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1080),
      layers: [
        background("#0F1419"),
        photoSlot({ id: "p1", x: 80, y: 80, width: 920, height: 920, cornerRadius: 460, label: "Tu foto" }),
        // Brillo lupa-vidrio simulado (capa de gradient blanco semitransparente top-left)
        shape({ id: "glass-shine", kind: "rect", x: 540, y: 540, width: 920, height: 920, fill: "rgba(255,255,255,0.12)", cornerRadius: 460 }),
      ],
    },
  },
  {
    slug: "photo-pack-mini-grid-pastel",
    kind: "PHOTO_PACK",
    name: "Mini Grid Pastel",
    order: 7,
    previewUrl: UNSPLASH("1502920917128-1aa500764cbd"),
    canvasData: {
      version: 1,
      stage: stage(800, 1000), // 4:5 ratio mini polaroid
      layers: [
        background("#FFE5EC"),
        photoSlot({ id: "p1", x: 60, y: 60, width: 680, height: 800, cornerRadius: 16, label: "Tu foto" }),
        text({ id: "tag", x: 400, y: 920, text: "🌸 mini", fontSize: 32, fill: BRAND.pink }),
      ],
    },
  },
  {
    slug: "photo-pack-banda-color",
    kind: "PHOTO_PACK",
    name: "Banda de Color",
    order: 8,
    previewUrl: UNSPLASH("1530541930197-ff16ac917b0e"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1080),
      layers: [
        background("#FFFFFF"),
        shape({ id: "band", kind: "rect", x: 540, y: 60, width: 1080, height: 80, fill: BRAND.turquoise }),
        photoSlot({ id: "p1", x: 40, y: 140, width: 1000, height: 900, cornerRadius: 8, label: "Tu foto" }),
      ],
    },
  },

  // ──────── PHOTO_GRID (3) ────────
  {
    slug: "photo-grid-3x3-minimal",
    kind: "PHOTO_GRID",
    name: "Grid 3×3 Minimal",
    order: 1,
    previewUrl: UNSPLASH("1502920917128-1aa500764cbd"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1080),
      grid: { cols: 3, rows: 3 },
      layers: [
        background("#FFFFFF"),
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
            cornerRadius: 16,
            label: `Foto ${i + 1}`,
          });
        }),
      ],
    },
  },
  {
    slug: "photo-grid-3x3-polaroid",
    kind: "PHOTO_GRID",
    name: "Grid 3×3 Polaroid",
    order: 2,
    previewUrl: UNSPLASH("1502920917128-1aa500764cbd"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1080),
      grid: { cols: 3, rows: 3 },
      layers: [
        background(BRAND.cream),
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
            height: cell - 50,
            cornerRadius: 4,
            label: `Foto ${i + 1}`,
          });
        }),
      ],
    },
  },
  {
    slug: "photo-grid-1x3-horizontal",
    kind: "PHOTO_GRID",
    name: "Grid Horizontal Tríptico",
    order: 3,
    previewUrl: UNSPLASH("1547119957-637f8679db1e"),
    canvasData: {
      version: 1,
      stage: stage(1620, 540), // 3:1 horizontal
      grid: { cols: 3, rows: 1 },
      layers: [
        background("#FFFFFF"),
        photoSlot({ id: "p1", x: 20, y: 20, width: 500, height: 500, cornerRadius: 12, label: "Foto 1" }),
        photoSlot({ id: "p2", x: 560, y: 20, width: 500, height: 500, cornerRadius: 12, label: "Foto 2" }),
        photoSlot({ id: "p3", x: 1100, y: 20, width: 500, height: 500, cornerRadius: 12, label: "Foto 3" }),
      ],
    },
  },

  // ──────── CALENDAR_PHOTO_MONTH (3) ────────
  {
    slug: "calendar-month-floral",
    kind: "CALENDAR_PHOTO_MONTH",
    name: "Calendario Floral 2026",
    order: 1,
    previewUrl: UNSPLASH("1606166187734-a4cb74079037"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1400), // A4-ish ratio
      monthsRequired: 12,
      perMonth: {
        layers: [
          background(BRAND.cream),
          shape({ id: "floral-bg", kind: "rect", x: 540, y: 200, width: 1080, height: 400, fill: BRAND.pink, cornerRadius: 0 }),
          photoSlot({ id: "p1", x: 90, y: 90, width: 900, height: 700, cornerRadius: 12, label: "Foto del mes" }),
          text({ id: "month-name", x: 540, y: 870, text: "{month}", fontSize: 56, fill: BRAND.purpleDark, fontFamily: "Fredoka" }),
          text({ id: "year", x: 540, y: 950, text: "2026", fontSize: 36, fill: BRAND.purple }),
          // Grid días — placeholder, lo construye M.3 dinámico
        ],
      },
    },
  },
  {
    slug: "calendar-month-minimal",
    kind: "CALENDAR_PHOTO_MONTH",
    name: "Calendario Minimalista 2026",
    order: 2,
    previewUrl: UNSPLASH("1606166187734-a4cb74079037"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1400),
      monthsRequired: 12,
      perMonth: {
        layers: [
          background("#FFFFFF"),
          photoSlot({ id: "p1", x: 40, y: 40, width: 1000, height: 800, cornerRadius: 0, label: "Foto del mes" }),
          text({ id: "month-name", x: 540, y: 900, text: "{month}", fontSize: 64, fill: "#222", fontFamily: "Inter", fontWeight: "bold" }),
          text({ id: "year", x: 540, y: 980, text: "2026", fontSize: 28, fill: "#666" }),
        ],
      },
    },
  },
  {
    slug: "calendar-month-kawaii",
    kind: "CALENDAR_PHOTO_MONTH",
    name: "Calendario Kawaii 2026",
    order: 3,
    previewUrl: UNSPLASH("1606166187734-a4cb74079037"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1400),
      monthsRequired: 12,
      perMonth: {
        layers: [
          background(BRAND.yellow),
          shape({ id: "card", kind: "rect", x: 540, y: 500, width: 980, height: 880, fill: "#FFFFFF", cornerRadius: 32 }),
          photoSlot({ id: "p1", x: 90, y: 100, width: 900, height: 700, cornerRadius: 24, label: "Foto del mes" }),
          text({ id: "month-name", x: 540, y: 880, text: "{month}", fontSize: 56, fill: BRAND.purple, fontFamily: "Fredoka" }),
        ],
      },
    },
  },

  // ──────── CALENDAR_PHOTO_HERO (2) ────────
  {
    slug: "calendar-hero-classic",
    kind: "CALENDAR_PHOTO_HERO",
    name: "Hero Clásico + Planner",
    order: 1,
    previewUrl: UNSPLASH("1577563908411-5077b6dc7624"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1620), // A3 ratio
      layers: [
        background("#FFFFFF"),
        photoSlot({ id: "p1", x: 40, y: 40, width: 1000, height: 600, cornerRadius: 12, label: "Foto Hero" }),
        // El planner debajo lo construye M.3 dinámicamente
        text({ id: "title", x: 540, y: 720, text: "{title}", fontSize: 48, fill: BRAND.purpleDark, editable: true }),
      ],
    },
  },
  {
    slug: "calendar-hero-kawaii",
    kind: "CALENDAR_PHOTO_HERO",
    name: "Hero Kawaii + Planner",
    order: 2,
    previewUrl: UNSPLASH("1577563908411-5077b6dc7624"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1620),
      layers: [
        background(BRAND.cream),
        shape({ id: "hero-frame", kind: "rect", x: 540, y: 360, width: 1000, height: 640, fill: "#FFFFFF", cornerRadius: 32 }),
        photoSlot({ id: "p1", x: 60, y: 60, width: 960, height: 600, cornerRadius: 24, label: "Foto Hero" }),
        text({ id: "title", x: 540, y: 730, text: "Mis metas 2026", fontSize: 56, fill: BRAND.purple, editable: true, fontFamily: "Fredoka" }),
      ],
    },
  },

  // ──────── EVENT_FAVOR (6) ────────
  {
    slug: "event-cumpleanos-kawaii",
    kind: "EVENT_FAVOR",
    name: "Cumpleaños Kawaii",
    order: 1,
    previewUrl: UNSPLASH("1530103862676-de8c9debad1d"),
    canvasData: {
      version: 1,
      stage: stage(800, 800),
      layers: [
        background(BRAND.yellow),
        shape({ id: "card", kind: "rect", x: 400, y: 400, width: 700, height: 700, fill: "#FFFFFF", cornerRadius: 24 }),
        photoSlot({ id: "p1", x: 100, y: 80, width: 600, height: 400, cornerRadius: 16, label: "Foto opcional" }),
        text({ id: "celebrante", x: 400, y: 540, text: "{name}", fontSize: 56, fill: BRAND.purple, editable: true, fontFamily: "Fredoka" }),
        text({ id: "edad", x: 400, y: 620, text: "{age} años", fontSize: 36, fill: BRAND.pink, editable: true }),
        text({ id: "fecha", x: 400, y: 700, text: "{date}", fontSize: 28, fill: BRAND.purpleDark, editable: true }),
      ],
    },
  },
  {
    slug: "event-bautizo-tierno",
    kind: "EVENT_FAVOR",
    name: "Bautizo Tierno",
    order: 2,
    previewUrl: UNSPLASH("1525258946800-98cfd641d0de"),
    canvasData: {
      version: 1,
      stage: stage(800, 800),
      layers: [
        background("#E8F5FF"),
        photoSlot({ id: "p1", x: 80, y: 60, width: 640, height: 420, cornerRadius: 320, label: "Foto del bebé" }),
        text({ id: "babyName", x: 400, y: 540, text: "{babyName}", fontSize: 56, fill: BRAND.purple, editable: true, fontFamily: "Fredoka" }),
        text({ id: "fecha", x: 400, y: 620, text: "Bautizo · {date}", fontSize: 28, fill: BRAND.purpleDark, editable: true }),
        text({ id: "venue", x: 400, y: 700, text: "{venue}", fontSize: 24, fill: BRAND.coral, editable: true }),
      ],
    },
  },
  {
    slug: "event-matrimonio-floral",
    kind: "EVENT_FAVOR",
    name: "Matrimonio Floral",
    order: 3,
    previewUrl: UNSPLASH("1519741497674-611481863552"),
    canvasData: {
      version: 1,
      stage: stage(800, 1000),
      layers: [
        background(BRAND.cream),
        photoSlot({ id: "p1", x: 60, y: 60, width: 680, height: 600, cornerRadius: 12, label: "Foto pareja (opcional)" }),
        text({ id: "coupleNames", x: 400, y: 740, text: "{coupleNames}", fontSize: 48, fill: BRAND.purpleDark, editable: true, fontFamily: "Fredoka" }),
        text({ id: "fecha", x: 400, y: 820, text: "{date}", fontSize: 28, fill: BRAND.purple, editable: true }),
        text({ id: "venue", x: 400, y: 880, text: "{venue}", fontSize: 22, fill: BRAND.coral, editable: true }),
      ],
    },
  },
  {
    slug: "event-graduacion-dorado",
    kind: "EVENT_FAVOR",
    name: "Graduación Dorado",
    order: 4,
    previewUrl: UNSPLASH("1523580494863-6f3031224c94"),
    canvasData: {
      version: 1,
      stage: stage(800, 800),
      layers: [
        background(BRAND.purpleDark),
        shape({ id: "card", kind: "rect", x: 400, y: 400, width: 720, height: 720, fill: "#FFFFFF", cornerRadius: 16 }),
        photoSlot({ id: "p1", x: 100, y: 80, width: 600, height: 440, cornerRadius: 8, label: "Foto graduado" }),
        text({ id: "graduate", x: 400, y: 580, text: "{graduateName}", fontSize: 48, fill: BRAND.purple, editable: true, fontFamily: "Fredoka" }),
        text({ id: "degree", x: 400, y: 650, text: "{degree}", fontSize: 30, fill: "#666", editable: true }),
        text({ id: "fecha", x: 400, y: 720, text: "{date}", fontSize: 24, fill: BRAND.coral, editable: true }),
      ],
    },
  },
  {
    slug: "event-quinceanera-rosa",
    kind: "EVENT_FAVOR",
    name: "Quinceañera Rosa",
    order: 5,
    previewUrl: UNSPLASH("1525258946800-98cfd641d0de"),
    canvasData: {
      version: 1,
      stage: stage(800, 1000),
      layers: [
        background(BRAND.pink),
        shape({ id: "card", kind: "rect", x: 400, y: 500, width: 720, height: 920, fill: "#FFFFFF", cornerRadius: 24 }),
        photoSlot({ id: "p1", x: 80, y: 80, width: 640, height: 640, cornerRadius: 320, label: "Foto quinceañera" }),
        text({ id: "name", x: 400, y: 780, text: "{quinceaneraName}", fontSize: 52, fill: BRAND.purple, editable: true, fontFamily: "Fredoka" }),
        text({ id: "fecha", x: 400, y: 870, text: "Mis XV · {date}", fontSize: 30, fill: BRAND.coral, editable: true }),
      ],
    },
  },
  {
    slug: "event-primer-anito",
    kind: "EVENT_FAVOR",
    name: "Mi Primer Añito",
    order: 6,
    previewUrl: UNSPLASH("1525258946800-98cfd641d0de"),
    canvasData: {
      version: 1,
      stage: stage(800, 800),
      layers: [
        background("#FFE5EC"),
        photoSlot({ id: "p1", x: 80, y: 80, width: 640, height: 480, cornerRadius: 24, label: "Foto del bebé" }),
        text({ id: "babyName", x: 400, y: 620, text: "{babyName}", fontSize: 48, fill: BRAND.purple, editable: true, fontFamily: "Fredoka" }),
        text({ id: "edad", x: 400, y: 690, text: "Mi primer añito", fontSize: 28, fill: BRAND.pink }),
        text({ id: "fecha", x: 400, y: 750, text: "{birthDate}", fontSize: 22, fill: BRAND.purpleDark, editable: true }),
      ],
    },
  },

  // ──────── BUSINESS_LOGO (3) ────────
  {
    slug: "business-corporativo-limpio",
    kind: "BUSINESS_LOGO",
    name: "Corporativo Limpio",
    order: 1,
    previewUrl: UNSPLASH("1606166187734-a4cb74079037"),
    canvasData: {
      version: 1,
      stage: stage(700, 500), // 7×5 cm rectangular
      layers: [
        background("#FFFFFF"),
        photoSlot({ id: "logo", x: 350, y: 150, width: 500, height: 200, cornerRadius: 0, label: "Tu logo" }),
        text({ id: "phone", x: 350, y: 340, text: "{phone}", fontSize: 22, fill: "#222", editable: true }),
        text({ id: "email", x: 350, y: 380, text: "{email}", fontSize: 22, fill: "#222", editable: true }),
        text({ id: "web", x: 350, y: 420, text: "{website}", fontSize: 22, fill: BRAND.purple, editable: true }),
      ],
    },
  },
  {
    slug: "business-tarjeta-minimal",
    kind: "BUSINESS_LOGO",
    name: "Tarjeta Presentación Minimal",
    order: 2,
    previewUrl: UNSPLASH("1606166187734-a4cb74079037"),
    canvasData: {
      version: 1,
      stage: stage(900, 500), // 9×5 cm
      layers: [
        background(BRAND.purpleDark),
        shape({ id: "accent", kind: "rect", x: 0, y: 250, width: 12, height: 500, fill: BRAND.turquoise }),
        text({ id: "name", x: 460, y: 130, text: "{name}", fontSize: 38, fill: "#FFFFFF", editable: true, fontFamily: "Fredoka", align: "left" }),
        text({ id: "title", x: 460, y: 180, text: "{title}", fontSize: 22, fill: BRAND.turquoise, editable: true, align: "left" }),
        text({ id: "phone", x: 460, y: 280, text: "{phone}", fontSize: 20, fill: "#FFFFFF", editable: true, align: "left" }),
        text({ id: "email", x: 460, y: 320, text: "{email}", fontSize: 20, fill: "#FFFFFF", editable: true, align: "left" }),
        text({ id: "company", x: 460, y: 380, text: "{company}", fontSize: 20, fill: BRAND.turquoise, editable: true, align: "left" }),
      ],
    },
  },
  {
    slug: "business-evento-corporativo",
    kind: "BUSINESS_LOGO",
    name: "Evento Corporativo",
    order: 3,
    previewUrl: UNSPLASH("1606166187734-a4cb74079037"),
    canvasData: {
      version: 1,
      stage: stage(600, 600),
      layers: [
        background(BRAND.cream),
        shape({ id: "border", kind: "rect", x: 300, y: 300, width: 560, height: 560, fill: "transparent", stroke: BRAND.purple, strokeWidth: 8, cornerRadius: 24 }),
        photoSlot({ id: "logo", x: 100, y: 80, width: 400, height: 200, cornerRadius: 0, label: "Tu logo" }),
        text({ id: "tagline", x: 300, y: 330, text: "{tagline}", fontSize: 28, fill: BRAND.purpleDark, editable: true, fontFamily: "Fredoka" }),
        text({ id: "event", x: 300, y: 420, text: "{eventName}", fontSize: 24, fill: BRAND.coral, editable: true }),
        text({ id: "date", x: 300, y: 480, text: "{date}", fontSize: 20, fill: BRAND.purple, editable: true }),
      ],
    },
  },

  // ──────── CUSTOM_DECOR (3) ────────
  {
    slug: "decor-mama-dia",
    kind: "CUSTOM_DECOR",
    name: "Día de la Madre",
    order: 1,
    previewUrl: UNSPLASH("1549465220-1a8b9238cd48"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1080),
      layers: [
        background("#FFE5EC"),
        photoSlot({ id: "p1", x: 540, y: 460, width: 800, height: 800, cornerRadius: 400, label: "Foto con mamá" }),
        text({ id: "title", x: 540, y: 920, text: "Mamá, te amo", fontSize: 56, fill: BRAND.pink, editable: true, fontFamily: "Fredoka" }),
        text({ id: "year", x: 540, y: 990, text: "2026", fontSize: 28, fill: BRAND.purpleDark }),
      ],
    },
  },
  {
    slug: "decor-pareja-corazon",
    kind: "CUSTOM_DECOR",
    name: "Pareja Corazón",
    order: 2,
    previewUrl: UNSPLASH("1518621736915-f3b1c41bfd00"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1080),
      layers: [
        background(BRAND.coral),
        shape({ id: "heart-frame", kind: "heart", x: 540, y: 540, width: 920, height: 920, fill: "#FFFFFF" }),
        photoSlot({ id: "p1", x: 200, y: 240, width: 680, height: 580, cornerRadius: 24, label: "Foto pareja" }),
        text({ id: "names", x: 540, y: 900, text: "{names}", fontSize: 44, fill: BRAND.purpleDark, editable: true, fontFamily: "Fredoka" }),
        text({ id: "date", x: 540, y: 970, text: "{anniversaryDate}", fontSize: 26, fill: BRAND.pink, editable: true }),
      ],
    },
  },
  {
    slug: "decor-libre",
    kind: "CUSTOM_DECOR",
    name: "Composición Libre",
    order: 3,
    previewUrl: UNSPLASH("1513519245088-0e12902e5a38"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1080),
      layers: [
        background("#FFFFFF"),
        photoSlot({ id: "p1", x: 540, y: 540, width: 1000, height: 1000, cornerRadius: 12, label: "Tu composición" }),
      ],
    },
  },

  // ──────── TEXT_ONLY (2) ────────
  {
    slug: "text-frase-pastel",
    kind: "TEXT_ONLY",
    name: "Frase Pastel",
    order: 1,
    previewUrl: UNSPLASH("1530989054533-9c3e6daa5b9e"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1080),
      layers: [
        background("#FFF0F5"),
        text({ id: "frase", x: 540, y: 540, text: "Tu frase aquí", fontSize: 80, fill: BRAND.purple, editable: true, fontFamily: "Fredoka", fontWeight: "bold" }),
        text({ id: "sub", x: 540, y: 700, text: "— Lucams", fontSize: 28, fill: BRAND.pink, editable: true }),
      ],
    },
  },
  {
    slug: "text-frase-elegante",
    kind: "TEXT_ONLY",
    name: "Frase Elegante",
    order: 2,
    previewUrl: UNSPLASH("1530989054533-9c3e6daa5b9e"),
    canvasData: {
      version: 1,
      stage: stage(1080, 1080),
      layers: [
        background(BRAND.purpleDark),
        text({ id: "frase", x: 540, y: 480, text: "Tu frase aquí", fontSize: 72, fill: "#FFFFFF", editable: true, fontFamily: "Baloo 2" }),
        shape({ id: "divider", kind: "rect", x: 540, y: 620, width: 120, height: 4, fill: BRAND.turquoise }),
        text({ id: "sub", x: 540, y: 700, text: "— Lucams", fontSize: 28, fill: BRAND.turquoise, editable: true }),
      ],
    },
  },
];

// ──────────── Upsert por slug ────────────

console.log(`Creando/actualizando ${templatesData.length} plantillas...`);
const byKind = {};
for (const t of templatesData) {
  const template = await prisma.personalizationTemplate.upsert({
    where: { slug: t.slug },
    update: {
      kind: t.kind,
      name: t.name,
      previewUrl: t.previewUrl,
      canvasData: t.canvasData,
      order: t.order,
      isActive: true,
      deletedAt: null,
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
console.log(`Total en DB: ${total} plantillas activas.`);
console.log("");
console.log("Distribución por kind:");
for (const [kind, count] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${kind.padEnd(22)} ${count}`);
}
console.log("");
console.log("Listo. El estudio M.3 leerá estas plantillas por kind.");

await prisma.$disconnect();
process.exit(0);

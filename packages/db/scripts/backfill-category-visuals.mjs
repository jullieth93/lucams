/*
 * backfill-category-visuals.mjs — ONE-SHOT roadmap B3 (2026-07-30)
 *
 * El icono/gradiente de las categorías vivía QUEMADO por slug en código
 * (CATEGORY_STYLES de apps/web/components/home/category-grid.tsx e ICONS de
 * apps/web/components/shop-mega-menu.tsx): una categoría nueva no podía
 * tener icono sin tocar código. Ahora son columnas de Category (dato de
 * catálogo, editable en /admin/categorias — NO es contenido CMS).
 *
 * Este script siembra esos defaults en la DB:
 *   1. Para cada categoría ACTIVA (isActive + no borrada) cuyo slug matchea
 *      el mapa histórico, setea icon/gradient.
 *   2. IDEMPOTENTE: solo rellena columnas NULL — nunca pisa un valor que
 *      Lucy ya haya editado a mano en el admin.
 *   3. Categorías sin match en el mapa quedan NULL → el storefront cae al
 *      fallback genérico (mismo comportamiento que antes).
 *
 * El mapa de acá es copia de los dos mapas hardcodeados al 2026-07-30
 * (la fuente canónica post-B3 es apps/web/lib/category-visuals.ts).
 *
 * Uso: pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/backfill-category-visuals.mjs
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

// slug → defaults visuales históricos (icono lucide + gradiente tailwind).
// Los slugs que solo tenían icono en el mega-menú (sin card en home) no
// llevan gradient → su columna gradient queda NULL (fallback default).
const VISUAL_DEFAULTS = {
  // Home grid (CATEGORY_STYLES): icono + gradiente.
  "foto-imanes": {
    icon: "Camera",
    gradient: "from-brand-purple/20 via-brand-pink/20 to-brand-coral/20",
  },
  "recuerdos-eventos": {
    icon: "PartyPopper",
    gradient: "from-brand-coral/25 via-brand-yellow/25 to-brand-pink/15",
  },
  organizate: {
    icon: "ClipboardList",
    gradient: "from-brand-turquoise/25 via-brand-cream to-brand-purple/15",
  },
  calendarios: {
    icon: "Calendar",
    gradient: "from-brand-yellow/30 via-brand-coral/15 to-brand-purple/15",
  },
  pequenes: {
    icon: "Baby",
    gradient: "from-brand-pink/25 via-brand-turquoise/20 to-brand-yellow/20",
  },
  "decora-espacio": {
    icon: "Frame",
    gradient: "from-brand-purple/20 via-brand-cream to-brand-turquoise/25",
  },
  "regalos-corazon": {
    icon: "Heart",
    gradient: "from-brand-pink/30 via-brand-coral/20 to-brand-purple/15",
  },
  // Mega-menú (ICONS): solo icono.
  recuerdos: { icon: "PartyPopper" },
  publicitarios: { icon: "Briefcase" },
  "regalos-personalizados": { icon: "Gift" },
  "de-temporada": { icon: "Snowflake" },
  "cuadros-decoracion": { icon: "Frame" },
  separadores: { icon: "Bookmark" },
  coleccionables: { icon: "Sparkles" },
  "juegos-aprendizaje": { icon: "GraduationCap" },
};

console.log("=== backfill-category-visuals (roadmap B3, 2026-07-30) ===\n");

let updated = 0;
let untouched = 0;
let noMatch = 0;

const categories = await prisma.category.findMany({
  where: { deletedAt: null, isActive: true },
  select: { id: true, slug: true, name: true, icon: true, gradient: true },
});

for (const cat of categories) {
  const defaults = VISUAL_DEFAULTS[cat.slug];
  if (!defaults) {
    console.log(`  · ${cat.slug}: sin match en el mapa histórico — queda NULL (fallback genérico)`);
    noMatch++;
    continue;
  }

  // Solo rellenar lo que esté NULL (no pisar ediciones del admin).
  const data = {};
  if (cat.icon === null && defaults.icon) data.icon = defaults.icon;
  if (cat.gradient === null && defaults.gradient) data.gradient = defaults.gradient;

  if (Object.keys(data).length === 0) {
    console.log(`  · ${cat.slug}: ya tenía valores — skip`);
    untouched++;
    continue;
  }

  await prisma.category.update({ where: { id: cat.id }, data });
  console.log(`  ✓ ${cat.slug} (${cat.name}): ${JSON.stringify(data)}`);
  updated++;
}

console.log(
  `\n=== Done. ${updated} categorías actualizadas, ${untouched} ya tenían valores, ${noMatch} sin match (quedan con fallback) ===`,
);
await prisma.$disconnect();

/*
 * Visuales de categoría (roadmap B3) — icono + gradiente del home grid y el
 * mega-menú.
 *
 * Decisión de dominio: el visual de una categoría es DATO DE CATÁLOGO, no
 * contenido editorial → vive en las columnas `Category.icon` / `Category.gradient`
 * y se edita desde /admin/categorias. NO va en el CMS.
 *
 * Orden de precedencia al pintar (resolveCategoryIcon / resolveCategoryGradient):
 *   1. Valor de BD (Category.icon / Category.gradient), si existe.
 *   2. Mapa fallback por slug (CATEGORY_STYLE_FALLBACK — los defaults de marca
 *      que antes estaban quemados como ÚNICA fuente en
 *      components/home/category-grid.tsx y components/shop-mega-menu.tsx).
 *   3. DEFAULT_CATEGORY_STYLE genérico.
 *
 * El string de BD se mapea al componente lucide con el mapa EXPLÍCITO
 * CATEGORY_ICONS (subset curado, imports estáticos) — nunca import dinámico:
 * un nombre que no está en el subset cae al icono default.
 */

import {
  Baby,
  Bookmark,
  Briefcase,
  Calendar,
  Camera,
  ClipboardList,
  Frame,
  Gift,
  GraduationCap,
  Heart,
  Image,
  Package,
  PartyPopper,
  Snowflake,
  Sparkles,
  Star,
  Tag,
  type LucideIcon,
} from "lucide-react";

// Subset curado de iconos lucide disponibles para `Category.icon`: los que ya
// usaban los mapas hardcodeados + unos pocos obvios extra para categorías
// futuras. El picker del admin ofrece estos mismos (CATEGORY_ICON_OPTIONS).
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Baby,
  Bookmark,
  Briefcase,
  Calendar,
  Camera,
  ClipboardList,
  Frame,
  Gift,
  GraduationCap,
  Heart,
  Image,
  Package,
  PartyPopper,
  Snowflake,
  Sparkles,
  Star,
  Tag,
};

export const DEFAULT_CATEGORY_ICON = "Camera";
export const DEFAULT_CATEGORY_GRADIENT =
  "from-brand-purple/15 via-brand-cream to-brand-turquoise/15";

// Opciones del picker de iconos en /admin/categorias (datalist + preview).
export const CATEGORY_ICON_OPTIONS = Object.keys(CATEGORY_ICONS);

// Mapa fallback por slug (antes quemado como única fuente). Hoy es el
// SEGUNDO nivel de precedencia: solo aplica cuando la columna de BD es NULL.
// Los slugs que solo tenían icono en el mega-menú no llevan gradiente → caen
// al gradiente default.
const CATEGORY_STYLE_FALLBACK: Record<string, { icon: string; gradient?: string }> = {
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
  recuerdos: { icon: "PartyPopper" },
  publicitarios: { icon: "Briefcase" },
  "regalos-personalizados": { icon: "Gift" },
  "de-temporada": { icon: "Snowflake" },
  "cuadros-decoracion": { icon: "Frame" },
  separadores: { icon: "Bookmark" },
  coleccionables: { icon: "Sparkles" },
  "juegos-aprendizaje": { icon: "GraduationCap" },
};

// Gradientes de marca existentes: opciones del picker en el admin (datalist +
// swatch preview). OJO: las clases deben quedar como strings literales en el
// código para que Tailwind las genere (safelist manual implícita).
export const CATEGORY_GRADIENT_OPTIONS: { value: string; label: string }[] = [
  {
    value: "from-brand-purple/20 via-brand-pink/20 to-brand-coral/20",
    label: "Morado → rosa → coral",
  },
  {
    value: "from-brand-coral/25 via-brand-yellow/25 to-brand-pink/15",
    label: "Coral → amarillo → rosa",
  },
  {
    value: "from-brand-turquoise/25 via-brand-cream to-brand-purple/15",
    label: "Turquesa → crema → morado",
  },
  {
    value: "from-brand-yellow/30 via-brand-coral/15 to-brand-purple/15",
    label: "Amarillo → coral → morado",
  },
  {
    value: "from-brand-pink/25 via-brand-turquoise/20 to-brand-yellow/20",
    label: "Rosa → turquesa → amarillo",
  },
  {
    value: "from-brand-purple/20 via-brand-cream to-brand-turquoise/25",
    label: "Morado → crema → turquesa",
  },
  {
    value: "from-brand-pink/30 via-brand-coral/20 to-brand-purple/15",
    label: "Rosa → coral → morado",
  },
  { value: DEFAULT_CATEGORY_GRADIENT, label: "Default suave (morado/crema/turquesa)" },
];

/** Resuelve el componente lucide a pintar: BD → fallback por slug → default.
 *  Un nombre que no está en el subset curado cae al icono default (nunca rompe). */
export function resolveCategoryIcon(icon: string | null | undefined, slug: string): LucideIcon {
  const name = icon ?? CATEGORY_STYLE_FALLBACK[slug]?.icon ?? DEFAULT_CATEGORY_ICON;
  return CATEGORY_ICONS[name] ?? CATEGORY_ICONS[DEFAULT_CATEGORY_ICON];
}

/** Resuelve las clases del gradiente a pintar: BD → fallback por slug → default. */
export function resolveCategoryGradient(gradient: string | null | undefined, slug: string): string {
  return gradient ?? CATEGORY_STYLE_FALLBACK[slug]?.gradient ?? DEFAULT_CATEGORY_GRADIENT;
}

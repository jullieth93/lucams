/*
 * Font picker — M.3.b.D (2026-05-14).
 *
 * Fuentes disponibles para text overlays editables del cliente.
 *
 * Constraint técnico crítico: Konva rasteriza el SVG asset vía useImage,
 * pero los Konva.Text nodes son texto NATIVO renderizado vía canvas2D.
 * Eso significa que las fuentes que aparecen acá DEBEN estar disponibles
 * en el browser del cliente, sea como:
 *   - Web-safe fallback (Arial, Helvetica, Georgia, Times)
 *   - Fonts brand cargadas vía CSS @import en globals.css (Fredoka, Baloo 2,
 *     Inter, Caveat, Patrick Hand) — esto SÍ funciona para Konva.Text
 *     porque el canvas2D usa las fuentes cargadas en el documento HTML.
 *
 * IMPORTANTE: cuando el cliente cambia el font de un text overlay, Konva
 * tiene que cachear el text node + rerenderizar. Esto es automático si
 * Konva.Text recibe `fontFamily` prop y la font ya está cargada.
 */

export type FontPreset = {
  /** Nombre técnico del font-family (debe estar disponible en el browser). */
  fontFamily: string;
  /** Etiqueta humana en es-CO tuteo. */
  label: string;
  /** Mood / cuándo usarlo. */
  mood: string;
  /** Categoría visual para agrupar en el UI. */
  category: "display" | "handwriting" | "serif" | "sans" | "mono";
};

/**
 * 5 fuentes pre-armadas — TODAS están disponibles en el browser sin pasos
 * extra (Fredoka + Inter cargadas vía next/font en layout.tsx; Georgia,
 * Helvetica/Arial, Courier son system-safe).
 *
 * Para agregar más fonts (Baloo 2, Caveat, Patrick Hand), primero hay que
 * importarlas en app/layout.tsx vía next/font/google y exponer la variable.
 */
export const FONT_PRESETS: FontPreset[] = [
  {
    fontFamily: "Fredoka, sans-serif",
    label: "Fredoka",
    mood: "Kawaii, redondeado, brand Lucams principal",
    category: "display",
  },
  {
    fontFamily: "Inter, sans-serif",
    label: "Inter",
    mood: "Limpio moderno, social posts",
    category: "sans",
  },
  {
    fontFamily: "Georgia, serif",
    label: "Georgia",
    mood: "Elegante, weddings, bautismos",
    category: "serif",
  },
  {
    fontFamily: "Helvetica, Arial, sans-serif",
    label: "Helvetica",
    mood: "Clásico universal, neutro",
    category: "sans",
  },
  {
    fontFamily: '"Courier New", monospace',
    label: "Mono",
    mood: "Tipo máquina de escribir, vintage",
    category: "mono",
  },
];

/**
 * Devuelve el FontPreset que matchea el fontFamily, o el primero (Fredoka)
 * como default si no se encuentra.
 */
export function getFontPreset(fontFamily: string | undefined): FontPreset {
  if (!fontFamily) return FONT_PRESETS[0];
  const match = FONT_PRESETS.find((f) => f.fontFamily === fontFamily);
  return match ?? FONT_PRESETS[0];
}

/**
 * Paleta de colores brand pre-armada para text overlays. Solo los colores
 * que tienen contraste suficiente para texto legible (sage-green muy claro
 * se omite porque cuesta leer).
 */
export type TextColorPreset = {
  /** HEX */
  color: string;
  /** Token brand */
  token: string;
  /** Etiqueta human */
  label: string;
};

export const TEXT_COLOR_PRESETS: TextColorPreset[] = [
  { color: "#262626", token: "neutral-900", label: "Negro" },
  { color: "#666666", token: "neutral-500", label: "Gris" },
  { color: "#3D2E5C", token: "purple-dark", label: "Morado oscuro" },
  { color: "#7C6AAD", token: "purple", label: "Morado Lucams" },
  { color: "#E85B9F", token: "pink", label: "Rosa" },
  { color: "#F58A6F", token: "coral", label: "Coral" },
  { color: "#D4AF37", token: "gold", label: "Dorado" },
  { color: "#5DD9D1", token: "turquoise", label: "Turquesa" },
  { color: "#FFFFFF", token: "white", label: "Blanco" },
];

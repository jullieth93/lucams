/*
 * Constantes de marca del Estudio — fuente única de los colores usados en
 * las delimitaciones de slots y las guías de edición del canvas.
 *
 * Los valores replican la paleta de globals.css:
 *   --brand-purple:    #7c6aad  → rgb(124, 106, 173)
 *   --brand-turquoise: #5dd9d1  → rgb(93, 217, 209)
 * Se declaran como canales RGB para componer rgba() con opacidades por estado
 * (los estados progresivos de las guías de drop — C1, owner 2026-09-15).
 */

/** Canales RGB del morado de marca (#7C6AAD). */
export const BRAND_PURPLE_RGB = "124, 106, 173";
/** Canales RGB del turquesa de marca (#5DD9D1). */
export const BRAND_TURQUOISE_RGB = "93, 217, 209";

/**
 * Delimitaciones progresivas del slot vacío (C1, owner 2026-09-15) — 3 niveles:
 *   a) Reposo:   contorno punteado morado sutil siempre visible (0.35).
 *   b) Hover:    misma guía a intensidad media (0.6).
 *   c) Drag-over: turquesa pleno (comportamiento histórico, intacto).
 * El relleno acompaña al contorno en cada nivel.
 */
export const SLOT_GUIDE_COLORS = {
  rest: `rgba(${BRAND_PURPLE_RGB}, 0.35)`,
  restFill: `rgba(${BRAND_PURPLE_RGB}, 0.05)`,
  hover: `rgba(${BRAND_PURPLE_RGB}, 0.6)`,
  hoverFill: `rgba(${BRAND_PURPLE_RGB}, 0.08)`,
  dropping: `rgb(${BRAND_TURQUOISE_RGB})`,
  droppingFill: `rgba(${BRAND_TURQUOISE_RGB}, 0.14)`,
} as const;

/**
 * B4 (owner 2026-09-15) — opacidad del texto GUÍA del placeholder en la grilla
 * del Estudio ("cómo se verá"): el default de la plantilla se dibuja atenuado
 * (~40%) para TODAS las plantillas con capas de texto editables. El nodo va
 * marcado `name="placeholder-guide edit-indicator"` → se oculta antes de cada
 * stage.toDataURL (snapshot de producción y preview de confirmación), igual
 * que el resto de adornos de pantalla.
 */
export const PLACEHOLDER_GUIDE_OPACITY = 0.4;

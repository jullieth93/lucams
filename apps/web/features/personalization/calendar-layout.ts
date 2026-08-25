/*
 * Layout de la TARJETA de un mes del calendario (ADR-063 CAL1 · rediseño 2026-07-22) — spec
 * compartido entre el compositor de producción (production-render-canvas) y el preview del
 * editor (compose-calendar-page), para que el encuadre del cliente mapee 1:1 (WYSIWYG).
 * Coordenadas en el stage lógico de la tarjeta.
 *
 * Producto: SET DE 12 TARJETAS mensuales de 7.5×10 cm (ratio exacto 3:4) — foto arriba +
 * mes abajo con festivos colombianos (referencia Lucy 2026-07-22). El calendario de pared
 * con espiral queda ARCHIVADO para este producto.
 *
 * Geometría:
 *   - Tarjeta 1080×1440 (= 7.5×10 cm a 300 DPI escalado ÷2.78... en px lógicos 3:4 exacto).
 *   - FOTO: franja superior full-bleed 1080×810 (ratio 4:3) — PROPORTIONAL a la ventana de
 *     foto de la plantilla del editor (600×450 sobre stage 600×800), así el photoTransform
 *     del cliente (pan/zoom) mapea 1:1 salvo el factor de escala 1080/600 = 1.8.
 *   - Debajo: título del mes en lettering grande ("ENE 2027"), encabezados de día, grilla
 *     y leyenda de festivos.
 *
 * Layouts (2026-08): la plantilla del producto elige la composición de la tarjeta via
 * `unitTemplate.calendarLayout` ("classic" | "split", default "classic"). "split" es la
 * variante lateral: foto redondeada con margen arriba y la banda inferior en DOS columnas
 * (mes gigante + año a la izquierda, grilla sin bordes a la derecha, sin leyenda).
 */

export const CALENDAR_PAGE = { width: 1080, height: 1440 } as const;

/** Layouts de la tarjeta de mes. "classic" = foto full-bleed + título centrado + grilla con
 *  bordes + leyenda (el original). "split" = foto redondeada con margen + banda en 2 columnas. */
export type CalendarLayoutKey = "classic" | "split";

// Región de foto: franja 4:3 full-bleed arriba (1080×810). Espeja la ventana de la plantilla
// del editor (600×450 en stage 600×800) — mismo ratio, factor 1.8.
export const CALENDAR_PHOTO = { x: 0, y: 0, width: 1080, height: 810 } as const;

// Región de foto del layout SPLIT: rectángulo redondeado CON margen blanco (54px) que termina
// en y=810 como el clásico. Ratio 972:756 = 9:7 exacto, espejo del photoSlot de la plantilla
// split del editor (30,30,540×420, cornerRadius 31 — todo ÷1.8) → encuadre 1:1 (WYSIWYG).
export const CALENDAR_PHOTO_SPLIT = {
  x: 54,
  y: 54,
  width: 972,
  height: 756,
  cornerRadius: 56,
} as const;

export const CALENDAR_LAYOUT = {
  // Título "ENE 2027" — lettering GRANDE (referencia Lucy: mes manuscrito protagonista).
  titleY: 952,
  titleFontSize: 104,
  // Encabezados de día (D L M M J V S) — baseline.
  weekdayY: 1046,
  weekdayFontSize: 34,
  // Grilla de días. gridBottom deja una franja abajo para la leyenda de festivos (FB3).
  gridTop: 1068,
  gridBottom: 1352,
  gridLeft: 60,
  gridRight: 1020, // ancho útil 960 → 7 columnas de ~137
  // FB3 — franja de leyenda de festivos colombianos, bajo la grilla (baseline + tamaño).
  legendY: 1406,
  legendFontSize: 26,
} as const;

// Banda inferior del layout SPLIT (y 810→1440) en dos columnas (referencia visual Lucy
// 2026-08): izquierda = mes abreviado GIGANTE + año debajo; derecha = encabezados de día y
// grilla SIN bordes de celda ni fondos (domingos y festivos en magenta). Sin leyenda al pie.
export const CALENDAR_LAYOUT_SPLIT = {
  // Columna izquierda — mes ("ENE") y año ("2027"), alineados a la izquierda.
  monthX: 84,
  monthY: 1010, // baseline
  monthFontSize: 170,
  yearX: 88,
  yearY: 1096, // baseline
  yearFontSize: 56,
  // Columna derecha — encabezados (baseline) y grilla sin bordes.
  weekdayY: 890, // baseline
  weekdayFontSize: 30,
  gridTop: 914,
  gridBottom: 1334,
  gridLeft: 470,
  gridRight: 1020, // ancho útil 550 → 7 columnas de ~78.6
  dayFontSize: 30,
} as const;

/** Región de foto de la página para el layout dado (el clásico no tiene cornerRadius). */
export function calendarPhotoFor(layout: CalendarLayoutKey): {
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius?: number;
} {
  return layout === "split" ? CALENDAR_PHOTO_SPLIT : CALENDAR_PHOTO;
}

/**
 * Lee el layout de calendario declarado por la plantilla (`unitTemplate.calendarLayout`).
 * Cualquier valor ausente/desconocido cae a "classic" — las plantillas viejas (y diseños ya
 * guardados) no cambian de look.
 */
export function calendarLayoutFromUnitTemplate(u: unknown): CalendarLayoutKey {
  if (!u || typeof u !== "object") return "classic";
  const v = (u as { calendarLayout?: unknown }).calendarLayout;
  return v === "split" ? "split" : "classic";
}

/**
 * Ancho del stage de la plantilla del editor para el que se capturó un photoTransform.
 * Los offsets (pan) se guardan en unidades del stage de la plantilla (600px de ancho);
 * la página de producción es de 1080 → hay que escalarlos al componer. `scale` NO se toca
 * (es un multiplicador adimensional sobre el cover, y las ventanas tienen el mismo ratio).
 */
export function scalePhotoTransformToPage(
  transform: { offsetX: number; offsetY: number; scale: number } | null | undefined,
  templateStageWidth: number | undefined,
): { offsetX: number; offsetY: number; scale: number } | null {
  if (!transform) return null;
  const from =
    templateStageWidth && templateStageWidth > 0 ? templateStageWidth : CALENDAR_PAGE.width;
  const factor = CALENDAR_PAGE.width / from;
  if (factor === 1) return { ...transform };
  return {
    offsetX: transform.offsetX * factor,
    offsetY: transform.offsetY * factor,
    scale: transform.scale,
  };
}

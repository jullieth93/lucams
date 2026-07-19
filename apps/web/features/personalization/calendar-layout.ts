/*
 * Layout de la PÁGINA de un mes del calendario (ADR-063 CAL1) — spec compartido entre el
 * compositor de producción (production-render-canvas) y el preview del editor (studio-slot), para
 * que el encuadre del cliente mapee 1:1 (WYSIWYG). Coordenadas en el stage lógico de la página.
 *
 * La región de FOTO ocupa el cuadrado superior full-width (1080×1080) — IDÉNTICO al slot cuadrado
 * del editor de calendario — así el photoTransform (offset/scale) del cliente se aplica sin
 * reescalar. Debajo va el título (mes + año), los encabezados de día y la grilla.
 */

export const CALENDAR_PAGE = { width: 1080, height: 1520 } as const;

// Región de foto: cuadrado full-width arriba. Igual al stage del slot del editor (1080×1080).
export const CALENDAR_PHOTO = { x: 0, y: 0, width: 1080, height: 1080 } as const;

export const CALENDAR_LAYOUT = {
  // Título "Enero 2027" — baseline y tamaño.
  titleY: 1180,
  titleFontSize: 62,
  // Encabezados de día (D L M M J V S) — baseline.
  weekdayY: 1268,
  weekdayFontSize: 30,
  // Grilla de días. gridBottom deja una franja abajo para la leyenda de festivos (FB3).
  gridTop: 1290,
  gridBottom: 1448,
  gridLeft: 30,
  gridRight: 1050, // ancho útil 1020 → 7 columnas de ~145.7
  // FB3 — franja de leyenda de festivos colombianos, bajo la grilla (baseline + tamaño).
  legendY: 1486,
  legendFontSize: 24,
} as const;

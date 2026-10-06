/*
 * Matemática del zoom del lightbox "Ver" del carrito (design-preview-dialog).
 *
 * La miniatura de la línea es pequeña y el PNG del diseño puede tener texto
 * chico (tiras/separadores): el cliente necesita acercar para revisarlo antes
 * de pagar. El estado del zoom vive en el componente; acá solo hay funciones
 * puras (clamp de escala, pasos de los botones y de la rueda, ratio del pinch,
 * pan anclado al cursor, límite del pan) para que la regla sea testeable sin
 * montar el diálogo.
 *
 * Módulo PURO (sin server-only ni deps de react) → lo importan client y server.
 */

/** Zoom mínimo (1 = la imagen a su tamaño natural capado por el diálogo). */
export const PREVIEW_ZOOM_MIN = 1;
/** Zoom máximo (4 = 400% — suficiente para leer texto chico del diseño). */
export const PREVIEW_ZOOM_MAX = 4;
/** Factor por click de los botones +/− (1.5× por paso). */
export const PREVIEW_ZOOM_STEP = 1.5;
/** Zoom al alternar con doble click / doble tap. */
export const PREVIEW_ZOOM_TOGGLE = 2;
/**
 * Factor por notch de rueda (×1.2 por tick — más fino que el ×1.5 de los
 * botones: la rueda dispara ticks seguidos y un paso grueso no deja afinar;
 * mismo criterio del paso "milimétrico" del Estudio, WHEEL_ZOOM_STEP).
 */
export const PREVIEW_ZOOM_WHEEL_STEP = 1.2;

/** Clampa la escala al rango permitido [1, 4]. */
export function clampPreviewZoom(scale: number): number {
  return Math.max(PREVIEW_ZOOM_MIN, Math.min(PREVIEW_ZOOM_MAX, scale));
}

/**
 * Escala resultante de un click en +/−: paso multiplicativo con clamp (al
 * llegar a un extremo el botón queda sin efecto — el componente lo deshabilita).
 */
export function stepPreviewZoom(scale: number, direction: 1 | -1): number {
  return clampPreviewZoom(direction === 1 ? scale * PREVIEW_ZOOM_STEP : scale / PREVIEW_ZOOM_STEP);
}

/** Escala de un gesto pinch: escala al inicio del gesto × ratio de distancia. */
export function pinchPreviewZoom(
  initialScale: number,
  initialDistance: number,
  currentDistance: number,
): number {
  if (initialDistance <= 0) return clampPreviewZoom(initialScale);
  return clampPreviewZoom(initialScale * (currentDistance / initialDistance));
}

/**
 * Escala tras un evento de rueda (deltaY > 0 = alejar): paso multiplicativo
 * fino con clamp. deltaY = 0 (scroll horizontal puro) no cambia la escala.
 */
export function wheelPreviewZoom(scale: number, deltaY: number): number {
  if (deltaY === 0) return clampPreviewZoom(scale);
  const factor = deltaY > 0 ? 1 / PREVIEW_ZOOM_WHEEL_STEP : PREVIEW_ZOOM_WHEEL_STEP;
  return clampPreviewZoom(scale * factor);
}

/**
 * Pan en UN eje para que el punto del cursor (`point`, relativo al centro de
 * la imagen sin transformar) quede fijo al pasar de oldScale a newScale. Con
 * transform-origin en el centro, un punto a distancia p del centro se dibuja
 * en p·s + offset; igualando antes/después: offset' = c − (c − offset)·(s'/s).
 * El caller clampea el resultado con clampPanOffset (en los extremos el zoom
 * degrada suave hacia el centro).
 */
export function zoomPanTowardPoint(
  offset: number,
  point: number,
  oldScale: number,
  newScale: number,
): number {
  if (oldScale <= 0) return offset;
  return point - (point - offset) * (newScale / oldScale);
}

/**
 * Límite del pan en un eje: con escala s la imagen desborda su caja base en
 * baseSize·(s−1), así que el desplazamiento útil es la mitad de ese exceso
 * (la imagen nunca deja ver fondo por el borde opuesto). Sin zoom → 0.
 */
export function maxPanOffset(scale: number, baseSize: number): number {
  if (scale <= 1 || baseSize <= 0) return 0;
  return (baseSize * (scale - 1)) / 2;
}

/** Clampa un desplazamiento de pan al rango ±maxPanOffset. */
export function clampPanOffset(offset: number, scale: number, baseSize: number): number {
  const max = maxPanOffset(scale, baseSize);
  return Math.max(-max, Math.min(max, offset));
}

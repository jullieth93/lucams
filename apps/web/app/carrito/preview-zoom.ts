/*
 * Matemática del zoom del lightbox "Ver" del carrito (design-preview-dialog).
 *
 * La miniatura de la línea es pequeña y el PNG del diseño puede tener texto
 * chico (tiras/separadores): el cliente necesita acercar para revisarlo antes
 * de pagar. El estado del zoom vive en el componente; acá solo hay funciones
 * puras (clamp de escala, pasos de los botones, ratio del pinch, límite del
 * pan) para que la regla sea testeable sin montar el diálogo.
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

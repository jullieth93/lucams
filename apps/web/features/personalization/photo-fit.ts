/*
 * Matemática ÚNICA del encuadre de foto (cover + zoom) compartida por las tres
 * superficies que pintan la foto del cliente:
 *
 *   - Editor Konva (studio-slot.tsx → ImagePlaceholder)
 *   - Render de producción tier sharp (production-render.ts)
 *   - Render de producción tier canvas (production-render-canvas.ts)
 *
 * Antes cada una llevaba su propia copia inline (`Math.max(0.5, Math.min(3, …))`,
 * `Math.max(w/imgW, h/imgH)`); una divergencia de cualquiera rompe el WYSIWYG
 * ("la edición difiere del lienzo"). Acá vive la fuente única: si hay que
 * cambiar el rango de zoom o la regla cover, se cambia UNA vez.
 *
 * Módulo PURO (sin server-only ni deps de react) → lo importan client y server.
 */

/** Zoom mínimo de la foto (0.5 = la foto a la mitad del cover → se ve el fondo). */
export const PHOTO_SCALE_MIN = 0.5;
/** Zoom máximo de la foto (3 = 300% del cover). */
export const PHOTO_SCALE_MAX = 3;

/** Clampa el scale que eligió el cliente al rango permitido [0.5, 3]. */
export function clampPhotoScale(scale: number): number {
  return Math.max(PHOTO_SCALE_MIN, Math.min(PHOTO_SCALE_MAX, scale));
}

/**
 * Scale "cover": el mínimo que cubre la ventana (w×h) con la imagen (imgW×imgH)
 * sin dejar huecos. Con rotación 90/270 el caller pasa las dimensiones YA
 * intercambiadas (swapDims) — la regla no cambia.
 */
export function coverScaleBase(
  windowW: number,
  windowH: number,
  imgW: number,
  imgH: number,
): number {
  return Math.max(windowW / imgW, windowH / imgH);
}

/**
 * Sensibilidad del pinch (zoom con dos dedos), ÚNICA para la grilla interactiva
 * (studio-slot) y el preview del modal de edición (studio-photo-preview): el
 * mismo gesto produce el mismo zoom percibido en ambas superficies. 1.7 = curva
 * amplificada validada por Lucy (Ola 15) — el gesto se siente inmediato sin
 * tener que estirar mucho los dedos.
 */
export const PINCH_SENSITIVITY = 1.7;

/**
 * Convierte el ratio crudo de distancia entre dedos (dist / distInicial) al
 * ratio de zoom aplicado, amplificando la desviación desde 1 con
 * PINCH_SENSITIVITY (1 → 1, sin salto al inicio del gesto).
 */
export function pinchAdjustedRatio(rawRatio: number): number {
  return 1 + (rawRatio - 1) * PINCH_SENSITIVITY;
}

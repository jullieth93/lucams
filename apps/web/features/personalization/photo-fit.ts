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

export type PhotoTransform = {
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation?: number;
};

type PhotoCoverageInput = {
  windowW: number;
  windowH: number;
  imageW: number;
  imageH: number;
  transform?: Partial<PhotoTransform> | null;
};

function normalizedQuarterRotation(rotation: number | undefined): number {
  return (((rotation ?? 0) % 360) + 360) % 360;
}

/**
 * Devuelve la caja visible de una foto después de aplicar cover, zoom y rotación.
 * Los offsets se expresan en coordenadas lógicas del stage, igual que Konva y
 * los dos renderers de producción.
 */
function photoCoverageGeometry(input: PhotoCoverageInput) {
  const rotation = normalizedQuarterRotation(input.transform?.rotation);
  const swapsAxes = rotation === 90 || rotation === 270;
  const orientedW = swapsAxes ? input.imageH : input.imageW;
  const orientedH = swapsAxes ? input.imageW : input.imageH;
  const coverBase = coverScaleBase(input.windowW, input.windowH, orientedW, orientedH);
  const scale = clampPhotoScale(input.transform?.scale ?? 1);

  return {
    renderedW: orientedW * coverBase * scale,
    renderedH: orientedH * coverBase * scale,
    offsetX: input.transform?.offsetX ?? 0,
    offsetY: input.transform?.offsetY ?? 0,
    rotation,
    scale,
  };
}

/**
 * Comprueba que la foto cubra por completo la ventana de impresión, sin que se
 * alcance a ver el respaldo. Se usa como invariante de los productos planos a
 * sangre (hoy, separadores `noFold`) tanto en cliente como en servidor.
 */
export function photoTransformCoversWindow(input: PhotoCoverageInput): boolean {
  if (input.windowW <= 0 || input.windowH <= 0 || input.imageW <= 0 || input.imageH <= 0) {
    return false;
  }
  const geometry = photoCoverageGeometry(input);
  const epsilon = 0.01;
  const maxOffsetX = Math.max(0, (geometry.renderedW - input.windowW) / 2);
  const maxOffsetY = Math.max(0, (geometry.renderedH - input.windowH) / 2);
  return (
    geometry.renderedW + epsilon >= input.windowW &&
    geometry.renderedH + epsilon >= input.windowH &&
    Math.abs(geometry.offsetX) <= maxOffsetX + epsilon &&
    Math.abs(geometry.offsetY) <= maxOffsetY + epsilon
  );
}

/**
 * Ajusta una transformación para conservar cobertura total: scale nunca baja
 * de cover (1) y el paneo queda dentro del excedente real de la foto rotada.
 */
export function constrainPhotoTransformToCover(input: PhotoCoverageInput): PhotoTransform {
  const requested: PhotoTransform = {
    offsetX: input.transform?.offsetX ?? 0,
    offsetY: input.transform?.offsetY ?? 0,
    scale: Math.max(1, clampPhotoScale(input.transform?.scale ?? 1)),
    rotation: normalizedQuarterRotation(input.transform?.rotation),
  };
  if (input.windowW <= 0 || input.windowH <= 0 || input.imageW <= 0 || input.imageH <= 0) {
    return requested;
  }

  const geometry = photoCoverageGeometry({ ...input, transform: requested });
  const maxOffsetX = Math.max(0, (geometry.renderedW - input.windowW) / 2);
  const maxOffsetY = Math.max(0, (geometry.renderedH - input.windowH) / 2);
  const clampOffset = (value: number, max: number) =>
    max === 0 ? 0 : Math.max(-max, Math.min(max, value));
  return {
    offsetX: clampOffset(requested.offsetX, maxOffsetX),
    offsetY: clampOffset(requested.offsetY, maxOffsetY),
    scale: requested.scale,
    rotation: requested.rotation,
  };
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

/*
 * M.3.b.UX.v11 (Lucy 2026-05-15) — Smart auto-crop usando smartcrop.js.
 *
 * Investigación: Cloudinary / Adobe Photoshop / Apple Photos usan algoritmos
 * similares (saliency detection: contraste + saturación + bordes + caras) para
 * calcular el "área interesante" de una imagen. smartcrop.js es la versión
 * open-source más popular (Google Photos lo usó como inspiración).
 *
 * Flujo en el editor:
 *   1. Cliente sube foto → `<KonvaImage>` con `useImage()` carga el HTMLImage.
 *   2. Al estar lista, ejecutamos `analyzeSmartCrop(image, slotW, slotH)`.
 *   3. Devuelve `{ offsetX, offsetY }` que centra la zona interesante de la foto
 *      en el centro del slot. Si la foto tiene un rostro descentrado a la
 *      derecha, el offset moverá la foto a la izquierda para centrar la cara.
 *   4. Aplicamos como photoTransform inicial (en lugar del default {0,0}).
 *
 * El cliente puede sobreescribir con drag/zoom manual igual que antes.
 *
 * Sin algoritmo de detección de caras específico (face-api.js pesa ~6MB, no
 * vale la pena para el caso): smartcrop.js usa heurística general que funciona
 * bien para fotos típicas familiares + paisajes.
 *
 * Bundle: smartcrop.js ≈ 50KB gzipped. Vale la pena por el WOW moment.
 */

import smartcrop from "smartcrop";

export type SmartCropResult = {
  /** Offset desde el centro del slot, en stage coords. */
  offsetX: number;
  offsetY: number;
};

/**
 * Calcula el offset que centra la zona interesante de la imagen en el slot.
 *
 * Algoritmo:
 *   1. smartcrop.crop(image, { width: slotW, height: slotH }) → devuelve el
 *      mejor crop rectangular { x, y, width, height } en coords de la imagen.
 *   2. El centro de ese crop en image coords = (x + width/2, y + height/2).
 *   3. Default cover crop centra la imagen → mostraría el pixel (img.w/2, img.h/2).
 *   4. Para que el smart crop quede en el centro del slot, hay que mover la
 *      imagen tal que el centro del smart crop coincida con el centro del slot.
 *   5. El offset (en slot coords) es la diferencia × finalScale.
 *
 * Devuelve `null` si la imagen no se puede analizar (corrupta, CORS, etc.).
 */
export async function analyzeSmartCrop(
  image: HTMLImageElement,
  slotWidth: number,
  slotHeight: number,
  finalScale: number,
): Promise<SmartCropResult | null> {
  try {
    const result = await smartcrop.crop(image, {
      width: slotWidth,
      height: slotHeight,
    });
    const crop = result.topCrop;
    if (!crop) return null;

    // Centro del smart crop en image coords:
    const cropCenterX = crop.x + crop.width / 2;
    const cropCenterY = crop.y + crop.height / 2;

    // Centro default (cover crop) está en el centro de la imagen:
    const imageCenterX = image.naturalWidth / 2;
    const imageCenterY = image.naturalHeight / 2;

    // Diferencia en image coords:
    const dxImage = imageCenterX - cropCenterX;
    const dyImage = imageCenterY - cropCenterY;

    // Convertir a slot coords aplicando finalScale (cuánto se renderea
    // la imagen en el slot):
    return {
      offsetX: dxImage * finalScale,
      offsetY: dyImage * finalScale,
    };
  } catch (err) {
    // smartcrop puede fallar con imágenes muy chicas, cross-origin, etc.
    // No bloqueante: si falla, el editor usa cover crop centrado normal.
    console.warn("[smart-crop] análisis falló, usando cover crop default:", err);
    return null;
  }
}

/**
 * Verifica si la imagen tiene resolución suficiente para imprimir al tamaño
 * físico del producto a 300 DPI (estándar de imprenta).
 *
 * @param image - HTMLImageElement cargada
 * @param sizeCm - tamaño físico del imán en cm (ej "6×6" o "7×9"). Si no hay
 *   info, devuelve { ok: true } por default.
 * @returns ok=false con detalles si la resolución es insuficiente.
 */
export function checkPhotoQuality(
  image: HTMLImageElement,
  sizeCm: string | undefined,
): {
  ok: boolean;
  requiredPx?: { w: number; h: number };
  actualPx?: { w: number; h: number };
  severity?: "warn" | "error";
} {
  if (!sizeCm) return { ok: true };

  // Parse "6×6" o "7×9" — usamos el ANCHO (primera dimensión) para calcular px
  // mínimo. Approximación conservadora.
  const match = sizeCm.match(/(\d+(?:\.\d+)?)/);
  if (!match) return { ok: true };
  const widthCm = parseFloat(match[1]);

  // 300 DPI estándar → 118 px por cm
  const PX_PER_CM = 118;
  const requiredW = widthCm * PX_PER_CM;
  const requiredH = widthCm * PX_PER_CM; // simplificado — asume cuadrado

  const actualW = image.naturalWidth;
  const actualH = image.naturalHeight;

  // Umbrales:
  //   >= requirement: OK
  //   50-100% requirement: warn (puede verse OK pero al límite)
  //   < 50% requirement: error (claramente pixelado)
  const minSide = Math.min(actualW, actualH);
  const requiredMin = Math.min(requiredW, requiredH);
  const ratio = minSide / requiredMin;

  if (ratio >= 1) return { ok: true };
  return {
    ok: false,
    requiredPx: { w: Math.round(requiredW), h: Math.round(requiredH) },
    actualPx: { w: actualW, h: actualH },
    severity: ratio < 0.5 ? "error" : "warn",
  };
}

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
 *
 * Paquete J (2026-10-02, auditoría §E-4 candidato #4) — el análisis corre
 * sobre una copia reducida a ≤256 px de borde largo. smartcrop.js YA
 * prescala internamente a 256px (options.prescale, default true), pero lo
 * hace con un drawImage del original de ~12 MP en el main thread; acá el
 * downscale se hace ANTES con createImageBitmap({resize...}) (pipeline de
 * imagen del navegador, fuera del path de raster del canvas 2D) y smartcrop
 * recibe la copia chica — su prescale queda en no-op. Las coords del crop
 * vuelven al espacio de la imagen original multiplicando por el ratio.
 */

import smartcrop from "smartcrop";

export type SmartCropResult = {
  /** Offset desde el centro del slot, en stage coords. */
  offsetX: number;
  offsetY: number;
};

/**
 * Guard de la carrera async (2026-10-05): `analyzeSmartCrop` resuelve DESPUÉS
 * de que el cliente pudo ajustar el encuadre a mano. El resultado del análisis
 * solo se aplica si al resolver NO hay photoTransform (foto intacta desde que
 * arrancó el análisis). Con cualquier transform presente —aunque sea solo un
 * offset del drag— el ajuste manual MANDA y el smart-crop se descarta.
 * Puro para poder fijarlo en test (la promesa no puede re-chequear la prop).
 */
export function shouldApplySmartCropResult(
  photoTransformAtResolve: unknown | null | undefined,
): boolean {
  return photoTransformAtResolve == null;
}

/** Borde largo máximo de la copia que se analiza (saliency no necesita más). */
const ANALYSIS_MAX_PX = 256;

/**
 * Mapea el topCrop (coords del ESPACIO ANALIZADO, posiblemente downscaleado)
 * al offset de centrado en el slot: centro del crop → coords de la imagen
 * original (× ratio) → delta contra el centro → × finalScale. Puro, testeable.
 */
export function smartCropOffsetFromCrop(
  crop: { x: number; y: number; width: number; height: number },
  analysisSize: { width: number; height: number },
  imageSize: { width: number; height: number },
  finalScale: number,
): SmartCropResult {
  const ratioX = imageSize.width / analysisSize.width;
  const ratioY = imageSize.height / analysisSize.height;
  // Centro del smart crop en coords de la IMAGEN ORIGINAL:
  const cropCenterX = (crop.x + crop.width / 2) * ratioX;
  const cropCenterY = (crop.y + crop.height / 2) * ratioY;
  // Diferencia contra el centro default (cover crop):
  const dxImage = imageSize.width / 2 - cropCenterX;
  const dyImage = imageSize.height / 2 - cropCenterY;
  // A slot coords aplicando finalScale (cuánto se renderea la imagen en el slot):
  return {
    offsetX: dxImage * finalScale,
    offsetY: dyImage * finalScale,
  };
}

type AnalysisInput = {
  source: CanvasImageSource;
  width: number;
  height: number;
  /** Cerrar tras el análisis (solo si es un ImageBitmap que creamos acá). */
  dispose?: () => void;
};

/**
 * Copia ≤256px del borde largo para el análisis. Cadena de fallbacks:
 * createImageBitmap resize → canvas drawImage → la imagen original (jsdom /
 * navegadores sin resize: el prescale interno de smartcrop cubre ese caso).
 */
async function downscaleForAnalysis(image: HTMLImageElement): Promise<AnalysisInput> {
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const scale = Math.min(1, ANALYSIS_MAX_PX / Math.max(w, h));
  if (scale >= 1 || w === 0 || h === 0) return { source: image, width: w, height: h };
  const dw = Math.max(1, Math.round(w * scale));
  const dh = Math.max(1, Math.round(h * scale));
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(image, {
        resizeWidth: dw,
        resizeHeight: dh,
        resizeQuality: "high",
      });
      return { source: bitmap, width: dw, height: dh, dispose: () => bitmap.close() };
    } catch {
      // Sigue el fallback canvas.
    }
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0, dw, dh);
      return { source: canvas, width: dw, height: dh };
    }
  } catch {
    // Cae al original.
  }
  return { source: image, width: w, height: h };
}

/**
 * Calcula el offset que centra la zona interesante de la imagen en el slot.
 *
 * Algoritmo:
 *   1. Copia ≤256px (downscaleForAnalysis) → smartcrop.crop(copia, { width:
 *      slotW, height: slotH }) → mejor crop rectangular en coords de la copia.
 *   2. El centro de ese crop se escala de vuelta a coords de la imagen
 *      original (× ratio del downscale) y se compara contra el centro default
 *      del cover crop (smartCropOffsetFromCrop).
 *   3. Para que el smart crop quede en el centro del slot, hay que mover la
 *      imagen tal que el centro del smart crop coincida con el centro del slot.
 *   4. El offset (en slot coords) es la diferencia × finalScale.
 *
 * Devuelve `null` si la imagen no se puede analizar (corrupta, CORS, etc.).
 */
export async function analyzeSmartCrop(
  image: HTMLImageElement,
  slotWidth: number,
  slotHeight: number,
  finalScale: number,
): Promise<SmartCropResult | null> {
  let input: AnalysisInput | null = null;
  try {
    // Paquete J — analizar la copia ≤256px, no el original de ~12 MP.
    input = await downscaleForAnalysis(image);
    const result = await smartcrop.crop(input.source as HTMLImageElement, {
      width: slotWidth,
      height: slotHeight,
    });
    const crop = result.topCrop;
    if (!crop) return null;

    return smartCropOffsetFromCrop(
      crop,
      { width: input.width, height: input.height },
      { width: image.naturalWidth, height: image.naturalHeight },
      finalScale,
    );
  } catch (err) {
    // smartcrop puede fallar con imágenes muy chicas, cross-origin, etc.
    // No bloqueante: si falla, el editor usa cover crop centrado normal.
    console.warn("[smart-crop] análisis falló, usando cover crop default:", err);
    return null;
  } finally {
    input?.dispose?.();
  }
}

/**
 * Verifica si la imagen tiene resolución suficiente para imprimir al tamaño
 * físico del producto a 300 DPI (estándar de imprenta).
 *
 * @param image - HTMLImageElement cargada
 * @param sizeCm - tamaño físico del imán en cm (ej "6×6" o "7×9"). Si no hay
 *   info, devuelve { ok: true } por default.
 * @param originalDims - 2026-09-24: dimensiones de la foto ORIGINAL cuando el
 *   archivo subido pasó por upscale local (client-photo-upscale). El
 *   re-muestreo NO crea detalle, así que medir el archivo mejorado inflaría
 *   el DPI percibido y apagaría el aviso falsamente — con originalDims el
 *   ratio/severidad se calculan sobre la original (y los px mostrados en el
 *   mensaje son los de la original).
 * @returns ok=false con detalles si la resolución es insuficiente.
 */
export function checkPhotoQuality(
  image: HTMLImageElement,
  sizeCm: string | undefined,
  originalDims?: { width: number; height: number },
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

  const actualW = originalDims?.width ?? image.naturalWidth;
  const actualH = originalDims?.height ?? image.naturalHeight;

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

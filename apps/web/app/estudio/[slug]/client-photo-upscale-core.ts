/*
 * Núcleo PURO del upscale local de fotos (Paquete J, 2026-10-02).
 *
 * Extraído de client-photo-upscale.ts para compartir la lógica entre el
 * Web Worker (client-photo-upscale.worker.ts — OffscreenCanvas fuera del
 * main thread) y el fallback inline del main thread, y para que sea
 * testeable en unidad con vitest (sin canvas real).
 *
 * Nada acá toca DOM ni canvas: solo aritmética y el kernel del unsharp mask
 * sobre un buffer de píxeles RGBA.
 */

/** Píxeles por cm a 300 DPI — MISMO valor que lib/photo-validation.ts (server). */
export const PX_PER_CM_300DPI = 300 / 2.54;

/** Ratio mínimo absoluto del servidor (bajo esto el aviso es bloqueante allá). */
export const RES_ERROR_BELOW = 0.5;

/** Tope de amplificación: más de ×4 solo inventa píxeles sin información. */
export const MAX_UPSCALE_FACTOR = 4;

/** Fuerza del unsharp mask leve (kernel [0,-k,0,-k,1+4k,-k,0,-k,0]). */
export const UNSHARP_AMOUNT = 0.3;

export const UPSCALE_ENCODE_QUALITY = 0.92;

export type UpscalePlan = {
  /** Píxeles requeridos en el lado menor para 300 DPI al tamaño del producto. */
  requiredPx: number;
  /** Ratio minDim/requiredPx antes del upscale. */
  ratioBefore: number;
  /** Ancho/alto objetivo del re-muestreo (aspect conservado, factor ≤ ×4). */
  targetW: number;
  targetH: number;
};

export function parseSizeCm(
  sizeCm: string | undefined,
): { widthCm: number; heightCm: number } | null {
  if (!sizeCm) return null;
  const match = sizeCm.match(/^(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  return { widthCm: parseFloat(match[1]), heightCm: parseFloat(match[2]) };
}

/**
 * Decide si la foto necesita re-muestreo y a qué tamaño. Devuelve null cuando
 * NO aplica procesamiento (sin sizeCm parseable o la foto ya cubre 300 DPI).
 */
export function computeUpscalePlan(
  originalWidth: number,
  originalHeight: number,
  productSizeCm?: string,
): UpscalePlan | null {
  const parsed = parseSizeCm(productSizeCm);
  if (!parsed) return null;
  const requiredPx = Math.ceil(Math.min(parsed.widthCm, parsed.heightCm) * PX_PER_CM_300DPI);
  const actualMinPx = Math.min(originalWidth, originalHeight);
  const ratioBefore = actualMinPx / requiredPx;
  if (ratioBefore >= 1) return null;

  // Tamaño objetivo: el lado MENOR llega a requiredPx (aspect conservado),
  // topeado a ×4 el original.
  const factor = Math.min(requiredPx / actualMinPx, MAX_UPSCALE_FACTOR);
  return {
    requiredPx,
    ratioBefore,
    targetW: Math.max(1, Math.round(originalWidth * factor)),
    targetH: Math.max(1, Math.round(originalHeight * factor)),
  };
}

/**
 * Unsharp mask 3×3 in-place sobre un buffer RGBA (ImageData.data). Salta el
 * borde de 1px. Copia la fuente primero: la convolución lee vecinos ya
 * escritos si no. Misma matemática que el applyUnsharpMask original.
 */
export function unsharpMaskPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number = UNSHARP_AMOUNT,
): void {
  if (width < 3 || height < 3) return;
  const k = amount;
  const original = new Uint8ClampedArray(data);
  const stride = width * 4;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * stride + x * 4;
      for (let c = 0; c < 3; c++) {
        const center = original[i + c] * (1 + 4 * k);
        const neighbors =
          original[i - stride + c] +
          original[i + stride + c] +
          original[i - 4 + c] +
          original[i + 4 + c];
        data[i + c] = center - neighbors * k;
      }
    }
  }
}

"use client";

/*
 * Upscale LOCAL de fotos al subir (C2, owner 2026-09-15).
 *
 * Cuando la foto del cliente queda por debajo de la resolución requerida para
 * imprimir el producto a 300 DPI (misma regla que validatePhotoQuality del
 * servidor en @/lib/photo-validation: requiredPx = min(cm) × 118.11), se
 * re-muestrea en el navegador ANTES de subir:
 *
 *   1. Re-muestreo progresivo — pasos de factor ≤ 2 con
 *      imageSmoothingEnabled + imageSmoothingQuality "high" (un solo salto
 *      grande degrada mucho más que varios suaves).
 *   2. Unsharp mask leve — convolution 3×3 sobre el resultado para recuperar
 *      nitidez percibida tras el re-muestreo.
 *   3. Re-validación — si tras el upscale el ratio sigue bajo 0.5 (el upscale
 *      va topeado a ×4: más que eso solo inventa píxeles), se sube igual y la
 *      UI muestra el aviso mejorado (texts.fotos.avisoMejoraAuto).
 *
 * Sin servicios externos (CSP estricta): todo Canvas2D local. Formatos:
 * solo raster decodificable por el navegador (JPEG/PNG/WebP); HEIC devuelve
 * null (lo decodifica el servidor con heic-decode). Conserva PNG si el
 * original era PNG (alpha); el resto sale WebP q0.92 cuando el navegador lo
 * codifica (2026-09-22 — el pipeline del servidor acepta image/webp), JPEG
 * q0.92 como fallback.
 *
 * Memoria: el ImageBitmap se cierra y los canvases intermedios se liberan
 * (width=0) apenas dejan de usarse — fotos de 12+ MP re-muestreadas a
 * ~1800px no deben dejar bitmaps gigantes vivos.
 */

import { supportsWebpEncode } from "./client-image-compress";

/** Píxeles por cm a 300 DPI — MISMO valor que lib/photo-validation.ts (server). */
const PX_PER_CM_300DPI = 300 / 2.54;

/** Ratio mínimo absoluto del servidor (bajo esto el aviso es bloqueante allá). */
const RES_ERROR_BELOW = 0.5;

/** Tope de amplificación: más de ×4 solo inventa píxeles sin información. */
const MAX_UPSCALE_FACTOR = 4;

/** Fuerza del unsharp mask leve (kernel [0,-k,0,-k,1+4k,-k,0,-k,0]). */
const UNSHARP_AMOUNT = 0.3;

const ENCODE_QUALITY = 0.92;

export type PhotoUpscaleResult = {
  /** Archivo listo para subir (el original si no hizo falta mejorar). */
  file: File;
  /** true si se generó una versión re-muestreada. */
  improved: boolean;
  /** Ratio minDim/requiredPx antes del upscale (1 si no aplica). */
  ratioBefore: number;
  /** Ratio tras el upscale. */
  ratioAfter: number;
};

function parseSizeCm(sizeCm: string | undefined): { widthCm: number; heightCm: number } | null {
  if (!sizeCm) return null;
  const match = sizeCm.match(/^(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  return { widthCm: parseFloat(match[1]), heightCm: parseFloat(match[2]) };
}

/** Unsharp mask 3×3 sobre el canvas (in-place). Salta el borde de 1px. */
function applyUnsharpMask(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  if (width < 3 || height < 3) return;
  const k = UNSHARP_AMOUNT;
  const imageData = ctx.getImageData(0, 0, width, height);
  const src = imageData.data;
  // Copia de la fila fuente: la convolution lee vecinos ya escritos si no.
  const original = new Uint8ClampedArray(src);
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
        src[i + c] = center - neighbors * k;
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Mejora la foto si queda bajo el ratio 1.0 para el tamaño físico del
 * producto. Devuelve null cuando NO aplica procesamiento local (sin sizeCm,
 * formato no decodificable por el navegador, o fallo de canvas) — el caller
 * sube el original como siempre.
 */
export async function upscalePhotoForPrint(
  file: File,
  productSizeCm?: string,
): Promise<PhotoUpscaleResult | null> {
  const parsed = parseSizeCm(productSizeCm);
  if (!parsed) return null;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return null;

  try {
    const requiredPx = Math.ceil(Math.min(parsed.widthCm, parsed.heightCm) * PX_PER_CM_300DPI);
    const bitmap = await createImageBitmap(file);
    const actualMinPx = Math.min(bitmap.width, bitmap.height);
    const ratioBefore = actualMinPx / requiredPx;

    if (ratioBefore >= 1) {
      bitmap.close();
      return { file, improved: false, ratioBefore, ratioAfter: ratioBefore };
    }

    // Tamaño objetivo: el lado MENOR llega a requiredPx (aspect conservado),
    // topeado a ×4 el original.
    const factor = Math.min(requiredPx / actualMinPx, MAX_UPSCALE_FACTOR);
    const targetW = Math.max(1, Math.round(bitmap.width * factor));
    const targetH = Math.max(1, Math.round(bitmap.height * factor));

    // Re-muestreo progresivo: pasos de factor ≤ 2 con smoothing de alta calidad.
    let srcCanvas = document.createElement("canvas");
    srcCanvas.width = bitmap.width;
    srcCanvas.height = bitmap.height;
    let srcCtx = srcCanvas.getContext("2d");
    if (!srcCtx) {
      bitmap.close();
      return null;
    }
    srcCtx.drawImage(bitmap, 0, 0);
    bitmap.close();

    let curW = srcCanvas.width;
    let curH = srcCanvas.height;
    while (curW < targetW || curH < targetH) {
      const stepW = Math.min(targetW, curW * 2);
      const stepH = Math.min(targetH, curH * 2);
      const dst = document.createElement("canvas");
      dst.width = stepW;
      dst.height = stepH;
      const dstCtx = dst.getContext("2d");
      if (!dstCtx) {
        srcCanvas.width = 0;
        srcCanvas.height = 0;
        return null;
      }
      dstCtx.imageSmoothingEnabled = true;
      dstCtx.imageSmoothingQuality = "high";
      dstCtx.drawImage(srcCanvas, 0, 0, stepW, stepH);
      // Liberar el canvas del paso anterior cuanto antes.
      srcCanvas.width = 0;
      srcCanvas.height = 0;
      srcCanvas = dst;
      srcCtx = dstCtx;
      curW = stepW;
      curH = stepH;
    }

    // Unsharp leve sobre el resultado final.
    applyUnsharpMask(srcCtx, curW, curH);

    const keepPng = file.type === "image/png";
    const useWebp = !keepPng && supportsWebpEncode();
    const mime = keepPng ? "image/png" : useWebp ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      srcCanvas.toBlob(resolve, mime, keepPng ? undefined : ENCODE_QUALITY),
    );
    srcCanvas.width = 0;
    srcCanvas.height = 0;
    if (!blob) return null;

    const name = keepPng
      ? file.name
      : file.name.replace(/\.[^.]+$/, "") + (useWebp ? ".webp" : ".jpg");
    const improved = new File([blob], name, { type: mime, lastModified: file.lastModified });
    const ratioAfter = Math.min(curW, curH) / requiredPx;
    return { file: improved, improved: true, ratioBefore, ratioAfter };
  } catch {
    // Ante cualquier fallo del pipeline local, que el servidor decida como antes.
    return null;
  }
}

/** ¿La foto mejorada sigue bajo el mínimo absoluto del servidor? */
export function isStillBelowMinimum(result: PhotoUpscaleResult): boolean {
  return result.improved && result.ratioAfter < RES_ERROR_BELOW;
}

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
 * Paquete J (2026-10-02) — el trabajo pesado (pasos 1+2, ~36M iteraciones en
 * 12 MP) corre en un WEB WORKER con OffscreenCanvas
 * (client-photo-upscale.worker.ts): antes era síncrono en el main thread
 * dentro de la cadena del evento de subir foto y dominaba el INP del estudio
 * (auditoría §E-4 candidato #1). Si el navegador no tiene Worker/
 * OffscreenCanvas o el worker falla, se cae al pipeline inline de siempre —
 * el resultado es idéntico (mismo kernel en client-photo-upscale-core.ts).
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
import {
  computeUpscalePlan,
  parseSizeCm,
  PX_PER_CM_300DPI,
  RES_ERROR_BELOW,
  UNSHARP_AMOUNT,
  UPSCALE_ENCODE_QUALITY,
  unsharpMaskPixels,
  type UpscalePlan,
} from "./client-photo-upscale-core";
import type { UpscaleWorkerRequest, UpscaleWorkerResponse } from "./client-photo-upscale.worker";

export type PhotoUpscaleResult = {
  /** Archivo listo para subir (el original si no hizo falta mejorar). */
  file: File;
  /** true si se generó una versión re-muestreada. */
  improved: boolean;
  /** Ratio minDim/requiredPx antes del upscale (1 si no aplica). */
  ratioBefore: number;
  /** Ratio tras el upscale. */
  ratioAfter: number;
  /**
   * Dimensiones de la foto ORIGINAL (2026-09-24): el caller las adjunta al
   * asset para que el indicador de calidad mida la nitidez real (el upscale
   * suaviza, no crea detalle).
   */
  originalWidth: number;
  originalHeight: number;
};

/** Unsharp mask 3×3 sobre el canvas (in-place). */
function applyUnsharpMask(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  if (width < 3 || height < 3) return;
  const imageData = ctx.getImageData(0, 0, width, height);
  unsharpMaskPixels(imageData.data, width, height, UNSHARP_AMOUNT);
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Corre el re-muestreo + unsharp + encode en el worker. Devuelve null si el
 * navegador no soporta Worker/OffscreenCanvas o si el worker falla — el
 * caller cae al pipeline inline con el MISMO bitmap (no se transfiere: el
 * structured clone de ImageBitmap comparte el backing, no copia píxeles).
 */
function upscaleInWorker(
  bitmap: ImageBitmap,
  plan: UpscalePlan,
  keepPng: boolean,
): Promise<{ blob: Blob; mime: string; width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
      resolve(null);
      return;
    }
    let worker: Worker;
    try {
      worker = new Worker(new URL("./client-photo-upscale.worker.ts", import.meta.url));
    } catch {
      resolve(null);
      return;
    }
    // Red de seguridad: un worker colgado no debe congelar la subida — se
    // termina y se cae al inline (lento pero funcional).
    const timer = setTimeout(() => {
      worker.terminate();
      console.warn("[upscale] worker sin respuesta en 60s — fallback inline");
      resolve(null);
    }, 60_000);
    worker.onmessage = (event: MessageEvent<UpscaleWorkerResponse>) => {
      clearTimeout(timer);
      worker.terminate();
      const res = event.data;
      if (!res.ok) console.warn("[upscale] worker devolvió error — fallback inline:", res.error);
      resolve(res.ok ? { blob: res.blob, mime: res.mime, width: res.width, height: res.height } : null);
    };
    worker.onerror = (event) => {
      clearTimeout(timer);
      worker.terminate();
      console.warn("[upscale] worker falló — fallback inline:", event.message ?? event.type);
      resolve(null);
    };
    const request: UpscaleWorkerRequest = {
      bitmap,
      targetW: plan.targetW,
      targetH: plan.targetH,
      keepPng,
      quality: UPSCALE_ENCODE_QUALITY,
    };
    try {
      worker.postMessage(request);
    } catch {
      clearTimeout(timer);
      worker.terminate();
      resolve(null);
    }
  });
}

/**
 * Pipeline inline (fallback): el camino histórico en el main thread. Misma
 * matemática que el worker (client-photo-upscale-core.ts).
 */
async function upscaleInline(
  bitmap: ImageBitmap,
  plan: UpscalePlan,
  keepPng: boolean,
): Promise<{ blob: Blob; mime: string; width: number; height: number } | null> {
  // Re-muestreo progresivo: pasos de factor ≤ 2 con smoothing de alta calidad.
  let srcCanvas = document.createElement("canvas");
  srcCanvas.width = bitmap.width;
  srcCanvas.height = bitmap.height;
  let srcCtx = srcCanvas.getContext("2d");
  if (!srcCtx) return null;
  srcCtx.drawImage(bitmap, 0, 0);

  let curW = srcCanvas.width;
  let curH = srcCanvas.height;
  while (curW < plan.targetW || curH < plan.targetH) {
    const stepW = Math.min(plan.targetW, curW * 2);
    const stepH = Math.min(plan.targetH, curH * 2);
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

  const useWebp = !keepPng && supportsWebpEncode();
  const mime = keepPng ? "image/png" : useWebp ? "image/webp" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    srcCanvas.toBlob(resolve, mime, keepPng ? undefined : UPSCALE_ENCODE_QUALITY),
  );
  srcCanvas.width = 0;
  srcCanvas.height = 0;
  if (!blob) return null;
  return { blob, mime, width: curW, height: curH };
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
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return null;
  // Early-exit sin decodificar: sin sizeCm parseable no hay procesamiento local.
  if (!parseSizeCm(productSizeCm)) return null;

  try {
    const bitmap = await createImageBitmap(file);
    // Capturar antes de cualquier close() — tras close() las dimensiones no son confiables.
    const originalWidth = bitmap.width;
    const originalHeight = bitmap.height;
    const plan = computeUpscalePlan(originalWidth, originalHeight, productSizeCm);

    if (!plan) {
      bitmap.close();
      // computeUpscalePlan devuelve null tanto para sizeCm inválido (no aplica
      // procesamiento → null al caller) como para ratio ≥ 1 (ya cubre 300 DPI
      // → se reporta el ratio sin tocar el archivo).
      const parsed = parseSizeCm(productSizeCm);
      if (!parsed) return null;
      const requiredPx = Math.ceil(
        Math.min(parsed.widthCm, parsed.heightCm) * PX_PER_CM_300DPI,
      );
      const ratio = Math.min(originalWidth, originalHeight) / requiredPx;
      return {
        file,
        improved: false,
        ratioBefore: ratio,
        ratioAfter: ratio,
        originalWidth,
        originalHeight,
      };
    }

    const keepPng = file.type === "image/png";
    // Preferido: worker (fuera del main thread). Fallback: inline.
    const out = (await upscaleInWorker(bitmap, plan, keepPng)) ??
      (await upscaleInline(bitmap, plan, keepPng));
    bitmap.close();
    if (!out) return null;

    const name =
      out.mime === "image/png"
        ? file.name
        : file.name.replace(/\.[^.]+$/, "") + (out.mime === "image/webp" ? ".webp" : ".jpg");
    const improved = new File([out.blob], name, {
      type: out.mime,
      lastModified: file.lastModified,
    });
    const ratioAfter = Math.min(out.width, out.height) / plan.requiredPx;
    return {
      file: improved,
      improved: true,
      ratioBefore: plan.ratioBefore,
      ratioAfter,
      originalWidth,
      originalHeight,
    };
  } catch {
    // Ante cualquier fallo del pipeline local, que el servidor decida como antes.
    return null;
  }
}

/** ¿La foto mejorada sigue bajo el mínimo absoluto del servidor? */
export function isStillBelowMinimum(result: PhotoUpscaleResult): boolean {
  return result.improved && result.ratioAfter < RES_ERROR_BELOW;
}

/*
 * Paquete J (2026-10-02) — Web Worker del upscale local de fotos.
 *
 * El re-muestreo progresivo + unsharp mask 3×3 sobre fotos de ~12 MP costaba
 * ~36M iteraciones SÍNCRONAS en el main thread dentro de la cadena del evento
 * de "subir foto" (INP >500 ms en móvil — auditoría §E-4 candidato #1). Acá el
 * mismo trabajo corre en un hilo aparte con OffscreenCanvas: el main thread
 * solo hace createImageBitmap (async) y espera el Blob resultante.
 *
 * Protocolo (un trabajo por worker; el caller lo termina al responder):
 *   →  { bitmap, targetW, targetH, keepPng, quality }   (ImageBitmap clonado,
 *      NO transferido: el caller lo cierra y puede reintentar inline si falla)
 *   ←  { ok: true, blob, mime, width, height } | { ok: false, error }
 */

import { unsharpMaskPixels, UNSHARP_AMOUNT } from "./client-photo-upscale-core";

export type UpscaleWorkerRequest = {
  bitmap: ImageBitmap;
  targetW: number;
  targetH: number;
  /** PNG original (alpha) se conserva PNG; el resto sale WebP/JPEG. */
  keepPng: boolean;
  quality: number;
};

export type UpscaleWorkerResponse =
  | {
      ok: true;
      blob: Blob;
      mime: "image/png" | "image/webp" | "image/jpeg";
      width: number;
      height: number;
    }
  | { ok: false; error: string };

let webpEncodeSupport: boolean | null = null;

/** Detección de WebP encode DENTRO del worker (no hay DOM canvas acá). */
async function workerSupportsWebpEncode(): Promise<boolean> {
  if (webpEncodeSupport !== null) return webpEncodeSupport;
  try {
    const probe = new OffscreenCanvas(1, 1);
    const blob = await probe.convertToBlob({ type: "image/webp", quality: 0.5 });
    webpEncodeSupport = blob.type === "image/webp";
  } catch {
    webpEncodeSupport = false;
  }
  return webpEncodeSupport;
}

async function runUpscale(req: UpscaleWorkerRequest): Promise<UpscaleWorkerResponse> {
  const { bitmap, targetW, targetH } = req;
  // Re-muestreo progresivo: pasos de factor ≤ 2 con smoothing de alta calidad
  // (un solo salto grande degrada mucho más que varios suaves).
  let src = new OffscreenCanvas(bitmap.width, bitmap.height);
  let srcCtx = src.getContext("2d");
  if (!srcCtx) return { ok: false, error: "sin contexto 2d" };
  srcCtx.drawImage(bitmap, 0, 0);

  let curW = src.width;
  let curH = src.height;
  while (curW < targetW || curH < targetH) {
    const stepW = Math.min(targetW, curW * 2);
    const stepH = Math.min(targetH, curH * 2);
    const dst = new OffscreenCanvas(stepW, stepH);
    const dstCtx = dst.getContext("2d");
    if (!dstCtx) return { ok: false, error: "sin contexto 2d (paso)" };
    dstCtx.imageSmoothingEnabled = true;
    dstCtx.imageSmoothingQuality = "high";
    dstCtx.drawImage(src, 0, 0, stepW, stepH);
    // Liberar el canvas del paso anterior cuanto antes.
    src.width = 0;
    src.height = 0;
    src = dst;
    srcCtx = dstCtx;
    curW = stepW;
    curH = stepH;
  }

  // Unsharp leve sobre el resultado final (mismo kernel que el fallback inline).
  if (curW >= 3 && curH >= 3) {
    const imageData = srcCtx.getImageData(0, 0, curW, curH);
    unsharpMaskPixels(imageData.data, curW, curH, UNSHARP_AMOUNT);
    srcCtx.putImageData(imageData, 0, 0);
  }

  const useWebp = !req.keepPng && (await workerSupportsWebpEncode());
  const mime = req.keepPng ? "image/png" : useWebp ? "image/webp" : "image/jpeg";
  const blob = await src.convertToBlob({
    type: mime,
    ...(req.keepPng ? {} : { quality: req.quality }),
  });
  src.width = 0;
  src.height = 0;
  // Defensa: si el navegador mintió con el mime (cae a PNG), el caller decide
  // por blob.type — lo reportamos tal cual.
  const outMime = (
    blob.type === "image/webp" || blob.type === "image/png" ? blob.type : "image/jpeg"
  ) as "image/png" | "image/webp" | "image/jpeg";
  return { ok: true, blob, mime: outMime, width: curW, height: curH };
}

self.onmessage = (event: MessageEvent<UpscaleWorkerRequest>) => {
  runUpscale(event.data)
    .then((res) => self.postMessage(res))
    .catch((err: unknown) =>
      self.postMessage({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      } satisfies UpscaleWorkerResponse),
    );
};

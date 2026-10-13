/*
 * Compresión cliente de fotos del Estudio (2026-08-05).
 *
 * Por qué existe: Vercel rechaza bodies de server action > ~4.5 MB
 * (FUNCTION_PAYLOAD_TOO_LARGE) y las fotos full-res de iPhone pesan 5–8 MB —
 * el usuario recibía un error (o nada) al subir su foto, que es el caso típico.
 * Comprimiendo en el navegador antes de subir, la promesa "máx 10 MB" se
 * cumple en la práctica sin chocar el tope de plataforma.
 *
 * Reglas:
 * - Solo JPEG/PNG/WebP raster y solo si superan el umbral seguro (~2 MB — bajado de 4 MB el
 *   2026-09-18: las fotos del cliente son el mayor consumidor del GB de Storage del plan Free;
 *   a 2400 px q0.85 el resultado queda en ~300–600 KB, ~10× menos que el original de iPhone).
 *   HEIC pasa intacto (el navegador no lo decodifica; el servidor ya lo
 *   resuelve con heic-decode, y los HEIC de iPhone pesan 1–2 MB).
 * - Redimensión al borde largo ≤ 2400 px: sobra para imprimir a 300 DPI en
 *   los tamaños del catálogo (hasta ~20 cm) y no afecta el DPI-check.
 * - Salida WebP q0.85 cuando el navegador sabe codificarlo (2026-09-22: WebP
 *   pesa ~25-35% menos que JPEG a igual calidad; el pipeline del servidor ya
 *   acepta image/webp de punta a punta), JPEG q0.85 como fallback (Safari
 *   viejo). Los imanes se imprimen; el alpha no aplica acá.
 *
 * Reducción OBLIGATORIA sobre el presupuesto del payload (robustez 2026-10-13):
 * el paso de arriba es OPTIMIZACIÓN (mejora peso/velocidad); si el archivo
 * preparado aun supera UPLOAD_PAYLOAD_BUDGET_BYTES el upload REVENTARÍA con el
 * 413 genérico de la plataforma (~4.5 MB por request en Vercel, bajo el tope
 * de negocio de 10 MB del servidor). `shrinkToFitUploadBudget` baja borde
 * largo y calidad progresivamente hasta caber, con un PISO en el lado menor:
 * si el caller conoce el tamaño del producto, el piso son los px requeridos
 * para 300 DPI (nunca sacrifica el mínimo de impresión por caber); sin
 * contexto, SHRINK_MIN_EDGE_FLOOR_PX. Si ni en el piso cabe (o el navegador no
 * decodifica el formato — HEIC en Chrome/Firefox), devuelve null y el pipeline
 * falla CERRADO con un mensaje honesto en vez del 413 silencioso.
 */

"use client";

export const COMPRESS_THRESHOLD_BYTES = 2 * 1024 * 1024; // ~2 MB, holgado bajo el tope de Vercel

/**
 * Presupuesto DURO del payload de la Server Action de subida. La plataforma
 * (Vercel) corta requests de ~4.5 MB con 413 ANTES de que corra la acción —
 * 4 MB deja margen para el multipart overhead y el resto del FormData.
 */
export const UPLOAD_PAYLOAD_BUDGET_BYTES = 4 * 1024 * 1024;

/**
 * Piso del lado menor cuando NO hay contexto de producto (sin sizeCm): con
 * 1024 px alcanza para imprimir ~8.7 cm a 300 DPI (cubre los productos chicos
 * del catálogo). Con sizeCm el piso lo calcula el caller (px de 300 DPI).
 */
export const SHRINK_MIN_EDGE_FLOOR_PX = 1024;

const MAX_EDGE_PX = 2400;
const ENCODE_QUALITY = 0.85;

let webpEncodeSupport: boolean | null = null;

/**
 * ¿El navegador puede codificar WebP con canvas? Detectado una vez vía
 * toDataURL (síncrono, 1×1 px): si no soporta el mime, devuelve PNG. Safari
 * <14 cae acá; los demás (Chrome/Edge/Firefox/Safari ≥14) codifican WebP.
 */
export function supportsWebpEncode(): boolean {
  if (webpEncodeSupport !== null) return webpEncodeSupport;
  try {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    webpEncodeSupport = probe.toDataURL("image/webp", 0.5).startsWith("data:image/webp");
  } catch {
    webpEncodeSupport = false;
  }
  return webpEncodeSupport;
}

/** ¿Este archivo pasa por el compresor? (raster permitido y sobre el umbral). */
export function shouldCompress(file: Pick<File, "type" | "size">): boolean {
  return /^image\/(jpeg|png|webp)$/.test(file.type) && file.size > COMPRESS_THRESHOLD_BYTES;
}

/**
 * Re-encode del bitmap con borde largo ≤ maxEdgePx (sin agrandar) a WebP/JPEG
 * con la calidad dada. Devuelve null si el canvas no está disponible o el
 * encode falla — el caller decide (fail-open en optimización, fail-closed en
 * reducción obligatoria).
 */
async function encodeResized(
  bitmap: ImageBitmap,
  maxEdgePx: number,
  quality: number,
  original: File,
): Promise<File | null> {
  const scale = Math.min(1, maxEdgePx / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  const mime = supportsWebpEncode() ? "image/webp" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) return null;
  const name = original.name.replace(/\.[^.]+$/, "") + (mime === "image/webp" ? ".webp" : ".jpg");
  return new File([blob], name, { type: mime, lastModified: original.lastModified });
}

/**
 * Devuelve el archivo listo para subir: original si no hace falta comprimir,
 * o un WebP (JPEG si el navegador no codifica WebP) redimensionado/comprimido
 * si superaba el umbral. Si el navegador no puede procesarlo (raro), devuelve
 * el original y que decida el servidor.
 */
export async function compressImageForUpload(file: File): Promise<File> {
  if (!shouldCompress(file)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const out = await encodeResized(bitmap, MAX_EDGE_PX, ENCODE_QUALITY, file);
    bitmap.close();
    return out ?? file;
  } catch {
    return file; // ante cualquier fallo del compresor, que el servidor intente como antes
  }
}

// ──────────── Reducción obligatoria al presupuesto del payload ────────────

export type ShrinkAttempt = {
  /** Borde largo máximo del intento (px). */
  maxEdgePx: number;
  /** Calidad de encode WebP/JPEG del intento. */
  quality: number;
};

/** Escaleras del shrink: primero baja calidad a tamaño completo, luego baja el borde. */
const SHRINK_EDGE_STEPS = [1, 0.8, 0.64, 0.5];
const SHRINK_QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55];

/**
 * Escalera de intentos de reducción, de mayor a menor tamaño esperado. PURA
 * (testeable sin canvas): el ejecutor los corre en orden y se queda con el
 * primero que entra en el presupuesto.
 *
 * Piso de impresión: ningún intento baja el lado MENOR por debajo de
 * `minEdgeFloorPx` (los px de 300 DPI del producto cuando el caller los
 * conoce). El piso nunca excede el lado menor actual — si la foto YA está
 * bajo el piso (caso raro: producto grande y foto chica), la reducción sigue
 * siendo posible a partir de su tamaño real (la calidad de impresión la
 * evalúa el servidor, no este compresor).
 */
export function computeShrinkAttempts(opts: {
  width: number;
  height: number;
  minEdgeFloorPx?: number;
}): ShrinkAttempt[] {
  const { width, height } = opts;
  const longEdge = Math.max(width, height);
  const minEdge = Math.min(width, height);
  const floor = Math.min(opts.minEdgeFloorPx ?? SHRINK_MIN_EDGE_FLOOR_PX, minEdge);
  const baseEdge = Math.min(MAX_EDGE_PX, longEdge);

  const attempts: ShrinkAttempt[] = [];
  for (const edgeStep of SHRINK_EDGE_STEPS) {
    const maxEdgePx = Math.max(1, Math.round(baseEdge * edgeStep));
    // Lado menor que resultaría de este borde largo (aspect conservado).
    const resultMinEdge = Math.round(minEdge * Math.min(1, maxEdgePx / longEdge));
    if (resultMinEdge < floor) continue; // nunca bajo el piso de impresión
    for (const quality of SHRINK_QUALITY_STEPS) {
      attempts.push({ maxEdgePx, quality });
    }
  }
  return attempts;
}

/**
 * Reduce el archivo PROGRESIVAMENTE hasta que quepa en el presupuesto del
 * payload de la Server Action (UPLOAD_PAYLOAD_BUDGET_BYTES). A diferencia de
 * compressImageForUpload (optimización fail-open), esta reducción es
 * OBLIGATORIA y FAIL-CLOSED:
 *
 * - Intenta decodificar CUALQUIER raster que el navegador entienda — incluido
 *   HEIC en Safari (lo decodifica nativamente), así un HEIC grande de iPhone
 *   no revienta el upload cuando el navegador puede convertirlo.
 * - Respeta el piso de impresión (ver computeShrinkAttempts): prefiere bajar
 *   calidad antes que resolución, y nunca baja el lado menor del mínimo.
 * - Si ya cabe, devuelve el archivo intacto. Si ningún intento cabe en el
 *   piso, o el navegador no decodifica el formato, devuelve NULL — el caller
 *   (pipeline de subida) reporta el error honesto en vez de exponer el 413
 *   genérico de la plataforma.
 */
export async function shrinkToFitUploadBudget(
  file: File,
  opts?: { minEdgeFloorPx?: number },
): Promise<File | null> {
  if (file.size <= UPLOAD_PAYLOAD_BUDGET_BYTES) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null; // formato no decodificable por este navegador (ej. HEIC en Chrome/Firefox)
  }
  try {
    const attempts = computeShrinkAttempts({
      width: bitmap.width,
      height: bitmap.height,
      minEdgeFloorPx: opts?.minEdgeFloorPx,
    });
    for (const attempt of attempts) {
      const out = await encodeResized(bitmap, attempt.maxEdgePx, attempt.quality, file);
      if (out && out.size <= UPLOAD_PAYLOAD_BUDGET_BYTES) return out;
    }
    return null; // ni en el piso de impresión cabe: fail-closed honesto
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}

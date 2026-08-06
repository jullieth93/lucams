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
 * - Solo JPEG/PNG/WebP raster y solo si superan el umbral seguro (~4 MB).
 *   HEIC pasa intacto (el navegador no lo decodifica; el servidor ya lo
 *   resuelve con heic-decode, y los HEIC de iPhone pesan 1–2 MB).
 * - Redimensión al borde largo ≤ 2400 px: sobra para imprimir a 300 DPI en
 *   los tamaños del catálogo (hasta ~20 cm) y no afecta el DPI-check.
 * - Salida JPEG q0.85 (los imanes se imprimen; el alpha no aplica acá).
 */

"use client";

export const COMPRESS_THRESHOLD_BYTES = 4 * 1024 * 1024; // ~4 MB, bajo el tope de Vercel
const MAX_EDGE_PX = 2400;
const JPEG_QUALITY = 0.85;

/** ¿Este archivo pasa por el compresor? (raster permitido y sobre el umbral). */
export function shouldCompress(file: Pick<File, "type" | "size">): boolean {
  return /^image\/(jpeg|png|webp)$/.test(file.type) && file.size > COMPRESS_THRESHOLD_BYTES;
}

/**
 * Devuelve el archivo listo para subir: original si no hace falta comprimir,
 * o un JPEG redimensionado/comprimido si superaba el umbral. Si el navegador
 * no puede procesarlo (raro), devuelve el original y que decida el servidor.
 */
export async function compressImageForUpload(file: File): Promise<File> {
  if (!shouldCompress(file)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file; // ante cualquier fallo del compresor, que el servidor intente como antes
  }
}

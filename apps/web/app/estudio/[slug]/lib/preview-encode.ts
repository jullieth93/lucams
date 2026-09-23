/*
 * Codificación del PREVIEW de confirmación pre-carrito (2026-09-22).
 *
 * El preview se componía en PNG sin compresión (canvas.toDataURL("image/png"))
 * y un grid de imanes/tiras superaba el límite de 3 MB del servidor
 * ("preview demasiado grande"). Ahora sale en WebP q≈0.85, con fallback JPEG
 * cuando el navegador no soporta WebP en canvas.toDataURL — la detección es
 * REAL (canvas de 1×1: Safari antiguo acepta el mime y devuelve PNG en
 * silencio, así que no basta con "el navegador es moderno").
 *
 * Seguro contra pérdida de alfa del JPEG: todos los previews se componen
 * sobre fondo CREMA opaco (buildCompositedPreview / buildBookmarkStripPreview
 * / montaje de calendario). NO usar para snapshots de producción (300 DPI,
 * silueta con transparencia — esos siguen en PNG).
 *
 * CONTRATO con el servidor: acepta image/webp, image/jpeg e image/png y
 * guarda con la extensión correcta; el cliente solo genera y envía el formato
 * correcto (extensión acorde al mime real, ver previewFileExtension).
 */

const PREVIEW_QUALITY = 0.85;

let webpSupported: boolean | null = null;

/** ¿canvas.toDataURL("image/webp") produce WebP de verdad en este navegador? */
export function supportsWebpExport(): boolean {
  if (webpSupported !== null) return webpSupported;
  try {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    webpSupported = probe.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    webpSupported = false;
  }
  return webpSupported;
}

/** MIME efectivo del preview: WebP si hay soporte real, JPEG si no. */
export function previewMimeType(): "image/webp" | "image/jpeg" {
  return supportsWebpExport() ? "image/webp" : "image/jpeg";
}

/** Serializa un canvas de preview (fondo opaco) en el MIME efectivo. */
export function canvasToPreviewDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL(previewMimeType(), PREVIEW_QUALITY);
}

/**
 * Re-codifica un dataURL de preview que un compositor devolvió en PNG
 * (ej. buildCalendarPreviewMontage) al MIME efectivo. Repinta sobre fondo
 * crema primero, por si el origen tuviera alfa (el JPEG no lo soporta).
 */
export async function reencodePreviewDataUrl(dataUrl: string): Promise<string> {
  if (dataUrl.startsWith(`data:${previewMimeType()}`)) return dataUrl;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("No se pudo decodificar el preview para comprimirlo"));
    el.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear contexto canvas para comprimir el preview");
  ctx.fillStyle = "#FFF8F0"; // brand-cream — mismo fondo de los compositores
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return canvasToPreviewDataUrl(canvas);
}

/** Extensión de archivo acorde al MIME real del dataURL (para el upload). */
export function previewFileExtension(dataUrl: string): string {
  const mime = dataUrl.match(/^data:([^;]+)/)?.[1];
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg") return "jpg";
  return "png";
}

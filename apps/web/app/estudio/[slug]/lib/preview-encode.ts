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
 *
 * Presupuesto de bytes (fix STG 2026-10-05): el preview viaja DENTRO del body
 * de la Server Action `finalizeDesignAction` y Vercel corta el body de una
 * Function en ~4.5 MB — techo duro que `serverActions.bodySizeLimit` NO
 * levanta (solo ajusta el parser de Next, no el de la plataforma). Un montaje
 * multi-unidad WebP q0.85 podía superarlo y el request moría con un 413 que el
 * cliente recibía como "NetworkError when attempting to fetch resource".
 * `fitPreviewToBudget` re-codifica (calidad decreciente y luego downscale,
 * misma escalera que `compressPreviewImage` del server, sharp-safe.ts) hasta
 * quedar por debajo de `PREVIEW_UPLOAD_BUDGET_BYTES` ANTES de armar el
 * FormData. El server conserva su re-compresión de 3–8 MB como red de
 * seguridad, pero el camino normal ya no depende de ella.
 */

const PREVIEW_QUALITY = 0.85;

/**
 * Techo del preview EN EL BODY del finalize: por debajo del cap ~4.5 MB de
 * Vercel con margen para el overhead multipart y el resto de campos del
 * FormData (designId, slotCount, etc. — todos minúsculos).
 */
export const PREVIEW_UPLOAD_BUDGET_BYTES = 3.5 * 1024 * 1024;

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

/** Tamaño en bytes del payload de un dataURL base64 (sin decodificarlo). */
export function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return 0;
  const b64 = dataUrl.slice(comma + 1);
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

export type PreviewFitPlan = { scales: number[]; qualities: number[] };

/**
 * Escalera escala × calidad para re-codificar un preview que no cabe en el
 * presupuesto. Misma matemática que `compressPreviewImage` (sharp-safe.ts) del
 * server: entradas muy grandes empiezan con resize (la calidad sola no basta
 * con un montaje fotográfico de varios MP); el resto prueba primero a tamaño
 * completo para conservar la nitidez de la vista previa.
 */
export function previewFitPlan(inputBytes: number): PreviewFitPlan {
  const scales = inputBytes > 4.5 * 1024 * 1024 ? [0.5, 0.35, 0.25] : [1, 0.75, 0.5, 0.35];
  const qualities = [0.82, 0.7, 0.58, 0.46];
  return { scales, qualities };
}

/**
 * Garantiza que el preview quepa en el body del finalize: si ya está por
 * debajo del presupuesto se devuelve tal cual (camino común, cero costo); si
 * no, se re-codifica con la escalera de `previewFitPlan` hasta que quepa.
 * Fail-closed igual que el server: si ninguna combinación baja del techo,
 * lanza — jamás se arma un FormData que Vercel va a cortar con un 413.
 */
export async function fitPreviewToBudget(
  dataUrl: string,
  budgetBytes = PREVIEW_UPLOAD_BUDGET_BYTES,
): Promise<string> {
  const inputBytes = dataUrlByteLength(dataUrl);
  if (inputBytes <= budgetBytes) return dataUrl;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("No se pudo decodificar el preview para ajustarlo"));
    el.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear contexto canvas para ajustar el preview");
  const { scales, qualities } = previewFitPlan(inputBytes);
  for (const scale of scales) {
    canvas.width = Math.max(64, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(64, Math.round(img.naturalHeight * scale));
    // Fondo crema opaco: la re-codificación puede caer a JPEG (sin alfa).
    ctx.fillStyle = "#FFF8F0";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of qualities) {
      const out = canvas.toDataURL(previewMimeType(), quality);
      if (dataUrlByteLength(out) <= budgetBytes) return out;
    }
  }
  throw new Error(
    "No pudimos preparar la vista previa para enviarla. Intenta de nuevo; si sigue, escríbenos por WhatsApp.",
  );
}

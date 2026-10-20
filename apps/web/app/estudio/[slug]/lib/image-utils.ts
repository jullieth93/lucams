/*
 * Utilidades de imagen compartidas por los editores del Estudio (studio-editor,
 * letter-set-editor, name-editor) y los compositores de preview de lib/.
 *
 * NOTA — `loadImage` acá es la variante SIN CORS del Estudio principal (los
 * dataURLs de snapshots Konva no la necesitan). Existen otras variantes
 * deliberadamente distintas que NO se unifican:
 *   - letter-set-editor / name-editor: wrapper de `loadCanvasImage`
 *     (optimizador de Next + fallback, devuelve `HTMLImageElement | null`).
 *   - lib/compose-calendar-page: `crossOrigin = "anonymous"` para fotos del
 *     bucket sin "taintar" el canvas.
 */

/**
 * Convierte un data URL base64 a Blob binario. Usado al finalizar el
 * diseño para enviar los PNGs como bytes raw vía FormData en vez de
 * strings base64 (que disparan "Maximum array nesting exceeded" en el
 * protocolo React Flight de Next 16 Server Actions).
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx < 0) throw new Error("dataURL inválido (sin coma)");
  const meta = dataUrl.slice(0, commaIdx);
  const base64 = dataUrl.slice(commaIdx + 1);
  const mimeMatch = meta.match(/^data:([^;]+)/);
  const mime = mimeMatch?.[1] ?? "image/png";
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar imagen para textura 3D"));
    img.src = dataUrl;
  });
}

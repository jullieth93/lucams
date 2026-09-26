/*
 * Carga de imágenes para composición CANVAS exportable (preview/3D) a prueba
 * de CORS (2026-09-25 — bug STG: las fichas de letras ilustradas se veían
 * solo-letra en la vista 3D).
 *
 * La composición canvas (toDataURL/toBlob) exige que la imagen NO contamine:
 * se carga con crossOrigin="anonymous", así que el host de la imagen debe
 * responder CORS para el origen actual. Cuando no lo hace (caso real en STG:
 * el bucket autoriza el dominio de prod pero NO el preview de Vercel, o
 * migraciones de storage que dejan URLs sin cabeceras CORS), la carga falla EN
 * SILENCIO y la ficha degrada a letra plana — mientras el <img> del lienzo
 * (que no usa CORS) sí muestra la ilustración. De ahí el síntoma: canvas
 * ilustrado, 3D solo-letra.
 *
 * La ruta por el optimizador de Next (/_next/image) es MISMO ORIGEN → no
 * exige CORS del bucket, y de regalo sirve la imagen redimensionada (texturas
 * más livianas). Si el optimizador falla (host fuera de `remotePatterns`,
 * imagen corrupta), se intenta la URL directa como antes. Si ambas fallan, se
 * deja warning en consola (antes la degradación era invisible).
 */

/** URL a usar para cargar una imagen remota en un canvas exportable. */
export function canvasSafeImageSrc(url: string, width = 640): string {
  // data:, blob: y relativas (mismo origen por definición) van directas.
  if (!/^https?:\/\//i.test(url)) return url;
  return `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=80`;
}

/**
 * Carga una imagen para canvas: primero por el optimizador de Next (mismo
 * origen → sin exigencia de CORS del bucket), luego la URL directa (camino
 * histórico). null si ambas fallan.
 */
export function loadCanvasImage(url: string, width = 640): Promise<HTMLImageElement | null> {
  const attempt = (src: string) =>
    new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  const optimized = canvasSafeImageSrc(url, width);
  if (optimized === url) return attempt(url);
  return attempt(optimized).then(async (img) => {
    if (img) return img;
    const direct = await attempt(url);
    if (!direct) {
      console.warn(
        "[canvas-image] no se pudo cargar la imagen (ni por el optimizador ni directa):",
        url.slice(0, 140),
      );
    }
    return direct;
  });
}

/*
 * `sharp` endurecido: única puerta de entrada a la librería en todo el proyecto.
 *
 * PROBLEMA. `sharp` hereda de libvips las CVE-2026-33327, 33328, 35590 y 35591 (dos de severidad
 * alta en CVSSv4), que solo se parchean en `sharp >= 0.35.0`. Pero esta app está clavada en 0.34.4
 * a propósito: el commit `6e86f94` bajó de 0.35.3 porque libvips reventaba en el runtime de Vercel.
 * Es decir, la versión que arregla la vulnerabilidad es la que tumba producción — y 0.35.3 sigue
 * siendo la última publicada, así que no hay una versión que resuelva ambas cosas.
 *
 * Y la exposición es real, no teórica: el Estudio está vivo en modo catálogo y `finalizeDesign`
 * procesa con sharp las fotos que sube cualquier invitado.
 *
 * SOLUCIÓN. El propio advisory de sharp documenta una mitigación sin actualizar: bloquear los
 * cargadores vulnerables. Las CVE están en los decodificadores de GIF, TIFF y del formato nativo
 * VIPS — y esta tienda no acepta ninguno de los tres: `ALLOWED_MIME` en `schemas.ts` se limita a
 * jpeg, png, webp, heic y heif. Bloquearlos cierra el vector con cero impacto funcional.
 *
 * Fuente: https://github.com/advisories/GHSA-f88m-g3jw-g9cj (consultado 2026-07-25).
 *
 * POR QUÉ UN MÓDULO Y NO UNA LLAMADA SUELTA. `sharp.block()` es global y basta con ejecutarlo una
 * vez, pero si cada archivo importara `sharp` directamente bastaría con que uno nuevo olvidara el
 * bloqueo para reabrir el hueco. Importando desde acá, usar sharp implica estar endurecido.
 *
 * AL SUBIR A >= 0.35.x: este bloqueo puede retirarse, pero conviene conservarlo igual — sigue
 * siendo superficie de ataque que la tienda no usa.
 */

import sharp from "sharp";

// Cargadores de los formatos que la tienda NO acepta y donde viven las CVE de libvips.
const BLOCKED_LOADERS = ["VipsForeignLoadNsgif", "VipsForeignLoadTiff", "VipsForeignLoadVips"];

sharp.block({ operation: BLOCKED_LOADERS });

export { BLOCKED_LOADERS };
// `sharp` se publica con `export =`, así que los tipos se re-exportan uno a uno (no vale `export *`).
export type { OverlayOptions, Sharp, Metadata, ResizeOptions } from "sharp";
export default sharp;

// ─────────────────────────────────────────────────────────────────────
//  Re-compresión del preview del Estudio (T2, 2026-09-22)
// ─────────────────────────────────────────────────────────────────────
//
// El preview que manda el cliente (finalizeDesignAction) tiene techo de 3 MB
// (cap de 4.5 MB del body de una Function de Vercel + bucket design-previews
// con max 3 MB — docs/DECISIONS.md). Antes se rechazaba de plano; ahora se
// RE-COMPRIME acá (webp, calidad decreciente y luego resize) y solo se falla
// si es físicamente imposible bajarlo.

/** Techo del preview YA comprimido (bucket design-previews + margen del body). */
export const PREVIEW_TARGET_BYTES = 3 * 1024 * 1024;

/** Mimes que el server action acepta para el preview (contrato con el Estudio). */
export const PREVIEW_ALLOWED_MIME = ["image/webp", "image/jpeg", "image/png"] as const;
export type PreviewMime = (typeof PREVIEW_ALLOWED_MIME)[number];

/** Extensión de archivo para un mime de preview aceptado. */
export function previewExtensionForMime(mime: string): "webp" | "jpg" | "png" {
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg") return "jpg";
  return "png";
}

/**
 * Re-comprime un preview que supera `maxBytes`: escalera de escala × calidad
 * webp hasta que quepa. Fail-closed: si ninguna combinación baja del techo (o
 * el buffer no es una imagen decodificable), lanza — el caller traduce a un
 * error de validación, jamás sube un archivo que el bucket rechazaría.
 */
export async function compressPreviewImage(input: Buffer, maxBytes = PREVIEW_TARGET_BYTES) {
  // metadata() valida que el buffer sea una imagen real (un blob con mime
  // mentiroso cae acá, antes de cualquier pipeline).
  const meta = await sharp(input).metadata();
  const baseWidth = Math.min(meta.width ?? 1080, 2048);
  // Entradas enormes (>4.5 MB, el cap de Vercel) empiezan con resize: la
  // calidad sola no basta con un PNG fotográfico de varios MP.
  const scales = input.length > 4.5 * 1024 * 1024 ? [0.5, 0.35, 0.25] : [1, 0.75, 0.5, 0.35];
  const qualities = [82, 70, 58, 46];
  for (const scale of scales) {
    const width = Math.max(64, Math.round(baseWidth * scale));
    for (const quality of qualities) {
      const out = await sharp(input)
        .rotate() // respeta EXIF de orientación (fotos de celular)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();
      if (out.length <= maxBytes) {
        return { buffer: out, mime: "image/webp" as const, width };
      }
    }
  }
  throw new Error(`preview incomprimible por debajo de ${Math.round(maxBytes / 1024 / 1024)}MB`);
}

/*
 * Marca de agua "LUCAMS" en tiling (2026-10-13 — extraído de lib/storage.ts para
 * reusarlo fuera de la galería de prediseñados: previews de diseños del cliente).
 *
 * La baldosa es un SVG con patrón ladrillo (dos textos desplazados, rotados -24°),
 * texto blanco semitransparente con un hairline oscuro para que se lea también
 * sobre fondos claros. sharp la rasteriza y la repite con composite({ tile: true })
 * — nítida a cualquier tamaño y sin depender de assets de public/brand (que son
 * para UI, no para quemar en imagen).
 *
 * Las superficies de VISUALIZACIÓN sirven la versión watermark; producción y
 * admin NUNCA la llevan (decisión de producto 2026-10-13).
 */

import "server-only";

/** Calidad WebP por defecto de las versiones watermark (misma del thumb de galería). */
export const WATERMARK_WEBP_QUALITY = 78;

/**
 * Baldosa SVG del watermark "LUCAMS" en tiling. tileW/tileH se ajustan al tamaño
 * de la imagen (sharp exige que el input del composite sea ≤ la base; diseños
 * chicos → baldosa chica) y el viewBox fijo 380×230 escala el dibujo completo
 * (texto incluido) a ese tamaño.
 */
export function buildWatermarkTileSvg(tileW: number, tileH: number): string {
  const text = (x: number, y: number) =>
    `<text x="${x}" y="${y}" fill="#ffffff" fill-opacity="0.30" stroke="#000000" stroke-opacity="0.10" stroke-width="1.2">LUCAMS</text>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${tileH}" viewBox="0 0 380 230">` +
    `<g font-family="DejaVu Sans, Verdana, sans-serif" font-size="36" font-weight="700" letter-spacing="8">` +
    `<g transform="rotate(-24 190 115)">${text(20, 96)}${text(200, 212)}</g>` +
    `</g></svg>`
  );
}

/**
 * Aplica el tiling del watermark sobre una imagen y la devuelve como WebP.
 * `maxEdgePx` (opcional) capa el borde largo ANTES de pintar (sin agrandar) —
 * para miniaturas; sin él la imagen conserva su tamaño. Lanza si sharp no
 * decodifica (el llamador decide si es fatal o best-effort).
 */
export async function applyTiledWatermark(
  buffer: Buffer,
  opts?: { maxEdgePx?: number; quality?: number },
): Promise<{ data: Buffer; width: number; height: number }> {
  const sharp = (await import("@/features/personalization/sharp-safe")).default;
  // LUC-SEC-005 — presupuesto explícito de píxeles (defensa en profundidad: el
  // input ya viene normalizado, pero el contrato no depende del orden).
  const LIMITS = { limitInputPixels: 50_000_000, limitInputChannels: 4, pages: 1 };
  let img = sharp(buffer, LIMITS).rotate(); // auto-orient por EXIF + strip
  if (opts?.maxEdgePx) {
    img = img.resize({
      width: opts.maxEdgePx,
      height: opts.maxEdgePx,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  const resized = await img.toBuffer({ resolveWithObject: true });
  const out = await sharp(resized.data, LIMITS)
    .composite([
      {
        input: Buffer.from(
          buildWatermarkTileSvg(
            Math.min(380, resized.info.width),
            Math.min(230, resized.info.height),
          ),
        ),
        tile: true,
        blend: "over",
      },
    ])
    .webp({ quality: opts?.quality ?? WATERMARK_WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });
  return { data: out.data, width: out.info.width, height: out.info.height };
}

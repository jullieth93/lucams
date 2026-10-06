/*
 * Resolución de las texturas que se hornean para las caras 3D (integrado
 * 2026-10-05 en `buildMagnetTextures` de studio-editor.tsx, que antes fijaba
 * el ancho en 512 px para TODAS las piezas).
 *
 * Por qué: con el zoom cercano nuevo de los visores 3D (minDistance ↓) y el
 * dpr hasta 2 en táctil, una textura de 512 px en una pieza de 10-15 cm se
 * ve borrosa justo cuando el cliente se acerca a leerla. La resolución debe
 * escalar con el TAMAÑO FÍSICO de la pieza, no ser fija.
 *
 * Módulo PURO → testeable y reutilizable desde cualquier constructor de
 * texturas (preview 3D, galería "en tu espacio", flat-lays).
 */

/** Ancho por defecto de la textura de una cara (piezas chicas/medianas). */
export const MAGNET_TEXTURE_WIDTH_DEFAULT = 1024;
/** Ancho para piezas grandes (tiras, alargados, calendario). */
export const MAGNET_TEXTURE_WIDTH_LARGE = 2048;
/** Lado mayor (cm) a partir del cual la pieza se considera grande. */
export const LARGE_PIECE_CM = 10;

/** Parser local de "6.5×20"/"4×12" → cm (misma gramática que book-geometry). */
function parseSizeCm(sizeCm: string | undefined | null): { wCm: number; hCm: number } | null {
  if (!sizeCm) return null;
  const m = sizeCm.match(/^(\d+(?:[.,]\d+)?)(?:\s*[×x]\s*(\d+(?:[.,]\d+)?))?$/i);
  if (!m) return null;
  const w = parseFloat(m[1]!.replace(",", "."));
  const h = m[2] ? parseFloat(m[2].replace(",", ".")) : w;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { wCm: w, hCm: h };
}

/**
 * Ancho de textura recomendado para la cara de una pieza.
 *
 * Regla: si el lado MAYOR de la pieza física alcanza `largePieceCm` (default
 * 10 cm — tiras 6.5×20, alargados 4×12/15, tarjeta de calendario), la textura
 * va a 2048 px de ancho; si no, a 1024. Sin sizeCm parseable → default (el
 * comportamiento más seguro: nunca menos que hoy, 512 → 1024 sube la nitidez
 * de todas las piezas chicas, que son las que más se acercan con el zoom).
 *
 * Tope de memoria: una cara 2048×~2800 RGBA ≈ 23 MB por textura — aceptable en
 * desktop; en móvil gama baja el integrador puede bajar `large` a 1536 si el
 * profiler lo marca (no hay evidencia aún — validar en dispositivo real).
 */
export function magnetTextureWidth(opts?: {
  /** sizeCm de la variante (ej "6.5×20"). Si falta o no parsea → default. */
  sizeCm?: string | null;
  /** Ancho para piezas chicas/medianas. Default 1024. */
  base?: number;
  /** Ancho para piezas grandes. Default 2048. */
  large?: number;
  /** Umbral (cm del lado mayor) para considerar la pieza grande. Default 10. */
  largePieceCm?: number;
}): number {
  const base = opts?.base ?? MAGNET_TEXTURE_WIDTH_DEFAULT;
  const large = opts?.large ?? MAGNET_TEXTURE_WIDTH_LARGE;
  const threshold = opts?.largePieceCm ?? LARGE_PIECE_CM;
  const cm = parseSizeCm(opts?.sizeCm);
  if (!cm) return base;
  return Math.max(cm.wCm, cm.hCm) >= threshold ? large : base;
}

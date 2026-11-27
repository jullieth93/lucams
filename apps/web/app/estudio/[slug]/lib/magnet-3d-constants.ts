/*
 * Constantes y helpers geométricos PUROS de MagnetMesh / escenas 3D.
 *
 * Extraídos de `magnet-3d.tsx` para desacoplar el chunk inicial del Estudio 2D
 * (`scene-gallery.tsx`, `studio-editor.tsx`) del runtime de Three.js /
 * `@react-three/fiber` / `@react-three/drei` (Fase 5 · #19).
 *
 * Invariante: CERO imports de `three`, `@react-three/*` ni React en este módulo.
 */

export type MagnetShape = "rectangle" | "circle" | "heart" | "custom";

/**
 * Parsea "6.5×6.5", "7.5x10", "6" → { wCm, hCm }. Con un solo número asume cuadrado/diámetro.
 * Misma gramática que `parseSize` de lib/size-comparator.ts (duplicada acá porque ese módulo no
 * exporta el parser y los helpers 3D no deben acoplarse a copy de marketing).
 */
export function parseSizeCm(sizeCm: string | undefined): { wCm: number; hCm: number } | null {
  if (!sizeCm) return null;
  const m = sizeCm.match(/^(\d+(?:\.\d+)?)(?:\s*[×x]\s*(\d+(?:\.\d+)?))?$/i);
  if (!m) return null;
  const w = parseFloat(m[1]!);
  const h = m[2] ? parseFloat(m[2]) : w;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { wCm: w, hCm: h };
}

/**
 * Región normalizada de textura para la cara impresa de MagnetMesh. Coordenadas 0..1 con `y`
 * medido DESDE ARRIBA de la imagen (como se lee).
 */
export type TextureRegion = {
  x: number;
  y: number;
  w: number;
  h: number;
  flipV?: boolean;
  flipU?: boolean;
  swapAxes?: boolean;
};

export const FULL_REGION: TextureRegion = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Transform de la textura clonada (repeat/offset/rotation) para mapear `region` sobre la tapa
 * del extruido. Los UV de la tapa del ExtrudeGeometry son las coordenadas CRUDAS del shape.
 */
export function textureRegionTransform(
  region: TextureRegion,
  width: number,
  height: number,
): { repeat: [number, number]; offset: [number, number]; rotation: number } {
  const { x: rx, y: ry, w: rw, h: rh, flipV, flipU, swapAxes } = region;
  if (swapAxes) {
    return {
      repeat: [(flipV ? -rh : rh) / height, (flipU ? rw : -rw) / width],
      offset: [1 - ry - rh / 2, rx + rw / 2],
      rotation: Math.PI / 2,
    };
  }
  return {
    repeat: [(flipU ? -rw : rw) / width, (flipV ? -rh : rh) / height],
    offset: [rx + rw / 2, 1 - ry - rh / 2],
    rotation: 0,
  };
}

/**
 * Equivalente a background-size:cover en coordenadas de región: la mayor sub-región centrada de
 * la imagen (aspecto `srcAspect` = w/h) que llena una cara de aspecto `dstAspect` sin deformar.
 */
export function coverRegion(srcAspect: number, dstAspect: number): TextureRegion {
  if (srcAspect <= 0 || dstAspect <= 0) return FULL_REGION;
  if (Math.abs(srcAspect - dstAspect) < 1e-3) return FULL_REGION;
  if (srcAspect < dstAspect) {
    const h = srcAspect / dstAspect;
    return { x: 0, y: (1 - h) / 2, w: 1, h };
  }
  const w = dstAspect / srcAspect;
  return { x: (1 - w) / 2, y: 0, w, h: 1 };
}

/**
 * Región de textura para una cara del separador doblado (FoldedStripMesh).
 */
export function foldedFaceRegion(
  wRatio: number,
  hRatio: number,
  stripW: number,
  hang: number,
): TextureRegion {
  const srcAspect = wRatio / hRatio;
  const dstAspect = stripW / hang;
  const swapAxes = (srcAspect - 1) * (dstAspect - 1) < 0;
  const region = coverRegion(swapAxes ? 1 / srcAspect : srcAspect, dstAspect);
  return swapAxes ? { ...region, swapAxes: true } : region;
}

/** Tamaño físico por defecto cuando falta el dato de cm (imán cuadrado típico de la tienda). */
const DEFAULT_MAGNET_CM = 6.5;

/**
 * Tamaños físicos en unidades de mundo para una tira de imanes, dados sus cm reales y la escala
 * de la escena (`uPerCm` = unidades de mundo por centímetro).
 */
export function magnetWorldSizes(
  items: readonly { wRatio: number; hRatio: number; wCm?: number; hCm?: number }[],
  uPerCm: number,
  opts: { fallbackSizeCm?: string } = {},
): { w: number; h: number }[] | null {
  const parsed = parseSizeCm(opts.fallbackSizeCm);
  const anyCm = items.some((m) => m.wCm ?? m.hCm ?? parsed);
  if (!anyCm) return null;
  const sizes = items.map((m) => {
    const aspect = m.hRatio / m.wRatio;
    const wCm = m.wCm ?? parsed?.wCm ?? (m.hCm ? m.hCm / aspect : DEFAULT_MAGNET_CM);
    const w = wCm * uPerCm;
    return { w, h: w * aspect };
  });
  const maxW = Math.max(...sizes.map((s) => s.w));
  const maxH = Math.max(...sizes.map((s) => s.h));
  if (!(maxW > 0) || !(maxH > 0)) return null;
  return sizes;
}

/**
 * Métricas del separador magnético DOBLADO (tira impresa de stripW × stripL que se pliega sobre
 * un borde redondeado de radio `rFold`).
 */
export function foldedStripMetrics(
  stripL: number,
  rFold: number,
  foldAngle: number,
): {
  delta: number;
  hang: number;
  crestArc: number;
} {
  const crestArc = Math.min(Math.PI, Math.max(0, foldAngle));
  const delta = (Math.PI - foldAngle) / 2;
  const hang = Math.max(0.05, (stripL - rFold * crestArc) / 2);
  return { delta, hang, crestArc };
}

/** Grosor físico real del fotoimán flexible (2 mm). */
export const MAGNET_THICKNESS_CM = 0.2;
/** Grosor físico real de las fichas de letras (1.5 mm). */
export const TILE_THICKNESS_CM = 0.15;
/** Grosor físico real de las tarjetas del Calendario Set 12 (cartulina ~0.4 mm). */
export const CALENDAR_CARD_THICKNESS_CM = 0.04;
/** Piso mínimo de profundidad en unidades de mundo anti-z-fighting. */
export const MIN_WORLD_DEPTH = 0.008;

/**
 * Grosor de la pieza en unidades de mundo derivado de la escala `uPerCm` y `thicknessCm`.
 */
export function realWorldDepth(uPerCm: number, thicknessCm = MAGNET_THICKNESS_CM): number {
  return Math.max(MIN_WORLD_DEPTH, thicknessCm * uPerCm);
}

/** Negro del imán (goma ferrita sin laminar) para reversos y cantos magnéticos. */
export const MAGNET_BACK_COLOR = "#1A1A1A";
/** Blanco de respaldo de una cara B sin diseñar mientras se genera el patrón «Lucams». */
export const BLANK_FACE_COLOR = "#FFFFFF";
/** Umbral de corte alfa de las tapas impresas (cutout opaco anti-borde negro). */
export const FACE_ALPHA_TEST = 0.5;
/** Rotación de 180° en Y para voltear hacia la cara B en vistas 3D. */
export const FACE_FLIP_ROTATION: readonly [number, number, number] = [0, Math.PI, 0];

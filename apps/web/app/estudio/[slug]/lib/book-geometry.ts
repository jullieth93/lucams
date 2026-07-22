/*
 * Geometría PURA del libro abierto de BookView3D (ola 2C — foto de referencia de Lucy: libro
 * ABIERTO acostado visto desde arriba-3/4, con separadores magnéticos doblados sobre el borde
 * superior de las páginas). Sin imports de three → testeable en vitest node.
 *
 * Escala: 0.3 unidades de mundo por cm (misma de la escena anterior). Libro 17×24 cm cerrado
 * (abierto: pliego de 34×24 cm), separadores de 6×2 cm o 4×4.2 cm — proporciones reales.
 *
 * Modelo vertical (la mesa es y=0, el libro reposa sobre ella):
 *   cubierta (COVER_T) → bloque de páginas (BLOCK_T) → hoja superior curva (camber).
 * El camber levanta la hoja hacia el lomo (x=0) y cae a 0 en el corte exterior — como un libro
 * de verdad abierto. Esa elevación es la que deja AIRE bajo el borde superior cerca del lomo,
 * así la cara trasera del separador cuelga libre (visible al orbitar) sin atravesar la mesa.
 */

export const CM = 0.3;
/** Ancho de cada página: del lomo (x=0) al corte exterior. 17 cm. */
export const PAGE_W = 17 * CM; // 5.1
/** Fondo de la página: del borde inferior (lector, +Z) al superior (−Z). 24 cm. */
export const PAGE_D = 24 * CM; // 7.2
/** Grosor del cartón de cubierta (~1.7 mm). */
export const COVER_T = 0.05;
/** Grosor del bloque de páginas por lado (~8 mm). */
export const BLOCK_T = 0.24;
/** Sobrehueso de la cubierta respecto al bloque (8 mm). */
export const COVER_OVERHANG = 0.24;
/** Levante máximo de la hoja hacia el lomo (~3 cm — libro grueso fotogénico). */
export const CAMBER_MAX = 0.9;
/** Hundimiento de la hoja justo en el lomo (el valle de la encuadernación). */
export const GUTTER_DIP = 0.12;
/** Rendija entre las dos hojas en el lomo. */
export const GUTTER_GAP = 0.06;

/** Curva de la hoja superior: 0 en el corte (|x|=PAGE_W), ~CAMBER_MAX hacia el lomo, con dip. */
export function camber(x: number): number {
  const t = Math.min(1, Math.abs(x) / PAGE_W);
  const profile = Math.pow(Math.cos((t * Math.PI) / 2), 1.2);
  const dip = GUTTER_DIP * Math.exp(-((x / 0.25) ** 2));
  return CAMBER_MAX * profile - dip;
}

/** Altura (mundo) de la superficie de la hoja superior sobre la mesa en la coordenada x dada. */
export function pageSurfaceY(x: number): number {
  return COVER_T + BLOCK_T + camber(x);
}

// ── Separadores doblados sobre el borde superior (z = −PAGE_D/2) ──

/** Ángulo entre las dos caras del separador: ~95° (la frontal reposa casi plana sobre la hoja,
 *  la trasera cuelga apenas pasada la vertical abrazando el canto del bloque). */
export const SEP_FOLD_ANGLE = (95 * Math.PI) / 180;
/** Radio del pliegue: abraza el filo de la hoja (~2 mm de cartulina plastificada + holgura). */
export const SEP_R_FOLD = 0.06;
/** Esquinas REDONDAS del separador (foto Lucy): radio ≈ 11% del ancho de la tira. */
export const SEP_CORNER_RATIO = 0.11;
/** Elevación de la cara frontal sobre la hoja: casi acostada (3°) — reposa, no flota. */
export const SEP_FRONT_LIFT_DEG = 3;

export type SeparatorPlacement = {
  /** Altura del eje del pliegue sobre la mesa. */
  crestY: number;
  /** z del eje del pliegue (apenas detrás del filo de la hoja). */
  crestZ: number;
  /** Rotación del grupo FoldedStripMesh sobre X (rad, negativa): baja la cara frontal a la hoja. */
  tilt: number;
  /** Largo visible de cada cara. */
  hang: number;
  /** Altura de la punta de la cara frontal (debe quedar ~sobre la superficie de la hoja). */
  frontTipY: number;
  /** Superficie de la hoja bajo el separador (referencia para el reposo de la punta). */
  surfaceY: number;
  /** Aire bajo el fondo de la cara trasera (≥ 0 → no atraviesa la mesa). */
  backClearance: number;
};

/**
 * Colocación de UN separador doblado sobre el borde superior de las páginas en x = bx.
 *
 * Marco de FoldedStripMesh: eje del pliegue = X; cara frontal cuelga hacia −Y del lado +Z
 * rotada −δ; la trasera π+δ; con δ = (π − foldAngle)/2. Al rotar el grupo COMPLETO θ sobre X:
 *   frontal: dirección (0, −cos(δ−θ), +sin(δ−θ))  → baja 90°−(δ−θ) bajo la horizontal
 *   trasera: dirección (0, −cos(δ+θ), −sin(δ+θ))  → baja 90°−(δ+θ) bajo la horizontal
 * θ se elige para que la frontal quede SEP_FRONT_LIFT_DEG sobre la hoja; la trasera cae ~2°
 * pasada la vertical (abrazando el canto del bloque, visible al orbitar detrás del libro).
 */
export function separatorPlacement(bx: number, stripL: number): SeparatorPlacement {
  // Espejo de foldedStripMetrics (magnet-3d) — duplicado para mantener este módulo sin three.
  const crestArc = Math.min(Math.PI, Math.max(0, SEP_FOLD_ANGLE));
  const delta = (Math.PI - SEP_FOLD_ANGLE) / 2;
  const hang = Math.max(0.05, (stripL - SEP_R_FOLD * crestArc) / 2);
  const tilt = delta - (Math.PI / 2 - (SEP_FRONT_LIFT_DEG * Math.PI) / 180);
  const surfaceY = pageSurfaceY(bx);
  // El pliegue abraza el filo de la hoja: eje un 80% del radio sobre la superficie y un
  // radio + holgura detrás del filo (la trasera cuelga libre del canto del bloque).
  const crestY = surfaceY + SEP_R_FOLD * 0.8;
  const crestZ = -PAGE_D / 2 - SEP_R_FOLD - 0.015;
  const frontTipY = crestY - hang * Math.cos(delta - tilt);
  const backBottomY = crestY - hang * Math.cos(delta + tilt);
  return {
    crestY,
    crestZ,
    tilt,
    hang,
    frontTipY,
    surfaceY,
    backClearance: backBottomY,
  };
}

/** Posiciones x de los 3 separadores (a distintas alturas gracias al camber) + giros naturales. */
export const SEPARATOR_SLOTS: readonly { x: number; yaw: number }[] = [
  { x: -2.25, yaw: 0.07 },
  { x: 0.55, yaw: -0.06 },
  { x: 2.15, yaw: 0.05 },
];

/** Encuadre de la cámara (FitCameraPolar): pliego completo + holgura, vista desde arriba-3/4. */
export const BOOK_FIT = {
  halfW: PAGE_W + COVER_OVERHANG + 0.16,
  halfH: 3.6,
  polarDeg: 48,
  targetY: 0.45,
} as const;

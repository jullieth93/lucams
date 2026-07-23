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
/** Levante máximo de la hoja hacia el lomo (~2 cm — ola 4: libro MÁS PLANO; era 3 cm). */
export const CAMBER_MAX = 0.6;
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

/** Ángulo entre las dos caras del separador: ~95° (la frontal reposa casi plana sobre la hoja
 *  —erguida solo SEP_FRONT_LIFT_DEG— y la trasera cuelga apenas pasada la vertical abrazando
 *  el canto del bloque). */
export const SEP_FOLD_ANGLE = (95 * Math.PI) / 180;
/** Radio del pliegue: abraza el filo de la hoja (~2 mm de cartulina plastificada + holgura). */
export const SEP_R_FOLD = 0.06;
/** Esquinas REDONDAS del separador (foto Lucy): radio ≈ 11% del ancho de la tira. */
export const SEP_CORNER_RATIO = 0.11;
/** Elevación de la cara frontal sobre la hoja (ola 4 — Lucy: separador "un punto más erguido",
 *  de pie sobre el borde para leer ambas caras): 14° sobre la hoja (era 3°, casi acostada).
 *  La punta sigue REPOSANDO sobre la hoja — el pliegue sube lo justo (ver separatorPlacement). */
export const SEP_FRONT_LIFT_DEG = 14;

// ── Ola 3 (2026-07-22) — separadores con las 2 CARAS REALES del Estudio ──
//
// El Estudio produce 2N texturas (convención de lib/faces.ts: slot par = cara A, impar = cara B
// de cada unidad) y el lienzo de cada slot es UNA CARA (600×200 rectangular · 400×420 cuadrada).
// El sizeCm de la variante ("6×2" · "4×4.2") son las dimensiones de ESA cara — la tira
// desplegada mide 2 caras + lo que come la cresta del pliegue.

/** Aire mínimo bajo la punta de la cara trasera: si no cuelga libre, se RECUESTÁ sobre la mesa. */
export const BACK_TIP_CLEARANCE = 0.02;
/** Apertura máxima de la cara trasera recostada (rad, ~49°): más que esto se ve roto → no se
 *  muestra el separador en ese slot. */
export const MAX_BACK_LEAN = 0.85;

/** Cara rectangular por defecto (template 600×200 → 6×2 cm reales). */
const FACE_RECT_CM = { wCm: 6, hCm: 2 } as const;
/** Cara cuadrada por defecto (template 400×420 → 4×4.2 cm reales). */
const FACE_SQUARE_CM = { wCm: 4, hCm: 4.2 } as const;

/** Parser local de "6×2"/"4×4.2" → cm (duplicado de magnet-3d.parseSizeCm para mantener este
 *  módulo sin three; misma gramática). */
function parseSizeCmLocal(sizeCm: string | undefined): { wCm: number; hCm: number } | null {
  if (!sizeCm) return null;
  const m = sizeCm.match(/^(\d+(?:\.\d+)?)(?:\s*[×x]\s*(\d+(?:\.\d+)?))?$/i);
  if (!m) return null;
  const w = parseFloat(m[1]!);
  const h = m[2] ? parseFloat(m[2]) : w;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { wCm: w, hCm: h };
}

/** Lienzo de CARA (ola 3) vs tira completa vieja: las caras son ~cuadradas/horizontales
 *  (400×420 ≈ 0.95 · 600×200 = 3); la tira vieja es vertical ~5:14 ≈ 0.36. */
const FACE_CANVAS_MIN_ASPECT = 0.6;

/**
 * Dimensiones de la tira desplegada (unidades de mundo) para la cara dada.
 *
 * Regla ola 3: la CARA manda — el lienzo del Estudio es UNA cara y `sizeCm` de la variante son
 * sus cm reales, así la cara 3D queda con el MISMO aspecto que la textura (coverRegion = región
 * completa → NO se re-corta el encuadre que dejó el cliente) y una cara 4×4.2 se ve distinta de
 * una 6×2. Prioridad de cm: wCm/hCm de la pieza (sets mixtos) → sizeCm de la variante → aspecto
 * del lienzo (600×200 → 6×2 · 400×420 → 4×4.2).
 *
 * Diseños VIEJOS (tira completa vertical ~5:14, sin sizeCm): se conserva la interpretación
 * histórica (tira 2×6 cm) para no romper previews de diseños pre-ola-3.
 */
export function stripDimsForFace(
  face: { wRatio: number; hRatio: number; wCm?: number; hCm?: number },
  sizeCm?: string,
): { stripW: number; stripL: number } {
  const aspect = face.wRatio / face.hRatio;
  if (!sizeCm && !(face.wCm && face.hCm) && aspect < FACE_CANVAS_MIN_ASPECT) {
    return { stripW: 2 * CM, stripL: 6 * CM }; // tira vieja 5:14 (ola 2C)
  }
  const cm =
    face.wCm && face.hCm
      ? { wCm: face.wCm, hCm: face.hCm }
      : (parseSizeCmLocal(sizeCm) ?? (aspect >= 1.8 ? FACE_RECT_CM : FACE_SQUARE_CM));
  // Ola 6 — el separador rectangular se dobla de PIE sobre el borde del libro: el lado CORTO
  // del lienzo (hCm, ej. 2 cm) es el ANCHO de la tira, y el lado LARGO (wCm, ej. 6 cm) es la
  // mitad del largo desplegado. La textura se rota 90° en el editor antes de llegar acá.
  const stripW = cm.hCm * CM;
  // Tira = 2 caras + lo que come la cresta → hang resultante = wCm·CM exacto (espejo de
  // foldedStripMetrics con rFold=SEP_R_FOLD y crestArc=SEP_FOLD_ANGLE).
  const stripL = 2 * cm.wCm * CM + SEP_R_FOLD * SEP_FOLD_ANGLE;
  return { stripW, stripL };
}

/**
 * Agrupa las texturas del Estudio en UNIDADES físicas de separador (ola 3 — convención de
 * lib/faces.ts: slot par = cara A → AL FRENTE, slot impar = cara B → ATRÁS). Con unidad impar
 * (no debería: facesPerUnit=2) la última repite su diseño atrás.
 *
 * Ola 6 — cuando llega `sizeCm` (variante de separador con dimensiones reales) forzamos el
 * pareo de caras, aunque las texturas ya hayan sido rotadas 90° en el editor y su aspecto
 * hRatio/wRatio sea menor que FACE_CANVAS_MIN_ASPECT. Sin este hint las caras rectangulares
 * (6×2) se confundían con tiras viejas y se repetía la misma textura en frente y atrás.
 *
 * Diseños VIEJOS de tira completa (lienzo vertical, pre-ola-3): no traen cara B — cada textura
 * es su propia unidad y repite el diseño en ambas caras (comportamiento histórico).
 */
export function bookmarkFaceUnits<T extends { wRatio: number; hRatio: number }>(
  bookmarks: readonly T[],
  /** sizeCm de la variante: si llega, confirma que estamos en el flujo moderno de caras. */
  sizeCm?: string,
): { front: T; back: T }[] {
  const looksLikeFaces =
    sizeCm !== undefined ||
    (bookmarks.length > 0 &&
      bookmarks.every((b) => b.wRatio / b.hRatio >= FACE_CANVAS_MIN_ASPECT));
  if (!looksLikeFaces) return bookmarks.map((b) => ({ front: b, back: b }));
  const units: { front: T; back: T }[] = [];
  for (let k = 0; 2 * k < bookmarks.length; k++) {
    const front = bookmarks[2 * k]!;
    units.push({ front, back: bookmarks[2 * k + 1] ?? front });
  }
  return units;
}

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
  /** Aire bajo el fondo de la cara trasera colgando libre (≥ 0 → no toca la mesa). */
  backClearance: number;
  /** Apertura EXTRA de la cara trasera (rad, ola 3): cuando la cara es larga (4×4.2) y colgando
   *  libre atravesaría la mesa, la trasera se RECUESTÁ sobre la mesa detrás del libro — como la
   *  cartulina flexible real. 0 cuando cuelga libre; Infinity cuando ni recostada cabe. */
  backLean: number;
};

/**
 * Colocación de UN separador doblado sobre el borde superior de las páginas en x = bx.
 *
 * Marco de FoldedStripMesh: eje del pliegue = X; cara frontal cuelga hacia −Y del lado +Z
 * rotada −δ; la trasera π+δ; con δ = (π − foldAngle)/2. Al rotar el grupo COMPLETO θ sobre X:
 *   frontal: dirección (0, −cos(δ−θ), +sin(δ−θ))  → baja 90°−(δ−θ) bajo la horizontal
 *   trasera: dirección (0, −cos(δ+θ), −sin(δ+θ))  → baja 90°−(δ+θ) bajo la horizontal
 * θ se elige para que la frontal quede SEP_FRONT_LIFT_DEG sobre la hoja; la trasera cae ~9°
 * pasada la vertical (abrazando el canto del bloque, visible al orbitar detrás del libro).
 * Con la frontal erguida (14°), la cresta SUBE hang·sin(lift) para que la punta frontal siga
 * REPOSANDO sobre la hoja (si la cresta quedara a ras, la punta se hundiría en la página).
 */
export function separatorPlacement(bx: number, stripL: number): SeparatorPlacement {
  // Espejo de foldedStripMetrics (magnet-3d) — duplicado para mantener este módulo sin three.
  const crestArc = Math.min(Math.PI, Math.max(0, SEP_FOLD_ANGLE));
  const delta = (Math.PI - SEP_FOLD_ANGLE) / 2;
  const hang = Math.max(0.05, (stripL - SEP_R_FOLD * crestArc) / 2);
  const tilt = delta - (Math.PI / 2 - (SEP_FRONT_LIFT_DEG * Math.PI) / 180);
  const surfaceY = pageSurfaceY(bx);
  // El pliegue abraza el filo de la hoja (80% del radio sobre la superficie, un radio + holgura
  // detrás del filo)… pero con la cara frontal erguida la cresta sube hang·sin(lift) para que
  // la punta repose justo sobre la hoja (frontTipY = crestY − hang·sin(lift) = surfaceY).
  const liftRad = (SEP_FRONT_LIFT_DEG * Math.PI) / 180;
  const crestY = surfaceY + Math.max(SEP_R_FOLD * 0.8, hang * Math.sin(liftRad));
  const crestZ = -PAGE_D / 2 - SEP_R_FOLD - 0.015;
  const frontTipY = crestY - hang * Math.cos(delta - tilt);
  const backBottomY = crestY - hang * Math.cos(delta + tilt);
  // Ola 3 — cara trasera larga (4×4.2): si colgando libre toca la mesa, se abre lo justo para
  // RECOSTAR la punta sobre la mesa (la cartulina real flexiona; acá la cara rígida se abre).
  // cos(δ+tilt+lean) = (crestY − clearance)/hang → lean = acos(…) − (δ+tilt), acotado a ≥ 0.
  let backLean = 0;
  if (backBottomY < BACK_TIP_CLEARANCE) {
    const c = (crestY - BACK_TIP_CLEARANCE) / hang;
    backLean = c <= 0 ? Infinity : Math.max(0, Math.acos(Math.min(1, c)) - (delta + tilt));
  }
  return {
    crestY,
    crestZ,
    tilt,
    hang,
    frontTipY,
    surfaceY,
    backClearance: backBottomY,
    backLean,
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

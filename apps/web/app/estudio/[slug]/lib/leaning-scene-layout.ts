/*
 * leaning-scene-layout.ts — matemática PURA (sin three en runtime → testeable en vitest node)
 * de las escenas con piezas RECOSTADAS: la repisa (shelf-3d-view) y el regalo (gift-3d-view),
 * que el 2026-10-26 reemplazaron los flat-lays 2D de ADR-063 (PNG 1080×1080 que se distorsionaba
 * al acercar) por escenas react-three-fiber con el mismo estándar de nevera/libro/polaroid.
 *
 * Regla heredada de las demás escenas: TAMAÑO REAL SIEMPRE — las piezas NUNCA se encogen; la
 * fila (y el mueble que la sostiene) crece y la cámara reencuadra (FitCameraPolar).
 *
 * Marco de mundo compartido por ambas escenas: la pieza mira a +Z, la superficie horizontal
 * (tabla de la repisa / mesa del regalo) es y = surfaceY y el plano vertical de apoyo (pared /
 * cara frontal de la caja) es z = supportZ (mira a +Z, la pieza queda DELANTE, z > supportZ).
 */

/** Tamaño de una pieza en unidades de mundo (w = ancho, h = alto, ambos > 0). */
export type LeaningPieceSize = { w: number; h: number };

/**
 * Fila horizontal CENTRADA de piezas recostadas: devuelve la x del CENTRO de cada pieza (en el
 * orden de entrada) y el ancho total de la fila (borde a borde, sin gap en los extremos). La
 * separación entre piezas vecinas es exactamente `gap` (borde a borde) — nunca se solapan.
 */
export function leaningRowLayout(
  sizes: readonly LeaningPieceSize[],
  gap: number,
): { xs: number[]; rowW: number } {
  const rowW = sizes.reduce((acc, s) => acc + s.w, 0) + gap * Math.max(0, sizes.length - 1);
  const xs: number[] = [];
  let cursor = -rowW / 2; // borde izquierdo de la pieza actual
  for (const s of sizes) {
    xs.push(cursor + s.w / 2);
    cursor += s.w + gap;
  }
  return { xs, rowW };
}

/**
 * Pose de una pieza RECOSTADA contra un plano vertical, pivotando sobre su borde inferior
 * frontal (tiltX = −leanRad: la punta cae HACIA el plano en −Z). Devuelve el centro (y, z) de
 * la pieza y la rotación X a aplicar, de modo que:
 *  - la esquina inferior FRONTAL (0, −h/2, +depth/2) apoya exactamente sobre y = surfaceY;
 *  - la esquina superior TRASERA (0, +h/2, −depth/2) toca exactamente el plano z = supportZ.
 * Con depth = 0 los bordes medios cumplen ambas condiciones. Es la versión 3D del "recostado
 * contra la pared" del flat-lay histórico, pero con contacto físico real (nada flota).
 */
export function leaningPose(
  h: number,
  leanRad: number,
  surfaceY: number,
  supportZ: number,
  depth = 0,
): { y: number; z: number; tiltX: number } {
  const halfH = h / 2;
  const halfD = depth / 2;
  return {
    y: surfaceY + halfH * Math.cos(leanRad) - halfD * Math.sin(leanRad),
    z: supportZ + halfH * Math.sin(leanRad) + halfD * Math.cos(leanRad),
    tiltX: -leanRad,
  };
}

/**
 * Abanico leve de la fila (como el tilt por índice del flat-lay 2D): giros en yaw simétricos
 * alrededor del centro de la fila, para que el conjunto no se vea militarmente alineado.
 */
export function fanYaw(index: number, count: number, stepRad: number): number {
  return (index - (count - 1) / 2) * stepRad;
}

/**
 * Grilla plana CENTRADA sobre la mesa (las piezas que no caben recostadas contra la caja del
 * regalo van acostadas delante, como las polaroids sueltas de polaroid-3d-view). Celdas de
 * tamaño uniforme (maxW+gap × maxH+gap) en filas cuasi-cuadradas (cols = ⌈√n⌉), relleno por
 * filas preservando el orden de entrada. Posiciones (x, z) del CENTRO de cada pieza.
 */
export function flatGridLayout(
  sizes: readonly LeaningPieceSize[],
  gap: number,
): {
  positions: { x: number; z: number }[];
  cols: number;
  rows: number;
  halfW: number;
  halfH: number;
} {
  const n = sizes.length;
  if (n === 0) return { positions: [], cols: 0, rows: 0, halfW: 0, halfH: 0 };
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cellW = Math.max(...sizes.map((s) => s.w)) + gap;
  const cellH = Math.max(...sizes.map((s) => s.h)) + gap;
  const positions = sizes.map((_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      x: (col - (cols - 1) / 2) * cellW,
      z: (row - (rows - 1) / 2) * cellH,
    };
  });
  return {
    positions,
    cols,
    rows,
    halfW: (cols * cellW - gap) / 2,
    halfH: (rows * cellH - gap) / 2,
  };
}

/*
 * cluster-layout — disposición de un clúster de piezas a TAMAÑO REAL sobre una superficie
 * (nevera / tablero magnético). Compartido por fridge-3d-view y room-board-view-3d
 * (2026-09-15): antes cada escena llevaba su propia copia del mismo algoritmo (gap, tope de
 * ancho, redistribución, bounds para la cámara) y divergían — de ahí el bug de la COLUMNA
 * ÚNICA de tiras que desbordaba la nevera por arriba y por abajo.
 *
 * Regla de columnas (decisión de producto 2026-09-15 — las piezas NUNCA se encogen):
 *  1. `preferCols` (el grid del editor) se respeta mientras quepa en el ancho preferido
 *     `maxW` (estético: deja libre la manija / el margen del marco).
 *  2. Cuando UNA columna superaría el alto útil de la superficie (`maxH`), se ABREN más
 *     columnas — y otra, y otra — incluso más allá de `maxW` si hace falta: el ancho del
 *     clúster puede crecer y la cámara reencuadra (FitCamera recibe los bounds).
 *  3. El reparto queda balanceado: las columnas difieren en ≤ 1 pieza (relleno por filas
 *     con la última fila posiblemente incompleta — preserva el ORDEN de lectura del grid,
 *     p.ej. los meses del calendario).
 *
 * Módulo PURO (sin three ni react) → testeable en vitest node.
 *
 * Ola 30 (2026-09-15, segunda pasada — proporciones pieza↔mueble): las DIMENSIONES FÍSICAS de
 * las dos superficies viven acá (`FRIDGE_SCENE` / `BOARD_SCENE`) como fuente única de verdad —
 * la nevera creció a NEVECÓN side-by-side (178×91×75 cm; el top-freezer de 170×68 era tan
 * angosto que una tira de 6.5 cm dominaba la escena) y el mural a un corcho de pared grande
 * (120×80 cm; el tablerito de 45×33 solo dejaba UNA fila de tiras → 12 columnas desbordadas).
 * Las vistas 3D construyen su geometría con estas constantes y los tests de proporción las
 * importan — nada de números duplicados que diverjan.
 */

// ── Dimensiones físicas de las escenas ──

/** Nevecón SIDE-BY-SIDE real (dos puertas verticales de cuerpo completo con junta central). */
export const FRIDGE_SCENE = {
  /** cm reales: 178 alto × 91 ancho × 75 fondo. */
  cm: { w: 91, h: 178, d: 75 },
  /** Alto en unidades de mundo (escala histórica de la escena — se conserva). */
  hU: 8.8,
  /** u/cm derivado del alto: 8.8 / 178 ≈ 0.04944. */
  uPerCm: 8.8 / 178,
  /** Ancho/fondo en unidades, derivados de los cm reales con la MISMA escala. */
  wU: (91 * 8.8) / 178, // ≈ 4.499
  dU: (75 * 8.8) / 178, // ≈ 3.708
  /** Región del clúster sobre AMBAS puertas (zona alta anclada; la junta central queda bajo
   *  las piezas, que montan proud sobre ella como imanes reales pegados sobre la unión). */
  cluster: {
    gap: 0.06, // ≈ 1.2 cm de aire entre piezas
    maxW: 3.55, // ≈ 72 cm — ambas puertas menos márgenes laterales estéticos
    topY: 3.9, // bajo el borde superior de las puertas
    bottomY: -3.85, // sobre el borde inferior
    anchorY: 1.2, // ancla estética en la zona ALTA (imanes a la altura de los ojos)
  },
} as const;

/** Mural de CORCHO de pared grande (12 tiras de 26.5 cm caben en grilla 6×2 CON márgenes —
 *  el tablerito anterior de 45×33 cm solo daba 1 fila de alto → desborde seguro). */
export const BOARD_SCENE = {
  /** cm reales: 120 ancho × 80 alto (corcho de pared tipo moodboard grande). */
  cm: { w: 120, h: 80 },
  /** Unidades de mundo: escala redonda 0.1 u/cm. */
  wU: 12,
  hU: 8,
  uPerCm: 0.1,
  /** Marco de madera ~5.5 cm y grosor del tablero ~2.2 cm. */
  frameU: 0.55,
  depthU: 0.22,
  /** Región del clúster dentro del marco, con aire estético. */
  cluster: {
    gap: 0.12, // 1.2 cm de aire entre piezas
    maxW: (12 - 2 * 0.55) * 0.9, // ≈ 9.81 u (98 cm dentro del marco)
    maxH: (8 - 2 * 0.55) * 0.86, // ≈ 5.93 u (59 cm dentro del marco)
  },
} as const;

export type ClusterPieceSize = { w: number; h: number };

export type ClusterLayoutOptions = {
  /** Ancho preferido del clúster (estético). Se puede superar si el alto útil manda. */
  maxW: number;
  /** Alto útil de la superficie: una columna NO lo supera si es evitable abriendo columnas. */
  maxH: number;
  /** Aire entre piezas vecinas (horizontal y vertical). */
  gap: number;
  /** Columnas pedidas por el diseño (grid del editor). Default 1. */
  preferCols?: number;
  /** Ancla vertical preferida del CENTRO del clúster (default 0 — centrado en la superficie). */
  anchorY?: number;
  /** Tope vertical de la superficie (si se pasan topY/bottomY, el clúster queda dentro cuando cabe). */
  topY?: number;
  /** Base vertical de la superficie. */
  bottomY?: number;
};

export type ClusterLayoutItem = ClusterPieceSize & {
  x: number;
  y: number;
  col: number;
  row: number;
};

export type ClusterLayout = {
  items: ClusterLayoutItem[];
  cols: number;
  rows: number;
  /** Ancho total del clúster (columnas + gaps). */
  width: number;
  /** Alto total del clúster (filas + gaps). */
  height: number;
  /** Centro vertical aplicado (tras ancla/clamps). */
  centerY: number;
  /** Medio-ancho para FitCamera. */
  halfW: number;
  /** Medio-alto para FitCamera: |centerY| + height/2 (cubre el extremo más alejado del origen). */
  halfH: number;
};

/**
 * Número de columnas efectivas para `n` piezas con celda uniforme `cellW × cellH`:
 *   effCols = clamp( max( columnasQueExigeElAlto, min(preferCols, columnasQueCabenEnMaxW) ), 1, n )
 * - `columnasQueCabenEnMaxW` = ⌊(maxW + gap) / (cellW + gap)⌋ (mínimo 1).
 * - `columnasQueExigeElAlto` = ⌈n / piezasQueCabenEnUnaColumna⌉, con
 *   piezasQueCabenEnUnaColumna = ⌊(maxH + gap) / (cellH + gap)⌋ (mínimo 1) — la regla que
 *   ABRE columna nueva cuando la anterior supera el alto útil.
 */
export function clusterColumnCount(
  n: number,
  cellW: number,
  cellH: number,
  opts: Pick<ClusterLayoutOptions, "maxW" | "maxH" | "gap" | "preferCols">,
): number {
  if (n <= 1) return 1;
  const { maxW, maxH, gap, preferCols = 1 } = opts;
  const fitCols = Math.max(1, Math.floor((maxW + gap) / (cellW + gap)));
  const rowsPerCol = Math.max(1, Math.floor((maxH + gap) / (cellH + gap)));
  const neededByHeight = Math.ceil(n / rowsPerCol);
  const preferred = Math.min(Math.max(1, Math.floor(preferCols)), fitCols);
  return Math.min(n, Math.max(neededByHeight, preferred));
}

/**
 * Posiciona `sizes` (tamaños REALES, nunca se modifican) en un grid de columnas balanceadas.
 * La celda del grid es uniforme (maxW × maxH de las piezas) para que la composición se vea
 * ordenada aunque las piezas difieran de tamaño. Devuelve posiciones centradas en X, con el
 * centro vertical resuelto por ancla/clamps, y los bounds para la cámara.
 */
export function clusterLayout(
  sizes: readonly ClusterPieceSize[],
  opts: ClusterLayoutOptions,
): ClusterLayout {
  const n = sizes.length;
  if (n === 0) {
    return {
      items: [],
      cols: 0,
      rows: 0,
      width: 0,
      height: 0,
      centerY: 0,
      halfW: 0,
      halfH: 0,
    };
  }
  const { gap } = opts;
  const cellW = Math.max(...sizes.map((s) => s.w));
  const cellH = Math.max(...sizes.map((s) => s.h));
  const cols = clusterColumnCount(n, cellW, cellH, opts);
  const rows = Math.ceil(n / cols);
  const width = cols * cellW + (cols - 1) * gap;
  const height = rows * cellH + (rows - 1) * gap;

  // Centro vertical: ancla estética, acotada para que el clúster quede ENTRE topY/bottomY
  // mientras quepa; si es más alto que la superficie, se centra en ella (la cámara abre).
  let centerY = opts.anchorY ?? 0;
  const { topY, bottomY } = opts;
  if (topY !== undefined && bottomY !== undefined && bottomY < topY) {
    const span = topY - bottomY;
    centerY =
      height >= span
        ? (topY + bottomY) / 2
        : Math.min(Math.max(centerY, bottomY + height / 2), topY - height / 2);
  }

  const items = sizes.map((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      ...s,
      col,
      row,
      x: (col - (cols - 1) / 2) * (cellW + gap),
      y: centerY + ((rows - 1) / 2 - row) * (cellH + gap),
    };
  });
  return {
    items,
    cols,
    rows,
    width,
    height,
    centerY,
    halfW: width / 2,
    halfH: Math.abs(centerY) + height / 2,
  };
}

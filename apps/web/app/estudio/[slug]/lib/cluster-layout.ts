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
 */

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

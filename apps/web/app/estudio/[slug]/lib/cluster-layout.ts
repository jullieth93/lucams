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
 * la nevera creció a NEVECÓN (178×91×75 cm; el top-freezer de 170×68 era tan angosto que una
 * tira de 6.5 cm dominaba la escena) y el mural a un corcho de pared grande (120×80 cm; el
 * tablerito de 45×33 solo dejaba UNA fila de tiras → 12 columnas desbordadas). Las vistas 3D
 * construyen su geometría con estas constantes y los tests de proporción las importan — nada
 * de números duplicados que diverjan.
 *
 * Ola 30 (tercera pasada — feedback dueña con foto de referencia): el nevecón se rediseña
 * FRENCH DOOR (dos puertas superiores ~2/3 + gaveta de freezer inferior ~1/3 con manija
 * horizontal + dispensador de agua en la puerta izquierda — el side-by-side de dos puertas
 * full-height se leía como CLOSET) y el clúster se parte en DOS sub-clústeres, uno por puerta:
 * regla física — un imán se pega a UNA puerta, NUNCA montado sobre la junta central
 * (`frenchDoorClusterLayout`, y la gaveta NO lleva imanes).
 */

// ── Dimensiones físicas de las escenas ──

/** Nevecón FRENCH DOOR real: dos puertas superiores (~2/3 del frente) + gaveta de freezer
 *  inferior (~1/3, manija horizontal) + dispensador de agua/hielo en la puerta izquierda. */
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
  /** Fracción del frente útil (alto entre márgenes) que ocupa la GAVETA del freezer (~1/3). */
  drawerFrac: 0.32,
  /** Dispensador de agua/hielo en la puerta IZQUIERDA (~11×23 cm, panel oscuro con receso a
   *  la altura de los ojos). El clúster de ESA puerta queda SIEMPRE por debajo
   *  (cluster.left.topY < dispenser.bottomY — testeado). */
  dispenser: { wU: 0.55, hU: 1.15, bottomY: 2.3 },
  /** Regiones del clúster: UN sub-clúster por puerta superior (la gaveta NO lleva imanes).
   *  Regla física: ningún imán toca la franja de la junta central (`seamHalfW`). */
  cluster: {
    gap: 0.06, // ≈ 1.2 cm de aire entre piezas
    /** |x| del centro de cada puerta superior (la vista deriva la geometría de ESTE número:
     *  ancho de puerta = 2·(doorCenterX − junta/2), con junta 0.12 y margen 0.15). */
    doorCenterX: 1.08,
    /** Ancho preferido del clúster DENTRO de una puerta — ni la junta central ni las manijas
     *  (que viven pegadas a la junta) quedan bajo las piezas. */
    doorMaxW: 1.55,
    /** Franja prohibida alrededor de la junta central (|x| < seamHalfW): NINGÚN imán la toca. */
    seamHalfW: 0.1,
    /** Puerta IZQUIERDA: bajo el dispensador (topY < dispenser.bottomY). */
    left: { topY: 2.15, bottomY: -1.1, anchorY: 0.7 },
    /** Puerta DERECHA: frente completo de la puerta, ancla a la altura de los ojos. */
    right: { topY: 3.9, bottomY: -1.1, anchorY: 2.0 },
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

// ── Ola 30 (tercera pasada) — french door: UN sub-clúster por puerta, NADA sobre la junta ──

export type FrenchDoorLayout = {
  /** Items en coordenadas de ESCENA (x ya desplazada al centro de su puerta), en el ORDEN
   *  original de las piezas (primero la puerta izquierda, luego la derecha). */
  items: ClusterLayoutItem[];
  /** Sub-layout de cada puerta (coords locales centradas en su puerta, antes del offset). */
  left: ClusterLayout;
  right: ClusterLayout;
  /** Bounds del conjunto para FitCamera (nevera + ambos sub-clústeres). */
  halfW: number;
  halfH: number;
};

/**
 * Reparto FRENCH DOOR del clúster (2026-09-15 — feedback dueña: "las fotoimanes no pueden
 * estar centradas en los bordes de las puertas"). Regla física: un imán se pega a UNA puerta,
 * NUNCA montado sobre la junta central — así que el clúster se parte en DOS sub-clústeres
 * independientes, uno por puerta superior (la gaveta del freezer NO lleva imanes):
 *
 *  - La PRIMERA mitad (⌊n/2⌋) va a la puerta IZQUIERDA (bajo el dispensador) y el resto a la
 *    DERECHA → se preserva el orden de lectura izquierda→derecha (meses del calendario) y con
 *    1 sola pieza cae en la derecha (la puerta que más se usa).
 *  - Cada sub-clúster se resuelve con `clusterLayout` dentro de SU región
 *    (`FRIDGE_SCENE.cluster.left/right`, ancla en zona alta) con `doorMaxW` de ancho preferido
 *    → por construcción ninguna pieza alcanza la franja de la junta (`seamHalfW`, testeado).
 *  - `preferCols` (grid del editor) se reparte entre puertas: ⌊cols/2⌋ izq, ⌈cols/2⌉ der.
 */
export function frenchDoorClusterLayout(
  sizes: readonly ClusterPieceSize[],
  opts: { preferCols?: number } = {},
): FrenchDoorLayout {
  const c = FRIDGE_SCENE.cluster;
  const n = sizes.length;
  const leftCount = Math.floor(n / 2);

  const perDoor = (
    side: "left" | "right",
  ): { layout: ClusterLayout; items: ClusterLayoutItem[] } => {
    const region = c[side];
    const subset = side === "left" ? sizes.slice(0, leftCount) : sizes.slice(leftCount);
    const preferCols = Math.max(
      1,
      Math[side === "left" ? "floor" : "ceil"]((opts.preferCols ?? 1) / 2),
    );
    const layout = clusterLayout(subset, {
      maxW: c.doorMaxW,
      maxH: region.topY - region.bottomY,
      gap: c.gap,
      preferCols,
      anchorY: region.anchorY,
      topY: region.topY,
      bottomY: region.bottomY,
    });
    const dx = side === "left" ? -c.doorCenterX : c.doorCenterX;
    return { layout, items: layout.items.map((it) => ({ ...it, x: it.x + dx })) };
  };

  const left = perDoor("left");
  const right = perDoor("right");
  const items = [...left.items, ...right.items];
  const halfW = items.reduce((a, it) => Math.max(a, Math.abs(it.x) + it.w / 2), 0);
  const halfH = items.reduce((a, it) => Math.max(a, Math.abs(it.y) + it.h / 2), 0);
  return { items, left: left.layout, right: right.layout, halfW, halfH };
}

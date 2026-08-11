/*
 * Helper para calcular el layout del grid del Estudio v2 multi-slot.
 *
 * `generateGridLayout(slotCount, unitStage)` retorna `{cols, rows, gap}`
 * óptimas para distribuir N imanes en una rejilla, tomando en cuenta:
 *
 *   1. Aspect ratio del unit template (un imán polaroid 720×920 es más alto
 *      que ancho; un imán cuadrado 1080×1080 es 1:1; un tríptico horizontal
 *      es 3:1). El grid se elige para que el viewport del editor quede
 *      relativamente cuadrado, evitando layouts extremos.
 *
 *   2. Cantidad N pre-definida según producto:
 *        N=1   → 1×1 (sin grid, full size)
 *        N=2   → 2×1 (lado-a-lado)
 *        N=3   → 3×1 horizontal
 *        N=4   → 2×2 cuadrado
 *        N=6   → 3×2 (3 cols × 2 rows)        [Set 6 Polaroid Grande]
 *        N=9   → 3×3
 *        N=12  → 3×4 (calendarios CALENDAR_PHOTO_MONTH: más vertical, tarjetas más grandes)
 *        N=20  → 5×4 (Set 20 Mini Polaroids)
 *
 *   3. Caso fallback (N no en la tabla): aprox sqrt(N) cols/rows balanceadas.
 *
 *   4. Gap: 16px lógicos por default. Si N >= 12, baja a 8px para que el
 *      grid no exceda el viewport del editor en mobile.
 *
 * Determinístico + puro — testeable sin mocks. Vuelve a llamar siempre
 * devuelve el mismo resultado dado el mismo input.
 */

import type { CanvasStage, GridLayout } from "../types";

/**
 * Tabla de layouts pre-armados según N. Ajustados para que el grid quede
 * relativamente cuadrado dado un unit template ~1:1. Si el unit template
 * es muy ancho/alto, `generateGridLayout` puede invertir cols/rows.
 */
const PRESET_LAYOUTS: Record<number, { cols: number; rows: number }> = {
  1: { cols: 1, rows: 1 },
  2: { cols: 2, rows: 1 },
  3: { cols: 3, rows: 1 },
  4: { cols: 2, rows: 2 },
  5: { cols: 5, rows: 1 }, // raro; B2B mínimo 50 usa otro flow
  6: { cols: 3, rows: 2 }, // Set 6 Polaroid
  8: { cols: 4, rows: 2 },
  9: { cols: 3, rows: 3 }, // Set 9 Polaroid Color
  10: { cols: 5, rows: 2 },
  12: { cols: 3, rows: 4 }, // Set 12 Polaroid + CALENDAR_PHOTO_MONTH (más vertical, mejor lectura meses)
  15: { cols: 5, rows: 3 },
  16: { cols: 4, rows: 4 },
  20: { cols: 5, rows: 4 }, // Set 20 Mini Polaroids
};

/** Decide el gap según slotCount. Más slots → gap más chico para caber. */
function gapForSlotCount(slotCount: number): number {
  if (slotCount <= 4) return 24;
  if (slotCount <= 9) return 16;
  if (slotCount <= 12) return 12;
  return 8;
}

/**
 * Genera el grid layout óptimo. Pura, sin side-effects.
 *
 * @param slotCount  Cantidad de imanes (1..20 testeado).
 * @param unitStage  Stage del unit template (width × height). Se usa para
 *                   decidir si conviene "invertir" cols/rows cuando el
 *                   unit es muy ancho o muy alto.
 *
 * @returns `{ cols, rows, gap }` listo para usarse en CSS grid.
 *
 * @example
 *   generateGridLayout(6, { width: 720, height: 920 })  // polaroid alto
 *   // → { cols: 3, rows: 2, gap: 16 }
 *
 *   generateGridLayout(3, { width: 1620, height: 540 }) // tríptico horizontal
 *   // → { cols: 1, rows: 3, gap: 24 }  (inverte por aspect extremo)
 */
export function generateGridLayout(slotCount: number, unitStage: CanvasStage): GridLayout {
  if (slotCount <= 0) {
    throw new Error(`generateGridLayout: slotCount must be >= 1, got ${slotCount}`);
  }

  // Caso pre-armado
  let { cols, rows } = PRESET_LAYOUTS[slotCount] ?? fallbackLayout(slotCount);
  const gap = gapForSlotCount(slotCount);

  // Si el unit template es muy ancho (aspect > 2.0) y el grid recomendado es
  // horizontal (cols > rows), invertir a vertical para que el viewport
  // resulta más cuadrado.
  // Caso típico: tríptico horizontal 1620×540 (aspect 3.0) con 3 slots →
  // PRESET dice cols=3 rows=1, pero como el unit ya es horizontal, el grid
  // queda demasiado ancho. Invertimos a cols=1 rows=3 (vertical stack).
  const aspect = unitStage.width / unitStage.height;
  if (aspect > 2.0 && cols > rows) {
    [cols, rows] = [rows, cols];
  }

  // Si el unit template es muy alto (aspect < 0.5) y el grid es vertical
  // (rows > cols), invertir a horizontal por el mismo motivo. Caso menos
  // común — la mayoría de imanes son ~1:1 o ligeramente verticales.
  if (aspect < 0.5 && rows > cols) {
    [cols, rows] = [rows, cols];
  }

  return { cols, rows, gap };
}

/**
 * Fallback layout para slotCount no listado en PRESET_LAYOUTS. Distribuye
 * en la rejilla más cuadrada posible: cols = ceil(sqrt(N)), rows = ceil(N/cols).
 *
 * Ejemplo: N=7 → cols=3, rows=3 (con una celda vacía). El editor sabe
 * renderizar solo los primeros N slots y dejar la celda extra como hueco.
 */
function fallbackLayout(slotCount: number): { cols: number; rows: number } {
  const cols = Math.ceil(Math.sqrt(slotCount));
  const rows = Math.ceil(slotCount / cols);
  return { cols, rows };
}

/**
 * Calcula las dimensiones del viewport del grid completo en pixels lógicos,
 * dado el unit stage + gridLayout. Útil para responsive scaling.
 *
 * @returns `{ width, height }` del grid total (incluyendo gaps).
 */
export function gridViewportSize(
  unitStage: CanvasStage,
  layout: GridLayout,
): {
  width: number;
  height: number;
} {
  const totalGapW = (layout.cols - 1) * layout.gap;
  const totalGapH = (layout.rows - 1) * layout.gap;
  return {
    width: layout.cols * unitStage.width + totalGapW,
    height: layout.rows * unitStage.height + totalGapH,
  };
}

/**
 * Dado un slotIndex (0..N-1), retorna su posición (col, row) 0-indexed
 * en el grid. Útil para renderizar el slot en CSS grid o para asignar
 * fotos en orden de lectura (left-to-right, top-to-bottom).
 *
 * @example
 *   slotPosition(4, { cols: 3, rows: 2, gap: 16 })
 *   // → { col: 1, row: 1 } (slot 4 está en 2da fila, 2da columna)
 */
export function slotPosition(slotIndex: number, layout: GridLayout): { col: number; row: number } {
  return {
    col: slotIndex % layout.cols,
    row: Math.floor(slotIndex / layout.cols),
  };
}

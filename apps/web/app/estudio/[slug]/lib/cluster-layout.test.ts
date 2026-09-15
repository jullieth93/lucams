/*
 * Tests del layout de clúster UNIFICADO (2026-09-15 — columnas múltiples a tamaño real).
 * Casos ancla: 2 piezas, 12+ tiras (el bug de la columna única que desbordaba la nevera),
 * piezas de distinto tamaño, balanceo de columnas (≤ 1 pieza de diferencia) y bounds para
 * FitCamera. Escala nevera: 8.8 u / 170 cm ≈ 0.05176 u/cm.
 */

import { describe, expect, it } from "vitest";

import { clusterColumnCount, clusterLayout } from "./cluster-layout";

const FRIDGE_U_PER_CM = 8.8 / 170;

/** Cuenta de piezas por columna (relleno por filas → se deriva de col de cada item). */
function columnSizes(items: readonly { col: number }[]): number[] {
  const counts = new Map<number, number>();
  for (const it of items) counts.set(it.col, (counts.get(it.col) ?? 0) + 1);
  return [...counts.values()];
}

describe("clusterColumnCount — regla de cuándo se ABRE una columna nueva", () => {
  it("respeta las columnas pedidas mientras quepan a lo ancho (grid del editor)", () => {
    // 4 fotoimanes 6.5 cm en nevera: preferCols 2 cabe → 2 columnas.
    const cell = 6.5 * FRIDGE_U_PER_CM;
    expect(
      clusterColumnCount(4, cell, cell, { maxW: 2.496, maxH: 5.4, gap: 0.06, preferCols: 2 }),
    ).toBe(2);
  });

  it("ABRE columnas cuando una sola supera el alto útil (12 tiras ~26.5 cm: 3 por columna → 4 columnas)", () => {
    const w = 5 * FRIDGE_U_PER_CM;
    const h = 26.5 * FRIDGE_U_PER_CM; // ≈ 1.372 u — el caso del screenshot (columna de 3+ m)
    // En el alto útil de la puerta (5.4 u) caben ⌊5.46/1.432⌋ = 3 tiras por columna.
    expect(
      clusterColumnCount(12, w, h, { maxW: 2.496, maxH: 5.405, gap: 0.06, preferCols: 1 }),
    ).toBe(4);
  });

  it("el ancho PUEDE crecer más allá de maxW si el alto manda (tira más alta que el tablero → 1 por columna)", () => {
    // Tablero: alto útil 3.78 u < tira 4.12 u → una por columna, 12 columnas aunque no quepan a lo ancho.
    expect(clusterColumnCount(12, 0.78, 4.12, { maxW: 5.7, maxH: 3.78, gap: 0.08, preferCols: 1 })).toBe(12);
  });

  it("nunca abre más columnas que piezas (sin columnas vacías)", () => {
    expect(clusterColumnCount(2, 1, 10, { maxW: 0.5, maxH: 5, gap: 0.1, preferCols: 1 })).toBe(2);
  });

  it("tope de compra real: 24 fotoimanes 6.5×6.5 con grid de 5 → 5 columnas (caben en alto y ancho)", () => {
    const cell = 6.5 * FRIDGE_U_PER_CM;
    expect(
      clusterColumnCount(24, cell, cell, { maxW: 2.496, maxH: 5.405, gap: 0.06, preferCols: 5 }),
    ).toBe(5);
  });

  it("tope de compra real: 16 tiras (3 fotos/tira) → 6 columnas de ≤ 3", () => {
    const w = 5 * FRIDGE_U_PER_CM;
    const h = 26.5 * FRIDGE_U_PER_CM;
    // ⌈16/3⌉ = 6 columnas.
    expect(
      clusterColumnCount(16, w, h, { maxW: 2.496, maxH: 5.405, gap: 0.06, preferCols: 1 }),
    ).toBe(6);
  });
});

describe("clusterLayout — posiciones y bounds", () => {
  it("2 piezas iguales: 2 columnas × 1 fila, simétricas, bounds exactos", () => {
    const layout = clusterLayout([{ w: 0.34, h: 0.34 }, { w: 0.34, h: 0.34 }], {
      maxW: 2.5,
      maxH: 5.4,
      gap: 0.06,
      preferCols: 2,
    });
    expect(layout.cols).toBe(2);
    expect(layout.rows).toBe(1);
    expect(layout.width).toBeCloseTo(0.74, 9);
    expect(layout.height).toBeCloseTo(0.34, 9);
    expect(layout.items[0]).toMatchObject({ col: 0, row: 0 });
    expect(layout.items[0]!.x).toBeCloseTo(-0.2, 9);
    expect(layout.items[1]!.x).toBeCloseTo(0.2, 9);
    expect(layout.items[0]!.y).toBeCloseTo(0, 9);
    expect(layout.halfW).toBeCloseTo(0.37, 9);
    expect(layout.halfH).toBeCloseTo(0.17, 9);
  });

  it("12 tiras a tamaño real (el bug de la dueña): 4 columnas × 3, alto ≤ alto útil, piezas intactas", () => {
    const w = 5 * FRIDGE_U_PER_CM;
    const h = 26.5 * FRIDGE_U_PER_CM;
    const sizes = Array.from({ length: 12 }, () => ({ w, h }));
    const layout = clusterLayout(sizes, {
      maxW: 2.496,
      maxH: 5.405,
      gap: 0.06,
      preferCols: 1, // la tira photobooth fuerza cols=1 en el editor — el layout abre columnas igual
      anchorY: -0.07,
      topY: 1.405,
      bottomY: -4.0,
    });
    expect(layout.cols).toBe(4);
    expect(layout.rows).toBe(3);
    // La columna YA NO desborda: el clúster cabe en el alto útil de la puerta.
    expect(layout.height).toBeLessThanOrEqual(5.405);
    expect(layout.height).toBeCloseTo(3 * h + 2 * 0.06, 9);
    // Balance perfecto: 3/3/3/3.
    expect(columnSizes(layout.items)).toEqual([3, 3, 3, 3]);
    // NUNCA se encoge: cada pieza conserva sus cm reales.
    for (const it of layout.items) {
      expect(it.w).toBeCloseTo(w, 9);
      expect(it.h).toBeCloseTo(h, 9);
    }
    // Ancho razonable: 4 tiras caben en la puerta (sin invadir la manija).
    expect(layout.width).toBeLessThanOrEqual(2.496);
    // Ancla acotada: el clúster queda entre topY y bottomY.
    expect(layout.centerY + layout.height / 2).toBeLessThanOrEqual(1.405 + 1e-9);
    expect(layout.centerY - layout.height / 2).toBeGreaterThanOrEqual(-4.0 - 1e-9);
    expect(layout.halfH).toBeCloseTo(Math.abs(layout.centerY) + layout.height / 2, 9);
  });

  it("balanceo: 10 piezas en 4 columnas → 3/3/2/2 (diferencia ≤ 1)", () => {
    const layout = clusterLayout(Array.from({ length: 10 }, () => ({ w: 0.3, h: 0.3 })), {
      maxW: 5,
      maxH: 2, // caben 4 por columna → el alto no fuerza nada
      gap: 0.05,
      preferCols: 4,
    });
    expect(layout.cols).toBe(4);
    const counts = columnSizes(layout.items);
    expect(counts).toEqual([3, 3, 2, 2]);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("relleno por filas: preserva el orden de lectura (1,2,3… de izquierda a derecha)", () => {
    const layout = clusterLayout(Array.from({ length: 6 }, () => ({ w: 0.3, h: 0.3 })), {
      maxW: 5,
      maxH: 5,
      gap: 0.05,
      preferCols: 3,
    });
    // Fila 0 = piezas 0,1,2 (como el grid del editor: los meses del calendario se leen en orden).
    expect(layout.items[0]).toMatchObject({ col: 0, row: 0 });
    expect(layout.items[1]).toMatchObject({ col: 1, row: 0 });
    expect(layout.items[2]).toMatchObject({ col: 2, row: 0 });
    expect(layout.items[3]).toMatchObject({ col: 0, row: 1 });
    // La fila 0 es la de ARRIBA (y mayor).
    expect(layout.items[0]!.y).toBeGreaterThan(layout.items[3]!.y);
  });

  it("piezas de distinto tamaño: celda uniforme con el máximo, tamaños reales intactos", () => {
    const layout = clusterLayout(
      [
        { w: 1, h: 0.5 },
        { w: 0.5, h: 1 },
        { w: 0.8, h: 0.8 },
      ],
      { maxW: 10, maxH: 10, gap: 0.1, preferCols: 3 },
    );
    expect(layout.cols).toBe(3);
    // Las celdas pican de 1×1 (el máximo) → columnas equiespaciadas a 1.1.
    expect(layout.items[1]!.x - layout.items[0]!.x).toBeCloseTo(1.1, 9);
    // Pero cada pieza conserva SU tamaño real (nunca se estira ni encoge).
    expect(layout.items[0]).toMatchObject({ w: 1, h: 0.5 });
    expect(layout.items[1]).toMatchObject({ w: 0.5, h: 1 });
  });

  it("clúster más alto que la superficie: se centra en ella y halfH cubre el desborde", () => {
    const layout = clusterLayout([{ w: 1, h: 5 }], {
      maxW: 10,
      maxH: 100,
      gap: 0.1,
      preferCols: 1,
      anchorY: -0.5,
      topY: 1,
      bottomY: -1,
    });
    expect(layout.centerY).toBeCloseTo(0, 9); // (top+bottom)/2, no el ancla
    expect(layout.halfH).toBeCloseTo(2.5, 9);
  });

  it("sin topY/bottomY: centrado en el ancla (tablero: 0)", () => {
    const layout = clusterLayout([{ w: 1, h: 1 }, { w: 1, h: 1 }], {
      maxW: 10,
      maxH: 10,
      gap: 0.1,
      preferCols: 1,
    });
    expect(layout.cols).toBe(1);
    expect(layout.centerY).toBe(0);
    expect(layout.items[0]!.y).toBeCloseTo(0.55, 9);
    expect(layout.items[1]!.y).toBeCloseTo(-0.55, 9);
    expect(layout.halfH).toBeCloseTo(1.05, 9);
  });

  it("ancla estética respetada cuando el clúster chico cabe en la superficie", () => {
    const layout = clusterLayout([{ w: 0.3, h: 0.3 }], {
      maxW: 2.5,
      maxH: 5.4,
      gap: 0.06,
      preferCols: 1,
      anchorY: -0.07,
      topY: 1.4,
      bottomY: -4,
    });
    expect(layout.centerY).toBeCloseTo(-0.07, 9);
  });

  it("robustez: lista vacía → layout vacío sin NaN", () => {
    const layout = clusterLayout([], { maxW: 1, maxH: 1, gap: 0.1 });
    expect(layout.items).toEqual([]);
    expect(layout.halfW).toBe(0);
    expect(layout.halfH).toBe(0);
  });
});

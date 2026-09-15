/*
 * Tests del layout de clúster UNIFICADO (2026-09-15 — columnas múltiples a tamaño real).
 * Casos ancla: 2 piezas, 12+ tiras (el bug de la columna única que desbordaba la nevera),
 * piezas de distinto tamaño, balanceo de columnas (≤ 1 pieza de diferencia) y bounds para
 * FitCamera.
 *
 * Ola 30 (mismo día, segunda pasada — proporciones pieza↔mueble, feedback dueña): las
 * dimensiones de las escenas se importan de FRIDGE_SCENE / BOARD_SCENE (fuente única — nada
 * de números duplicados). Nevecón side-by-side 178×91×75 cm (8.8 u → 0.04944 u/cm) y mural de
 * corcho 120×80 cm (12 u → 0.1 u/cm); al final, aserciones de PROPORCIÓN FÍSICA (lo que la
 * dueña mira al validar).
 */

import { describe, expect, it } from "vitest";

import {
  BOARD_SCENE,
  clusterColumnCount,
  clusterLayout,
  frenchDoorClusterLayout,
  FRIDGE_SCENE,
} from "./cluster-layout";

const BOARD = BOARD_SCENE.cluster;
const FDOOR = FRIDGE_SCENE.cluster;

/** Cuenta de piezas por columna (relleno por filas → se deriva de col de cada item). */
function columnSizes(items: readonly { col: number }[]): number[] {
  const counts = new Map<number, number>();
  for (const it of items) counts.set(it.col, (counts.get(it.col) ?? 0) + 1);
  return [...counts.values()];
}

/** Regla física de la dueña: NINGÚN imán toca la franja de la junta central (|x| < seamHalfW)
 *  ni se sale del frente por los costados. */
function expectNeverOnSeam(items: readonly { x: number; w: number }[]) {
  for (const it of items) {
    expect(Math.abs(it.x) - it.w / 2).toBeGreaterThanOrEqual(FDOOR.seamHalfW - 1e-9);
  }
}

describe("clusterColumnCount — regla de cuándo se ABRE una columna nueva", () => {
  it("respeta las columnas pedidas mientras quepan a lo ancho (grid del editor)", () => {
    // 4 fotoimanes 6.5 cm: preferCols 2 cabe → 2 columnas.
    const cell = 6.5 * FRIDGE_SCENE.uPerCm;
    expect(
      clusterColumnCount(4, cell, cell, {
        maxW: FDOOR.doorMaxW,
        maxH: FDOOR.right.topY - FDOOR.right.bottomY,
        gap: FDOOR.gap,
        preferCols: 2,
      }),
    ).toBe(2);
  });

  it("ABRE columnas cuando una sola supera el alto útil (6 tiras 6.5×26.5 cm en una puerta: 3 por columna → 2 columnas)", () => {
    const w = 6.5 * FRIDGE_SCENE.uPerCm;
    const h = 26.5 * FRIDGE_SCENE.uPerCm; // ≈ 1.310 u
    // En el alto útil de la puerta derecha (5.0 u) caben ⌊5.06/1.370⌋ = 3 tiras por columna.
    expect(
      clusterColumnCount(6, w, h, {
        maxW: FDOOR.doorMaxW,
        maxH: FDOOR.right.topY - FDOOR.right.bottomY,
        gap: FDOOR.gap,
        preferCols: 1,
      }),
    ).toBe(2);
  });

  it("el ancho PUEDE crecer más allá de maxW si el alto manda (pieza más alta que el alto útil → 1 por columna)", () => {
    // Mural: alto útil ≈ 5.93 u < pieza de 6.5 u → una por columna, 12 columnas aunque a lo
    // ancho solo quepan 11 — el clúster desborda y la cámara reencuadra (nunca se encoge).
    expect(
      clusterColumnCount(12, 0.78, 6.5, {
        maxW: BOARD.maxW,
        maxH: BOARD.maxH,
        gap: BOARD.gap,
        preferCols: 1,
      }),
    ).toBe(12);
  });

  it("nunca abre más columnas que piezas (sin columnas vacías)", () => {
    expect(clusterColumnCount(2, 1, 10, { maxW: 0.5, maxH: 5, gap: 0.1, preferCols: 1 })).toBe(2);
  });

  it("tope de compra real: 24 fotoimanes 6.5×6.5 con grid de 5 → 5 columnas (caben en alto y ancho)", () => {
    const cell = 6.5 * FRIDGE_SCENE.uPerCm;
    expect(
      clusterColumnCount(24, cell, cell, {
        maxW: FDOOR.doorMaxW * 2, // hipotética superficie ancha — la regla de columnas es genérica
        maxH: FDOOR.right.topY - FDOOR.right.bottomY,
        gap: FDOOR.gap,
        preferCols: 5,
      }),
    ).toBe(5);
  });

  it("tope de compra real: 16 tiras (3 fotos/tira) en una superficie de 5 tiras por columna → 4 columnas", () => {
    const w = 6.5 * FRIDGE_SCENE.uPerCm;
    const h = 26.5 * FRIDGE_SCENE.uPerCm;
    // ⌈16/5⌉ = 4 columnas (alto útil de 7.75 u, el de la geometría side-by-side anterior).
    expect(clusterColumnCount(16, w, h, { maxW: 10, maxH: 7.75, gap: 0.06, preferCols: 1 })).toBe(
      4,
    );
  });
});

describe("clusterLayout — posiciones y bounds", () => {
  it("2 piezas iguales: 2 columnas × 1 fila, simétricas, bounds exactos", () => {
    const layout = clusterLayout(
      [
        { w: 0.34, h: 0.34 },
        { w: 0.34, h: 0.34 },
      ],
      {
        maxW: 2.5,
        maxH: 5.4,
        gap: 0.06,
        preferCols: 2,
      },
    );
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

  it("12 tiras a tamaño real en una SOLA superficie (regla genérica): 3 columnas × 4, alto ≤ alto útil", () => {
    const w = 6.5 * FRIDGE_SCENE.uPerCm;
    const h = 26.5 * FRIDGE_SCENE.uPerCm;
    const sizes = Array.from({ length: 12 }, () => ({ w, h }));
    const layout = clusterLayout(sizes, {
      maxW: 3.55,
      maxH: 7.75,
      gap: 0.06,
      preferCols: 1, // la tira photobooth fuerza cols=1 en el editor — el layout abre columnas igual
      anchorY: 1.2,
      topY: 3.9,
      bottomY: -3.85,
    });
    expect(layout.cols).toBe(3);
    expect(layout.rows).toBe(4);
    expect(layout.height).toBeLessThanOrEqual(7.75);
    expect(layout.height).toBeCloseTo(4 * h + 3 * 0.06, 9);
    // Balance perfecto: 4/4/4.
    expect(columnSizes(layout.items)).toEqual([4, 4, 4]);
    // NUNCA se encoge: cada pieza conserva sus cm reales.
    for (const it of layout.items) {
      expect(it.w).toBeCloseTo(w, 9);
      expect(it.h).toBeCloseTo(h, 9);
    }
    expect(layout.width).toBeLessThanOrEqual(3.55);
    expect(layout.centerY + layout.height / 2).toBeLessThanOrEqual(3.9 + 1e-9);
    expect(layout.centerY - layout.height / 2).toBeGreaterThanOrEqual(-3.85 - 1e-9);
    expect(layout.halfH).toBeCloseTo(Math.abs(layout.centerY) + layout.height / 2, 9);
  });

  it("balanceo: 10 piezas en 4 columnas → 3/3/2/2 (diferencia ≤ 1)", () => {
    const layout = clusterLayout(
      Array.from({ length: 10 }, () => ({ w: 0.3, h: 0.3 })),
      {
        maxW: 5,
        maxH: 2, // caben 4 por columna → el alto no fuerza nada
        gap: 0.05,
        preferCols: 4,
      },
    );
    expect(layout.cols).toBe(4);
    const counts = columnSizes(layout.items);
    expect(counts).toEqual([3, 3, 2, 2]);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("relleno por filas: preserva el orden de lectura (1,2,3… de izquierda a derecha)", () => {
    const layout = clusterLayout(
      Array.from({ length: 6 }, () => ({ w: 0.3, h: 0.3 })),
      {
        maxW: 5,
        maxH: 5,
        gap: 0.05,
        preferCols: 3,
      },
    );
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
    const layout = clusterLayout(
      [
        { w: 1, h: 1 },
        { w: 1, h: 1 },
      ],
      {
        maxW: 10,
        maxH: 10,
        gap: 0.1,
        preferCols: 1,
      },
    );
    expect(layout.cols).toBe(1);
    expect(layout.centerY).toBe(0);
    expect(layout.items[0]!.y).toBeCloseTo(0.55, 9);
    expect(layout.items[1]!.y).toBeCloseTo(-0.55, 9);
    expect(layout.halfH).toBeCloseTo(1.05, 9);
  });

  it("ancla estética respetada cuando el clúster chico cabe en la superficie", () => {
    const layout = clusterLayout([{ w: 0.3, h: 0.3 }], {
      maxW: FDOOR.doorMaxW,
      maxH: FDOOR.right.topY - FDOOR.right.bottomY,
      gap: FDOOR.gap,
      preferCols: 1,
      anchorY: FDOOR.right.anchorY,
      topY: FDOOR.right.topY,
      bottomY: FDOOR.right.bottomY,
    });
    expect(layout.centerY).toBeCloseTo(FDOOR.right.anchorY, 9);
  });

  it("robustez: lista vacía → layout vacío sin NaN", () => {
    const layout = clusterLayout([], { maxW: 1, maxH: 1, gap: 0.1 });
    expect(layout.items).toEqual([]);
    expect(layout.halfW).toBe(0);
    expect(layout.halfH).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────
//  Ola 30 (3ª pasada) — french door: UN sub-clúster por puerta, NADA sobre la junta
// ──────────────────────────────────────────────────────────────────

describe("frenchDoorClusterLayout — reparto por puerta (regla física: nada sobre la junta)", () => {
  it("12 tiras 6.5×26.5: 6 por puerta, grillas dentro de cada puerta, NINGUNA toca la junta", () => {
    const w = 6.5 * FRIDGE_SCENE.uPerCm;
    const h = 26.5 * FRIDGE_SCENE.uPerCm;
    const layout = frenchDoorClusterLayout(
      Array.from({ length: 12 }, () => ({ w, h })),
      {
        preferCols: 1, // la tira photobooth fuerza cols=1 — el reparto abre columnas igual
      },
    );
    expect(layout.items).toHaveLength(12);
    expect(layout.left.items).toHaveLength(6);
    expect(layout.right.items).toHaveLength(6);
    // Regla física explícita: ningún item intersecta la franja de la junta central.
    expectNeverOnSeam(layout.items);
    // Cada sub-clúster cabe en el alto útil de su puerta y a lo ancho preferido.
    for (const [sub, region] of [
      [layout.left, FDOOR.left],
      [layout.right, FDOOR.right],
    ] as const) {
      expect(sub.height).toBeLessThanOrEqual(region.topY - region.bottomY);
      expect(sub.width).toBeLessThanOrEqual(FDOOR.doorMaxW);
      expect(sub.centerY + sub.height / 2).toBeLessThanOrEqual(region.topY + 1e-9);
      expect(sub.centerY - sub.height / 2).toBeGreaterThanOrEqual(region.bottomY - 1e-9);
    }
    // Tamaño real intacto (nunca encoger).
    for (const it of layout.items) {
      expect(it.w).toBeCloseTo(w, 9);
      expect(it.h).toBeCloseTo(h, 9);
    }
    // El clúster izquierdo queda SIEMPRE bajo el dispensador de agua.
    for (const it of layout.items.slice(0, 6)) {
      expect(it.y + it.h / 2).toBeLessThanOrEqual(FRIDGE_SCENE.dispenser.bottomY + 1e-9);
    }
    // Bounds del conjunto: cubren ambas puertas (la cámara encuadra nevera + clúster).
    expect(layout.halfW).toBeGreaterThan(FDOOR.doorCenterX);
    expect(layout.halfH).toBeGreaterThan(0);
  });

  it("24 fotoimanes 6×8: 12 por puerta en grillas ordenadas, sin tocar la junta", () => {
    const w = 6 * FRIDGE_SCENE.uPerCm;
    const h = 8 * FRIDGE_SCENE.uPerCm;
    const layout = frenchDoorClusterLayout(
      Array.from({ length: 24 }, () => ({ w, h })),
      {
        preferCols: 4,
      },
    );
    expect(layout.left.items).toHaveLength(12);
    expect(layout.right.items).toHaveLength(12);
    expectNeverOnSeam(layout.items);
    for (const sub of [layout.left, layout.right]) {
      expect(sub.width).toBeLessThanOrEqual(FDOOR.doorMaxW);
    }
  });

  it("1 sola pieza cae en la puerta DERECHA (la que más se usa), a tamaño real", () => {
    const w = 6.5 * FRIDGE_SCENE.uPerCm;
    const layout = frenchDoorClusterLayout([{ w, h: w }]);
    expect(layout.left.items).toHaveLength(0);
    expect(layout.right.items).toHaveLength(1);
    expect(layout.items[0]!.x).toBeGreaterThan(0);
    expectNeverOnSeam(layout.items);
  });

  it("2 piezas: una por puerta (como en una casa real), tamaño real idéntico", () => {
    const w = 6.5 * FRIDGE_SCENE.uPerCm;
    const h = 26.5 * FRIDGE_SCENE.uPerCm;
    const layout = frenchDoorClusterLayout([
      { w, h },
      { w, h },
    ]);
    expect(layout.left.items).toHaveLength(1);
    expect(layout.right.items).toHaveLength(1);
    expect(layout.items[0]!.x).toBeLessThan(0);
    expect(layout.items[1]!.x).toBeGreaterThan(0);
    expectNeverOnSeam(layout.items);
    for (const it of layout.items) {
      expect(it.w).toBeCloseTo(w, 9);
      expect(it.h).toBeCloseTo(h, 9);
    }
  });

  it("orden de lectura: la PRIMERA mitad va a la izquierda (meses 1-6 izq, 7-12 der)", () => {
    const cell = 0.3;
    const layout = frenchDoorClusterLayout(
      Array.from({ length: 12 }, () => ({ w: cell, h: cell })),
    );
    // items preservan el orden original: índices 0-5 a la izquierda (x<0), 6-11 a la derecha.
    for (const [i, it] of layout.items.entries()) {
      if (i < 6) expect(it.x).toBeLessThan(0);
      else expect(it.x).toBeGreaterThan(0);
    }
  });
});

// ──────────────────────────────────────────────────────────────────
//  Ola 30 — PROPORCIONES FÍSICAS pieza↔mueble (lo que la dueña valida a ojo)
// ──────────────────────────────────────────────────────────────────

describe("proporciones físicas de las escenas (Ola 30)", () => {
  it("el nevecón es french door real: 178×91×75 cm con UNA sola escala", () => {
    expect(FRIDGE_SCENE.hU / FRIDGE_SCENE.uPerCm).toBeCloseTo(178, 6);
    expect(FRIDGE_SCENE.wU / FRIDGE_SCENE.uPerCm).toBeCloseTo(91, 6);
    expect(FRIDGE_SCENE.dU / FRIDGE_SCENE.uPerCm).toBeCloseTo(75, 6);
  });

  it("french door: gaveta ~1/3 del frente y el clúster izquierdo SIEMPRE bajo el dispensador", () => {
    expect(FRIDGE_SCENE.drawerFrac).toBeGreaterThanOrEqual(0.28);
    expect(FRIDGE_SCENE.drawerFrac).toBeLessThanOrEqual(0.36);
    expect(FDOOR.left.topY).toBeLessThan(FRIDGE_SCENE.dispenser.bottomY);
    // La franja prohibida cubre la junta (0.12 u de ancho → 0.06 de semiancho) con holgura.
    expect(FDOOR.seamHalfW).toBeGreaterThanOrEqual(0.06);
  });

  it("una tira de 26.5 cm se ve ~15% del alto del nevecón (ni miniatura ni dominante)", () => {
    const ratio = (26.5 * FRIDGE_SCENE.uPerCm) / FRIDGE_SCENE.hU;
    expect(ratio).toBeCloseTo(26.5 / 178, 9);
    expect(ratio).toBeGreaterThan(0.12);
    expect(ratio).toBeLessThan(0.18);
  });

  it("un fotoimán 6.5×6.5 en el nevecón ≈ proporción real (3.6% del alto, 7% del ancho)", () => {
    const hRatio = (6.5 * FRIDGE_SCENE.uPerCm) / FRIDGE_SCENE.hU;
    const wRatio = (6.5 * FRIDGE_SCENE.uPerCm) / FRIDGE_SCENE.wU;
    expect(hRatio).toBeCloseTo(6.5 / 178, 9);
    expect(hRatio).toBeGreaterThan(0.03);
    expect(hRatio).toBeLessThan(0.05);
    expect(wRatio).toBeCloseTo(6.5 / 91, 9);
    expect(wRatio).toBeGreaterThan(0.05);
    expect(wRatio).toBeLessThan(0.1);
  });

  it("fotoimán 6×8 en el nevecón ≈ proporción real (4.5% del alto, 6.6% del ancho)", () => {
    expect((8 * FRIDGE_SCENE.uPerCm) / FRIDGE_SCENE.hU).toBeCloseTo(8 / 178, 9);
    expect((6 * FRIDGE_SCENE.uPerCm) / FRIDGE_SCENE.wU).toBeCloseTo(6 / 91, 9);
  });

  it("el mural es un corcho de pared grande: 120×80 cm con escala redonda", () => {
    expect(BOARD_SCENE.wU / BOARD_SCENE.uPerCm).toBeCloseTo(120, 6);
    expect(BOARD_SCENE.hU / BOARD_SCENE.uPerCm).toBeCloseTo(80, 6);
  });

  it("12 tiras 6.5×26.5 en el mural: grilla de ≤ 2 filas DENTRO del tablero con márgenes (el bug del screenshot)", () => {
    const w = 6.5 * BOARD_SCENE.uPerCm;
    const h = 26.5 * BOARD_SCENE.uPerCm;
    const layout = clusterLayout(
      Array.from({ length: 12 }, () => ({ w, h })),
      {
        maxW: BOARD.maxW,
        maxH: BOARD.maxH,
        gap: BOARD.gap,
        preferCols: 1,
      },
    );
    expect(layout.rows).toBeLessThanOrEqual(2);
    expect(layout.cols).toBe(6); // grilla 6×2
    // NO desborda el corcho (superficie dentro del marco): cabe con márgenes.
    const innerW = BOARD_SCENE.wU - 2 * BOARD_SCENE.frameU;
    const innerH = BOARD_SCENE.hU - 2 * BOARD_SCENE.frameU;
    expect(layout.width).toBeLessThanOrEqual(innerW);
    expect(layout.height).toBeLessThanOrEqual(innerH);
    // Tamaño real intacto.
    for (const it of layout.items) {
      expect(it.w).toBeCloseTo(w, 9);
      expect(it.h).toBeCloseTo(h, 9);
    }
  });

  it("24 fotoimanes 6×8 en el mural: grilla ordenada dentro del tablero", () => {
    const w = 6 * BOARD_SCENE.uPerCm;
    const h = 8 * BOARD_SCENE.uPerCm;
    const layout = clusterLayout(
      Array.from({ length: 24 }, () => ({ w, h })),
      {
        maxW: BOARD.maxW,
        maxH: BOARD.maxH,
        gap: BOARD.gap,
        preferCols: 4,
      },
    );
    expect(layout.cols).toBe(4);
    expect(layout.rows).toBe(6);
    const innerW = BOARD_SCENE.wU - 2 * BOARD_SCENE.frameU;
    const innerH = BOARD_SCENE.hU - 2 * BOARD_SCENE.frameU;
    expect(layout.width).toBeLessThanOrEqual(innerW);
    expect(layout.height).toBeLessThanOrEqual(innerH);
  });

  it("2 piezas en el mural: tamaño real idéntico (nunca encoger)", () => {
    const w = 6.5 * BOARD_SCENE.uPerCm;
    const h = 26.5 * BOARD_SCENE.uPerCm;
    const layout = clusterLayout(
      [
        { w, h },
        { w, h },
      ],
      {
        maxW: BOARD.maxW,
        maxH: BOARD.maxH,
        gap: BOARD.gap,
        preferCols: 2,
      },
    );
    expect(layout.rows).toBe(1);
    for (const it of layout.items) {
      expect(it.w).toBeCloseTo(w, 9);
      expect(it.h).toBeCloseTo(h, 9);
    }
  });
});

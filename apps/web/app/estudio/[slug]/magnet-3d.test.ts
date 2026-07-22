/*
 * Tests de los helpers PUROS de magnet-3d (escala física de escenas 3D + separador doblado).
 * Se mockea @react-three/drei para poder importar el módulo en entorno node (los componentes
 * R3F no se ejercitan acá, solo la matemática exportada).
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@react-three/drei", () => ({
  useTexture: () => null,
}));

import { coverRegion, foldedStripMetrics, magnetWorldSizes, parseSizeCm } from "./magnet-3d";

describe("parseSizeCm", () => {
  it("parsea tamaños con ×, x y un solo número", () => {
    expect(parseSizeCm("6.5×6.5")).toEqual({ wCm: 6.5, hCm: 6.5 });
    expect(parseSizeCm("7.5x10")).toEqual({ wCm: 7.5, hCm: 10 });
    expect(parseSizeCm("6")).toEqual({ wCm: 6, hCm: 6 });
    expect(parseSizeCm("7.5 × 10")).toEqual({ wCm: 7.5, hCm: 10 });
  });

  it("rechaza entradas inválidas", () => {
    expect(parseSizeCm(undefined)).toBeNull();
    expect(parseSizeCm("")).toBeNull();
    expect(parseSizeCm("abc")).toBeNull();
    expect(parseSizeCm("0×0")).toBeNull();
    expect(parseSizeCm("6.5×")).toBeNull();
  });
});

describe("coverRegion", () => {
  it("aspectos iguales → región completa", () => {
    expect(coverRegion(1, 1)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it("lienzo más angosto que la cara → recorta banda vertical centrada (cover)", () => {
    // Lienzo del separador rectangular (~5:14 = 0.357) en una cara 2×2.8 (0.714).
    const r = coverRegion(0.357, 0.714);
    expect(r.x).toBe(0);
    expect(r.w).toBe(1);
    expect(r.h).toBeCloseTo(0.357 / 0.714, 5);
    expect(r.y).toBeCloseTo((1 - r.h) / 2, 5);
  });

  it("lienzo más ancho que la cara → recorta banda horizontal centrada", () => {
    const r = coverRegion(2, 1);
    expect(r.y).toBe(0);
    expect(r.h).toBe(1);
    expect(r.w).toBeCloseTo(0.5, 5);
    expect(r.x).toBeCloseTo(0.25, 5);
  });
});

describe("magnetWorldSizes", () => {
  const U = 0.05; // 1 cm → 0.05 u de mundo

  it("sin dato de cm en ninguna fuente → null (caller cae al ajuste-a-celda)", () => {
    const sizes = magnetWorldSizes([{ wRatio: 1, hRatio: 1 }], U, {
      cellW: 1,
      cellH: 1,
      gap: 0.05,
    });
    expect(sizes).toBeNull();
  });

  it("usa wCm/hCm por pieza cuando llegan en el Magnet3D", () => {
    const sizes = magnetWorldSizes([{ wRatio: 1, hRatio: 1, wCm: 6.5, hCm: 6.5 }], U, {
      cellW: 1,
      cellH: 1,
      gap: 0.05,
    });
    expect(sizes).not.toBeNull();
    expect(sizes![0]!.w).toBeCloseTo(6.5 * U, 5);
    expect(sizes![0]!.h).toBeCloseTo(6.5 * U, 5);
  });

  it("cae al sizeCm de la variante y respeta el aspecto del template (7.5×10, stage 1080×1520)", () => {
    const sizes = magnetWorldSizes([{ wRatio: 1080, hRatio: 1520 }], U, {
      cellW: 10,
      cellH: 10,
      gap: 0.05,
      fallbackSizeCm: "7.5×10",
    });
    expect(sizes).not.toBeNull();
    expect(sizes![0]!.w).toBeCloseTo(7.5 * U, 5);
    expect(sizes![0]!.h).toBeCloseTo(7.5 * U * (1520 / 1080), 5);
  });

  it("un 7.5×10 se ve NOTABLEMENTE más grande que un 4×4.2 en la misma escena", () => {
    const sizes = magnetWorldSizes(
      [
        { wRatio: 1, hRatio: 1, wCm: 7.5, hCm: 10 },
        { wRatio: 1, hRatio: 1, wCm: 4, hCm: 4.2 },
      ],
      U,
      { cellW: 2, cellH: 2, gap: 0.05 },
    );
    expect(sizes).not.toBeNull();
    expect(sizes![0]!.w).toBeGreaterThan(sizes![1]!.w * 1.8);
  });

  it("el ajuste a la celda es UNIFORME (no rompe la proporción relativa entre piezas)", () => {
    const sizes = magnetWorldSizes(
      [
        { wRatio: 1, hRatio: 1, wCm: 6.5 },
        { wRatio: 1, hRatio: 1, wCm: 13 },
      ],
      1,
      { cellW: 5, cellH: 100, gap: 0 },
    );
    expect(sizes).not.toBeNull();
    // f = 5/13 para ambas → la relación 2:1 se mantiene.
    expect(sizes![0]!.w).toBeCloseTo(6.5 * (5 / 13), 5);
    expect(sizes![1]!.w).toBeCloseTo(5, 5);
    expect(sizes![1]!.w / sizes![0]!.w).toBeCloseTo(2, 5);
  });

  it("mezcla con y sin cm: la pieza sin dato cae al default 6.5 cm", () => {
    const sizes = magnetWorldSizes(
      [
        { wRatio: 1, hRatio: 1 },
        { wRatio: 1, hRatio: 1, wCm: 10 },
      ],
      1,
      {
        cellW: 100,
        cellH: 100,
        gap: 0,
      },
    );
    expect(sizes).not.toBeNull();
    expect(sizes![0]!.w).toBeCloseTo(6.5, 5);
    expect(sizes![1]!.w).toBeCloseTo(10, 5);
  });
});

describe("foldedStripMetrics", () => {
  it("doblado plano (foldAngle π): cresta de 180°, cada cara = mitad de la tira menos el arco", () => {
    const { delta, hang, crestArc } = foldedStripMetrics(1.8, 0.05, Math.PI);
    expect(delta).toBeCloseTo(0, 6);
    expect(crestArc).toBeCloseTo(Math.PI, 6);
    expect(hang).toBeCloseTo((1.8 - 0.05 * Math.PI) / 2, 6);
  });

  it("carpa de libro (foldAngle = π − 2·0.49): caras abiertas 28° de la vertical", () => {
    const foldAngle = Math.PI - 2 * 0.49;
    const { delta, hang, crestArc } = foldedStripMetrics(1.8, 0.23, foldAngle);
    expect(delta).toBeCloseTo(0.49, 6);
    expect(crestArc).toBeCloseTo(foldAngle, 6);
    // La cresta COME tira: cara visible < mitad de la tira.
    expect(hang).toBeCloseTo((1.8 - 0.23 * foldAngle) / 2, 6);
    expect(hang).toBeLessThan(0.9);
    expect(hang).toBeGreaterThan(0.6);
  });

  it("nunca devuelve un hang negativo (tira más corta que el arco)", () => {
    const { hang } = foldedStripMetrics(0.1, 1, Math.PI);
    expect(hang).toBe(0.05);
  });
});

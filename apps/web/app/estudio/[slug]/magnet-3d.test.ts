/*
 * Tests de los helpers PUROS de magnet-3d (escala física de escenas 3D + separador doblado).
 * Se mockea @react-three/drei para poder importar el módulo en entorno node (los componentes
 * R3F no se ejercitan acá, solo la matemática exportada).
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@react-three/drei", () => ({
  useTexture: () => null,
}));

import {
  MAGNET_DEPTH,
  TILE_DEPTH,
  coverRegion,
  foldedStripMetrics,
  magnetWorldSizes,
  parseSizeCm,
  textureRegionTransform,
} from "./magnet-3d";

describe("grosores del extruido (ola 4 — Lucy: fichas OTRO punto más delgadas, no planas)", () => {
  it("TILE_DEPTH es ~62.5% menos que MAGNET_DEPTH y sigue teniendo cuerpo (no plana)", () => {
    expect(TILE_DEPTH).toBeGreaterThan(0);
    expect(TILE_DEPTH).toBeLessThan(MAGNET_DEPTH);
    const reduction = 1 - TILE_DEPTH / MAGNET_DEPTH;
    expect(reduction).toBeGreaterThanOrEqual(0.55);
    expect(reduction).toBeLessThanOrEqual(0.7);
  });

  it("TILE_DEPTH ≈ 60% del grosor anterior (0.025) — bisel y sombra se conservan", () => {
    expect(TILE_DEPTH).toBeGreaterThanOrEqual(0.012);
    expect(TILE_DEPTH).toBeLessThanOrEqual(0.018);
  });
});

describe("textureRegionTransform (ola 4 — bug de la cara B negra)", () => {
  const W = 1.2; // stripW de ejemplo
  const H = 0.6; // hang de ejemplo
  /** v muestreada en los extremos de la cara (UV de la tapa = coords del shape). */
  const vAt = (offset: number, repeat: number, y: number) => y * repeat + offset;
  const uAt = (offset: number, repeat: number, x: number) => x * repeat + offset;

  it("sin flip: la cara completa muestrea la región completa, derecha", () => {
    const { repeat, offset } = textureRegionTransform({ x: 0, y: 0, w: 1, h: 1 }, W, H);
    expect(uAt(offset[0], repeat[0], -W / 2)).toBeCloseTo(0, 9);
    expect(uAt(offset[0], repeat[0], W / 2)).toBeCloseTo(1, 9);
    // y=+h/2 (tope local) → v=1 (tope de la imagen): derecha, no volteada.
    expect(vAt(offset[1], repeat[1], H / 2)).toBeCloseTo(1, 9);
    expect(vAt(offset[1], repeat[1], -H / 2)).toBeCloseTo(0, 9);
  });

  it("flipV+flipU: el muestreo queda DENTRO de [0,1] (antes v ≥ 1 → fila del borde estirada, cara negra)", () => {
    const { repeat, offset } = textureRegionTransform(
      { x: 0, y: 0, w: 1, h: 1, flipV: true, flipU: true },
      W,
      H,
    );
    for (const y of [-H / 2, 0, H / 2]) {
      const v = vAt(offset[1], repeat[1], y);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    for (const x of [-W / 2, 0, W / 2]) {
      const u = uAt(offset[0], repeat[0], x);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
    }
  });

  it("flipV+flipU = rotación de 180°: la cara trasera (girada ~π sobre X) se lee DERECHA desde atrás", () => {
    const { repeat, offset } = textureRegionTransform(
      { x: 0, y: 0, w: 1, h: 1, flipV: true, flipU: true },
      W,
      H,
    );
    // Tope local de la cara → fila INFERIOR de la imagen (v=0) y borde izquierdo local →
    // columna derecha (u=1): exactamente lo que pide la rotación de 180° del mesh.
    expect(vAt(offset[1], repeat[1], H / 2)).toBeCloseTo(0, 9);
    expect(vAt(offset[1], repeat[1], -H / 2)).toBeCloseTo(1, 9);
    expect(uAt(offset[0], repeat[0], W / 2)).toBeCloseTo(0, 9);
    expect(uAt(offset[0], repeat[0], -W / 2)).toBeCloseTo(1, 9);
  });

  it("con sub-región (cover) y flips, el muestreo queda dentro de la región", () => {
    const region = { x: 0.25, y: 0.1, w: 0.5, h: 0.8, flipV: true, flipU: true };
    const { repeat, offset } = textureRegionTransform(region, W, H);
    for (const y of [-H / 2, H / 2]) {
      const v = vAt(offset[1], repeat[1], y);
      expect(v).toBeGreaterThanOrEqual(1 - region.y - region.h - 1e-9);
      expect(v).toBeLessThanOrEqual(1 - region.y + 1e-9);
    }
    for (const x of [-W / 2, W / 2]) {
      const u = uAt(offset[0], repeat[0], x);
      expect(u).toBeGreaterThanOrEqual(region.x - 1e-9);
      expect(u).toBeLessThanOrEqual(region.x + region.w + 1e-9);
    }
  });
});

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

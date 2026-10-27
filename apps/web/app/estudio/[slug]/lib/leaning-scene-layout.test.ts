/*
 * Tests de leaning-scene-layout — la matemática pura de las escenas 3D de repisa y regalo
 * (2026-10-26, reemplazo 3D de los flat-lays 2D de ADR-063). Lo que se certifica acá:
 *  - la fila recostada está centrada y las piezas NUNCA se solapan (gap borde a borde);
 *  - la pose recostada apoya la esquina inferior frontal sobre la superficie y toca el plano
 *    vertical con la esquina superior trasera (contacto físico real, nada flota ni se hunde);
 *  - la grilla plana de la mesa respeta el gap y queda centrada.
 */

import { describe, expect, it } from "vitest";
import { fanYaw, flatGridLayout, leaningPose, leaningRowLayout } from "./leaning-scene-layout";

describe("leaningRowLayout", () => {
  it("una pieza queda centrada en x=0 y la fila mide su ancho", () => {
    const { xs, rowW } = leaningRowLayout([{ w: 0.6, h: 0.8 }], 0.15);
    expect(xs).toEqual([0]);
    expect(rowW).toBeCloseTo(0.6);
  });

  it("la fila está centrada: borde izquierdo = −rowW/2 y borde derecho = +rowW/2", () => {
    const sizes = [
      { w: 0.4, h: 0.4 },
      { w: 0.6, h: 0.9 },
      { w: 0.3, h: 0.5 },
    ];
    const { xs, rowW } = leaningRowLayout(sizes, 0.2);
    expect(rowW).toBeCloseTo(0.4 + 0.6 + 0.3 + 2 * 0.2);
    expect(xs[0]! - sizes[0]!.w / 2).toBeCloseTo(-rowW / 2);
    const last = sizes.length - 1;
    expect(xs[last]! + sizes[last]!.w / 2).toBeCloseTo(rowW / 2);
  });

  it("piezas vecinas quedan separadas EXACTAMENTE `gap` borde a borde (sin solape)", () => {
    const sizes = [
      { w: 0.5, h: 0.7 },
      { w: 0.35, h: 0.5 },
      { w: 0.8, h: 1.2 },
      { w: 0.42, h: 0.42 },
    ];
    const gap = 0.13;
    const { xs } = leaningRowLayout(sizes, gap);
    for (let i = 1; i < sizes.length; i++) {
      const gapReal = xs[i]! - sizes[i]!.w / 2 - (xs[i - 1]! + sizes[i - 1]!.w / 2);
      expect(gapReal).toBeCloseTo(gap);
    }
  });

  it("fila vacía: sin posiciones y ancho 0", () => {
    expect(leaningRowLayout([], 0.2)).toEqual({ xs: [], rowW: 0 });
  });
});

describe("leaningPose — contacto físico de la pieza recostada", () => {
  const h = 1.2;
  const depth = 0.05;
  const lean = (12 * Math.PI) / 180;
  const surfaceY = 0.3;
  const supportZ = 0.65;

  it("la esquina inferior FRONTAL apoya exactamente sobre la superficie (y = surfaceY)", () => {
    const { y, tiltX } = leaningPose(h, lean, surfaceY, supportZ, depth);
    // Esquina (0, −h/2, +depth/2) rotada tiltX alrededor de X, trasladada a (y, z):
    // y' = y + (−h/2)·cos(tiltX) − (depth/2)·sin(tiltX)  (tiltX = −lean)
    const bottomFrontY = y - (h / 2) * Math.cos(lean) + (depth / 2) * Math.sin(lean);
    expect(bottomFrontY).toBeCloseTo(surfaceY);
    expect(tiltX).toBeCloseTo(-lean); // la punta cae HACIA el plano (−Z)
  });

  it("la esquina superior TRASERA toca exactamente el plano de apoyo (z = supportZ)", () => {
    const { z } = leaningPose(h, lean, surfaceY, supportZ, depth);
    // Esquina (0, +h/2, −depth/2) rotada −lean alrededor de X:
    // z' = z + (h/2)·sin(−lean) + (−depth/2)·cos(lean)... el signo neto: la punta cae a −Z.
    const topBackZ = z - (h / 2) * Math.sin(lean) - (depth / 2) * Math.cos(lean);
    expect(topBackZ).toBeCloseTo(supportZ);
  });

  it("sin grosor (depth=0) los bordes medios cumplen el contacto", () => {
    const { y, z } = leaningPose(h, lean, surfaceY, supportZ);
    expect(y).toBeCloseTo(surfaceY + (h / 2) * Math.cos(lean));
    expect(z).toBeCloseTo(supportZ + (h / 2) * Math.sin(lean));
  });

  it("sin inclinación (lean=0) la pieza queda vertical apoyada contra el plano", () => {
    const { y, z, tiltX } = leaningPose(h, 0, surfaceY, supportZ, depth);
    expect(tiltX).toBeCloseTo(0);
    expect(y).toBeCloseTo(surfaceY + h / 2);
    expect(z).toBeCloseTo(supportZ + depth / 2);
  });
});

describe("fanYaw", () => {
  it("es simétrico alrededor del centro de la fila (abanico)", () => {
    expect(fanYaw(0, 3, 0.04)).toBeCloseTo(-0.04);
    expect(fanYaw(1, 3, 0.04)).toBe(0);
    expect(fanYaw(2, 3, 0.04)).toBeCloseTo(0.04);
  });

  it("una sola pieza no gira", () => {
    expect(fanYaw(0, 1, 0.04)).toBe(0);
  });
});

describe("flatGridLayout — piezas acostadas sobre la mesa", () => {
  it("vacío: grilla degenerada sin posiciones", () => {
    expect(flatGridLayout([], 0.1)).toEqual({
      positions: [],
      cols: 0,
      rows: 0,
      halfW: 0,
      halfH: 0,
    });
  });

  it("centros separados ≥ pieza + gap en ambos ejes (sin solape)", () => {
    const sizes = Array.from({ length: 7 }, (_, i) => ({ w: 0.5 + (i % 3) * 0.1, h: 0.7 }));
    const gap = 0.18;
    const { positions } = flatGridLayout(sizes, gap);
    const maxW = Math.max(...sizes.map((s) => s.w));
    const maxH = Math.max(...sizes.map((s) => s.h));
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = Math.abs(positions[i]!.x - positions[j]!.x);
        const dz = Math.abs(positions[i]!.z - positions[j]!.z);
        // Misma fila → separación horizontal ≥ celda (múltiplo de maxW+gap según columnas de
        // por medio); misma columna → separación vertical ≥ celda.
        if (dz < 1e-9) expect(dx).toBeGreaterThanOrEqual(maxW + gap - 1e-9);
        if (dx < 1e-9) expect(dz).toBeGreaterThanOrEqual(maxH + gap - 1e-9);
        expect(dx > 0 || dz > 0).toBe(true);
      }
    }
  });

  it("la grilla queda centrada en el origen y halfW/halfH cubren las piezas", () => {
    const sizes = [
      { w: 0.6, h: 0.6 },
      { w: 0.6, h: 0.6 },
      { w: 0.6, h: 0.6 },
      { w: 0.6, h: 0.6 },
    ];
    const gap = 0.1;
    const { positions, cols, rows, halfW, halfH } = flatGridLayout(sizes, gap);
    expect(cols).toBe(2);
    expect(rows).toBe(2);
    const xs = positions.map((p) => p.x);
    const zs = positions.map((p) => p.z);
    expect(Math.min(...xs)).toBeCloseTo(-Math.max(...xs));
    expect(Math.min(...zs)).toBeCloseTo(-Math.max(...zs));
    expect(Math.max(...xs) + 0.3).toBeCloseTo(halfW);
    expect(Math.max(...zs) + 0.3).toBeCloseTo(halfH);
  });

  it("preserva el orden de entrada (relleno por filas)", () => {
    const sizes = Array.from({ length: 5 }, () => ({ w: 1, h: 1 }));
    const { positions, cols } = flatGridLayout(sizes, 0.5);
    expect(cols).toBe(3); // ⌈√5⌉
    // Fila 0: índices 0..2 de izquierda a derecha; fila 1: 3..4.
    expect(positions[0]!.x).toBeLessThan(positions[1]!.x);
    expect(positions[1]!.x).toBeLessThan(positions[2]!.x);
    expect(positions[3]!.z).toBeGreaterThan(positions[0]!.z);
  });
});

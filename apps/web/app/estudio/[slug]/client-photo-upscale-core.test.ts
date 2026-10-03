/*
 * Tests del núcleo puro del upscale local (client-photo-upscale-core.ts) —
 * Paquete J (2026-10-02). La matemática vive acá para que el Web Worker y el
 * fallback inline compartan EXACTAMENTE el mismo plan de re-muestreo y el
 * mismo kernel de unsharp; estos tests congelan ambos sin canvas real.
 */

import { describe, expect, it } from "vitest";
import {
  computeUpscalePlan,
  MAX_UPSCALE_FACTOR,
  parseSizeCm,
  PX_PER_CM_300DPI,
  unsharpMaskPixels,
} from "./client-photo-upscale-core";

describe("parseSizeCm", () => {
  it("parsea formatos válidos (× y x, con decimales)", () => {
    expect(parseSizeCm("6×6")).toEqual({ widthCm: 6, heightCm: 6 });
    expect(parseSizeCm("7x9")).toEqual({ widthCm: 7, heightCm: 9 });
    expect(parseSizeCm("5.5×15")).toEqual({ widthCm: 5.5, heightCm: 15 });
  });

  it("devuelve null con entrada inválida", () => {
    expect(parseSizeCm(undefined)).toBeNull();
    expect(parseSizeCm("")).toBeNull();
    expect(parseSizeCm("grande")).toBeNull();
  });
});

describe("computeUpscalePlan", () => {
  // 6 cm × 118.11 px/cm ≈ 709 px requeridos en el lado menor.
  const required6cm = Math.ceil(6 * PX_PER_CM_300DPI);

  it("sin sizeCm → null (no aplica procesamiento)", () => {
    expect(computeUpscalePlan(400, 300, undefined)).toBeNull();
  });

  it("foto que ya cubre 300 DPI → null (no se toca)", () => {
    expect(computeUpscalePlan(2000, 1500, "6×6")).toBeNull();
    expect(computeUpscalePlan(required6cm, required6cm, "6×6")).toBeNull();
  });

  it("foto baja → target = lado menor a requiredPx, aspect conservado", () => {
    const plan = computeUpscalePlan(400, 300, "6×6");
    expect(plan).not.toBeNull();
    expect(plan!.requiredPx).toBe(required6cm);
    expect(plan!.ratioBefore).toBeCloseTo(300 / required6cm, 6);
    // factor = 709/300 ≈ 2.36 → 400×2.36 ≈ 945, 300×2.36 ≈ 709.
    expect(plan!.targetH).toBe(required6cm);
    expect(plan!.targetW).toBe(Math.round(400 * (required6cm / 300)));
  });

  it(`el factor se topea a ×${MAX_UPSCALE_FACTOR} (más solo inventa píxeles)`, () => {
    // 100 px de lado menor necesitaría ×7.09 → se topea a ×4.
    const plan = computeUpscalePlan(200, 100, "6×6");
    expect(plan!.targetH).toBe(100 * MAX_UPSCALE_FACTOR);
    expect(plan!.targetW).toBe(200 * MAX_UPSCALE_FACTOR);
  });

  it("usa el lado MENOR en cm para el requiredPx (7×9 → 7 cm)", () => {
    const plan = computeUpscalePlan(100, 100, "7×9");
    expect(plan!.requiredPx).toBe(Math.ceil(7 * PX_PER_CM_300DPI));
  });
});

describe("unsharpMaskPixels", () => {
  it("realza el contraste de un borde (kernel 3×3)", () => {
    // 5×1 no aplica (height < 3) → usar 5×3: fila del medio con escalón 0|200.
    const width = 5;
    const height = 3;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = x < 2 ? 0 : 200;
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    unsharpMaskPixels(data, width, height, 0.5);
    // Píxel a la izquierda del borde (x=1, fila central): center=0, vecinos
    // incluyen 200 a la derecha → 0×(1+4k) − (0+0+0+200)×k = −100 → clampea a 0
    // y el de la derecha sube: 200×3 − (200+200+200+0)×0.5 = 300 → 255.
    const left = data[(1 * width + 1) * 4];
    const right = data[(1 * width + 2) * 4];
    expect(left).toBe(0);
    expect(right).toBe(255);
    // El borde de 1 px NO se toca.
    expect(data[0]).toBe(0);
    expect(data[(1 * width + 4) * 4]).toBe(200);
  });

  it("no toca el alpha (solo canales RGB)", () => {
    const width = 3;
    const height = 3;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = 100;
      data[i * 4 + 1] = 100;
      data[i * 4 + 2] = 100;
      data[i * 4 + 3] = 7; // alpha arbitrario
    }
    unsharpMaskPixels(data, width, height, 0.5);
    for (let i = 0; i < width * height; i++) {
      expect(data[i * 4 + 3]).toBe(7);
    }
  });

  it("imagen plana queda idéntica (no inventa ruido)", () => {
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4).fill(128);
    const before = new Uint8ClampedArray(data);
    unsharpMaskPixels(data, width, height, 0.3);
    expect(Array.from(data)).toEqual(Array.from(before));
  });

  it("no-ops con dimensiones < 3", () => {
    const data = new Uint8ClampedArray(2 * 2 * 4).fill(50);
    expect(() => unsharpMaskPixels(data, 2, 2, 0.3)).not.toThrow();
  });
});

/*
 * Unit tests de la matemática del zoom del lightbox "Ver" del carrito
 * (app/carrito/preview-zoom.ts): la escala nunca sale de [1, 4] y el pan
 * nunca deja ver fondo por el borde opuesto de la imagen.
 */

import { describe, expect, it } from "vitest";

import {
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  clampPanOffset,
  clampPreviewZoom,
  maxPanOffset,
  pinchPreviewZoom,
  stepPreviewZoom,
} from "./preview-zoom";

describe("clampPreviewZoom", () => {
  it("clampa al rango [1, 4]", () => {
    expect(clampPreviewZoom(0.5)).toBe(PREVIEW_ZOOM_MIN);
    expect(clampPreviewZoom(1)).toBe(1);
    expect(clampPreviewZoom(2.5)).toBe(2.5);
    expect(clampPreviewZoom(99)).toBe(PREVIEW_ZOOM_MAX);
  });
});

describe("stepPreviewZoom — botones +/−", () => {
  it("sube y baja en pasos multiplicativos sin salir del rango", () => {
    expect(stepPreviewZoom(1, 1)).toBe(1.5);
    expect(stepPreviewZoom(1.5, -1)).toBe(1);
    // En los extremos el paso queda clavado (el botón se deshabilita).
    expect(stepPreviewZoom(PREVIEW_ZOOM_MAX, 1)).toBe(PREVIEW_ZOOM_MAX);
    expect(stepPreviewZoom(PREVIEW_ZOOM_MIN, -1)).toBe(PREVIEW_ZOOM_MIN);
  });
});

describe("pinchPreviewZoom — gesto de dos dedos", () => {
  it("duplicar la distancia entre dedos duplica la escala", () => {
    expect(pinchPreviewZoom(1, 100, 200)).toBe(2);
  });

  it("respeta el techo y tolera distancia inicial inválida", () => {
    expect(pinchPreviewZoom(3, 100, 500)).toBe(PREVIEW_ZOOM_MAX);
    expect(pinchPreviewZoom(2, 0, 100)).toBe(2);
  });
});

describe("pan — límite de desplazamiento", () => {
  it("sin zoom no hay pan disponible", () => {
    expect(maxPanOffset(1, 400)).toBe(0);
    expect(clampPanOffset(50, 1, 400)).toBe(0);
  });

  it("con zoom el pan se clampa a la mitad del exceso escalado", () => {
    // 400px de base a 2× → desborda 400px → ±200px de pan.
    expect(maxPanOffset(2, 400)).toBe(200);
    expect(clampPanOffset(500, 2, 400)).toBe(200);
    expect(clampPanOffset(-500, 2, 400)).toBe(-200);
    expect(clampPanOffset(120, 2, 400)).toBe(120);
  });

  it("datos corruptos (base ≤ 0) no producen pan", () => {
    expect(maxPanOffset(2, 0)).toBe(0);
    expect(clampPanOffset(10, 2, -5)).toBe(0);
  });
});

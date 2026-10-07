/*
 * Fase 2 · item 2.1 — matemática del pinch-to-zoom del LIENZO (stage).
 */

import { describe, it, expect } from "vitest";
import {
  pinchDistance,
  pinchMidpoint,
  pinchStageZoom,
  pinchAnchorRatio,
  anchoredScrollOffset,
} from "./stage-pinch";
import { STAGE_ZOOM_MIN, STAGE_ZOOM_MAX } from "../studio-canvas-grid-size";

describe("pinchDistance / pinchMidpoint", () => {
  it("distancia euclídea y punto medio del gesto", () => {
    const a = { clientX: 0, clientY: 0 };
    const b = { clientX: 30, clientY: 40 };
    expect(pinchDistance(a, b)).toBe(50);
    expect(pinchMidpoint(a, b)).toEqual({ clientX: 15, clientY: 20 });
  });
});

describe("pinchStageZoom", () => {
  it("escala por ratio de distancia desde el zoom inicial del gesto", () => {
    expect(pinchStageZoom(1, 100, 150, STAGE_ZOOM_MAX)).toBeCloseTo(1.5);
    expect(pinchStageZoom(1, 100, 50, STAGE_ZOOM_MAX)).toBeCloseTo(0.5);
  });

  it("respeta el tope de ACERCAR (cap = STAGE_ZOOM_MAX, misma regla de los botones)", () => {
    expect(pinchStageZoom(2, 100, 400, STAGE_ZOOM_MAX)).toBe(STAGE_ZOOM_MAX);
  });

  it("respeta el piso STAGE_ZOOM_MIN al alejar", () => {
    expect(pinchStageZoom(1, 200, 10, STAGE_ZOOM_MAX)).toBe(STAGE_ZOOM_MIN);
  });

  it("distancia inicial degenerada (≤ 0) no cambia el zoom", () => {
    expect(pinchStageZoom(1.25, 0, 100, STAGE_ZOOM_MAX)).toBe(1.25);
  });

  it("un zoom inicial fuera de rango queda clampado", () => {
    expect(pinchStageZoom(99, 0, 100, STAGE_ZOOM_MAX)).toBe(STAGE_ZOOM_MAX);
    expect(pinchStageZoom(0.1, 0, 100, STAGE_ZOOM_MAX)).toBe(STAGE_ZOOM_MIN);
  });
});

describe("pinchAnchorRatio", () => {
  it("fracción del contenido bajo el ancla", () => {
    // Contenido 1000px, scroll 100, ancla a 150 del viewport → punto 250 → 0.25
    expect(pinchAnchorRatio(100, 150, 1000)).toBeCloseTo(0.25);
  });

  it("clampea a [0..1] con el ancla fuera del contenido", () => {
    expect(pinchAnchorRatio(0, -50, 1000)).toBe(0);
    expect(pinchAnchorRatio(900, 500, 1000)).toBe(1);
  });

  it("contenido de tamaño 0 → 0 (sin división por cero)", () => {
    expect(pinchAnchorRatio(10, 10, 0)).toBe(0);
  });
});

describe("anchoredScrollOffset", () => {
  it("deja el mismo punto del contenido bajo el ancla tras el zoom", () => {
    // Antes: contenido 1000, ratio 0.25, ancla a 150. Después (×2 = 2000):
    // punto 0.25·2000 = 500 → scroll = 500 − 150 = 350.
    expect(anchoredScrollOffset(0.25, 150, 2000)).toBe(350);
    // Verificación cruzada: el punto bajo el ancla no cambia de ratio.
    const ratioAntes = pinchAnchorRatio(100, 150, 1000);
    const scrollDespues = anchoredScrollOffset(ratioAntes, 150, 2000);
    expect(pinchAnchorRatio(scrollDespues, 150, 2000)).toBeCloseTo(ratioAntes);
  });

  it("nunca negativo (sin scroll antes del inicio del contenido)", () => {
    expect(anchoredScrollOffset(0.01, 400, 1000)).toBe(0);
  });
});

/*
 * Tests de la matemática ÚNICA del encuadre de foto (photo-fit.ts) — blindaje
 * de concordancia: esta regla (cover-scale + clamp [0.5,3]) la consumen el
 * editor Konva (studio-slot), el tier sharp (production-render) y el tier
 * canvas (production-render-canvas). Si alguien cambia la fórmula acá, las
 * TRES superficies cambian a la vez (identidad por construcción) y este test
 * documenta los valores exactos que producción espera.
 */

import { describe, expect, it } from "vitest";
import {
  PHOTO_SCALE_MIN,
  PHOTO_SCALE_MAX,
  clampPhotoScale,
  coverScaleBase,
  PINCH_SENSITIVITY,
  pinchAdjustedRatio,
  constrainPhotoTransformToCover,
  photoTransformCoversWindow,
} from "./photo-fit";

describe("photo-fit — regla cover + zoom compartida (editor/sharp/canvas)", () => {
  it("los límites del zoom son 0.5 y 3 (la promesa del editor y de producción)", () => {
    expect(PHOTO_SCALE_MIN).toBe(0.5);
    expect(PHOTO_SCALE_MAX).toBe(3);
  });

  it("clampPhotoScale acota al rango [0.5, 3] y respeta el valor dentro", () => {
    expect(clampPhotoScale(0.1)).toBe(0.5);
    expect(clampPhotoScale(0.5)).toBe(0.5);
    expect(clampPhotoScale(1)).toBe(1);
    expect(clampPhotoScale(2.75)).toBe(2.75);
    expect(clampPhotoScale(3)).toBe(3);
    expect(clampPhotoScale(99)).toBe(3);
  });

  it("coverScaleBase = max(w/imgW, h/imgH): cubre la ventana sin huecos", () => {
    // Ventana 200×200, foto 1000×800 → manda el ancho (0.2 > ... no: 200/1000=0.2, 200/800=0.25 → 0.25).
    expect(coverScaleBase(200, 200, 1000, 800)).toBeCloseTo(0.25);
    // Ventana apaisada 400×200 con la misma foto → 400/1000 = 0.4.
    expect(coverScaleBase(400, 200, 1000, 800)).toBeCloseTo(0.4);
    // Con rotación 90/270 el caller pasa las dims YA intercambiadas (swapDims).
    expect(coverScaleBase(200, 200, 800, 1000)).toBeCloseTo(0.25);
  });

  it("el finalScale resultante coincide con la fórmula histórica inline", () => {
    // Réplica de los casos que antes estaban duplicados en studio-slot.tsx,
    // production-render.ts y production-render-canvas.ts.
    const finalScale = (w: number, h: number, iw: number, ih: number, user: number) =>
      coverScaleBase(w, h, iw, ih) * clampPhotoScale(user);
    expect(finalScale(200, 200, 1000, 800, 1)).toBeCloseTo(0.25); // cover exacto
    expect(finalScale(200, 200, 1000, 800, 0.2)).toBeCloseTo(0.125); // clamp a 0.5
    expect(finalScale(200, 200, 1000, 800, 10)).toBeCloseTo(0.75); // clamp a 3
  });
});

describe("photo-fit — cobertura obligatoria de productos planos a sangre", () => {
  it("detecta el hueco blanco del encuadre observado en LCM-2026-0003", () => {
    expect(
      photoTransformCoversWindow({
        windowW: 400,
        windowH: 1500,
        imageW: 1125,
        imageH: 2000,
        transform: {
          scale: 0.9580693425411546,
          offsetX: 0,
          offsetY: -40.29663085937489,
        },
      }),
    ).toBe(false);
  });

  it("sube zoom a cover y limita el paneo al excedente disponible", () => {
    const constrained = constrainPhotoTransformToCover({
      windowW: 400,
      windowH: 1500,
      imageW: 1125,
      imageH: 2000,
      transform: { scale: 0.5, offsetX: 999, offsetY: -999 },
    });

    expect(constrained.scale).toBe(1);
    expect(constrained.offsetX).toBeCloseTo(221.875);
    expect(constrained.offsetY).toBe(0);
    expect(
      photoTransformCoversWindow({
        windowW: 400,
        windowH: 1500,
        imageW: 1125,
        imageH: 2000,
        transform: constrained,
      }),
    ).toBe(true);
  });

  it("intercambia ejes para rotaciones de 90° y conserva zoom válido", () => {
    const constrained = constrainPhotoTransformToCover({
      windowW: 300,
      windowH: 600,
      imageW: 1200,
      imageH: 600,
      transform: { scale: 1.5, offsetX: 500, offsetY: 500, rotation: 90 },
    });

    expect(constrained.scale).toBe(1.5);
    expect(constrained.rotation).toBe(90);
    expect(
      photoTransformCoversWindow({
        windowW: 300,
        windowH: 600,
        imageW: 1200,
        imageH: 600,
        transform: constrained,
      }),
    ).toBe(true);
  });
});

describe("photo-fit — sensibilidad ÚNICA del pinch (grilla = preview modal)", () => {
  it("la curva amplificada es 1.7 (validada Ola 15) y pasa por 1 en el origen", () => {
    expect(PINCH_SENSITIVITY).toBe(1.7);
    expect(pinchAdjustedRatio(1)).toBe(1); // sin salto al inicio del gesto
  });

  it("el mismo gesto produce el mismo zoom en ambas superficies", () => {
    // Dedos que se abren ×1.5 → zoom ×1.85 (antes: ×1.5 en la grilla, ×1.85 en el preview).
    expect(pinchAdjustedRatio(1.5)).toBeCloseTo(1.85);
    // Dedos que se cierran ×0.8 → zoom ×0.66.
    expect(pinchAdjustedRatio(0.8)).toBeCloseTo(0.66);
  });
});

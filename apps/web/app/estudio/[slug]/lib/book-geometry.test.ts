/*
 * Tests de la geometría PURA del libro abierto (ola 2C): proporciones reales (17×24 cm, escala
 * 0.3 u/cm), camber de las hojas y colocación física de los separadores doblados sobre el borde
 * superior — la cara frontal REPOSA sobre la hoja (no flota ni se hunde) y la trasera cuelga
 * libre sin atravesar la mesa (visible al orbitar).
 */

import { describe, expect, it } from "vitest";
import {
  BOOK_FIT,
  CM,
  COVER_T,
  BLOCK_T,
  PAGE_D,
  PAGE_W,
  camber,
  pageSurfaceY,
  separatorPlacement,
  SEPARATOR_SLOTS,
} from "./book-geometry";

describe("proporciones del libro (escala física 0.3 u/cm)", () => {
  it("página de 17×24 cm reales", () => {
    expect(PAGE_W / CM).toBeCloseTo(17, 6);
    expect(PAGE_D / CM).toBeCloseTo(24, 6);
  });

  it("el encuadre cubre el pliego completo abierto (34 cm + sobrehueso)", () => {
    expect(BOOK_FIT.halfW).toBeGreaterThan(PAGE_W);
  });
});

describe("camber (curvatura de la hoja hacia el lomo)", () => {
  it("cae a 0 en el corte exterior", () => {
    expect(camber(PAGE_W)).toBeCloseTo(0, 6);
    expect(camber(-PAGE_W)).toBeCloseTo(0, 6);
  });

  it("levanta hacia el lomo con dip en el valle de la encuadernación", () => {
    // Máximo cerca del lomo…
    expect(camber(0.5)).toBeGreaterThan(camber(2.5));
    expect(camber(0.5)).toBeGreaterThan(0.7);
    // …pero justo en x=0 hunde un poco (el valle entre las dos hojas).
    expect(camber(0)).toBeLessThan(camber(0.5));
  });

  it("es simétrico respecto al lomo", () => {
    expect(camber(-1.7)).toBeCloseTo(camber(1.7), 9);
  });

  it("la superficie de la hoja queda sobre el bloque en todo el ancho", () => {
    for (const x of [-5, -2.5, -0.5, 0, 0.5, 2.5, 5]) {
      expect(pageSurfaceY(x)).toBeGreaterThan(COVER_T + BLOCK_T - 0.15);
    }
  });
});

describe("separatorPlacement (separador doblado sobre el borde superior)", () => {
  const STRIPS = [
    { name: "6×2 cm", stripL: 6 * CM },
    { name: "4×4.2 cm", stripL: 4.2 * CM },
  ];

  for (const { name, stripL } of STRIPS) {
    describe(name, () => {
      it("la cara frontal reposa sobre la hoja (ni flota ni se hunde)", () => {
        for (const { x } of SEPARATOR_SLOTS) {
          const p = separatorPlacement(x, stripL);
          expect(p.frontTipY).toBeGreaterThanOrEqual(p.surfaceY - 0.005);
          expect(p.frontTipY).toBeLessThanOrEqual(p.surfaceY + 0.06);
        }
      });

      it("la cara trasera cuelga libre sobre la mesa en los 3 slots (visible al orbitar)", () => {
        for (const { x } of SEPARATOR_SLOTS) {
          const p = separatorPlacement(x, stripL);
          expect(p.backClearance).toBeGreaterThanOrEqual(0.015);
        }
      });

      it("el pliegue COME tira: cara visible < mitad de la tira", () => {
        const p = separatorPlacement(0.55, stripL);
        expect(p.hang).toBeLessThan(stripL / 2);
        expect(p.hang).toBeGreaterThan(stripL / 4);
      });

      it("el tilt baja la cara frontal hacia la hoja (rotación negativa)", () => {
        const p = separatorPlacement(0.55, stripL);
        expect(p.tilt).toBeLessThan(0);
        expect(p.tilt).toBeGreaterThan(-Math.PI / 3);
      });
    });
  }

  it("los 3 slots quedan a distintas alturas (gracias al camber)", () => {
    const heights = SEPARATOR_SLOTS.map(({ x }) => separatorPlacement(x, 6 * CM).crestY);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.1);
  });
});

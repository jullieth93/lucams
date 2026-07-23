/*
 * Tests de la geometría PURA del libro abierto (ola 2C): proporciones reales (17×24 cm, escala
 * 0.3 u/cm), camber de las hojas y colocación física de los separadores doblados sobre el borde
 * superior — la cara frontal REPOSA sobre la hoja (no flota ni se hunde) y la trasera cuelga
 * libre sin atravesar la mesa (visible al orbitar).
 */

import { describe, expect, it } from "vitest";
import {
  BACK_TIP_CLEARANCE,
  BOOK_FIT,
  CM,
  COVER_T,
  BLOCK_T,
  MAX_BACK_LEAN,
  PAGE_D,
  PAGE_W,
  SEP_FOLD_ANGLE,
  SEP_FRONT_LIFT_DEG,
  SEP_R_FOLD,
  SEPARATOR_SLOTS,
  bookmarkFaceUnits,
  camber,
  pageSurfaceY,
  separatorPlacement,
  stripDimsForFace,
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
    expect(camber(0.5)).toBeGreaterThan(0.5); // ola 4: libro más plano (CAMBER_MAX 0.9 → 0.6)
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

// ──────────────────────────────────────────────────────────────────
//  Ola 3 — separadores con las 2 CARAS REALES del Estudio
// ──────────────────────────────────────────────────────────────────

/** Hang efectivo que produce una tira (espejo de foldedStripMetrics con los SEP_* del libro). */
function effectiveHang(stripL: number): number {
  return (stripL - SEP_R_FOLD * SEP_FOLD_ANGLE) / 2;
}

describe("stripDimsForFace (ola 3 — la CARA manda: tamaño y encuadre sin re-corte)", () => {
  const FACE_RECT = { wRatio: 600, hRatio: 200 }; // cara rectangular 6×2
  const FACE_SQUARE = { wRatio: 400, hRatio: 420 }; // cara cuadrada 4×4.2

  it("sizeCm de la variante son los cm de la CARA: 6×2 → tira de 2 de ancho y caras de 6 (de pie sobre el libro)", () => {
    const { stripW, stripL } = stripDimsForFace(FACE_RECT, "6×2");
    expect(stripW / CM).toBeCloseTo(2, 6);
    expect(effectiveHang(stripL) / CM).toBeCloseTo(6, 6);
    // La cara 3D se pone de pie: la textura rotada 90° en el editor mantiene el aspecto.
    expect(stripW / effectiveHang(stripL)).toBeCloseTo(FACE_RECT.hRatio / FACE_RECT.wRatio, 6);
  });

  it("cara cuadrada 4×4.2 → tira de 4.2 de ancho y caras de 4 (de pie sobre el libro)", () => {
    const { stripW, stripL } = stripDimsForFace(FACE_SQUARE, "4×4.2");
    expect(stripW / CM).toBeCloseTo(4.2, 6);
    expect(effectiveHang(stripL) / CM).toBeCloseTo(4, 6);
    expect(stripW / effectiveHang(stripL)).toBeCloseTo(
      FACE_SQUARE.hRatio / FACE_SQUARE.wRatio,
      6,
    );
  });

  it("la cara 4×4.2 se ve DISTINTA de la 6×2 (ancho y alto difieren claramente)", () => {
    const sq = stripDimsForFace(FACE_SQUARE, "4×4.2");
    const rect = stripDimsForFace(FACE_RECT, "6×2");
    expect(effectiveHang(rect.stripL)).toBeGreaterThan(effectiveHang(sq.stripL) * 1.3);
    expect(sq.stripW).toBeGreaterThan(rect.stripW * 1.8);
  });

  it("wCm/hCm por pieza tienen prioridad sobre sizeCm (sets mixtos: 1×6×2 y 2×4×4.2)", () => {
    const mixed = stripDimsForFace({ ...FACE_SQUARE, wCm: 4, hCm: 4.2 }, "6×2");
    expect(mixed.stripW / CM).toBeCloseTo(4.2, 6);
    expect(effectiveHang(mixed.stripL) / CM).toBeCloseTo(4, 6);
  });

  it("sin sizeCm, el aspecto del lienzo decide: 600×200 → 2×6 · 400×420 → 4.2×4", () => {
    expect(stripDimsForFace(FACE_RECT).stripW / CM).toBeCloseTo(2, 6);
    expect(stripDimsForFace(FACE_SQUARE).stripW / CM).toBeCloseTo(4.2, 6);
  });

  it("diseño VIEJO de tira completa (vertical ~5:14, sin sizeCm) → tira 2×6 histórica", () => {
    const { stripW, stripL } = stripDimsForFace({ wRatio: 500, hRatio: 1400 });
    expect(stripW / CM).toBeCloseTo(2, 6);
    expect(stripL / CM).toBeCloseTo(6, 6);
  });
});

describe("bookmarkFaceUnits (ola 3 — slot par = cara A al frente, impar = cara B atrás)", () => {
  const face = (id: string, w = 600, h = 200) => ({ id, wRatio: w, hRatio: h });

  it("agrupa 2N texturas en N unidades: A al frente, B atrás", () => {
    const slots = [face("1A"), face("1B"), face("2A"), face("2B"), face("3A"), face("3B")];
    const units = bookmarkFaceUnits(slots);
    expect(units.map((u) => [u.front.id, u.back.id])).toEqual([
      ["1A", "1B"],
      ["2A", "2B"],
      ["3A", "3B"],
    ]);
  });

  it("mezcla de aspectos de cara (600×200 y 400×420) también se agrupa por pares", () => {
    const slots = [face("1A"), face("1B"), face("2A", 400, 420), face("2B", 400, 420)];
    const units = bookmarkFaceUnits(slots);
    expect(units).toHaveLength(2);
    expect(units[1]!.front.id).toBe("2A");
    expect(units[1]!.back.id).toBe("2B");
  });

  it("unidad impar (no debería con facesPerUnit=2): la última repite su diseño atrás", () => {
    const units = bookmarkFaceUnits([face("1A"), face("1B"), face("2A")]);
    expect(units).toHaveLength(2);
    expect(units[1]!.back.id).toBe("2A");
  });

  it("diseños VIEJOS de tira completa (vertical) NO se parean: cada uno repite su diseño", () => {
    const legacy = [face("tira1", 500, 1400), face("tira2", 500, 1400)];
    const units = bookmarkFaceUnits(legacy);
    expect(units.map((u) => [u.front.id, u.back.id])).toEqual([
      ["tira1", "tira1"],
      ["tira2", "tira2"],
    ]);
  });

  it("lista vacía → cero unidades (sin explosiones)", () => {
    expect(bookmarkFaceUnits([])).toEqual([]);
  });

  it("Ola 6 — texturas rectangulares rotadas 90° (wRatio/hRatio < 0.6) se parean con sizeCm", () => {
    // Simula el resultado de rotateTextures90 para una cara 6×2: la imagen pasa a 200×600.
    const rotated = [
      face("1A", 200, 600),
      face("1B", 200, 600),
      face("2A", 200, 600),
      face("2B", 200, 600),
    ];
    // Sin sizeCm el aspecto < 0.6 se confunde con tira vieja y NO empareja.
    expect(bookmarkFaceUnits(rotated).map((u) => [u.front.id, u.back.id])).toEqual([
      ["1A", "1A"],
      ["1B", "1B"],
      ["2A", "2A"],
      ["2B", "2B"],
    ]);
    // Con sizeCm se confirma que son caras de separador moderno → A al frente, B atrás.
    const units = bookmarkFaceUnits(rotated, "6×2");
    expect(units.map((u) => [u.front.id, u.back.id])).toEqual([
      ["1A", "1B"],
      ["2A", "2B"],
    ]);
  });
});

describe("separatorPlacement con las caras reales (ola 3)", () => {
  const delta = (Math.PI - SEP_FOLD_ANGLE) / 2;

  it("cara 6×2 (de pie sobre el libro): la trasera se RECUESTÁ sobre la mesa (backLean acotado)", () => {
    const { stripL } = stripDimsForFace({ wRatio: 600, hRatio: 200 }, "6×2");
    for (const { x } of SEPARATOR_SLOTS) {
      const p = separatorPlacement(x, stripL);
      // La cara de 6 cm es larga; colgando libre tocaría la mesa…
      expect(p.backClearance).toBeLessThan(BACK_TIP_CLEARANCE);
      // …pero recostada la punta queda justo sobre la mesa, dentro del límite de apertura.
      expect(p.backLean).toBeGreaterThan(0);
      expect(p.backLean).toBeLessThanOrEqual(MAX_BACK_LEAN);
      const restedTipY = p.crestY - p.hang * Math.cos(delta + p.tilt + p.backLean);
      expect(restedTipY).toBeCloseTo(BACK_TIP_CLEARANCE, 5);
    }
  });

  it("cara larga (4×4.2): la trasera se RECUESTÁ sobre la mesa (backLean acotado, sin atravesarla)", () => {
    const { stripL } = stripDimsForFace({ wRatio: 400, hRatio: 420 }, "4×4.2");
    for (const { x } of SEPARATOR_SLOTS) {
      const p = separatorPlacement(x, stripL);
      // Colgando libre tocaría la mesa…
      expect(p.backClearance).toBeLessThan(BACK_TIP_CLEARANCE);
      // …pero recostada la punta queda justo sobre la mesa, dentro del límite de apertura.
      expect(p.backLean).toBeGreaterThan(0);
      expect(p.backLean).toBeLessThanOrEqual(MAX_BACK_LEAN);
      const restedTipY = p.crestY - p.hang * Math.cos(delta + p.tilt + p.backLean);
      expect(restedTipY).toBeCloseTo(BACK_TIP_CLEARANCE, 5);
    }
  });

  it("con las caras reales la frontal sigue reposando sobre la hoja (ni flota ni se hunde)", () => {
    for (const [face, sizeCm] of [
      [{ wRatio: 600, hRatio: 200 }, "6×2"],
      [{ wRatio: 400, hRatio: 420 }, "4×4.2"],
    ] as const) {
      const { stripL } = stripDimsForFace(face, sizeCm);
      for (const { x } of SEPARATOR_SLOTS) {
        const p = separatorPlacement(x, stripL);
        expect(p.frontTipY).toBeGreaterThanOrEqual(p.surfaceY - 0.03);
        expect(p.frontTipY).toBeLessThanOrEqual(p.surfaceY + 0.06);
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────────
//  Ola 4 (2026-07-23) — composición: libro MÁS PLANO + separador MÁS ERGUIDO
// ──────────────────────────────────────────────────────────────────

describe("composición ola 4 (libro más plano, separador un punto más erguido)", () => {
  it("la cara frontal se ergue lo justo para leerse de frente (ni acostada ni vertical)", () => {
    expect(SEP_FRONT_LIFT_DEG).toBeGreaterThanOrEqual(8);
    expect(SEP_FRONT_LIFT_DEG).toBeLessThanOrEqual(25);
  });

  it("con la cara erguida la cresta SUBE y la punta frontal reposa EXACTA sobre la hoja", () => {
    for (const [face, sizeCm] of [
      [{ wRatio: 600, hRatio: 200 }, "6×2"],
      [{ wRatio: 400, hRatio: 420 }, "4×4.2"],
    ] as const) {
      const { stripL } = stripDimsForFace(face, sizeCm);
      for (const { x } of SEPARATOR_SLOTS) {
        const p = separatorPlacement(x, stripL);
        // La cresta nunca baja del abrazo del filo…
        expect(p.crestY).toBeGreaterThanOrEqual(p.surfaceY + SEP_R_FOLD * 0.8 - 1e-9);
        // …y la punta apoya justo en la superficie (no flota, no se hunde).
        expect(p.frontTipY).toBeCloseTo(p.surfaceY, 6);
      }
    }
  });

  it("la trasera sigue libre o recostada dentro del límite con la nueva pose", () => {
    for (const [face, sizeCm] of [
      [{ wRatio: 600, hRatio: 200 }, "6×2"],
      [{ wRatio: 400, hRatio: 420 }, "4×4.2"],
    ] as const) {
      const { stripL } = stripDimsForFace(face, sizeCm);
      for (const { x } of SEPARATOR_SLOTS) {
        const p = separatorPlacement(x, stripL);
        expect(p.backClearance > BACK_TIP_CLEARANCE || p.backLean <= MAX_BACK_LEAN).toBe(true);
        expect(Number.isFinite(p.backLean)).toBe(true);
      }
    }
  });
});

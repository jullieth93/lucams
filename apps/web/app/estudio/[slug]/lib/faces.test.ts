/*
 * Test del helper de caras (Ola 3): la convención slotCount=2N con slots 2k=cara A
 * y 2k+1=cara B es la fuente de verdad del grid del Estudio, del render de
 * producción (tira desplegada) y del insumo de texturas para el frente 3D.
 */

import { describe, expect, it } from "vitest";
import {
  effectiveSlotCount,
  unitIndexOfSlot,
  faceOfSlot,
  faceSlotLabels,
  facePairOfUnit,
  missingFaceACount,
  deployedSizeCm,
} from "./faces";

describe("faces (Ola 3 — separadores 2 caras)", () => {
  it("effectiveSlotCount duplica los slots por unidad solo con facesPerUnit=2", () => {
    expect(effectiveSlotCount(6, 2)).toBe(12);
    expect(effectiveSlotCount(1, 2)).toBe(2);
    expect(effectiveSlotCount(6, 1)).toBe(6);
    expect(effectiveSlotCount(6, undefined)).toBe(6);
  });

  it("slot 2k es la cara A de la unidad k y slot 2k+1 la cara B", () => {
    expect(unitIndexOfSlot(0, 2)).toBe(0);
    expect(unitIndexOfSlot(1, 2)).toBe(0);
    expect(unitIndexOfSlot(2, 2)).toBe(1);
    expect(unitIndexOfSlot(3, 2)).toBe(1);
    expect(faceOfSlot(0, 2)).toBe("A");
    expect(faceOfSlot(1, 2)).toBe("B");
    expect(faceOfSlot(4, 2)).toBe("A");
    expect(faceOfSlot(5, 2)).toBe("B");
    // Con 1 cara no hay duplicación: unidad = slot, siempre cara A.
    expect(unitIndexOfSlot(3, 1)).toBe(3);
    expect(faceOfSlot(3, 1)).toBe("A");
  });

  it("faceSlotLabels genera 2N etiquetas compactas ordenadas por unidad", () => {
    expect(faceSlotLabels(3, 2)).toEqual(["1A", "1B", "2A", "2B", "3A", "3B"]);
    expect(faceSlotLabels(1, 2)).toEqual(["1A", "1B"]);
    expect(faceSlotLabels(3, 1)).toBeUndefined();
    expect(faceSlotLabels(3, undefined)).toBeUndefined();
  });

  it("facePairOfUnit devuelve los slots de la tira desplegada (A izquierda, B derecha)", () => {
    expect(facePairOfUnit(0)).toEqual({ faceA: 0, faceB: 1 });
    expect(facePairOfUnit(2)).toEqual({ faceA: 4, faceB: 5 });
  });

  // 2026-09-22 — cara B opcional (backOptional) y tamaño desplegado.
  it("missingFaceACount cuenta solo las caras A (slots pares) sin foto", () => {
    const slots = [
      { slotIndex: 0, assetUrl: "a.jpg" }, // A con foto
      { slotIndex: 1, assetUrl: null }, // B vacía — NO cuenta
      { slotIndex: 2, assetUrl: null }, // A vacía — cuenta
      { slotIndex: 3, assetUrl: "b.jpg" },
    ];
    expect(missingFaceACount(slots)).toBe(1);
    expect(missingFaceACount([])).toBe(0);
  });

  it("deployedSizeCm duplica la dimensión mayor (el largo del doblez)", () => {
    expect(deployedSizeCm("2×6")).toBe("2×12");
    expect(deployedSizeCm("4×4.2")).toBe("4×8.4");
    expect(deployedSizeCm("5x5")).toBe("5×10");
    expect(deployedSizeCm("grande")).toBeNull();
    expect(deployedSizeCm(undefined)).toBeNull();
  });
});

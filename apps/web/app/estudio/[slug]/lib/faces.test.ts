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
  previewFacePairOfUnit,
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

  // Decisión owner 2026-10-07 — REGLA ÚNICA de la cara B vacía (revierte la
  // regla espejo del Paquete D, 2026-10-02): en TODOS los renders (preview
  // cliente, 3D, producción) la cara B sin diseñar queda EN BLANCO.
  it("previewFacePairOfUnit: cara B vacía (backOptional) → faceB = null (se pinta EN BLANCO)", () => {
    const slots = [
      { slotIndex: 0, assetUrl: "a.jpg" }, // unidad 0 · A con foto
      { slotIndex: 1, assetUrl: null }, // unidad 0 · B VACÍA
      { slotIndex: 2, assetUrl: "b.jpg" }, // unidad 1 · A con foto
      { slotIndex: 3, assetUrl: "c.jpg" }, // unidad 1 · B diseñada
    ];
    // B vacía → faceB = null: el caller pinta ese rect en blanco puro, nunca
    // espejo de la cara A.
    expect(previewFacePairOfUnit(slots, 0, true)).toEqual({ faceA: 0, faceB: null });
    // B diseñada → el par real, sin cambios.
    expect(previewFacePairOfUnit(slots, 1, true)).toEqual({ faceA: 2, faceB: 3 });
    // Sin backOptional el par es siempre el real (la B se exige diseñada).
    expect(previewFacePairOfUnit(slots, 0, false)).toEqual({ faceA: 0, faceB: 1 });
  });

  // Concordancia con producción (2026-10-07): la cara B vacía NO usa ningún
  // slot — producción genera un PNG blanco del tamaño de la cara A
  // (blankBackFacePng, blank-back-face.ts) y el preview pinta el rect blanco.
  // Cualquier unidad, sin importar su índice, resuelve faceB = null.
  it("la B vacía se pinta EN BLANCO en cualquier unidad (faceB = null, mismo blanco que producción)", () => {
    for (let unit = 0; unit < 5; unit++) {
      const { faceA, faceB } = facePairOfUnit(unit);
      const slots = [
        { slotIndex: faceA, assetUrl: `a${unit}.jpg` },
        { slotIndex: faceB, assetUrl: null }, // B vacía
      ];
      const pair = previewFacePairOfUnit(slots, unit, true);
      expect(pair.faceA).toBe(faceA); // la cara A siempre es su slot par real
      expect(pair.faceB).toBeNull(); // la B vacía nunca espeja otro slot
    }
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

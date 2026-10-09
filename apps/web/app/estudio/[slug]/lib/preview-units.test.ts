/*
 * Fase 2 · item 2.2 — partición de la Vista Previa por unidad física.
 */

import { describe, it, expect } from "vitest";
import { previewUnitRanges, previewNeedsPager } from "./preview-units";

describe("previewUnitRanges", () => {
  it("calendario ×4 sets: un rango de 12 por set (48 slots)", () => {
    const ranges = previewUnitRanges({ slotCount: 48, unitCount: 4, unitSlots: 12 });
    expect(ranges).toEqual([
      { start: 0, end: 12 },
      { start: 12, end: 24 },
      { start: 24, end: 36 },
      { start: 36, end: 48 },
    ]);
    expect(previewNeedsPager(ranges)).toBe(true);
  });

  it("tiras ×2 (3 fotos c/u): un rango por tira", () => {
    expect(previewUnitRanges({ slotCount: 6, unitCount: 2, unitSlots: 3 })).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 6 },
    ]);
  });

  it("separadores ×3 (2 caras c/u): un rango por separador con sus 2 caras", () => {
    expect(previewUnitRanges({ slotCount: 6, unitCount: 3, unitSlots: 2 })).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
      { start: 4, end: 6 },
    ]);
  });

  it("UN solo calendario/set: una página, sin navegación", () => {
    const ranges = previewUnitRanges({ slotCount: 12, unitCount: 1, unitSlots: 12 });
    expect(ranges).toEqual([{ start: 0, end: 12 }]);
    expect(previewNeedsPager(ranges)).toBe(false);
  });

  it("packs de fotoimanes (12 = 2 packs de 6): un rango por pack", () => {
    const ranges = previewUnitRanges({
      slotCount: 12,
      unitCount: 1,
      unitSlots: 1,
      packGroupSlots: 6,
    });
    expect(ranges).toEqual([
      { start: 0, end: 6 },
      { start: 6, end: 12 },
    ]);
  });

  it("UN solo pack: una página sin navegación (slotCount == pack)", () => {
    const ranges = previewUnitRanges({
      slotCount: 6,
      unitCount: 1,
      unitSlots: 1,
      packGroupSlots: 6,
    });
    expect(ranges).toEqual([{ start: 0, end: 6 }]);
    expect(previewNeedsPager(ranges)).toBe(false);
  });

  it("diseño legacy que no calza en packs (9 con packs de 6): una página", () => {
    const ranges = previewUnitRanges({
      slotCount: 9,
      unitCount: 1,
      unitSlots: 1,
      packGroupSlots: 6,
    });
    expect(ranges).toEqual([{ start: 0, end: 9 }]);
  });

  it("producto de 1 unidad sin modelo declarado (polaroid ×6): una página", () => {
    const ranges = previewUnitRanges({ slotCount: 6 });
    expect(ranges).toEqual([{ start: 0, end: 6 }]);
    expect(previewNeedsPager(ranges)).toBe(false);
  });

  it("multi-unidad incoherente (unitCount × unitSlots > slotCount): degrada a una página", () => {
    const ranges = previewUnitRanges({ slotCount: 10, unitCount: 2, unitSlots: 12 });
    expect(ranges).toEqual([{ start: 0, end: 10 }]);
  });

  it("sin slots: sin rangos", () => {
    expect(previewUnitRanges({ slotCount: 0 })).toEqual([]);
  });
});

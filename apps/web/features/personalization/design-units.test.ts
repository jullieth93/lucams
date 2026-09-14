/*
 * Tests del modelo MULTI-UNIDAD (owner 2026-09-09) — helpers puros de
 * design-units.ts: derivación de unidades, layout por unidad y, sobre todo, el
 * MULTIPLICADOR de precio (la ruta del dinero: nunca se cobra de menos en un
 * flujo legítimo y los diseños legacy/packs quedan en ×1 intactos).
 */

import { describe, expect, it } from "vitest";
import {
  declaresUnits,
  designUnitPriceMultiplier,
  gridSlotCountForLayout,
  letterSetUnitCount,
  maxUnitsForProduct,
  photosPerUnitForEditor,
  unitCountOf,
  unitIndexOfSlot,
  unitSlotRange,
  unitSlotsOf,
  MAX_LETTER_SET_UNITS,
} from "./design-units";

const stripTemplate = { gridCols: 1, gridGap: 0 };
const plainTemplate = { version: 1, stage: { width: 1080, height: 1080 }, layers: [] };

describe("photosPerUnitForEditor — fotos por unidad según el producto", () => {
  it("calendario → photoSlots (12 tarjetas por calendario)", () => {
    expect(
      photosPerUnitForEditor({
        isCalendarMonth: true,
        facesPerUnit: 1,
        photoSlots: 12,
        unitTemplate: plainTemplate,
      }),
    ).toBe(12);
  });

  it("separadores (facesPerUnit=2) → 1 foto por cara (los slots son caras)", () => {
    expect(
      photosPerUnitForEditor({
        isCalendarMonth: false,
        facesPerUnit: 2,
        photoSlots: 3,
        unitTemplate: plainTemplate,
      }),
    ).toBe(1);
  });

  it("tira photobooth (gridCols=1, gridGap=0) → photoSlots por tira", () => {
    expect(
      photosPerUnitForEditor({
        isCalendarMonth: false,
        facesPerUnit: 1,
        photoSlots: 3,
        unitTemplate: stripTemplate,
      }),
    ).toBe(3);
  });

  it("imán suelto (polaroid/cuadrados) → 1 (cada imán ES su unidad)", () => {
    expect(
      photosPerUnitForEditor({
        isCalendarMonth: false,
        facesPerUnit: 1,
        photoSlots: 10,
        unitTemplate: plainTemplate,
      }),
    ).toBe(1);
  });
});

describe("derivación de unidades del canvasData (legacy = 1 unidad)", () => {
  it("diseño legacy sin claves → 1 unidad de slotCount slots", () => {
    const legacy = { version: 2, slotCount: 6, slots: [] };
    expect(declaresUnits(legacy)).toBe(false);
    expect(unitCountOf(legacy)).toBe(1);
    expect(unitSlotsOf(legacy)).toBe(6);
  });

  it("diseño multi-unidad declarado → se lee tal cual", () => {
    const multi = { version: 2, slotCount: 6, unitCount: 2, unitSlots: 3, slots: [] };
    expect(declaresUnits(multi)).toBe(true);
    expect(unitCountOf(multi)).toBe(2);
    expect(unitSlotsOf(multi)).toBe(3);
  });

  it("unitIndexOfSlot / unitSlotRange reparten la pila plana por unidad", () => {
    expect(unitIndexOfSlot(0, 3)).toBe(0);
    expect(unitIndexOfSlot(2, 3)).toBe(0);
    expect(unitIndexOfSlot(3, 3)).toBe(1);
    expect(unitIndexOfSlot(5, 3)).toBe(1);
    expect(unitSlotRange(1, 3)).toEqual({ start: 3, end: 6 });
  });
});

describe("gridSlotCountForLayout — gridLayout por unidad o por diseño", () => {
  it("multi-unidad multi-slot (tiras ×2) → layout de UNA unidad", () => {
    expect(
      gridSlotCountForLayout({ unitCount: 2, unitSlots: 3, slotCount: 6, facesPerUnit: 1 }),
    ).toBe(3);
  });

  it("separadores agrupados (facesPerUnit=2) → layout del diseño completo", () => {
    expect(
      gridSlotCountForLayout({ unitCount: 3, unitSlots: 2, slotCount: 6, facesPerUnit: 2 }),
    ).toBe(6);
  });

  it("una sola unidad → layout del diseño completo (retrocompatible)", () => {
    expect(
      gridSlotCountForLayout({ unitCount: 1, unitSlots: 3, slotCount: 3, facesPerUnit: 1 }),
    ).toBe(3);
    expect(
      gridSlotCountForLayout({ unitCount: 6, unitSlots: 1, slotCount: 6, facesPerUnit: 1 }),
    ).toBe(6);
  });
});

describe("designUnitPriceMultiplier — la ruta del dinero", () => {
  it("diseños legacy (sin unitSlots) → ×1 para siempre", () => {
    expect(designUnitPriceMultiplier({ version: 2, slotCount: 10, photoSlots: 10 })).toBe(1);
    expect(designUnitPriceMultiplier({ version: 2, slotCount: 6 })).toBe(1);
    expect(designUnitPriceMultiplier(null)).toBe(1);
    expect(designUnitPriceMultiplier({ version: 1 })).toBe(1);
  });

  it("tira de 3 fotos × 2 unidades → ×2 (la variante cubre UNA tira)", () => {
    const tira2 = { version: 2, slotCount: 6, unitCount: 2, unitSlots: 3, photoSlots: 3 };
    expect(designUnitPriceMultiplier(tira2, 1)).toBe(2);
  });

  it("tira de 4 fotos × 3 unidades → ×3", () => {
    const tira3 = { version: 2, slotCount: 12, unitCount: 3, unitSlots: 4, photoSlots: 4 };
    expect(designUnitPriceMultiplier(tira3, 1)).toBe(3);
  });

  it("separadores × 3 → ×1 (la variante YA es el pack de 3 unidades × 2 caras)", () => {
    const sep = { version: 2, slotCount: 6, unitCount: 3, unitSlots: 2, photoSlots: 3 };
    expect(designUnitPriceMultiplier(sep, 2)).toBe(1);
  });

  it("calendario × 2 (sin photoSlots raíz) → ×2 via unitSlots", () => {
    const cal = { version: 2, slotCount: 24, unitCount: 2, unitSlots: 12 };
    expect(designUnitPriceMultiplier(cal, 1)).toBe(2);
  });

  it("polaroid/cuadrados: no se declara (unitSlots=1) → ×1 (la variante es el pack)", () => {
    // Invariante de escritura: los packs de imán suelto NO declaran unidades.
    const polaroid = { version: 2, slotCount: 10, photoSlots: 10 };
    expect(designUnitPriceMultiplier(polaroid, 1)).toBe(1);
  });

  it("tampering no cobra de menos: slotCount inflado con variante de 1 tira → se paga por pieza", () => {
    // Cliente escribe 24 slots pero la variante resuelta es la tira de 3:
    // paga 8 tiras equivalentes (económicamente consistente, jamás menos).
    const tampered = { version: 2, slotCount: 24, unitCount: 1, unitSlots: 3, photoSlots: 3 };
    expect(designUnitPriceMultiplier(tampered, 1)).toBe(8);
  });

  it("tampering a la baja (unitCount=1 con 6 slots y raíz 3) → paga por pieza equivalente", () => {
    const tampered = { version: 2, slotCount: 6, unitCount: 1, unitSlots: 3, photoSlots: 3 };
    expect(designUnitPriceMultiplier(tampered, 1)).toBe(2);
  });
});

describe("letterSetUnitCount — sets de letras (metadata, no canvas)", () => {
  it("sin clave → 1 (retrocompatible)", () => {
    expect(letterSetUnitCount(null)).toBe(1);
    expect(letterSetUnitCount({})).toBe(1);
    expect(letterSetUnitCount({ surface: "letterset" })).toBe(1);
  });

  it("lee el unitCount validado del server", () => {
    expect(letterSetUnitCount({ surface: "letterset", unitCount: 3 })).toBe(3);
  });

  it("acota al tope defensivo (anti-inyección de metadata)", () => {
    expect(letterSetUnitCount({ surface: "letterset", unitCount: 999 })).toBe(MAX_LETTER_SET_UNITS);
  });

  it("sin surface letterset → 1: el metadata.unitCount de un canvas V2 es ESPEJO (lo cubre designUnitPriceMultiplier)", () => {
    // Bug 2026-09-11: tira ×2 (canvas V2 + espejo del finalize) cobraba ×4 al
    // multiplicar dos veces. El gate por surface lo evita.
    expect(letterSetUnitCount({ unitCount: 2 })).toBe(1);
    expect(letterSetUnitCount({ surface: "name", unitCount: 3 })).toBe(1);
  });
});

describe("maxUnitsForProduct — tope por el cap de 50 slots", () => {
  it("calendario (12 por unidad) → 4", () => {
    expect(maxUnitsForProduct(12)).toBe(4);
  });
  it("tira de 3 → 16 · tira de 4 → 12", () => {
    expect(maxUnitsForProduct(3)).toBe(16);
    expect(maxUnitsForProduct(4)).toBe(12);
  });
  it("separadores (2 caras) → 25 · imán suelto → 50", () => {
    expect(maxUnitsForProduct(2)).toBe(25);
    expect(maxUnitsForProduct(1)).toBe(50);
  });
});

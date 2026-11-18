/*
 * Tests del modelo MULTI-UNIDAD y topes canónicos (ADR-209) — helpers puros de
 * design-units.ts.
 */

import { describe, expect, it } from "vitest";
import {
  capPiecesPerCommercialUnit,
  commercialDesignUnitsForItem,
  declaresUnits,
  declaredValueCopPerInventoryUnit,
  designUnitPriceMultiplier,
  gridSlotCountForLayout,
  inventoryUnitsForOrderItem,
  letterSetUnitCount,
  linePhysicalUnitsForCap,
  maxCopiesForDesignUnits,
  maxSelectorUnitsForProduct,
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

  it("pack de 6 fotoimanes (isPackOfSix=true) → 6 fotos por pack", () => {
    expect(
      photosPerUnitForEditor({
        isCalendarMonth: false,
        facesPerUnit: 1,
        photoSlots: 6,
        unitTemplate: plainTemplate,
        isPackOfSix: true,
      }),
    ).toBe(6);
  });

  it("pieza suelta → 1", () => {
    expect(
      photosPerUnitForEditor({
        isCalendarMonth: false,
        facesPerUnit: 1,
        photoSlots: 1,
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

  it("diseño legacy de 18 slots reales contra variante base de 6 slots deriva 3 packs y rechaza slotCount inflado", () => {
    const legacyPack = {
      version: 2,
      slotCount: 18,
      photoSlots: 18,
      slots: Array.from({ length: 18 }, (_, slotIndex) => ({ slotIndex })),
    };
    expect(unitCountOf(legacyPack, 6)).toBe(3);
    expect(designUnitPriceMultiplier(legacyPack, 1, 6)).toBe(3);

    const tampered = {
      version: 2,
      slotCount: 18,
      photoSlots: 6,
      slots: Array.from({ length: 6 }, (_, slotIndex) => ({ slotIndex })),
    };
    expect(unitCountOf(tampered, 6)).toBe(1);
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
  });
});

describe("designUnitPriceMultiplier — la ruta del dinero y anti-tamper", () => {
  it("diseños legacy sin unitSlots ni variante superior → ×1", () => {
    expect(designUnitPriceMultiplier({ version: 2, slotCount: 10, photoSlots: 10 })).toBe(1);
    expect(designUnitPriceMultiplier({ version: 2, slotCount: 6 })).toBe(1);
    expect(designUnitPriceMultiplier(null)).toBe(1);
    expect(designUnitPriceMultiplier({ version: 1 })).toBe(1);
  });

  it("tira de 3 fotos × 2 unidades → ×2", () => {
    const tira2 = { version: 2, slotCount: 6, unitCount: 2, unitSlots: 3, photoSlots: 3 };
    expect(designUnitPriceMultiplier(tira2, 1, 3)).toBe(2);
  });

  it("tira de 4 fotos × 15 unidades (60 slots) → ×15", () => {
    const tira15 = { version: 2, slotCount: 60, unitCount: 15, unitSlots: 4, photoSlots: 4 };
    expect(designUnitPriceMultiplier(tira15, 1, 4)).toBe(15);
  });

  it("separadores sobre variante base (photoSlots=1, facesPerUnit=2) × 5 → ×5", () => {
    const sep5 = { version: 2, slotCount: 10, unitCount: 5, unitSlots: 2, photoSlots: 1 };
    expect(designUnitPriceMultiplier(sep5, 2, 1)).toBe(5);
  });

  it("anti-tamper: si el cliente infla cd.photoSlots, manda variantPhotoSlots del servidor", () => {
    const tampered = { version: 2, slotCount: 10, unitCount: 1, unitSlots: 2, photoSlots: 99 };
    expect(designUnitPriceMultiplier(tampered, 2, 1)).toBe(5);
  });

  it("separadores legacy (variante vieja con photoSlots=3) → ×1", () => {
    const sepLegacy = { version: 2, slotCount: 6, unitCount: 3, unitSlots: 2, photoSlots: 3 };
    expect(designUnitPriceMultiplier(sepLegacy, 2, 3)).toBe(1);
  });

  it("pack de 6 fotoimanes × 4 packs (24 slots) sobre variante base (photoSlots=6) → ×4", () => {
    const packs4 = { version: 2, slotCount: 24, unitCount: 4, unitSlots: 6, photoSlots: 6 };
    expect(designUnitPriceMultiplier(packs4, 1, 6)).toBe(4);
  });

  it("calendario × 2 (sin photoSlots raíz) → ×2 via unitSlots", () => {
    const cal = { version: 2, slotCount: 24, unitCount: 2, unitSlots: 12 };
    expect(designUnitPriceMultiplier(cal, 1)).toBe(2);
  });
});

describe("letterSetUnitCount — sets de letras (metadata, no canvas)", () => {
  it("sin clave → 1", () => {
    expect(letterSetUnitCount(null)).toBe(1);
    expect(letterSetUnitCount({})).toBe(1);
    expect(letterSetUnitCount({ surface: "letterset" })).toBe(1);
  });

  it("lee el unitCount validado del server y acota a MAX_LETTER_SET_UNITS", () => {
    expect(letterSetUnitCount({ surface: "letterset", unitCount: 3 })).toBe(3);
    expect(letterSetUnitCount({ surface: "letterset", unitCount: 999 })).toBe(MAX_LETTER_SET_UNITS);
    expect(letterSetUnitCount({ unitCount: 2 })).toBe(1);
  });
});

describe("maxUnitsForProduct y topes de copias <= 100 uds físicas (ADR-209)", () => {
  it("calendario (12 meses) → máx. 4 sets (48 meses)", () => {
    expect(maxUnitsForProduct(12)).toBe(4);
  });

  it("packs de 6 fotoimanes → máx. 6 packs (36 fotos) y máx. 16 packs totales con copias (96 imanes)", () => {
    expect(maxUnitsForProduct(6)).toBe(6);
    expect(capPiecesPerCommercialUnit({ productSlug: "set-fotoimanes-polaroid" })).toBe(6);
    expect(maxCopiesForDesignUnits(1, 6)).toBe(16);
    expect(maxCopiesForDesignUnits(2, 6)).toBe(8);
    expect(maxCopiesForDesignUnits(6, 6)).toBe(2);
    expect(linePhysicalUnitsForCap({ qty: 8, designUnits: 2, piecesPerCommercialUnit: 6 })).toBe(
      96,
    );
  });

  it("tiras (3 y 4 fotos), separadores (2 caras) y piezas sueltas (1 cara) → máx. 15 diseños", () => {
    expect(maxUnitsForProduct(4)).toBe(15);
    expect(maxUnitsForProduct(3)).toBe(15);
    expect(maxUnitsForProduct(2)).toBe(15);
    expect(maxUnitsForProduct(1)).toBe(15);
    expect(maxCopiesForDesignUnits(1, 1)).toBe(100);
    expect(maxCopiesForDesignUnits(15, 1)).toBe(6);
  });

  it("sets de letras → máx. 10 sets", () => {
    expect(maxUnitsForProduct(1, { isLetterSet: true })).toBe(10);
  });

  it("maxSelectorUnitsForProduct alinea PDP y /admin/mayorista por familia (ADR-209)", () => {
    expect(
      maxSelectorUnitsForProduct({
        slug: "separadores-magneticos",
        personalizationKind: "PHOTO_PACK",
        personalizationSchema: { facesPerUnit: 2, freeUnitDesign: true, photoSlots: 1 },
      }),
    ).toEqual({ maxUnits: 15, unitSingular: "unidad", unitPlural: "unidades", isPack: false });

    expect(
      maxSelectorUnitsForProduct({
        slug: "set-fotoimanes-cuadrados",
        personalizationKind: "PHOTO_PACK",
        personalizationSchema: { photoSlots: 6 },
      }),
    ).toEqual({ maxUnits: 6, unitSingular: "pack", unitPlural: "packs", isPack: true });

    expect(
      maxSelectorUnitsForProduct({
        slug: "calendario-mes-a-mes-fotos",
        personalizationKind: "CALENDAR_PHOTO_MONTH",
        personalizationSchema: { photoSlots: 12 },
      }),
    ).toEqual({ maxUnits: 4, unitSingular: "set", unitPlural: "sets", isPack: false });

    expect(
      maxSelectorUnitsForProduct({
        slug: "abecedario-completo",
        personalizationKind: "NONE",
        personalizationSchema: { letterSet: "full" },
      }),
    ).toEqual({ maxUnits: 10, unitSingular: "pack", unitPlural: "packs", isPack: true });

    expect(
      maxSelectorUnitsForProduct({
        slug: "box-para-pareja",
        personalizationKind: "NONE",
        personalizationSchema: null,
      }),
    ).toEqual({ maxUnits: 100, unitSingular: "unidad", unitPlural: "unidades", isPack: false });
  });
});

describe("inventoryUnitsForOrderItem y commercialDesignUnitsForItem", () => {
  it("multiplica qty comercial, unidades del pack y unidades del diseño", () => {
    expect(
      inventoryUnitsForOrderItem({
        qty: 2,
        variantAttrs: { quantity: 3 },
        customDesign: { version: 2, slotCount: 24, unitSlots: 12, unitCount: 2 },
        metadata: {},
        productSchema: {},
      }),
    ).toBe(12);
  });

  it("tolera la forma anidada de Prisma (OrderItem con variant.product y design) — fix P0 saga", () => {
    const prismaOrderItem = {
      qty: 30,
      variant: {
        attributes: { quantity: 1, photoSlots: 1 },
        product: { personalizationSchema: { facesPerUnit: 2 } },
      },
      design: {
        canvasData: { version: 2, slotCount: 4, unitCount: 2, unitSlots: 2, photoSlots: 1 },
        metadata: { unitCount: 2 },
      },
    };
    expect(commercialDesignUnitsForItem(prismaOrderItem)).toBe(2);
    expect(inventoryUnitsForOrderItem(prismaOrderItem)).toBe(60);
  });

  it("no multiplica dos veces un pack de caras ya incluido en variante legacy", () => {
    expect(
      inventoryUnitsForOrderItem({
        qty: 1,
        variantAttrs: { quantity: 1, photoSlots: 3 },
        customDesign: { version: 2, slotCount: 6, photoSlots: 3, unitSlots: 2 },
        metadata: {},
        productSchema: { facesPerUnit: 2 },
      }),
    ).toBe(1);
  });
});

describe("declaredValueCopPerInventoryUnit — valor asegurado por unidad física", () => {
  it("el total declarado es el valor de venta de la línea, nunca × las unidades físicas", () => {
    const perUnit = declaredValueCopPerInventoryUnit({
      unitPriceCop: 3_990_000,
      qty: 1,
      inventoryUnits: 26,
    });
    expect(perUnit).toBe(Math.round(3_990_000 / 26));
    expect(Math.abs(perUnit * 26 - 3_990_000)).toBeLessThanOrEqual(13);
  });

  it("2 diseños × 30 copias = 60 unidades divide exacto el valor de la tanda", () => {
    const perUnit = declaredValueCopPerInventoryUnit({
      unitPriceCop: 4_000_000,
      qty: 30,
      inventoryUnits: 60,
    });
    expect(perUnit).toBe(2_000_000);
  });
});

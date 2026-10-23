/*
 * Tests de designPreviewPageLabels (2026-10-22) — rótulos por página del "Ver"
 * paginado, alineados por índice con las unidades del diseño.
 *
 * Contrato: null cuando no hay nada verdadero que rotular (1 unidad, sin
 * páginas, sin metadata/canvas) y NUNCA rótulos desalineados (unidades ≠
 * páginas efectivas → null). Lettersets rotulan borde por set desde
 * metadata.units[k]; el resto usa el sustantivo de la unidad del Estudio.
 */

import { describe, expect, it } from "vitest";
import { designPreviewPageLabels, unitNounForLine } from "./preview-page-labels";

const LETTERSET_UNITS = {
  surface: "letterset",
  unitCount: 3,
  withBorder: true, // clave raíz = representante del set 0 (retrocompat ADR-157)
  units: [
    { colors: ["#111"], styleSetId: null, withBorder: true },
    { colors: ["#222"], styleSetId: "style-animales", withBorder: false },
    { colors: ["#333"], styleSetId: null, withBorder: true },
  ],
};

const TIRA_CANVAS = { version: 2, slotCount: 6, unitCount: 2, unitSlots: 3 };

describe("designPreviewPageLabels", () => {
  it("sin diseño / sin páginas / 1 sola página → null (no hay pager que rotular)", () => {
    expect(designPreviewPageLabels(null)).toBeNull();
    expect(designPreviewPageLabels(undefined)).toBeNull();
    expect(designPreviewPageLabels({})).toBeNull();
    expect(designPreviewPageLabels({ previewPagesCount: 1 })).toBeNull();
    expect(designPreviewPageLabels({ previewPagesCount: null })).toBeNull();
  });

  it("diseño sin metadata ni canvas multi-unidad → null (1 unidad, comportamiento intacto)", () => {
    expect(designPreviewPageLabels({ previewPagesCount: 2, metadata: null })).toBeNull();
    expect(
      designPreviewPageLabels({ previewPagesCount: 2, canvasData: { version: 1 } }),
    ).toBeNull();
  });

  it("letterset multi-set: rótulo por set con SU borde (metadata.units[k])", () => {
    expect(designPreviewPageLabels({ metadata: LETTERSET_UNITS, previewPagesCount: 3 })).toEqual([
      "Set 1 · con borde",
      "Set 2 · sin borde",
      "Set 3 · con borde",
    ]);
  });

  it("letterset: units.length ≠ páginas → null (nunca rótulos desalineados)", () => {
    expect(designPreviewPageLabels({ metadata: LETTERSET_UNITS, previewPagesCount: 2 })).toBeNull();
  });

  it("letterset multi-set sin array units (metadata.unitCount espejo) → 'Set N' genérico", () => {
    expect(
      designPreviewPageLabels({
        metadata: { surface: "letterset", unitCount: 2 },
        previewPagesCount: 2,
      }),
    ).toEqual(["Set 1", "Set 2"]);
  });

  it("canvas V2 multi-unidad (tiras): usa el sustantivo de la línea", () => {
    expect(
      designPreviewPageLabels(
        { canvasData: TIRA_CANVAS, metadata: { unitCount: 2 }, previewPagesCount: 2 },
        "Tira",
      ),
    ).toEqual(["Tira 1", "Tira 2"]);
  });

  it("canvas V2: unidades ≠ páginas (diseño viejo o > PREVIEW_PAGES_MAX) → null", () => {
    expect(
      designPreviewPageLabels({ canvasData: TIRA_CANVAS, previewPagesCount: 3 }, "Tira"),
    ).toBeNull();
    // 30 unidades declaradas pero las páginas se topan en 24 → desalineado.
    expect(
      designPreviewPageLabels({
        canvasData: { version: 2, slotCount: 60, unitCount: 30, unitSlots: 2 },
        previewPagesCount: 30,
      }),
    ).toBeNull();
  });

  it("sin sustantivo reconocible (pack de fotos) → 'Unidad N'", () => {
    expect(
      designPreviewPageLabels(
        { canvasData: TIRA_CANVAS, previewPagesCount: 2 },
        unitNounForLine(null, "Pack de 6 fotos"),
      ),
    ).toEqual(["Unidad 1", "Unidad 2"]);
  });
});

describe("unitNounForLine", () => {
  it("mapea el kind de la línea al sustantivo del Estudio", () => {
    expect(unitNounForLine("CALENDAR_PHOTO_MONTH", null)).toBe("Calendario");
    expect(unitNounForLine("BOOKMARK_PHOTO", null)).toBe("Separador");
    expect(unitNounForLine(null, "Tira de 3 fotos")).toBe("Tira");
    expect(unitNounForLine(null, null)).toBe("Unidad");
  });
});

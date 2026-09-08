/*
 * Tests unitarios del cálculo puro de tamaño de stage — studio-canvas-grid-size.ts
 * (Lucy 2026-09-07).
 *
 * Blindan el fix "la Polaroid Instagram se ve pequeña":
 *   1. IG 1 slot desktop → alto de slot ≥ piso TEXT_MIN_SLOT_SIZE y SIN el
 *      cap few=460: el marco manda (82vh acotado), no el conteo de slots.
 *   2. IG móvil → 1 columna (como el calendario), no 2.
 *   3. No-IG con pocos/muchos slots → comportamiento anterior intacto (cap por conteo).
 *   4. Calendario intacto: marco por contenido, piso 280, caps propios.
 *   5. Detección de texto editable y pisos por tipo de producto.
 */

import { describe, expect, it } from "vitest";
import {
  ACTION_BAR_RESERVE,
  CALENDAR_MIN_SLOT_SIZE,
  FRAME_HEIGHT_MAX,
  FRAME_HEIGHT_MIN,
  MIN_SLOT_SIZE,
  SLOT_HEIGHT_CAP_BY_COUNT,
  TEXT_MIN_SLOT_SIZE,
  computeFlatSlotDisplaySize,
  computeMaxFrameH,
  hasEditableTextLayers,
  resolveMaxCols,
  resolveMinSlotSize,
  slotHeightCapByCount,
} from "./studio-canvas-grid-size";

// Stage 450×600 (aspect 4:3) de la Polaroid Instagram.
const IG_ASPECT = 600 / 450;

describe("hasEditableTextLayers", () => {
  it("detecta la Polaroid Instagram (5 capas de texto editables)", () => {
    const layers = [
      { type: "background" },
      { type: "image-placeholder" },
      { type: "asset", src: "/templates/ig_post_3x4.svg" },
      { type: "text", editable: true, id: "user_name" },
      { type: "text", editable: true, id: "caption" },
    ];
    expect(hasEditableTextLayers(layers)).toBe(true);
  });

  it("false en plantillas sin texto editable (fotoimanes cuadrados, tiras)", () => {
    const layers = [{ type: "background" }, { type: "image-placeholder" }];
    expect(hasEditableTextLayers(layers)).toBe(false);
  });

  it("false si el texto existe pero no es editable", () => {
    const layers = [{ type: "text", editable: false }];
    expect(hasEditableTextLayers(layers)).toBe(false);
  });
});

describe("resolveMaxCols", () => {
  it("IG con texto editable → 1 columna en móvil (<640px)", () => {
    expect(
      resolveMaxCols({
        containerWidth: 375,
        isCalendar: false,
        hasEditableText: true,
        gridCols: 2,
      }),
    ).toBe(1);
  });

  it("IG con texto editable → sin cap en desktop (cols del gridLayout)", () => {
    expect(
      resolveMaxCols({
        containerWidth: 1024,
        isCalendar: false,
        hasEditableText: true,
        gridCols: 2,
      }),
    ).toBe(2);
  });

  it("no-IG sigue la regla progresiva: 2 cols en móvil", () => {
    expect(
      resolveMaxCols({
        containerWidth: 500,
        isCalendar: false,
        hasEditableText: false,
        gridCols: 3,
      }),
    ).toBe(2);
  });

  it("calendario intacto: 1/2/3 cols según viewport", () => {
    expect(
      resolveMaxCols({
        containerWidth: 375,
        isCalendar: true,
        hasEditableText: false,
        gridCols: 4,
      }),
    ).toBe(1);
    expect(
      resolveMaxCols({
        containerWidth: 800,
        isCalendar: true,
        hasEditableText: false,
        gridCols: 4,
      }),
    ).toBe(2);
    expect(
      resolveMaxCols({
        containerWidth: 1200,
        isCalendar: true,
        hasEditableText: false,
        gridCols: 4,
      }),
    ).toBe(3);
  });
});

describe("computeMaxFrameH — IG sin cap por conteo", () => {
  const base = { isCalendar: false, gap: 16, reserve: ACTION_BAR_RESERVE };

  it("IG 1 slot desktop (768px) → marco 82vh sin cap few=460", () => {
    const slotMaxHeight = slotHeightCapByCount(1, 1024, false); // few.desktop = 460
    const frame = computeMaxFrameH({
      ...base,
      viewportH: 768,
      hasEditableText: true,
      slotMaxHeight,
      rows: 1,
    });
    // Antes del fix: min(630, 460+44=504) = 504. Ahora manda solo el viewport.
    const expected = Math.min(FRAME_HEIGHT_MAX, Math.max(FRAME_HEIGHT_MIN, Math.round(768 * 0.82)));
    expect(expected).toBe(630);
    expect(frame).toBe(630);
  });

  it("no-IG 1 slot desktop → comportamiento anterior: cap few=460 intacto", () => {
    const slotMaxHeight = slotHeightCapByCount(1, 1024, false);
    const frame = computeMaxFrameH({
      ...base,
      viewportH: 768,
      hasEditableText: false,
      slotMaxHeight,
      rows: 1,
    });
    expect(frame).toBe(460 + ACTION_BAR_RESERVE); // 504
  });

  it("no-IG con 12 slots → cap many intacto (marco nunca supera el cap por slots)", () => {
    const slotMaxHeight = slotHeightCapByCount(12, 1024, false); // many.desktop = 520
    expect(slotMaxHeight).toBe(SLOT_HEIGHT_CAP_BY_COUNT.many.desktop);
    const frame = computeMaxFrameH({
      ...base,
      viewportH: 2000,
      hasEditableText: false,
      slotMaxHeight,
      rows: 3,
    });
    const cap = 520 * 3 + 16 * 2 + 3 * ACTION_BAR_RESERVE; // 1724
    expect(frame).toBe(Math.min(FRAME_HEIGHT_MAX, Math.round(2000 * 0.82), cap));
    expect(frame).toBeLessThanOrEqual(cap);
  });

  it("calendario intacto: el marco lo define el contenido, no el viewport", () => {
    const slotMaxHeight = slotHeightCapByCount(12, 1024, true); // 920
    const frame = computeMaxFrameH({
      ...base,
      viewportH: 768,
      isCalendar: true,
      hasEditableText: false,
      slotMaxHeight,
      rows: 4,
    });
    expect(frame).toBe(920 * 4 + 16 * 3 + 4 * ACTION_BAR_RESERVE);
  });

  it("viewportH null (primer render) → null, como antes", () => {
    expect(
      computeMaxFrameH({
        ...base,
        viewportH: null,
        hasEditableText: true,
        slotMaxHeight: 460,
        rows: 1,
      }),
    ).toBeNull();
  });
});

describe("computeFlatSlotDisplaySize — IG más grande", () => {
  const base = { gap: 16, reserve: ACTION_BAR_RESERVE, slotAspect: IG_ASPECT };

  it("IG 1 slot desktop → slot más alto que el cap viejo (345px) y ≥ piso 260", () => {
    const slotMaxHeight = slotHeightCapByCount(1, 1024, false);
    const maxFrameH = computeMaxFrameH({
      viewportH: 768,
      isCalendar: false,
      hasEditableText: true,
      slotMaxHeight,
      rows: 1,
      gap: 16,
      reserve: ACTION_BAR_RESERVE,
    })!;
    const size = computeFlatSlotDisplaySize({
      ...base,
      availableW: 1024,
      cols: 1,
      rows: 1,
      maxFrameH,
      minSize: resolveMinSlotSize({ isCalendar: false, hasEditableText: true }),
    });
    // Antes: min(1024, 460) = 460 ancho... no: maxFrameH 504 → usableH 460 →
    // byHeight = floor(460 / (4/3)) = 345. Ahora: usableH 586 → byHeight 439.
    expect(size).toBeGreaterThan(345);
    expect(size).toBeGreaterThanOrEqual(TEXT_MIN_SLOT_SIZE);
    expect(size).toBe(439);
  });

  it("IG móvil 375×667 → 1 columna y slot ancho (marco 82vh)", () => {
    const maxFrameH = computeMaxFrameH({
      viewportH: 667,
      isCalendar: false,
      hasEditableText: true,
      slotMaxHeight: SLOT_HEIGHT_CAP_BY_COUNT.few.mobile, // 300 (ignorado)
      rows: 1,
      gap: 16,
      reserve: ACTION_BAR_RESERVE,
    })!;
    expect(maxFrameH).toBe(Math.max(FRAME_HEIGHT_MIN, Math.round(667 * 0.82))); // 547
    const size = computeFlatSlotDisplaySize({
      ...base,
      availableW: 375,
      cols: 1,
      rows: 1,
      maxFrameH,
      minSize: TEXT_MIN_SLOT_SIZE,
    });
    // byWidth 375 vs byHeight floor(503 / (4/3)) = 377 → manda el ancho.
    expect(size).toBe(375);
    expect(size).toBeGreaterThanOrEqual(TEXT_MIN_SLOT_SIZE);
  });

  it("viewport angosto extremo: el piso TEXT_MIN_SLOT_SIZE garantiza ≥260", () => {
    const size = computeFlatSlotDisplaySize({
      ...base,
      availableW: 240, // más angosto que el piso
      cols: 1,
      rows: 1,
      maxFrameH: 500,
      minSize: resolveMinSlotSize({ isCalendar: false, hasEditableText: true }),
    });
    expect(size).toBe(TEXT_MIN_SLOT_SIZE);
  });

  it("no-IG: piso genérico 120 intacto", () => {
    expect(resolveMinSlotSize({ isCalendar: false, hasEditableText: false })).toBe(MIN_SLOT_SIZE);
    expect(resolveMinSlotSize({ isCalendar: true, hasEditableText: false })).toBe(
      CALENDAR_MIN_SLOT_SIZE,
    );
  });

  it("calendario: piso 280 intacto", () => {
    const size = computeFlatSlotDisplaySize({
      ...base,
      availableW: 200,
      cols: 1,
      rows: 4,
      maxFrameH: 4000,
      minSize: resolveMinSlotSize({ isCalendar: true, hasEditableText: false }),
    });
    expect(size).toBe(CALENDAR_MIN_SLOT_SIZE);
  });
});

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
  STAGE_ZOOM_MAX,
  STAGE_ZOOM_MIN,
  TEXT_MIN_SLOT_SIZE,
  computeFlatSlotDisplaySize,
  computeMaxFrameH,
  computeStageZoomCap,
  hasEditableTextLayers,
  resolveMaxCols,
  resolveMinSlotSize,
  slotHeightCapByCount,
  stepStageZoom,
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

describe("slotHeightCapByCount — ramas por franja de ancho no cubiertas", () => {
  it("few (1-2 slots): narrow <380 / tablet <1024 / desktop", () => {
    expect(slotHeightCapByCount(1, 360, false)).toBe(SLOT_HEIGHT_CAP_BY_COUNT.few.mobile);
    expect(slotHeightCapByCount(2, 800, false)).toBe(SLOT_HEIGHT_CAP_BY_COUNT.few.tablet);
    expect(slotHeightCapByCount(2, 1400, false)).toBe(SLOT_HEIGHT_CAP_BY_COUNT.few.desktop);
  });

  it("medium (3-6 slots): narrow / tablet / desktop", () => {
    expect(slotHeightCapByCount(4, 360, false)).toBe(SLOT_HEIGHT_CAP_BY_COUNT.medium.mobile);
    expect(slotHeightCapByCount(6, 800, false)).toBe(SLOT_HEIGHT_CAP_BY_COUNT.medium.tablet);
    expect(slotHeightCapByCount(3, 1400, false)).toBe(SLOT_HEIGHT_CAP_BY_COUNT.medium.desktop);
  });

  it("calendario (>6 slots): 1 col móvil <640 / 2 cols tablet / 3 cols desktop", () => {
    expect(slotHeightCapByCount(12, 500, true)).toBe(560); // < BP_MOBILE: tarjeta casi full-width
    expect(slotHeightCapByCount(12, 800, true)).toBe(640); // 2 cols
    expect(slotHeightCapByCount(12, 1400, true)).toBe(920); // 3 cols
  });

  it("calendario en narrow (<380) sigue la rama móvil (el check es < BP_MOBILE)", () => {
    expect(slotHeightCapByCount(12, 360, true)).toBe(560);
  });

  it("many no-calendario (>6 slots): narrow / tablet / desktop", () => {
    expect(slotHeightCapByCount(8, 360, false)).toBe(SLOT_HEIGHT_CAP_BY_COUNT.many.mobile);
    expect(slotHeightCapByCount(8, 800, false)).toBe(SLOT_HEIGHT_CAP_BY_COUNT.many.tablet);
    expect(slotHeightCapByCount(16, 1400, false)).toBe(SLOT_HEIGHT_CAP_BY_COUNT.many.desktop);
  });
});

describe("resolveMaxCols — frontera BP_NARROW y hasEditableText en tablet", () => {
  it("viewport <380px → 1 columna siempre (con o sin texto editable)", () => {
    expect(
      resolveMaxCols({
        containerWidth: 360,
        isCalendar: false,
        hasEditableText: true,
        gridCols: 3,
      }),
    ).toBe(1);
    expect(
      resolveMaxCols({
        containerWidth: 360,
        isCalendar: false,
        hasEditableText: false,
        gridCols: 3,
      }),
    ).toBe(1);
  });

  it("texto editable en tablet (640-1023) → 3 columnas como el resto", () => {
    expect(
      resolveMaxCols({
        containerWidth: 900,
        isCalendar: false,
        hasEditableText: true,
        gridCols: 4,
      }),
    ).toBe(3);
  });
});

describe("computeFlatSlotDisplaySize — maxFrameH null vs con alto límite", () => {
  it("maxFrameH null → manda solo el ancho (con piso)", () => {
    expect(
      computeFlatSlotDisplaySize({
        availableW: 700,
        cols: 2,
        slotAspect: IG_ASPECT,
        rows: 1,
        gap: 16,
        reserve: ACTION_BAR_RESERVE,
        maxFrameH: null,
        minSize: MIN_SLOT_SIZE,
      }),
    ).toBe(350); // floor(700/2), sobre el piso
  });

  it("el alto del marco puede ser el constraint (byHeight < byWidth)", () => {
    const size = computeFlatSlotDisplaySize({
      availableW: 2000,
      cols: 1,
      slotAspect: IG_ASPECT,
      rows: 1,
      gap: 16,
      reserve: ACTION_BAR_RESERVE,
      maxFrameH: 500,
      minSize: MIN_SLOT_SIZE,
    });
    // usableH = 500 − 44 = 456 → byHeight = floor(456 / (4/3)) = 342 < byWidth 2000
    expect(size).toBe(342);
  });
});

describe("zoom de lienzo (Ola 22 + zoom-out 2026-09-09) — tope por ancho y pasos", () => {
  it("grid que ya llena el ancho → tope de ACERCAR 1 (sin zoom in ofrecido)", () => {
    expect(computeStageZoomCap(1000, 1000)).toBe(1);
    expect(computeStageZoomCap(800, 1000)).toBe(1); // contenido más ancho que el contenedor
  });

  it("el tope nunca baja de 1 aunque el piso general permita alejar (el 100% siempre es alcanzable)", () => {
    // STAGE_ZOOM_MIN es 0.5, pero eso es piso de ALEJAR — no del tope de acercar.
    expect(STAGE_ZOOM_MIN).toBe(0.5);
    expect(computeStageZoomCap(400, 1000)).toBe(1);
  });

  it("grid con margen → tope = ancho disponible / ancho del contenido", () => {
    // Polaroid 1 slot de 520px centrada en 1280: tope = 1280/520 ≈ 2.46
    expect(computeStageZoomCap(1280, 520)).toBeCloseTo(2.46, 2);
    // Nunca supera STAGE_ZOOM_MAX.
    expect(computeStageZoomCap(4000, 500)).toBe(STAGE_ZOOM_MAX);
  });

  it("stepStageZoom avanza en pasos de 0.25 y respeta min/cap", () => {
    expect(stepStageZoom(1, 1, 2)).toBe(1.25);
    expect(stepStageZoom(1.25, -1, 2)).toBe(1);
    // No supera el cap.
    expect(stepStageZoom(2, 1, 2)).toBe(2);
    expect(stepStageZoom(2.4, 1, 2.46)).toBe(2.46);
  });

  it("zoom-out: permite bajar del 100% hasta STAGE_ZOOM_MIN (0.5), nunca menos", () => {
    expect(stepStageZoom(1, -1, 2)).toBe(0.75);
    expect(stepStageZoom(0.75, -1, 2)).toBe(0.5);
    expect(stepStageZoom(0.5, -1, 2)).toBe(STAGE_ZOOM_MIN); // piso firme
  });

  it("sin margen para acercar (cap 1): el paso + queda inerte en 100% (el control lo deshabilita)", () => {
    // Contrato del control inline de la fila de pills (StudioStageZoomControl):
    // con tope 1 el botón + se deshabilita (zoom >= cap); si igual se llamara,
    // el valor no se mueve del 100%.
    expect(stepStageZoom(1, 1, 1)).toBe(1);
    // …y alejar sigue disponible aunque acercar no lo esté.
    expect(stepStageZoom(1, -1, 1)).toBe(0.75);
  });

  it("con anchos inválidos → tope 1 (defensivo, nunca NaN)", () => {
    expect(computeStageZoomCap(0, 500)).toBe(1);
    expect(computeStageZoomCap(500, 0)).toBe(1);
  });
});

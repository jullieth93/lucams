/*
 * Tests unitarios del cálculo puro de tamaño de stage — studio-canvas-grid-size.ts
 * (Lucy 2026-09-07).
 *
 * Blindan el fix "la Polaroid Instagram se ve pequeña":
 *   1. IG 1 slot desktop → alto de slot ≥ piso TEXT_MIN_SLOT_SIZE y SIN el
 *      cap few: el marco manda (82vh acotado), no el conteo de slots.
 *   2. IG móvil → 1 columna (como TODO estudio foto desde Ola 34), no 2.
 *   3. No-IG con pocos slots y UNA fila → marco 82vh + cap por conteo.
 *   4. Calendario intacto: marco por contenido, piso 280, caps propios.
 *   5. Detección de texto editable y pisos por tipo de producto.
 *
 * Contrato owner 2026-09-18 (canvas fluido + cero overflow):
 *   6. Grids MULTI-FILA (rows ≥ 2): el marco lo define el CONTENIDO (cap por
 *      slots) — el alto del viewport ya no achica celdas ni fuerza pisos.
 *   7. fitColsToFloor: los pisos NUNCA desbordan el contenedor; si
 *      minSize*cols + gaps no cabe, se reducen columnas (piso firme: 1).
 *
 * Contrato owner 2026-09-18 (Ola 34 — spec de tamaños v2, "zoom del estudio"):
 *   8. Móvil (<640px): SIEMPRE 1 columna full-width en TODOS los estudios foto
 *      (rechazó la regla de 2 cols a 380-639); el marco en alto de UNA fila es
 *      FIJO (MOBILE_FRAME_HEIGHT) — el alto del viewport móvil cambia al
 *      scrollear (barra del navegador) y el tamaño NO debe moverse.
 *   9. Tablet/desktop: columnas por ANCHO OBJETIVO de slot (450px ≤6 slots /
 *      300px ≥7 slots, piso 2 cols) — 6-pack → 2 cols a ~950px de contenedor,
 *      3 cols solo cuando caben 3×~450; 20 slots → 4-5 cols en desktop ancho.
 *  10. Tiras: móvil 1 sección full-width por fila; la 3ª columna solo con
 *      contenedor ≥1400px (secciones ≥ ~440px, ~×1.5 vs la grilla vieja).
 */

import { describe, expect, it } from "vitest";
import {
  ACTION_BAR_RESERVE,
  CALENDAR_MIN_SLOT_SIZE,
  FRAME_HEIGHT_MAX,
  FRAME_HEIGHT_MIN,
  MIN_SLOT_SIZE,
  MOBILE_FRAME_HEIGHT,
  SLOT_HEIGHT_CAP_BY_COUNT,
  STAGE_ZOOM_MAX,
  STAGE_ZOOM_MIN,
  TARGET_SLOT_WIDTH,
  TARGET_SLOT_WIDTH_MANY,
  TEXT_MIN_SLOT_SIZE,
  computeFlatSlotDisplaySize,
  computeMaxFrameH,
  computeStageZoomCap,
  fitColsToFloor,
  hasEditableTextLayers,
  resolveMaxCols,
  resolveMinSlotSize,
  slotHeightCapByCount,
  stepStageZoom,
  unitSectionsPerRowFor,
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

describe("resolveMaxCols — Ola 34: 1 col móvil + ancho objetivo en desktop", () => {
  it("móvil (<640px) → SIEMPRE 1 columna, con o sin texto editable, pocos o muchos slots", () => {
    // Contrato del owner: la regla de 2 columnas a 380-639 queda ELIMINADA —
    // el pack va a UNA columna full-width en todos los estudios foto.
    for (const w of [320, 375, 500, 639]) {
      expect(
        resolveMaxCols({ containerWidth: w, isCalendar: false, gridCols: 3, slotCount: 6 }),
      ).toBe(1);
      expect(
        resolveMaxCols({ containerWidth: w, isCalendar: false, gridCols: 5, slotCount: 20 }),
      ).toBe(1);
    }
  });

  it("6 slots (pocos) → 2 columnas a ~950px de contenedor; 3 solo cuando caben 3×~450", () => {
    // Contenedor del estudio @1280 (viewport 1280 − sidebar 288 − padding 64 ≈ 928).
    expect(
      resolveMaxCols({ containerWidth: 928, isCalendar: false, gridCols: 3, slotCount: 6 }),
    ).toBe(2);
    // 3×450 = 1350 → justo a partir de ahí entran 3.
    expect(
      resolveMaxCols({ containerWidth: 1349, isCalendar: false, gridCols: 3, slotCount: 6 }),
    ).toBe(2);
    expect(
      resolveMaxCols({ containerWidth: 1568, isCalendar: false, gridCols: 3, slotCount: 6 }),
    ).toBe(3);
  });

  it("piso 2 columnas desde 640px: el objetivo daría 1 y el pack quedaría en fila única", () => {
    // Contenedor @1024 (672px): floor(672/450)=1, pero 2 columnas dan slots de
    // ~320px (tap sobrado) — mejor que una fila única altísima.
    expect(
      resolveMaxCols({ containerWidth: 672, isCalendar: false, gridCols: 3, slotCount: 6 }),
    ).toBe(2);
    expect(
      resolveMaxCols({ containerWidth: 736, isCalendar: false, gridCols: 3, slotCount: 6 }),
    ).toBe(2);
  });

  it("muchos slots (12/20) → objetivo menor: 12 → 3 cols, 20 → 4-5 cols en desktop ancho", () => {
    // 12 slots con preset 3 (gridCols): el preset capea aunque el ancho dé más.
    expect(
      resolveMaxCols({ containerWidth: 1568, isCalendar: false, gridCols: 3, slotCount: 12 }),
    ).toBe(3);
    // 20 slots: floor(928/300)=3 @1280; floor(1568/300)=5 @desktop ancho.
    expect(
      resolveMaxCols({ containerWidth: 928, isCalendar: false, gridCols: 5, slotCount: 20 }),
    ).toBe(3);
    expect(
      resolveMaxCols({ containerWidth: 1568, isCalendar: false, gridCols: 5, slotCount: 20 }),
    ).toBe(5);
  });

  it("gridCols siempre capea (plantilla de 1 columna como la tira no se rompe)", () => {
    expect(
      resolveMaxCols({ containerWidth: 1568, isCalendar: false, gridCols: 1, slotCount: 3 }),
    ).toBe(1);
  });

  it("calendario intacto: 1/2/3 cols según viewport (regla aprobada por el owner)", () => {
    expect(
      resolveMaxCols({ containerWidth: 375, isCalendar: true, gridCols: 4, slotCount: 12 }),
    ).toBe(1);
    expect(
      resolveMaxCols({ containerWidth: 800, isCalendar: true, gridCols: 4, slotCount: 12 }),
    ).toBe(2);
    expect(
      resolveMaxCols({ containerWidth: 1200, isCalendar: true, gridCols: 4, slotCount: 12 }),
    ).toBe(3);
  });
});

describe("computeMaxFrameH — IG sin cap por conteo + marco móvil fijo (Ola 34)", () => {
  const base = { isCalendar: false, gap: 16, reserve: ACTION_BAR_RESERVE, containerWidth: 1024 };

  it("IG 1 slot desktop (768px) → marco 82vh sin cap few", () => {
    const slotMaxHeight = slotHeightCapByCount(1, 1024, false); // few.desktop = 640 (Ola 34)
    const frame = computeMaxFrameH({
      ...base,
      viewportH: 768,
      hasEditableText: true,
      slotMaxHeight,
      rows: 1,
    });
    // Antes del fix IG: min(630, cap+44). Ahora manda solo el viewport.
    const expected = Math.min(FRAME_HEIGHT_MAX, Math.max(FRAME_HEIGHT_MIN, Math.round(768 * 0.82)));
    expect(expected).toBe(630);
    expect(frame).toBe(630);
  });

  it("no-IG 1 slot desktop → marco 82vh acotado por el cap few (Ola 34: 640)", () => {
    const slotMaxHeight = slotHeightCapByCount(1, 1024, false);
    const frame = computeMaxFrameH({
      ...base,
      viewportH: 768,
      hasEditableText: false,
      slotMaxHeight,
      rows: 1,
    });
    // min(frame 630, 640+44=684) = 630 — el marco de viewport gobierna.
    expect(frame).toBe(630);
  });

  it("UNA fila en MÓVIL → marco FIJO (MOBILE_FRAME_HEIGHT), NO 82vh (Ola 34)", () => {
    // Owner: en móvil el tamaño NO debe cambiar al hacer scroll — el alto del
    // viewport cambia cuando la barra del navegador se oculta/muestra. El
    // marco de 1 fila en móvil es una constante, independiente de viewportH.
    const slotMaxHeight = slotHeightCapByCount(1, 375, false); // few.mobile
    const baseMobile = { ...base, containerWidth: 375 };
    const frameBajo = computeMaxFrameH({
      ...baseMobile,
      viewportH: 600, // barra visible (viewport "bajo")
      hasEditableText: false,
      slotMaxHeight,
      rows: 1,
    });
    const frameAlto = computeMaxFrameH({
      ...baseMobile,
      viewportH: 750, // barra oculta tras scrollear (viewport "alto")
      hasEditableText: false,
      slotMaxHeight,
      rows: 1,
    });
    expect(frameBajo).toBe(frameAlto); // ← el contrato: el tamaño NO se mueve
    expect(frameBajo).toBe(Math.min(MOBILE_FRAME_HEIGHT, slotMaxHeight + ACTION_BAR_RESERVE));
  });

  it("texto editable UNA fila en móvil → marco fijo SIN cap por conteo", () => {
    const frame = computeMaxFrameH({
      ...base,
      containerWidth: 375,
      viewportH: 667,
      hasEditableText: true,
      slotMaxHeight: SLOT_HEIGHT_CAP_BY_COUNT.few.mobile, // ignorado (texto)
      rows: 1,
    });
    expect(frame).toBe(MOBILE_FRAME_HEIGHT);
  });

  it("multi-fila (rows ≥ 2): el marco lo define el CONTENIDO, no el viewport (owner 2026-09-18)", () => {
    // Antes: min(frame 82vh acotado, cap por slots) → en ventanas bajas el
    // marco achicaba las celdas hasta el piso y el grid quedaba diminuto y
    // centrado. Ahora manda el cap por slots; la página scrollea vertical.
    const slotMaxHeight = slotHeightCapByCount(12, 1024, false); // many.desktop = 640 (Ola 34)
    expect(slotMaxHeight).toBe(SLOT_HEIGHT_CAP_BY_COUNT.many.desktop);
    const frame = computeMaxFrameH({
      ...base,
      viewportH: 2000,
      hasEditableText: false,
      slotMaxHeight,
      rows: 3,
    });
    expect(frame).toBe(640 * 3 + 16 * 2 + 3 * ACTION_BAR_RESERVE); // 2084
  });

  it("multi-fila en ventana BAJA: ya NO se achica al marco 82vh (dimensionar por ancho)", () => {
    // Caso del owner: ventana de 700px de alto con grid de 2 filas — antes el
    // marco (max(440, 574)) forzaba el piso de 120px por slot; ahora el alto
    // útil lo fija el cap por slots y manda el ANCHO disponible.
    const slotMaxHeight = slotHeightCapByCount(6, 1024, false); // medium.desktop = 700 (Ola 34)
    const frame = computeMaxFrameH({
      ...base,
      viewportH: 700,
      hasEditableText: false,
      slotMaxHeight,
      rows: 2,
    });
    expect(frame).toBe(700 * 2 + 16 + 2 * ACTION_BAR_RESERVE); // 1504
  });

  it("texto editable multi-fila: también por contenido (el marco 82vh sin cap es solo para 1 fila)", () => {
    const slotMaxHeight = slotHeightCapByCount(6, 1024, false);
    const frame = computeMaxFrameH({
      ...base,
      viewportH: 768,
      hasEditableText: true,
      slotMaxHeight,
      rows: 2,
    });
    expect(frame).toBe(700 * 2 + 16 + 2 * ACTION_BAR_RESERVE);
  });

  it("UNA fila (rows ≤ 1): el marco 82vh sigue acotando (bug original de stages gigantes)", () => {
    const slotMaxHeight = slotHeightCapByCount(1, 1024, false); // few.desktop = 640 (Ola 34)
    const frame = computeMaxFrameH({
      ...base,
      viewportH: 2000, // 82vh → acotado a FRAME_HEIGHT_MAX
      hasEditableText: false,
      slotMaxHeight,
      rows: 1,
    });
    expect(frame).toBe(Math.min(FRAME_HEIGHT_MAX, 640 + ACTION_BAR_RESERVE)); // 684
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
      containerWidth: 1024,
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
    // Antes: maxFrameH 504 → usableH 460 → byHeight 345. Ahora: usableH 586 → 439.
    expect(size).toBeGreaterThan(345);
    expect(size).toBeGreaterThanOrEqual(TEXT_MIN_SLOT_SIZE);
    expect(size).toBe(439);
  });

  it("IG móvil 375×667 → 1 columna y slot ancho (marco FIJO móvil, Ola 34)", () => {
    const maxFrameH = computeMaxFrameH({
      viewportH: 667,
      containerWidth: 375,
      isCalendar: false,
      hasEditableText: true,
      slotMaxHeight: SLOT_HEIGHT_CAP_BY_COUNT.few.mobile, // ignorado (texto)
      rows: 1,
      gap: 16,
      reserve: ACTION_BAR_RESERVE,
    })!;
    // Ola 34: en móvil el marco es la constante MOBILE_FRAME_HEIGHT, no 82vh —
    // el tamaño no cambia cuando la barra del navegador se oculta al scrollear.
    expect(maxFrameH).toBe(MOBILE_FRAME_HEIGHT);
    const size = computeFlatSlotDisplaySize({
      ...base,
      availableW: 375,
      cols: 1,
      rows: 1,
      maxFrameH,
      minSize: TEXT_MIN_SLOT_SIZE,
    });
    // byWidth 375 vs byHeight floor(596 / (4/3)) = 447 → manda el ancho.
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

describe("slotHeightCapByCount — ramas por franja de ancho (Ola 34: móvil = <640)", () => {
  it("few (1-2 slots): mobile <640 / tablet <1024 / desktop", () => {
    expect(slotHeightCapByCount(1, 360, false)).toBe(SLOT_HEIGHT_CAP_BY_COUNT.few.mobile);
    expect(slotHeightCapByCount(1, 500, false)).toBe(SLOT_HEIGHT_CAP_BY_COUNT.few.mobile);
    expect(slotHeightCapByCount(2, 800, false)).toBe(SLOT_HEIGHT_CAP_BY_COUNT.few.tablet);
    expect(slotHeightCapByCount(2, 1400, false)).toBe(SLOT_HEIGHT_CAP_BY_COUNT.few.desktop);
  });

  it("medium (3-6 slots): mobile / tablet / desktop", () => {
    expect(slotHeightCapByCount(4, 360, false)).toBe(SLOT_HEIGHT_CAP_BY_COUNT.medium.mobile);
    expect(slotHeightCapByCount(6, 800, false)).toBe(SLOT_HEIGHT_CAP_BY_COUNT.medium.tablet);
    expect(slotHeightCapByCount(3, 1400, false)).toBe(SLOT_HEIGHT_CAP_BY_COUNT.medium.desktop);
  });

  it("calendario (>6 slots): 1 col móvil <640 / 2 cols tablet / 3 cols desktop", () => {
    expect(slotHeightCapByCount(12, 500, true)).toBe(560); // < BP_MOBILE: tarjeta casi full-width
    expect(slotHeightCapByCount(12, 800, true)).toBe(640); // 2 cols
    expect(slotHeightCapByCount(12, 1400, true)).toBe(920); // 3 cols
  });

  it("calendario en móvil angosto (<380) sigue la rama móvil (el check es < BP_MOBILE)", () => {
    expect(slotHeightCapByCount(12, 360, true)).toBe(560);
  });

  it("many no-calendario (>6 slots): mobile / tablet / desktop", () => {
    expect(slotHeightCapByCount(8, 360, false)).toBe(SLOT_HEIGHT_CAP_BY_COUNT.many.mobile);
    expect(slotHeightCapByCount(8, 800, false)).toBe(SLOT_HEIGHT_CAP_BY_COUNT.many.tablet);
    expect(slotHeightCapByCount(16, 1400, false)).toBe(SLOT_HEIGHT_CAP_BY_COUNT.many.desktop);
  });

  it("caps Ola 34 subidos: no anulan el ancho objetivo (~450px × aspect 1.28 ≈ 576 de alto)", () => {
    // Contrato del spec v2: el cap medium desktop no puede quedar por debajo
    // del alto que pide un slot de ~450-470px de ancho en aspect polaroid —
    // antes (560) el cap mandaba y el slot quedaba en ~437.
    expect(SLOT_HEIGHT_CAP_BY_COUNT.medium.desktop).toBeGreaterThanOrEqual(576);
    expect(SLOT_HEIGHT_CAP_BY_COUNT.medium.mobile).toBeGreaterThanOrEqual(450);
  });
});

describe("resolveMaxCols — frontera móvil/tablet y piso 2 columnas (Ola 34)", () => {
  it("justo bajo BP_MOBILE → 1 columna; justo encima → piso 2", () => {
    expect(
      resolveMaxCols({ containerWidth: 639, isCalendar: false, gridCols: 3, slotCount: 6 }),
    ).toBe(1);
    expect(
      resolveMaxCols({ containerWidth: 640, isCalendar: false, gridCols: 3, slotCount: 6 }),
    ).toBe(2);
  });

  it("el ancho objetivo es paramétrico: 450px ≤6 slots / 300px ≥7 slots", () => {
    expect(TARGET_SLOT_WIDTH).toBe(450);
    expect(TARGET_SLOT_WIDTH_MANY).toBe(300);
    // 7 slots ya entra al objetivo "muchos" (300px): floor(928/300) = 3.
    expect(
      resolveMaxCols({ containerWidth: 928, isCalendar: false, gridCols: 4, slotCount: 7 }),
    ).toBe(3);
    // 6 slots sigue en 450px: floor(928/450) = 2.
    expect(
      resolveMaxCols({ containerWidth: 928, isCalendar: false, gridCols: 4, slotCount: 6 }),
    ).toBe(2);
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

describe("zoom de lienzo (Ola 22 + zoom-out 2026-09-09 + tope fijo Ola 33)", () => {
  it("el tope de ACERCAR es SIEMPRE STAGE_ZOOM_MAX (Ola 33, owner 2026-09-18)", () => {
    // Con el dimensionado por ancho de Ola 31 el grid llena el contenedor a
    // zoom 1 → el tope viejo (containerWidth/contentWidth) quedaba en 1 y el
    // "+" no hacía nada. Ahora el wrapper interno scrollea horizontal cuando el
    // contenido zoomado excede el ancho (nunca la página), así que acercar es
    // seguro hasta el máximo en cualquier estudio — incluso con grids que ya
    // llenan el ancho (calendario 12 slots, packs multi-fila).
    expect(computeStageZoomCap()).toBe(STAGE_ZOOM_MAX);
    expect(STAGE_ZOOM_MAX).toBe(2.5);
  });

  it("el piso de ALEJAR sigue siendo STAGE_ZOOM_MIN (el 100% siempre es alcanzable)", () => {
    expect(STAGE_ZOOM_MIN).toBe(0.5);
    expect(STAGE_ZOOM_MIN).toBeLessThan(1);
    expect(computeStageZoomCap()).toBeGreaterThan(1);
  });

  it("stepStageZoom avanza en pasos de 0.25 y respeta min/cap", () => {
    expect(stepStageZoom(1, 1, STAGE_ZOOM_MAX)).toBe(1.25);
    expect(stepStageZoom(1.25, -1, STAGE_ZOOM_MAX)).toBe(1);
    // No supera el cap.
    expect(stepStageZoom(STAGE_ZOOM_MAX, 1, STAGE_ZOOM_MAX)).toBe(STAGE_ZOOM_MAX);
    expect(stepStageZoom(2.4, 1, STAGE_ZOOM_MAX)).toBe(STAGE_ZOOM_MAX);
  });

  it("zoom-out: permite bajar del 100% hasta STAGE_ZOOM_MIN (0.5), nunca menos", () => {
    expect(stepStageZoom(1, -1, STAGE_ZOOM_MAX)).toBe(0.75);
    expect(stepStageZoom(0.75, -1, STAGE_ZOOM_MAX)).toBe(0.5);
    expect(stepStageZoom(0.5, -1, STAGE_ZOOM_MAX)).toBe(STAGE_ZOOM_MIN); // piso firme
  });

  it("acercar desde 100% siempre sube (el control habilita '+' hasta el 250%)", () => {
    // Contrato del control inline de la fila de pills (StudioStageZoomControl):
    // con tope fijo STAGE_ZOOM_MAX el botón + queda habilitado en 100% en TODOS
    // los estudios y el paso nunca queda inerte hasta el máximo; alejar sigue
    // disponible en cualquier punto del rango.
    expect(stepStageZoom(1, 1, computeStageZoomCap())).toBe(1.25);
    expect(stepStageZoom(1, -1, computeStageZoomCap())).toBe(0.75);
  });
});

// Ola 29 (owner 2026-09-11, 1.3.A mejora visual) + Ola 34 (owner 2026-09-18):
// secciones de TIRA en filas — móvil 1 por fila full-width (rechazadas las 2
// por fila a 380-899), desktop 2 por fila y la 3ª solo con contenedor ≥1400px
// (cada sección ≥ ~440px → tiras ~×1.5 más anchas que la grilla vieja).
describe("unitSectionsPerRowFor — secciones de tira en grilla horizontal", () => {
  it("desktop ancho (≥1400px de contenedor): máximo 3 por fila", () => {
    expect(
      unitSectionsPerRowFor({ isStripSections: true, unitCount: 4, containerWidth: 1568 }),
    ).toBe(3);
    expect(
      unitSectionsPerRowFor({ isStripSections: true, unitCount: 2, containerWidth: 1568 }),
    ).toBe(2);
    expect(
      unitSectionsPerRowFor({ isStripSections: true, unitCount: 12, containerWidth: 1568 }),
    ).toBe(3);
  });

  it("desktop <1400px: 2 por fila (secciones ≥ ~440px, ~×1.5 vs Ola 29)", () => {
    // @1280 el contenedor del estudio es ~928px: antes 3 por fila (~280px cada
    // una), ahora 2 (~444px) — el "×1.5" del owner.
    expect(
      unitSectionsPerRowFor({ isStripSections: true, unitCount: 4, containerWidth: 928 }),
    ).toBe(2);
    expect(
      unitSectionsPerRowFor({ isStripSections: true, unitCount: 3, containerWidth: 1399 }),
    ).toBe(2);
  });

  it("móvil (<640px): SIEMPRE 1 por fila — la tira va full-width (owner Ola 34)", () => {
    expect(
      unitSectionsPerRowFor({ isStripSections: true, unitCount: 4, containerWidth: 390 }),
    ).toBe(1);
    expect(
      unitSectionsPerRowFor({ isStripSections: true, unitCount: 2, containerWidth: 639 }),
    ).toBe(1);
    // En tablet (≥640) vuelven las 2 por fila.
    expect(
      unitSectionsPerRowFor({ isStripSections: true, unitCount: 3, containerWidth: 800 }),
    ).toBe(2);
  });

  it("1 unidad o no-tiras → 1 (apilado de siempre)", () => {
    expect(
      unitSectionsPerRowFor({ isStripSections: true, unitCount: 1, containerWidth: 1280 }),
    ).toBe(1);
    expect(
      unitSectionsPerRowFor({ isStripSections: false, unitCount: 4, containerWidth: 1280 }),
    ).toBe(1);
  });
});

// Owner 2026-09-18 — guarda de PISO vs ANCHO: los pisos de displaySize nunca
// pueden desbordar el contenedor; si `minSize*cols + gaps` no cabe, se reducen
// columnas ANTES de aceptar un grid más ancho que el contenedor. Es la causa
// confirmada del overflow horizontal real @768 (piso texto 260 × 3 cols) y
// @1024 (sidebar lg 288px + piso calendario 280 × 3 cols > ancho útil).
describe("fitColsToFloor — los pisos nunca desbordan el contenedor", () => {
  it("piso de texto editable 260 × 3 cols no cabe en tablet (~720px útiles) → baja a 2", () => {
    // Caso real set-fotoimanes-polaroid @768: 260*3 + 16*2 = 812 > 720.
    expect(fitColsToFloor({ cols: 3, minSize: TEXT_MIN_SLOT_SIZE, gap: 16, availableW: 720 })).toBe(
      2,
    );
    // A 2 sí cabe: 260*2 + 16 = 536 ≤ 720 → se queda en 2 (no cae a 1).
    expect(fitColsToFloor({ cols: 2, minSize: TEXT_MIN_SLOT_SIZE, gap: 16, availableW: 720 })).toBe(
      2,
    );
  });

  it("piso de calendario 280 × 3 no cabe con el sidebar lg (~656px útiles) → baja a 2", () => {
    // Caso real calendario @1024: 280*3 + 12*2 = 864 > 656; a 2: 572 ≤ 656.
    expect(
      fitColsToFloor({ cols: 3, minSize: CALENDAR_MIN_SLOT_SIZE, gap: 12, availableW: 656 }),
    ).toBe(2);
  });

  it("si el piso cabe, no toca las columnas (ni en el ajuste exacto)", () => {
    expect(fitColsToFloor({ cols: 3, minSize: MIN_SLOT_SIZE, gap: 16, availableW: 656 })).toBe(3);
    // Justo justo: 120*3 + 16*2 = 392 → cabe por igualdad.
    expect(fitColsToFloor({ cols: 3, minSize: MIN_SLOT_SIZE, gap: 16, availableW: 392 })).toBe(3);
  });

  it("piso firme: nunca baja de 1 columna, aunque ni una celda al piso quepa", () => {
    expect(fitColsToFloor({ cols: 2, minSize: TEXT_MIN_SLOT_SIZE, gap: 16, availableW: 200 })).toBe(
      1,
    );
  });

  it("entradas defensivas: cols 0 o ancho ≤ 0 → 1 (nunca NaN ni 0 columnas)", () => {
    expect(fitColsToFloor({ cols: 0, minSize: MIN_SLOT_SIZE, gap: 16, availableW: 500 })).toBe(1);
    expect(fitColsToFloor({ cols: 3, minSize: MIN_SLOT_SIZE, gap: 16, availableW: 0 })).toBe(1);
  });
});

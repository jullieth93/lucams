// @vitest-environment jsdom

/*
 * Test de regresión — StudioCanvasGrid lazy-mount (owner 2026-09-14, tiras).
 *
 * Bug: con lazy-mount activo (slotCount > LAZY_MOUNT_THRESHOLD), al AGREGAR
 * unidades/fotos las celdas nuevas no existían cuando se armó el
 * IntersectionObserver y ninguna dep del effect cambiaba → nunca se observaban
 * y quedaban atrapadas como LazySlotPlaceholder ("Toca para elegir") para
 * siempre: "al agregar más Unidades se pierde el lienzo/esquema".
 *
 * Contrato blindado: al crecer slotCount, el observer se RE-ARMA y registra
 * las celdas nuevas; al intersectar, esas celdas montan su StudioSlot real.
 *
 * react-konva no corre en jsdom → StudioSlot y la modal de edición se mockean.
 * Los textos CMS caen al DEFAULT_STUDIO_TEXTS sin provider (patrón del repo).
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { StudioCanvasGrid } from "./studio-canvas-grid";
import { createStudioStore } from "./lib/store";
import type { CanvasDataV2 } from "./types";

// ── Mocks de frontera ────────────────────────────────────────────────

vi.mock("./studio-slot", () => ({
  StudioSlot: ({
    slotState,
    displaySize,
  }: {
    slotState: { slotIndex: number };
    displaySize?: number;
  }) => <div data-testid={`studio-slot-${slotState.slotIndex}`} data-display-size={displaySize} />,
}));
vi.mock("./studio-slot-edit-modal", () => ({ StudioSlotEditModal: () => null }));
vi.mock("./use-prefers-reduced-motion", () => ({ usePrefersReducedMotion: () => true }));

/** Observer falso: registra los slotIndex observados y expone el callback. */
const io = vi.hoisted(() => ({
  observed: [] as number[],
  elements: new Map<number, Element>(),
  callback: null as IntersectionObserverCallback | null,
}));

class FakeIntersectionObserver {
  constructor(cb: IntersectionObserverCallback) {
    io.callback = cb;
  }
  observe(el: Element) {
    const idx = Number((el as HTMLElement).dataset.slotObserve);
    io.observed.push(idx);
    io.elements.set(idx, el);
  }
  unobserve() {}
  disconnect() {}
}

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function fireIntersection(...indexes: number[]) {
  const entries = indexes.map(
    (idx) => ({ isIntersecting: true, target: io.elements.get(idx) }) as IntersectionObserverEntry,
  );
  act(() => {
    io.callback?.(entries, {} as IntersectionObserver);
  });
}

// ── Harness ──────────────────────────────────────────────────────────

/** Tira de 3 fotos × `units` unidades (celda 390×400, 1 columna, gap 0). */
function makeStripCanvas(units: number): CanvasDataV2 {
  const unitSlots = 3;
  const slotCount = unitSlots * units;
  return {
    version: 2,
    unitTemplate: {
      version: 1,
      stage: { width: 390, height: 400 },
      layers: [{ id: "bg", type: "background", color: "#FFFFFF" }],
      gridCols: 1,
      gridGap: 0,
    } as CanvasDataV2["unitTemplate"],
    slotCount,
    photoSlots: 3,
    unitCount: units,
    unitSlots,
    sizeCm: "6.5×20",
    slots: Array.from({ length: slotCount }, (_, i) => ({
      slotIndex: i,
      assetId: null,
      assetUrl: null,
    })),
    gridLayout: { cols: 1, rows: unitSlots, gap: 0 },
  };
}

function setup(units: number) {
  const store = createStudioStore();
  store.getState().init({
    designId: "d1",
    productSlug: "tiras-magneticas-fotos",
    canvasData: makeStripCanvas(units),
    templates: [],
  });
  render(
    <StudioCanvasGrid
      store={store}
      onSlotClick={() => {}}
      stageZoomRaw={1}
      onStageZoomState={() => {}}
      registerSlotStages={() => {}}
    />,
  );
  return store;
}

beforeEach(() => {
  io.observed = [];
  io.elements = new Map();
  io.callback = null;
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StudioCanvasGrid — lazy-mount multi-unidad", () => {
  it("al agregar una unidad, las celdas nuevas se observan y montan al intersectar", async () => {
    const store = setup(3); // 9 slots > umbral 6 → lazy activo

    // Boot: el observer registra las 9 celdas iniciales.
    await waitFor(() => expect(io.observed).toHaveLength(9));
    expect([...io.observed].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);

    // Intersectar la primera tanda: monta esos slots (re-arma el observer,
    // como pasa en vivo cada vez que se monta una celda).
    fireIntersection(0, 1, 2);
    await waitFor(() => expect(io.observed.length).toBeGreaterThanOrEqual(9));

    // Agregar UNA unidad (Tira 4 de 4): slots 9, 10, 11 nuevos. Antes del fix
    // el observer no se re-armaba (deps sin slotCount) y jamás se observaban.
    act(() => {
      store.getState().setUnitCount(4, { facesPerUnit: 1, max: 16 });
    });
    await waitFor(() => {
      expect(io.observed).toContain(9);
      expect(io.observed).toContain(10);
      expect(io.observed).toContain(11);
    });

    // Al intersectar, las celdas nuevas montan su StudioSlot real (adiós
    // placeholder "Toca para elegir" permanente).
    fireIntersection(9, 10, 11);
    const { container } = render(<></>); // noop para mantener act limpio
    container.remove();
    await waitFor(() => {
      expect(document.querySelector('[data-testid="studio-slot-9"]')).not.toBeNull();
      expect(document.querySelector('[data-testid="studio-slot-10"]')).not.toBeNull();
      expect(document.querySelector('[data-testid="studio-slot-11"]')).not.toBeNull();
    });
  });
});

// ── Delimitación visual de unidades (owner 2026-09-15) ───────────────
//
// La dueña pidió la misma delimitación que tienen los separadores ("Separador
// 1", "Separador 2"…) en TODOS los productos multi-unidad: fotoimanes por
// packs de 6 → tarjetas "Pack 1" (slots 1-6) / "Pack 2" (slots 7-12) con el
// patrón visual de las tarjetas de separadores; calendario multi-set →
// secciones "Set 1", "Set 2" (sustantivo por familia vía unitNoun).

/** Pack de fotoimanes polaroid: N unidades sueltas, SIN modelo multi-unidad
 *  declarado (unitSlots = 1 — la variante YA es el pack). */
function makePolaroidCanvas(units: number): CanvasDataV2 {
  return {
    version: 2,
    unitTemplate: {
      version: 1,
      stage: { width: 720, height: 920 },
      layers: [{ id: "bg", type: "background", color: "#FFFFFF" }],
    } as CanvasDataV2["unitTemplate"],
    slotCount: units,
    photoSlots: units,
    sizeCm: "6×8",
    slots: Array.from({ length: units }, (_, i) => ({
      slotIndex: i,
      assetId: null,
      assetUrl: null,
    })),
    gridLayout: { cols: 3, rows: Math.ceil(units / 3), gap: 16 },
  };
}

/** Calendario multi-set: 12 tarjetas por set (modelo multi-unidad declarado). */
function makeCalendarCanvas(sets: number): CanvasDataV2 {
  const unitSlots = 12;
  const slotCount = unitSlots * sets;
  return {
    version: 2,
    unitTemplate: {
      version: 1,
      stage: { width: 1080, height: 1350 },
      layers: [{ id: "bg", type: "background", color: "#FFFFFF" }],
    } as CanvasDataV2["unitTemplate"],
    slotCount,
    unitCount: sets,
    unitSlots,
    slots: Array.from({ length: slotCount }, (_, i) => ({
      slotIndex: i,
      assetId: null,
      assetUrl: null,
    })),
    gridLayout: { cols: 3, rows: 4, gap: 12 },
  };
}

function slotObserveIndexesOf(el: Element | null): number[] {
  if (!el) return [];
  return Array.from(el.querySelectorAll<HTMLElement>("[data-slot-observe]")).map((n) =>
    Number(n.dataset.slotObserve),
  );
}

describe("StudioCanvasGrid — delimitación de PACKS (fotoimanes 6+6)", () => {
  it("12 unidades con unitGroupSlots=6 → dos tarjetas «Pack 1» (slots 0-5) y «Pack 2» (slots 6-11)", () => {
    const store = createStudioStore();
    store.getState().init({
      designId: "d1",
      productSlug: "set-fotoimanes-polaroid",
      canvasData: makePolaroidCanvas(12),
      templates: [],
    });
    render(
      <StudioCanvasGrid
        store={store}
        unitGroupSlots={6}
        unitNoun="Pack"
        onSlotClick={() => {}}
        stageZoomRaw={1}
        onStageZoomState={() => {}}
        registerSlotStages={() => {}}
      />,
    );

    // Rótulos de las tarjetas (textos CMS por defecto: "Pack {n}").
    expect(screen.getByText("Pack 1")).toBeInTheDocument();
    expect(screen.getByText("Pack 2")).toBeInTheDocument();

    // Cada tarjeta agrupa EXACTAMENTE sus 6 slots, en orden.
    const card1 = document.getElementById("studio-unit-0");
    const card2 = document.getElementById("studio-unit-1");
    expect(card1?.getAttribute("aria-label")).toBe("Pack 1 de 2");
    expect(card2?.getAttribute("aria-label")).toBe("Pack 2 de 2");
    expect(slotObserveIndexesOf(card1)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(slotObserveIndexesOf(card2)).toEqual([6, 7, 8, 9, 10, 11]);

    // Progreso por pack (0/6 en cada tarjeta).
    expect(screen.getAllByText("0/6")).toHaveLength(2);
  });

  it("un solo pack (6 unidades) → tarjeta-unidad SÍ, pero sin rótulo «Pack 1» ni pager (owner 2026-09-18)", () => {
    // Contrato nuevo (antes: 1 pack caía a grilla plana SIN tarjeta): todo pack
    // va envuelto en la tarjeta-unidad estándar (fondo que recubre + progreso);
    // solo se omiten el rótulo y el pager, que son ruido para una sola tarjeta.
    const store = createStudioStore();
    store.getState().init({
      designId: "d1",
      productSlug: "set-fotoimanes-polaroid",
      canvasData: makePolaroidCanvas(6),
      templates: [],
    });
    render(
      <StudioCanvasGrid
        store={store}
        unitGroupSlots={6}
        unitNoun="Pack"
        onSlotClick={() => {}}
        stageZoomRaw={1}
        onStageZoomState={() => {}}
        registerSlotStages={() => {}}
      />,
    );

    // La tarjeta queda, con sus 6 slots en orden y su progreso.
    const card = document.getElementById("studio-unit-0");
    expect(card).not.toBeNull();
    expect(card?.getAttribute("aria-label")).toBe("Pack 1 de 1");
    expect(slotObserveIndexesOf(card)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(screen.getByText("0/6")).toBeInTheDocument();

    // Sin rótulo "Pack 1" ni pager de unidades (una pastilla sola no salta a nada).
    expect(screen.queryByText("Pack 1")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("diseño legacy no divisible por el pack (9 unidades) → grilla plana (en su tarjeta de modo plano)", () => {
    const store = createStudioStore();
    store.getState().init({
      designId: "d1",
      productSlug: "set-fotoimanes-polaroid",
      canvasData: makePolaroidCanvas(9),
      templates: [],
    });
    render(
      <StudioCanvasGrid
        store={store}
        unitGroupSlots={6}
        unitNoun="Pack"
        onSlotClick={() => {}}
        stageZoomRaw={1}
        onStageZoomState={() => {}}
        registerSlotStages={() => {}}
      />,
    );

    expect(screen.queryByText("Pack 1")).not.toBeInTheDocument();
    expect(document.getElementById("studio-unit-0")).toBeNull();
  });
});

describe("StudioCanvasGrid — modo plano con tarjeta-unidad (owner 2026-09-18)", () => {
  it("el grid plano (sin packs, sin agrupado, sin secciones) va envuelto en la tarjeta estándar", () => {
    // Ej. cuadro-3-fotos / planner: slots sueltos sin unitGroupSlots. Antes el
    // grid quedaba "desnudo" (sin el fondo que recubre de separadores/packs).
    const store = createStudioStore();
    store.getState().init({
      designId: "d1",
      productSlug: "cuadro-3-fotos",
      canvasData: makePolaroidCanvas(3),
      templates: [],
    });
    const { container } = render(
      <StudioCanvasGrid
        store={store}
        onSlotClick={() => {}}
        stageZoomRaw={1}
        onStageZoomState={() => {}}
        registerSlotStages={() => {}}
      />,
    );

    // La tarjeta de modo plano: mismo visual que separadores/packs
    // (borde brand + bg-white/70 + rounded-2xl), con TODOS los slots dentro.
    const card = Array.from(container.querySelectorAll("div.rounded-2xl")).find((el) =>
      el.className.includes("bg-white/70"),
    );
    expect(card).toBeDefined();
    expect(slotObserveIndexesOf(card ?? null)).toEqual([0, 1, 2]);

    // Sin rótulos ni pager de unidad: el plano no declara unidades.
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(document.getElementById("studio-unit-0")).toBeNull();
  });
});

// ── Overrides del lienzo por producto (owner 2026-09-24, v2 STG) ──────
//
// El admin fija por producto (personalizationSchema): gridColsOverride FUERZA
// las columnas en desktop (sin capear contra el ancho objetivo ni el template)
// y canvasBaseScale es el TAMAÑO BASE del lienzo (el "100%" que ve el cliente
// — su control de zoom es relativo a esa base).
describe("StudioCanvasGrid — overrides del lienzo por producto (owner 2026-09-24, v2 STG)", () => {
  // En jsdom clientWidth es 0 → el grid mediría 0px y resolvería 1 columna
  // (regla móvil). Stub configurable por test (el efecto lo lee al montar).
  let stubWidth = 1600;
  let clientWidthDesc: PropertyDescriptor | undefined;
  beforeEach(() => {
    stubWidth = 1600;
    clientWidthDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => stubWidth,
    });
  });
  afterEach(() => {
    if (clientWidthDesc) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidthDesc);
    }
  });

  function gridTemplateColsOf(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll<HTMLElement>("div"))
      .map((el) => el.style.gridTemplateColumns)
      .filter((v) => v.startsWith("repeat("));
  }

  function renderFlat(
    slots: number,
    overrides: { gridColsOverride?: number; canvasBaseScale?: number } = {},
  ) {
    const store = createStudioStore();
    store.getState().init({
      designId: "d1",
      productSlug: "cuadro-3-fotos",
      canvasData: makePolaroidCanvas(slots), // gridLayout del template: 3 cols
      templates: [],
    });
    const onStageZoomState = vi.fn();
    const { container } = render(
      <StudioCanvasGrid
        store={store}
        gridColsOverride={overrides.gridColsOverride}
        canvasBaseScale={overrides.canvasBaseScale}
        onSlotClick={() => {}}
        stageZoomRaw={1}
        onStageZoomState={onStageZoomState}
        registerSlotStages={() => {}}
      />,
    );
    return { container, onStageZoomState };
  }

  it("override=2 reemplaza las 3 columnas del template en la grilla plana", () => {
    const { container } = renderFlat(3, { gridColsOverride: 2 });
    expect(gridTemplateColsOf(container)).toContain("repeat(2, 1fr)");
    expect(gridTemplateColsOf(container)).not.toContain("repeat(3, 1fr)");
  });

  it("sin override la grilla del template queda intacta (3 columnas)", () => {
    const { container } = renderFlat(3);
    expect(gridTemplateColsOf(container)).toContain("repeat(3, 1fr)");
  });

  it("el override FUERZA 3 columnas aunque el ancho objetivo dé 2 (v2 STG)", () => {
    // 950px de contenedor → resolveMaxCols da 2 (floor(950/450)); sin override
    // el grid mostraría 2. El admin pidió 3 → se ven 3.
    stubWidth = 950;
    const { container } = renderFlat(6, { gridColsOverride: 3 });
    expect(gridTemplateColsOf(container)).toContain("repeat(3, 1fr)");
    expect(gridTemplateColsOf(container)).not.toContain("repeat(2, 1fr)");
  });

  it("guarda: nunca más columnas que slots disponibles (override 6 con 3 slots → 3)", () => {
    const { container } = renderFlat(3, { gridColsOverride: 6 });
    expect(gridTemplateColsOf(container)).toContain("repeat(3, 1fr)");
    expect(gridTemplateColsOf(container)).not.toContain("repeat(6, 1fr)");
  });

  it("guarda: en móvil (<640px) el override NO aplica — siempre 1 columna", () => {
    stubWidth = 390;
    const { container } = renderFlat(6, { gridColsOverride: 3 });
    expect(gridTemplateColsOf(container)).toContain("repeat(1, 1fr)");
    expect(gridTemplateColsOf(container)).not.toContain("repeat(3, 1fr)");
  });

  it("modo agrupado (separadores): el override cuenta TARJETAS DE UNIDAD por fila", () => {
    // 3 separadores de 2 caras (6 slots): default desktop = 2 tarjetas por
    // fila; override=3 → las 3 tarjetas-unidad en una fila.
    const store = createStudioStore();
    store.getState().init({
      designId: "d1",
      productSlug: "separadores-magneticos",
      canvasData: {
        ...makePolaroidCanvas(6),
        unitSlots: 2,
        unitCount: 3,
        gridLayout: { cols: 1, rows: 2, gap: 12 },
      },
      templates: [],
    });
    const { container } = render(
      <StudioCanvasGrid
        store={store}
        facesPerUnit={2}
        gridColsOverride={3}
        onSlotClick={() => {}}
        stageZoomRaw={1}
        onStageZoomState={() => {}}
        registerSlotStages={() => {}}
      />,
    );
    expect(gridTemplateColsOf(container)).toContain("repeat(3, 1fr)");
  });

  it("tamaño base 0.5 renderiza los slots a la MITAD y el control del cliente sigue en su 100%", async () => {
    const full = renderFlat(3);
    const half = renderFlat(3, { canvasBaseScale: 0.5 });
    const sizeOf = (c: HTMLElement) =>
      Number(c.querySelector<HTMLElement>('[data-testid="studio-slot-0"]')?.dataset.displaySize);
    const fullSize = sizeOf(full.container);
    const halfSize = sizeOf(half.container);
    expect(fullSize).toBeGreaterThan(0);
    // baseScale 0.5 → la mitad (±1px por el redondeo del sizing).
    expect(Math.abs(halfSize - fullSize / 2)).toBeLessThanOrEqual(1);

    // El zoom del CLIENTE es relativo a la base: con stageZoomRaw=1 el control
    // reporta 1 (= su 100%) aunque el lienzo se renderice más chico.
    await waitFor(() =>
      expect(half.onStageZoomState).toHaveBeenCalledWith(
        expect.objectContaining({ zoom: 1, cap: expect.any(Number) }),
      ),
    );
  });

  it("zoom: el grid reporta el zoom pedido por el padre (relativo al tamaño base)", async () => {
    const { onStageZoomState } = (() => {
      const store = createStudioStore();
      store.getState().init({
        designId: "d1",
        productSlug: "cuadro-3-fotos",
        canvasData: makePolaroidCanvas(3),
        templates: [],
      });
      const onStageZoomState = vi.fn();
      render(
        <StudioCanvasGrid
          store={store}
          canvasBaseScale={0.5}
          onSlotClick={() => {}}
          // Zoom del CLIENTE (150% sobre la base): lo pide el control de pills.
          stageZoomRaw={1.5}
          onStageZoomState={onStageZoomState}
          registerSlotStages={() => {}}
        />,
      );
      return { onStageZoomState };
    })();
    await waitFor(() =>
      expect(onStageZoomState).toHaveBeenCalledWith(
        expect.objectContaining({ zoom: 1.5, cap: expect.any(Number) }),
      ),
    );
  });
});

describe("StudioCanvasGrid — calendario multi-set (secciones «Set N»)", () => {
  it("2 sets de 12 → dos secciones con sustantivo «Set» y sus 12 slots c/u", () => {
    const store = createStudioStore();
    store.getState().init({
      designId: "d1",
      productSlug: "calendario-set-12",
      canvasData: makeCalendarCanvas(2),
      templates: [],
    });
    render(
      <StudioCanvasGrid
        store={store}
        unitNoun="Set"
        calendarPreview={{ year: 2027, startMonth: 0 }}
        onSlotClick={() => {}}
        stageZoomRaw={1}
        onStageZoomState={() => {}}
        registerSlotStages={() => {}}
      />,
    );

    // Secciones con el sustantivo de familia ("{nombre} {n} de {total}").
    const set1 = document.getElementById("studio-unit-0");
    const set2 = document.getElementById("studio-unit-1");
    expect(set1?.getAttribute("aria-label")).toBe("Set 1 de 2");
    expect(set2?.getAttribute("aria-label")).toBe("Set 2 de 2");
    expect(slotObserveIndexesOf(set1)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(slotObserveIndexesOf(set2)).toEqual(Array.from({ length: 12 }, (_, i) => i + 12));

    // Header de sección + pastilla del pager usan el mismo rótulo.
    expect(screen.getAllByText("Set 1 de 2").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Set 2 de 2").length).toBeGreaterThanOrEqual(2);
  });
});

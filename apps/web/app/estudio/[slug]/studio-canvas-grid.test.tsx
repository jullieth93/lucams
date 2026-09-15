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
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { StudioCanvasGrid } from "./studio-canvas-grid";
import { createStudioStore } from "./lib/store";
import type { CanvasDataV2 } from "./types";

// ── Mocks de frontera ────────────────────────────────────────────────

vi.mock("./studio-slot", () => ({
  StudioSlot: ({ slotState }: { slotState: { slotIndex: number } }) => (
    <div data-testid={`studio-slot-${slotState.slotIndex}`} />
  ),
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

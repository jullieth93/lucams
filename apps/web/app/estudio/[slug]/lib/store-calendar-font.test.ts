/*
 * setCalendarFont — selector de tipo de letra del título/mes del calendario
 * (Lucy 2026-09-07, "sería bueno que el usuario pudiera ser más versátil, como es
 * coger el tipo de letra"). Sigue el patrón de setBorderColor: no-op si no cambia,
 * persiste vía setCanvasData → undo + auto-save.
 */

import { describe, expect, it } from "vitest";
import { createStudioStore } from "./store";
import type { CanvasDataV2 } from "../types";

function makeCanvasData(): CanvasDataV2 {
  return {
    version: 2,
    unitTemplate: {
      version: 1,
      stage: { width: 600, height: 800 },
      layers: [{ id: "bg", type: "background", color: "#FFFFFF" }],
    },
    slotCount: 12,
    slots: Array.from({ length: 12 }, (_, i) => ({
      slotIndex: i,
      assetId: null,
      assetUrl: null,
    })),
    gridLayout: { cols: 4, rows: 3, gap: 12 },
  };
}

function setup() {
  const store = createStudioStore();
  store.getState().init({
    designId: "d1",
    productSlug: "calendario-set-12-tarjetas",
    canvasData: makeCanvasData(),
    templates: [],
  });
  return store;
}

describe("setCalendarFont — tipo de letra del calendario", () => {
  it("persiste la elección en canvasData y marca el diseño sucio (auto-save la guarda)", () => {
    const store = setup();
    expect(store.getState().canvasData?.calendarFont).toBeUndefined();
    store.getState().setCalendarFont("caveat");
    expect(store.getState().canvasData?.calendarFont).toBe("caveat");
    expect(store.getState().isDirty).toBe(true);
  });

  it("no-op cuando el valor no cambia (ausente = fredoka): no toca canvasData ni el dirty", () => {
    const store = setup();
    store.getState().markClean();
    const before = store.getState().canvasData;
    store.getState().setCalendarFont("fredoka"); // ya es el efectivo (default retrocompatible)
    expect(store.getState().canvasData).toBe(before); // misma referencia: cero ruido de undo
    expect(store.getState().isDirty).toBe(false);
  });

  it("cambiar de una fuente a otra actualiza la clave persistida", () => {
    const store = setup();
    store.getState().setCalendarFont("caveat");
    store.getState().markClean();
    store.getState().setCalendarFont("inter");
    expect(store.getState().canvasData?.calendarFont).toBe("inter");
    expect(store.getState().isDirty).toBe(true);
  });

  it("va por setCanvasData → queda en el undo stack", () => {
    const store = setup();
    store.getState().setCalendarFont("caveat");
    expect(store.getState().undoStack.length).toBeGreaterThan(0);
    store.getState().undo();
    expect(store.getState().canvasData?.calendarFont).toBeUndefined();
  });
});

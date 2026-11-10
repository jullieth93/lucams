// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createStudioStore } from "./lib/store";
import { MiniBookFields } from "./mini-book-fields";
import type { CanvasDataV2 } from "./types";

afterEach(() => cleanup());

function canvasData(): CanvasDataV2 {
  return {
    version: 2,
    unitTemplate: {
      version: 1,
      stage: { width: 710, height: 500 },
      layers: [
        { id: "title", type: "text", x: 400, y: 420, text: "Título" },
        { id: "spine_title", type: "text", x: 355, y: 250, text: "Título" },
        { id: "author", type: "text", x: 400, y: 465, text: "Autor" },
        { id: "back_message", type: "text", x: 160, y: 250, text: "Dedicatoria" },
      ],
    },
    slotCount: 1,
    unitCount: 1,
    unitSlots: 1,
    slots: [{ slotIndex: 0, assetId: null, assetUrl: null }],
    gridLayout: { cols: 1, rows: 1, gap: 0 },
  };
}

function setup() {
  const store = createStudioStore();
  store.getState().init({
    designId: "design-1",
    productSlug: "mini-libros-magneticos",
    canvasData: canvasData(),
    templates: [],
  });
  return store;
}

describe("MiniBookFields", () => {
  it("coordina el título de portada y lomo en una sola actualización", () => {
    const store = setup();
    render(<MiniBookFields store={store} />);

    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Nuestra historia" },
    });

    const slot = store.getState().canvasData!.slots[0]!;
    expect(slot.textOverrides?.title).toEqual({ text: "Nuestra historia" });
    expect(slot.textOverrides?.spine_title).toEqual({ text: "Nuestra historia" });
  });

  it("guarda autor y contraportada en la unidad activa", () => {
    const store = setup();
    render(<MiniBookFields store={store} />);

    fireEvent.change(screen.getByLabelText("Autor o dedicatoria corta"), {
      target: { value: "Con amor, Lucía" },
    });
    fireEvent.change(screen.getByLabelText("Mensaje para la contraportada"), {
      target: { value: "Gracias por tantas páginas juntos" },
    });

    const slot = store.getState().canvasData!.slots[0]!;
    expect(slot.textOverrides?.author).toEqual({ text: "Con amor, Lucía" });
    expect(slot.textOverrides?.back_message).toEqual({ text: "Gracias por tantas páginas juntos" });
  });

  it("limpia ambas regiones del título cuando queda vacío", () => {
    const store = setup();
    store.getState().setSlotTextOverrides(0, {
      title: { text: "Antes" },
      spine_title: { text: "Antes" },
    });
    render(<MiniBookFields store={store} />);

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "" } });

    const slot = store.getState().canvasData!.slots[0]!;
    expect(slot.textOverrides?.title).toBeUndefined();
    expect(slot.textOverrides?.spine_title).toBeUndefined();
  });
});

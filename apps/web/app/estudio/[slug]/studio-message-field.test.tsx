// @vitest-environment jsdom

/*
 * Test del FLUJO de edición de texto de la Polaroid (Ola 3c, Lucy 2026-07-22 — 2ª
 * queja: "no deja modificar texto"). Certifica la vía principal nueva: el campo
 * "Tu mensaje" de la sidebar escribe el override en TODOS los slots del pack
 * (canvasData → auto-save → producción, WYSIWYG). Ola 4 (Lucy 2026-07-23): el
 * mensaje es OPCIONAL — el campo arranca vacío y vacío = no se imprime nada.
 * El click/tap en el canvas queda como atajo al modal.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StudioMessageField } from "./studio-message-field";
import { createStudioStore } from "./lib/store";
import type { CanvasDataV2 } from "./types";

function polaroidCanvas(): CanvasDataV2 {
  return {
    version: 2,
    unitTemplate: {
      version: 1,
      stage: { width: 450, height: 600, dpiPreview: 90, dpiProduction: 300 },
      layers: [
        { id: "bg", type: "background", color: "#FFFFFF" },
        { id: "card", type: "frame-card", fill: "#FFFFFF", cornerRadius: 18 },
        {
          id: "p1",
          type: "image-placeholder",
          x: 28,
          y: 28,
          width: 394,
          height: 394,
          label: "Tu foto",
        },
        {
          id: "message",
          type: "text",
          x: 225,
          y: 512,
          text: "Escribe tu mensaje",
          fontFamily: "Fredoka",
          fontSize: 34,
          editable: true,
        },
      ],
    },
    slotCount: 2,
    slots: [
      { slotIndex: 0, assetId: null, assetUrl: null },
      { slotIndex: 1, assetId: null, assetUrl: null },
    ],
    gridLayout: { cols: 2, rows: 1, gap: 24 },
    borderColor: null,
  };
}

function makeStore() {
  const store = createStudioStore();
  store.getState().init({
    designId: "d1",
    productSlug: "set-fotoimanes-polaroid",
    canvasData: polaroidCanvas(),
    templates: [],
  });
  return store;
}

afterEach(cleanup);

describe("StudioMessageField — flujo 'Tu mensaje' (Lucy 2026-07-22)", () => {
  it("arranca VACÍO (placeholder solo guía) y escribe el override en TODOS los slots", () => {
    // Ola 4 (Lucy 2026-07-23) — el mensaje es OPCIONAL: el campo ya no muestra el texto
    // base de la plantilla como valor (eso lo hacía parecer obligatorio y el placeholder
    // terminaba impreso). Vacío = no se imprime nada.
    const store = makeStore();
    render(<StudioMessageField store={store} />);

    const input = screen.getByRole("textbox", { name: /tu mensaje/i }) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("Escribe tu mensaje");

    fireEvent.change(input, { target: { value: "Te amo mamá" } });

    const slots = store.getState().canvasData!.slots;
    expect(slots).toHaveLength(2);
    for (const s of slots) {
      expect(s.textOverrides?.message?.text).toBe("Te amo mamá");
    }
  });

  it("vaciar el campo limpia los overrides (sin texto → no se imprime nada)", () => {
    const store = makeStore();
    render(<StudioMessageField store={store} />);
    const input = screen.getByRole("textbox", { name: /tu mensaje/i }) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "Feliz cumple" } });
    expect(store.getState().canvasData!.slots[0].textOverrides?.message?.text).toBe("Feliz cumple");

    fireEvent.change(input, { target: { value: "" } });
    for (const s of store.getState().canvasData!.slots) {
      expect(s.textOverrides?.message).toBeUndefined();
    }
    // El input queda vacío (ya NO vuelve a mostrar el texto base).
    expect(input.value).toBe("");
  });

  it("refleja un override hecho por otra vía (modal del canvas) en el primer slot con texto", () => {
    const store = makeStore();
    // Simula el camino del modal: override por-slot en el slot 1.
    store.getState().setSlotTextOverride(1, "message", { text: "Desde el modal" });
    render(<StudioMessageField store={store} />);
    const input = screen.getByRole("textbox", { name: /tu mensaje/i }) as HTMLInputElement;
    expect(input.value).toBe("Desde el modal");
  });

  it("NO se muestra cuando la plantilla tiene VARIAS capas editables (Instagram: 4 zonas)", () => {
    const store = makeStore();
    const canvas = polaroidCanvas();
    canvas.unitTemplate.layers.push({
      id: "caption",
      type: "text",
      x: 25,
      y: 568,
      text: "Tu título",
      editable: true,
    } as never);
    store.getState().setCanvasData(canvas, { skipUndo: true });
    render(<StudioMessageField store={store} />);
    expect(screen.queryByRole("textbox", { name: /tu mensaje/i })).toBeNull();
  });
});

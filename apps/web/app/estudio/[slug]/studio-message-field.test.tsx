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

  it("muestra el aviso de que el mensaje aplica a TODAS las fotos del set (Lucy 2026-09-08)", () => {
    // "Mantener con aviso" (aprobado por el owner): el campo sigue, pero el aviso
    // pack-level debe estar visible junto al campo.
    const store = makeStore();
    render(<StudioMessageField store={store} />);
    expect(screen.getByRole("note").textContent).toMatch(/todas las fotos del set/i);
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

describe("StudioMessageField — QA 1.2: masivo + edición individual conviven (2026-10-07)", () => {
  // Bug de QA en STG: tras "aplicar a todas", editar el texto de UNA foto desde
  // el canvas hacía "desaparecer todo". El flujo que debe quedar funcionando:
  // masivo "Hola" → editar slot 2 a "Chao" → slots 1..N conservan "Hola", el
  // campo masivo sigue mostrando el valor vigente → re-editar funciona a la 1ª.
  it("masivo → edición individual de un slot: los demás conservan el masivo y el campo NO salta", () => {
    const store = makeStore();
    render(<StudioMessageField store={store} />);
    const input = screen.getByRole("textbox", { name: /tu mensaje/i }) as HTMLInputElement;

    // 1. Masivo "Hola" → todos los slots.
    fireEvent.change(input, { target: { value: "Hola" } });
    for (const s of store.getState().canvasData!.slots) {
      expect(s.textOverrides?.message?.text).toBe("Hola");
    }

    // 2. Edición individual del slot 2 (camino del modal del canvas).
    store.getState().setSlotTextOverride(1, "message", { text: "Chao" });

    // Slots: el 1 conserva "Hola", el 2 tiene "Chao".
    expect(store.getState().canvasData!.slots[0].textOverrides?.message?.text).toBe("Hola");
    expect(store.getState().canvasData!.slots[1].textOverrides?.message?.text).toBe("Chao");
    // El campo masivo sigue mostrando el valor pack-level vigente (no "salta").
    expect(input.value).toBe("Hola");

    // 3. Re-editar el mismo slot funciona a la primera (el override se pisa, no se borra).
    store.getState().setSlotTextOverride(1, "message", { text: "Chao 2" });
    expect(store.getState().canvasData!.slots[1].textOverrides?.message?.text).toBe("Chao 2");
    expect(store.getState().canvasData!.slots[0].textOverrides?.message?.text).toBe("Hola");
    expect(input.value).toBe("Hola");
  });

  it("vaciar el campo masivo tras una edición individual limpia TODOS los slots y el valor pack-level", () => {
    const store = makeStore();
    render(<StudioMessageField store={store} />);
    const input = screen.getByRole("textbox", { name: /tu mensaje/i }) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "Hola" } });
    store.getState().setSlotTextOverride(1, "message", { text: "Chao" });
    expect(input.value).toBe("Hola");

    fireEvent.change(input, { target: { value: "" } });
    for (const s of store.getState().canvasData!.slots) {
      expect(s.textOverrides?.message).toBeUndefined();
    }
    expect(store.getState().packTextValues.message).toBeUndefined();
    expect(input.value).toBe("");
  });
});

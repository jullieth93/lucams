// @vitest-environment jsdom

/*
 * Test del bloque de diligenciamiento MASIVO de la Polaroid Instagram (Fase 1B,
 * owner 2026-09): la sección "Datos de la publicación" del sidebar es el
 * equivalente multi-campo de "Tu mensaje" (Polaroid Clásica) — un campo por capa
 * editable IG (@usuario, ubicación, "me gusta", título, hashtags) que escribe el
 * override en TODOS los slots vía setTextOverrideAllSlots.
 *
 * Contrato blindado:
 *  1. Solo se monta con plantilla Instagram (isInstagramTemplate); en Clásica y
 *     demás no aparece.
 *  2. Cada campo escribe en TODOS los slots por tecla; vacío → override null.
 *  3. Valor mostrado = el texto compartido; si las unidades difieren, el campo
 *     queda vacío con chip "Varía por foto" y al escribir se unifica.
 *  4. likes_count se anuncia opcional; las 4 requeridas (Ola 26) como obligatorias.
 *  5. Aviso pack-level visible (misma caja que "Tu mensaje").
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StudioIgPostFields } from "./studio-ig-post-fields";
import { createStudioStore } from "./lib/store";
import type { CanvasDataV2 } from "./types";

function igCanvas(): CanvasDataV2 {
  return {
    version: 2,
    unitTemplate: {
      version: 1,
      stage: { width: 450, height: 600, dpiPreview: 90, dpiProduction: 300 },
      layers: [
        { id: "bg", type: "background", color: "#FFFFFF" },
        // El asset con src "ig_post" es lo que marca la plantilla como Instagram
        // (isInstagramTemplate, frame-palette).
        { id: "frame", type: "asset", src: "/templates/ig_post_3x4.svg", x: 0, y: 0 },
        {
          id: "p1",
          type: "image-placeholder",
          x: 29,
          y: 58,
          width: 392,
          height: 392,
          label: "Tu foto",
        },
        { id: "user_name", type: "text", x: 60, y: 34, text: "@tu_usuario", editable: true },
        { id: "location", type: "text", x: 60, y: 48, text: "Bogotá, Colombia", editable: true },
        { id: "likes_count", type: "text", x: 25, y: 510, text: "362 me gusta", editable: true },
        { id: "caption", type: "text", x: 25, y: 526, text: "Tu título acá", editable: true },
        {
          id: "hashtags",
          type: "text",
          x: 25,
          y: 542,
          text: "#mirecuerdo #lucamsshop",
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

function makeStore(canvas: CanvasDataV2 = igCanvas()) {
  const store = createStudioStore();
  store.getState().init({
    designId: "d1",
    productSlug: "set-fotoimanes-polaroid-instagram",
    canvasData: canvas,
    templates: [],
  });
  return store;
}

afterEach(cleanup);

describe("StudioIgPostFields — diligenciamiento masivo IG (Fase 1B)", () => {
  it("renderiza UN campo por capa editable IG con el aviso pack-level", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);

    expect(screen.getByText("Datos de la publicación")).toBeInTheDocument();
    for (const label of ["@usuario", "Ubicación", "«Me gusta»", "Título", "Hashtags"]) {
      expect(screen.getByRole("textbox", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }
    expect(screen.getByRole("note").textContent).toMatch(/TODAS las fotos del set/i);
  });

  it("marca las 4 capas requeridas como obligatorias y «me gusta» como opcional", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);

    expect(screen.getByRole("textbox", { name: /ubicación.*obligatorio/i })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /me gusta.*opcional.*no se imprime/i }),
    ).toBeInTheDocument();
  });

  it("cada campo escribe el override en TODOS los slots por tecla; vacío → null", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);

    const input = screen.getByRole("textbox", { name: /@usuario/i }) as HTMLInputElement;
    expect(input.value).toBe("");

    fireEvent.change(input, { target: { value: "@lucy.fotos" } });
    for (const s of store.getState().canvasData!.slots) {
      expect(s.textOverrides?.user_name?.text).toBe("@lucy.fotos");
    }

    fireEvent.change(input, { target: { value: "" } });
    for (const s of store.getState().canvasData!.slots) {
      expect(s.textOverrides?.user_name).toBeUndefined();
    }
  });

  it("muestra el valor compartido cuando TODAS las unidades coinciden", () => {
    const store = makeStore();
    store.getState().setTextOverrideAllSlots("caption", { text: "Domingo de playa" });
    render(<StudioIgPostFields store={store} />);

    const input = screen.getByRole("textbox", { name: /título/i }) as HTMLInputElement;
    expect(input.value).toBe("Domingo de playa");
    expect(screen.queryByText("Varía por foto")).toBeNull();
  });

  it("estado «Varía por foto»: valores distintos entre unidades → campo vacío con chip, y al escribir se unifica", () => {
    const store = makeStore();
    // Edición individual posterior (modal): las unidades difieren en el título.
    store.getState().setSlotTextOverride(0, "caption", { text: "Cumple de Ana" });
    store.getState().setSlotTextOverride(1, "caption", { text: "Vacaciones 2026" });
    render(<StudioIgPostFields store={store} />);

    const input = screen.getByRole("textbox", { name: /título/i }) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("Varía por foto — escribe para unificar");
    expect(screen.getByText("Varía por foto")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Título único" } });
    for (const s of store.getState().canvasData!.slots) {
      expect(s.textOverrides?.caption?.text).toBe("Título único");
    }
    expect(screen.queryByText("Varía por foto")).toBeNull();
    expect(input.value).toBe("Título único");
  });

  it("NO se muestra con otras plantillas (Polaroid Clásica: 1 capa editable, sin asset ig_post)", () => {
    const store = makeStore({
      ...igCanvas(),
      unitTemplate: {
        version: 1,
        stage: { width: 450, height: 600, dpiPreview: 90, dpiProduction: 300 },
        layers: [
          { id: "bg", type: "background", color: "#FFFFFF" },
          {
            id: "message",
            type: "text",
            x: 225,
            y: 512,
            text: "Escribe tu mensaje",
            editable: true,
          },
        ],
      },
    });
    render(<StudioIgPostFields store={store} />);
    expect(screen.queryByText("Datos de la publicación")).toBeNull();
  });
});

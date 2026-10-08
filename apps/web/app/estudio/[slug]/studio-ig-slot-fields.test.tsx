// @vitest-environment jsdom

/*
 * Test de StudioIgSlotFields — QA ronda 2 (owner 2026-10-07, F3): los 5 campos
 * de la Polaroid Instagram en la edición INDIVIDUAL por canvas (pestaña Texto
 * del StudioSlotEditModal).
 *
 * Contrato blindado:
 *  1. Con plantilla Instagram renderiza los 5 campos con ETIQUETAS AMIGABLES
 *     (@usuario, Ubicación, «Me gusta», Título, Hashtags — no ids de capa
 *     crudos); con otra plantilla no aparece.
 *  2. Valor inicial: override del slot → valor pack-level vigente
 *     (packTextValues) → vacío.
 *  3. La edición escribe el override INDIVIDUAL del slot (setSlotTextOverride)
 *     y NO toca los demás slots ni el valor pack-level.
 *  4. El combobox de ubicación (mismo componente compartido del panel global)
 *     filtra la lista MUNDIAL y compromete la elección solo en este slot.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StudioIgSlotFields } from "./studio-ig-slot-fields";
import { createStudioStore } from "./lib/store";
import type { TextOverride } from "./types";
import type { CanvasDataV2 } from "./types";

function igCanvas(): CanvasDataV2 {
  return {
    version: 2,
    unitTemplate: {
      version: 1,
      stage: { width: 450, height: 600, dpiPreview: 90, dpiProduction: 300 },
      layers: [
        { id: "bg", type: "background", color: "#FFFFFF" },
        // El asset con src "ig_post" es lo que marca la plantilla como Instagram.
        { id: "frame", type: "asset", src: "/templates/ig_post_3x4.svg", x: 0, y: 0 },
        { id: "p1", type: "image-placeholder", x: 29, y: 58, width: 392, height: 392 },
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

type Store = ReturnType<typeof makeStore>;

/** Cableado espejo del host (studio-canvas-grid): onApply → setSlotTextOverride. */
function wireOnApply(store: Store, slotIndex: number) {
  return (layerId: string, override: TextOverride | null | undefined) => {
    if (override !== undefined) store.getState().setSlotTextOverride(slotIndex, layerId, override);
  };
}

function slotOverrides(store: Store, slotIndex: number) {
  return store.getState().canvasData!.slots.find((s) => s.slotIndex === slotIndex)?.textOverrides;
}

function renderFields(store: Store, slotIndex = 0) {
  const state = store.getState();
  const overrides = state.canvasData!.slots.find((s) => s.slotIndex === slotIndex)?.textOverrides;
  return render(
    <StudioIgSlotFields
      slotIndex={slotIndex}
      currentOverrides={overrides}
      onApply={wireOnApply(store, slotIndex)}
      store={store}
    />,
  );
}

afterEach(cleanup);

describe("StudioIgSlotFields — campos IG en la edición individual (QA ronda 2, F3)", () => {
  it("renderiza los 5 campos con etiquetas AMIGABLES (no ids de capa) en plantilla IG", () => {
    const store = makeStore();
    renderFields(store);

    expect(screen.getByText("Campos de Instagram")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /@usuario/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /ubicación/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /me gusta/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /título/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /hashtags/i })).toBeInTheDocument();
    // Los ids crudos de capa NO se muestran como etiqueta.
    expect(screen.queryByText("user_name")).toBeNull();
    expect(screen.queryByText("likes_count")).toBeNull();
  });

  it("NO se renderiza con una plantilla que no es Instagram", () => {
    const canvas = igCanvas();
    canvas.unitTemplate.layers = canvas.unitTemplate.layers.filter((l) => l.id !== "frame");
    const store = makeStore(canvas);
    const { container } = renderFields(store);
    expect(container).toBeEmptyDOMElement();
  });

  it("valor inicial: override del slot > valor pack-level vigente > vacío", () => {
    const store = makeStore();
    // Pack-level vigente (aplicado masivamente antes).
    store.getState().setTextOverrideAllSlots("caption", { text: "Título del set" });
    // Slot 1 lo pisó con su propio texto (edición individual posterior).
    store.getState().setSlotTextOverride(1, "caption", { text: "Cumple de Ana" });

    // Slot 0 (sin override propio) muestra el valor pack-level…
    const { unmount } = renderFields(store, 0);
    expect(screen.getByRole("textbox", { name: /título/i })).toHaveValue("Título del set");
    unmount();

    // …y el slot 1 muestra SU override (manda sobre el pack-level).
    renderFields(store, 1);
    expect(screen.getByRole("textbox", { name: /título/i })).toHaveValue("Cumple de Ana");
  });

  it("la edición escribe el override INDIVIDUAL del slot y no toca otros slots ni el pack-level", () => {
    const store = makeStore();
    renderFields(store, 0);

    fireEvent.change(screen.getByRole("textbox", { name: /@usuario/i }), {
      target: { value: "lucy.fotos" },
    });

    // El override se guarda CON "@" (se imprime tal cual) SOLO en el slot 0.
    expect(slotOverrides(store, 0)?.user_name?.text).toBe("@lucy.fotos");
    expect(slotOverrides(store, 1)?.user_name).toBeUndefined();
    expect(store.getState().packTextValues.user_name).toBeUndefined();
  });

  it("ubicación: el combobox filtra la lista MUNDIAL y compromete la elección solo en este slot", () => {
    const store = makeStore();
    renderFields(store, 0);

    const input = screen.getByRole("combobox", { name: /ubicación/i });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "madri" } });
    const option = screen.getByRole("option", { name: "Madrid, España" });
    fireEvent.click(option);

    expect(slotOverrides(store, 0)?.location?.text).toBe("Madrid, España");
    expect(slotOverrides(store, 1)?.location).toBeUndefined();
  });

  it("«me gusta»: solo numérico con sufijo fijo, individual por slot", () => {
    const store = makeStore();
    renderFields(store, 1);

    fireEvent.change(screen.getByRole("textbox", { name: /me gusta/i }), {
      target: { value: "1234" },
    });

    expect(slotOverrides(store, 1)?.likes_count?.text).toBe("1.234 me gusta");
    expect(slotOverrides(store, 0)?.likes_count).toBeUndefined();
  });

  it("hashtags: chips compartidos — agrega con Enter solo en este slot", () => {
    const store = makeStore();
    renderFields(store, 0);

    const input = screen.getByRole("textbox", { name: /hashtags/i });
    fireEvent.change(input, { target: { value: "familia" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(slotOverrides(store, 0)?.hashtags?.text).toBe("#familia");
    expect(slotOverrides(store, 1)?.hashtags).toBeUndefined();
  });
});

// @vitest-environment jsdom

/*
 * useStudioChecklist — paso «Elige tu plantilla» (5.1, owner 2026-10-22):
 * ninguna plantilla viene seleccionada por defecto, así que con >1 plantillas
 * el paso nace PENDIENTE (primero del checklist — es la primera decisión del
 * flujo) y se completa al aplicar una. Con 0 o 1 plantilla el paso no aplica
 * (0 = nada que elegir; 1 = elección trivial que el boot auto-selecciona).
 *
 * Los textos CMS caen al DEFAULT_STUDIO_TEXTS sin provider (mismo patrón que
 * studio-style-toolbar.test.tsx); el store corre real (zustand vanilla).
 */

import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createStudioStore } from "./lib/store";
import { useStudioChecklist } from "./studio-checklist";
import type { CanvasDataV2, StudioTemplate } from "./types";

afterEach(() => cleanup());

function tpl(id: string): StudioTemplate {
  return {
    id,
    slug: id,
    name: id,
    previewUrl: "",
    canvasData: {
      version: 1,
      stage: { width: 450, height: 600 },
      layers: [
        { id: "bg", type: "background", color: "#FFFFFF" },
        { id: "ph", type: "image-placeholder", x: 0, y: 0, width: 450, height: 600 },
      ],
    },
  } as unknown as StudioTemplate;
}

function makeCanvasData(): CanvasDataV2 {
  return {
    version: 2,
    unitTemplate: tpl("base").canvasData,
    slotCount: 2,
    slots: [
      { slotIndex: 0, assetId: null, assetUrl: null },
      { slotIndex: 1, assetId: null, assetUrl: null },
    ],
    gridLayout: { cols: 2, rows: 1, gap: 8 },
  } as unknown as CanvasDataV2;
}

function setup(opts: { templates: StudioTemplate[]; selectedTemplateId?: string | null }) {
  const store = createStudioStore();
  store.getState().init({
    designId: "d1",
    productSlug: "set-fotoimanes",
    canvasData: makeCanvasData(),
    templates: opts.templates,
    selectedTemplateId: opts.selectedTemplateId ?? null,
  });
  const hook = renderHook(() => useStudioChecklist(store, {}));
  return { store, ...hook };
}

describe("useStudioChecklist — paso «Elige tu plantilla»", () => {
  it("ausente con 0 plantillas", () => {
    const { result } = setup({ templates: [] });
    expect(result.current.steps.find((s) => s.id === "plantillas")).toBeUndefined();
  });

  it("ausente con 1 sola plantilla (elección trivial, auto-seleccionada en el boot)", () => {
    const { result } = setup({ templates: [tpl("a")], selectedTemplateId: "a" });
    expect(result.current.steps.find((s) => s.id === "plantillas")).toBeUndefined();
  });

  it(">1 plantillas sin selección: paso pendiente y PRIMERO del checklist", () => {
    const { result } = setup({ templates: [tpl("a"), tpl("b")] });
    const step = result.current.steps.find((s) => s.id === "plantillas");
    expect(step?.state).toBe("pending");
    expect(step?.label).toBe("Elige tu plantilla");
    expect(result.current.steps[0].id).toBe("plantillas");
  });

  it("complete tras setSelectedTemplate", () => {
    const { store, result } = setup({ templates: [tpl("a"), tpl("b")] });
    act(() => store.getState().setSelectedTemplate("b"));
    const step = result.current.steps.find((s) => s.id === "plantillas");
    expect(step?.state).toBe("complete");
  });

  it("pendingCount refleja el paso: 2 pendientes sin plantilla (plantilla + fotos), 1 tras elegir", () => {
    const { store, result } = setup({ templates: [tpl("a"), tpl("b")] });
    expect(result.current.pendingCount).toBe(2); // plantillas + fotos vacías
    act(() => store.getState().setSelectedTemplate("a"));
    expect(result.current.pendingCount).toBe(1); // solo fotos
  });
});

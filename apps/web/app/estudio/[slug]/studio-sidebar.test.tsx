// @vitest-environment jsdom

/*
 * StudioSidebar — sección «Diseños prediseñados» COLAPSABLE (Fase 2 · 2.5,
 * 2026-10-07). Con muchos diseños la sección sepultaba el resto de la sidebar
 * («Mis fotos» quedaba lejos del scroll). Ahora:
 *   1. > 6 prediseñados → arranca CERRADA (contador visible en el header).
 *   2. <= 6 → arranca abierta (pocos diseños no estorban).
 *   3. El toggle (aria-expanded + aria-controls) pliega/despliega el panel.
 * El filtrado server-side (listGalleryImages) no cambia: la sección solo se
 * monta cuando hay prediseñados, como antes.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createStudioStore } from "./lib/store";
import type { CanvasDataV2 } from "./types";
import type { PredesignedItem } from "./studio-asset-picker-modal";

vi.mock("@/features/personalization/actions", () => ({
  uploadDesignAssetAction: vi.fn(),
}));

import { StudioSidebar } from "./studio-sidebar";

afterEach(cleanup);

function minimalCanvas(): CanvasDataV2 {
  return {
    version: 2,
    unitTemplate: {
      version: 1,
      stage: { width: 450, height: 600, dpiPreview: 90, dpiProduction: 300 },
      layers: [{ id: "bg", type: "background", color: "#FFFFFF" }],
    },
    slotCount: 2,
    slots: [
      { slotIndex: 0, assetId: null, assetUrl: null },
      { slotIndex: 1, assetId: null, assetUrl: null },
    ],
    gridLayout: { cols: 2, rows: 1, gap: 24 },
    borderColor: null,
  } as unknown as CanvasDataV2;
}

function predesignedItems(n: number): PredesignedItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `g${i}`,
    name: `Diseño ${i + 1}`,
    imageUrl: `https://example.com/g${i}.png`,
  }));
}

function renderSidebar(predesigned: PredesignedItem[]) {
  const store = createStudioStore();
  store.getState().init({
    designId: "d1",
    productSlug: "set-fotoimanes-polaroid-clasica",
    canvasData: minimalCanvas(),
    templates: [],
  });
  render(
    <TooltipProvider>
      <StudioSidebar
        store={store}
        productName="Set Fotoimanes"
        productSku="SFP-01"
        predesigned={predesigned}
      />
    </TooltipProvider>,
  );
}

const TOGGLE_NAME = "Mostrar u ocultar los diseños prediseñados";

describe("StudioSidebar — prediseñados colapsables (Fase 2 · 2.5)", () => {
  it("con MUCHOS (>6) arranca cerrada: contador visible, grid oculto, «Mis fotos» no queda sepultada", () => {
    renderSidebar(predesignedItems(9));

    const toggle = screen.getByRole("button", { name: TOGGLE_NAME });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // El header conserva el contador aunque esté cerrada.
    expect(screen.getByText("(9)")).toBeInTheDocument();
    // Grid oculto: ningún botón «Aplicar el diseño…» montado.
    expect(screen.queryByRole("button", { name: /Aplicar el diseño/ })).toBeNull();
    // «Mis fotos» sigue visible arriba (no hay que scrollear los prediseñados).
    expect(screen.getByText("Mis fotos")).toBeInTheDocument();
  });

  it("el toggle despliega el panel con el grid y lo vuelve a plegar", () => {
    renderSidebar(predesignedItems(8));

    const toggle = screen.getByRole("button", { name: TOGGLE_NAME });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: "Aplicar el diseño Diseño 1 al slot" }),
    ).toBeInTheDocument();
    // aria-controls apunta al panel desplegado.
    const panelId = toggle.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).not.toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /Aplicar el diseño/ })).toBeNull();
  });

  it("con POCOS (<=6) arranca abierta", () => {
    renderSidebar(predesignedItems(3));

    expect(screen.getByRole("button", { name: TOGGLE_NAME })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Aplicar el diseño Diseño 3 al slot" }),
    ).toBeInTheDocument();
  });

  it("sin prediseñados: la sección no se monta (igual que antes)", () => {
    renderSidebar([]);

    expect(screen.queryByRole("button", { name: TOGGLE_NAME })).toBeNull();
    expect(screen.queryByText(/Diseños prediseñados/)).toBeNull();
  });
});

describe("StudioSidebar — miniatura watermark de prediseñados (3.10, 2026-10-07)", () => {
  it("exhibe thumbUrl cuando existe; fallback al original si no; contextmenu bloqueado", () => {
    renderSidebar([
      {
        id: "g1",
        name: "Con thumb",
        imageUrl: "https://example.com/g1.png",
        thumbUrl: "https://example.com/thumbs/g1.webp",
      },
      { id: "g2", name: "Sin thumb", imageUrl: "https://example.com/g2.png" },
    ]);

    const conThumb = screen.getByAltText("Con thumb");
    expect(conThumb).toHaveAttribute("src", "https://example.com/thumbs/g1.webp");
    expect(conThumb).toHaveAttribute("draggable", "false");
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    conThumb.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);

    // Sin thumbUrl (fila pre-backfill): fallback transitorio al original.
    expect(screen.getByAltText("Sin thumb")).toHaveAttribute("src", "https://example.com/g2.png");
  });
});

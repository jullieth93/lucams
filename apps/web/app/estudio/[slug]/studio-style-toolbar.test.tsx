// @vitest-environment jsdom

/*
 * StudioStyleToolbar — color de tarjeta en Instagram SIN BORDE (owner 2026-10-06).
 *
 * Antes, entrar a «Sin borde» en la Polaroid Instagram forzaba la tarjeta blanca
 * y dejaba la paleta inerte (excepción del rediseño 2026-10-05: un negro residual
 * teñiría las franjas). El owner pidió elegir el color TAMBIÉN en «Sin borde»:
 * las franjas toman el color (binario blanco/negro) y la maquinaria de contraste
 * ya existente (igTextFill + chrome `_dark_noborder`) hace el resto. Contrato:
 *  1. Entrar a «Sin borde» NO resetea el borderColor elegido.
 *  2. La paleta queda HABILITADA en el modo, con aviso informativo propio.
 *  3. Control: la Polaroid Clásica conserva el apagado de Ola 24.
 *
 * Los textos CMS caen al DEFAULT_STUDIO_TEXTS sin provider (mismo patrón que
 * studio-asset-picker-modal.test.tsx); el store corre real (zustand vanilla).
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createStudioStore } from "./lib/store";
import { StudioStyleToolbar } from "./studio-style-toolbar";
import type { CanvasDataV1, CanvasDataV2, StudioTemplate } from "./types";

afterEach(() => cleanup());

const PH_INSET = { id: "ph", type: "image-placeholder", x: 29, y: 58, width: 392, height: 392 };
const PH_FULL = { id: "ph", type: "image-placeholder", x: 0, y: 0, width: 450, height: 600 };

function unitOf(ph: typeof PH_INSET, opts?: { chrome?: boolean }): CanvasDataV1 {
  return {
    version: 1,
    stage: { width: 450, height: 600 },
    layers: [
      { id: "bg", type: "background", color: "#FFFFFF" },
      ph,
      ...(opts?.chrome
        ? [
            {
              id: "chrome",
              type: "asset",
              src: "/templates/ig_post_3x4.svg",
              x: 0,
              y: 0,
              width: 450,
              height: 600,
            },
          ]
        : []),
    ],
  } as unknown as CanvasDataV1;
}

function canvasOf(unitTemplate: CanvasDataV1, borderColor: string | null): CanvasDataV2 {
  return {
    version: 2,
    unitTemplate,
    slotCount: 2,
    slots: [
      { slotIndex: 0, assetId: null, assetUrl: null },
      { slotIndex: 1, assetId: null, assetUrl: null },
    ],
    gridLayout: { cols: 2, rows: 1, gap: 8 },
    borderColor,
  } as unknown as CanvasDataV2;
}

function setup(opts: {
  slug: string;
  unitTemplate: CanvasDataV1;
  borderColor: string | null;
  /** Canvas base de la plantilla (rect "con borde"); default = el unitTemplate. */
  templateCanvas?: CanvasDataV1;
}) {
  const template = {
    id: `tpl-${opts.slug}`,
    slug: opts.slug,
    name: opts.slug,
    previewUrl: "/templates/ig_post_3x4.svg",
    canvasData: opts.templateCanvas ?? opts.unitTemplate,
  } as unknown as StudioTemplate;
  const store = createStudioStore();
  store.getState().init({
    designId: "d1",
    productSlug: "polaroid",
    canvasData: canvasOf(opts.unitTemplate, opts.borderColor),
    templates: [template],
    selectedTemplateId: template.id,
  });
  render(
    <TooltipProvider>
      <StudioStyleToolbar store={store} frameOptions={["blanco", "negro"]} />
    </TooltipProvider>,
  );
  return store;
}

describe("StudioStyleToolbar — Instagram SIN BORDE con color de tarjeta (owner 2026-10-06)", () => {
  it("entrar a «Sin borde» NO fuerza la tarjeta blanca: conserva el color elegido", () => {
    const store = setup({
      slug: "photo-pack-polaroid-instagram",
      unitTemplate: unitOf(PH_INSET, { chrome: true }),
      borderColor: "#221E25",
    });

    fireEvent.click(screen.getByRole("radio", { name: "Sin borde" }));

    const data = store.getState().canvasData!;
    expect(data.igNoBorder).toBe(true);
    expect(data.borderColor).toBe("#221E25"); // antes quedaba forzado a #FFFFFF
  });

  it("en «Sin borde» la paleta blanco/negro queda HABILITADA y el negro se puede elegir", () => {
    const store = setup({
      slug: "photo-pack-polaroid-instagram",
      unitTemplate: unitOf(PH_INSET, { chrome: true }),
      borderColor: null,
    });

    fireEvent.click(screen.getByRole("radio", { name: "Sin borde" }));

    const negro = screen.getByRole("radio", { name: "Negro" });
    expect(negro).toBeEnabled();
    // Aviso informativo del modo (ya no el de "paleta desactivada").
    expect(screen.getByText(/el color pinta las franjas de arriba y abajo/)).toBeInTheDocument();

    fireEvent.click(negro);
    expect(store.getState().canvasData!.borderColor).toBe("#221E25");
  });

  it("control — Polaroid Clásica conserva la paleta DESACTIVADA en «Sin borde» (Ola 24)", () => {
    // Clásica con la foto ya a sangre total (placeholder ≠ rect base → full-bleed).
    const store = setup({
      slug: "photo-pack-polaroid-clasica",
      unitTemplate: unitOf(PH_FULL),
      templateCanvas: unitOf(PH_INSET),
      borderColor: null,
    });

    fireEvent.click(screen.getByRole("radio", { name: "Negro" }));
    expect(screen.getByRole("radio", { name: "Negro" })).toBeDisabled();
    expect(screen.getByText(/la foto cubre toda la tarjeta/)).toBeInTheDocument();
    expect(store.getState().canvasData!.borderColor).toBeNull();
  });
});

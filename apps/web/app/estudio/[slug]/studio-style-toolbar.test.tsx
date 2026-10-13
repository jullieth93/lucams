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

// El tooltip radix del swatch «Personalizado» (Hint) abre al enfocar el trigger
// y usa ResizeObserver via react-use-size, ausente en jsdom → stub global
// (mismo patrón de studio-toolbar.test.tsx / global-search.test.tsx).
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

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
  /** Opciones de marco del producto; default binario IG. */
  frameOptions?: string[];
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
      <StudioStyleToolbar store={store} frameOptions={opts.frameOptions ?? ["blanco", "negro"]} />
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

/*
 * Cuadrados (tarjeta simple) — el toggle «Borde de foto» gobierna borderColor
 * (bug fix 2026-10-12): el render de la tarjeta simple recalcula la ventana con
 * simpleCardPhotoRect a partir de borderColor e ignora el rect del placeholder,
 * así que el toggle que solo movía el rect no cambiaba el canvas. Contrato:
 *  1. «Sin borde» → borderColor null (foto a sangre total) y paleta DESACTIVADA
 *     con aviso (mismo patrón de la Clásica).
 *  2. Boot sin borderColor (el default del producto, "sin bordes") → el toggle
 *     abre en «Sin borde»; «Con borde» cae al primer color de la paleta.
 *  3. No-reset: el color elegido se conserva al ir y volver de «Sin borde».
 *  4. El ∅ «Sin color» de la paleta equivale a «Sin borde» (mismo estado).
 */
const PH_CARD_INSET = {
  id: "ph",
  type: "image-placeholder",
  x: 24,
  y: 24,
  width: 552,
  height: 552,
};

function squareUnit(): CanvasDataV1 {
  return {
    version: 1,
    stage: { width: 600, height: 600 },
    layers: [{ id: "bg", type: "background", color: "#FFFFFF" }, PH_CARD_INSET],
  } as unknown as CanvasDataV1;
}

describe("StudioStyleToolbar — Cuadrados: el toggle Con/Sin borde gobierna borderColor", () => {
  it("«Sin borde» pone borderColor null (sangre total) y desactiva la paleta con aviso", () => {
    const store = setup({
      slug: "cuadrados-simple",
      unitTemplate: squareUnit(),
      borderColor: "#E85B9F",
      frameOptions: ["blanco", "rosa"],
    });

    fireEvent.click(screen.getByRole("radio", { name: "Sin borde" }));

    expect(store.getState().canvasData!.borderColor).toBeNull();
    expect(screen.getByRole("radio", { name: "Rosa" })).toBeDisabled();
    expect(screen.getByText(/la foto cubre toda la tarjeta/)).toBeInTheDocument();
  });

  it("boot sin borderColor abre en «Sin borde»; «Con borde» cae al primer color de la paleta", () => {
    const store = setup({
      slug: "cuadrados-simple",
      unitTemplate: squareUnit(),
      borderColor: null,
      frameOptions: ["blanco", "rosa"],
    });

    expect(screen.getByRole("radio", { name: "Sin borde" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Rosa" })).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: "Con borde" }));

    expect(store.getState().canvasData!.borderColor).toBe("#FFFFFF");
    expect(screen.getByRole("radio", { name: "Rosa" })).toBeEnabled();
  });

  it("no-reset: el color elegido se conserva al ir a «Sin borde» y volver a «Con borde»", () => {
    const store = setup({
      slug: "cuadrados-simple",
      unitTemplate: squareUnit(),
      borderColor: "#E85B9F",
      frameOptions: ["blanco", "rosa"],
    });

    fireEvent.click(screen.getByRole("radio", { name: "Sin borde" }));
    expect(store.getState().canvasData!.borderColor).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Con borde" }));

    expect(store.getState().canvasData!.borderColor).toBe("#E85B9F");
  });

  it("el ∅ «Sin color» de la paleta equivale a «Sin borde» (toggle y apagado coherentes)", () => {
    const store = setup({
      slug: "cuadrados-simple",
      unitTemplate: squareUnit(),
      borderColor: "#E85B9F",
      frameOptions: ["blanco", "rosa"],
    });

    fireEvent.click(screen.getByRole("radio", { name: "Sin color" }));

    expect(store.getState().canvasData!.borderColor).toBeNull();
    expect(screen.getByRole("radio", { name: "Sin borde" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Rosa" })).toBeDisabled();
  });
});

/*
 * «Personalizado» — picker propio (components/color-picker.tsx) en la paleta de
 * tarjeta (2026-10-12). Antes era un <input type="color"> nativo: rejilla fija
 * de ~20 colores en Android/Linux. Contrato:
 *  1. El swatch arcoíris abre el panel inline (área sat/lum + tono + HEX).
 *  2. Un HEX escrito a mano entra a canvasData.borderColor NORMALIZADO
 *     (mayúsculas), igual que un swatch de la paleta.
 *  3. El trigger queda activo con el hex elegido y el panel se cierra con Escape.
 */
describe("StudioStyleToolbar — «Personalizado»: picker propio con paridad de plataformas", () => {
  it("abre el panel inline y un hex manual entra a borderColor normalizado", () => {
    const store = setup({
      slug: "cuadrados-simple",
      unitTemplate: squareUnit(),
      borderColor: "#FFFFFF", // «Con borde»: la paleta está habilitada
      frameOptions: ["blanco", "rosa"],
    });

    fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));

    const input = screen.getByRole("textbox", { name: "Código de color hexadecimal" });
    fireEvent.change(input, { target: { value: "#123abc" } });
    expect(store.getState().canvasData!.borderColor).toBe("#123ABC");

    // El trigger refleja el color libre y queda marcado como activo.
    const trigger = screen.getByRole("button", { name: "Personalizado" });
    expect(trigger.style.background).toContain("rgb(18, 58, 188)");

    fireEvent.keyDown(screen.getByRole("group", { name: "Personalizado" }), { key: "Escape" });
    expect(
      screen.queryByRole("textbox", { name: "Código de color hexadecimal" }),
    ).not.toBeInTheDocument();
  });

  it("un hex inválido NO toca borderColor (validación del campo HEX)", () => {
    const store = setup({
      slug: "cuadrados-simple",
      unitTemplate: squareUnit(),
      borderColor: "#FFFFFF",
      frameOptions: ["blanco", "rosa"],
    });

    fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Código de color hexadecimal" }), {
      target: { value: "zz" },
    });

    expect(store.getState().canvasData!.borderColor).toBe("#FFFFFF");
  });
});

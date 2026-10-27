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
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  /** Rango de grosor de borde habilitado por el admin (2026-10-26). */
  borderWidth?: { min: number; max: number; default: number } | null;
  /** Factor ya persistido en el canvas (diseño recuperado). */
  borderWidthFactor?: number;
  /** Grilla de tira photobooth (1 col, gap 0, varios slots). */
  strip?: boolean;
}) {
  const template = {
    id: `tpl-${opts.slug}`,
    slug: opts.slug,
    name: opts.slug,
    previewUrl: "/templates/ig_post_3x4.svg",
    canvasData: opts.templateCanvas ?? opts.unitTemplate,
  } as unknown as StudioTemplate;
  const store = createStudioStore();
  const canvas = canvasOf(opts.unitTemplate, opts.borderColor);
  if (opts.strip) canvas.gridLayout = { cols: 1, rows: 2, gap: 0 };
  if (opts.borderWidthFactor !== undefined) canvas.borderWidthFactor = opts.borderWidthFactor;
  store.getState().init({
    designId: "d1",
    productSlug: "polaroid",
    canvasData: canvas,
    templates: [template],
    selectedTemplateId: template.id,
  });
  render(
    <TooltipProvider>
      <StudioStyleToolbar
        store={store}
        frameOptions={opts.frameOptions ?? ["blanco", "negro"]}
        borderWidth={opts.borderWidth ? { enabled: true, ...opts.borderWidth } : null}
      />
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

    // 2026-10-19 — el trigger conserva el gradiente multicolor como affordance
    // (se puede re-abrir el picker) y el hex elegido va en el DISCO INTERIOR.
    const trigger = screen.getByRole("button", { name: "Personalizado" });
    expect(trigger.style.background).toContain("conic-gradient");
    const innerDisc = trigger.querySelector("span[aria-hidden]");
    expect(innerDisc).not.toBeNull();
    expect((innerDisc as HTMLElement).style.backgroundColor).toBe("rgb(18, 58, 188)");

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

/*
 * Bottom-sheet de estilo en móvil (Fase 2 UX, 2026-10-13). En <sm la fila con
 * scroll horizontal se reemplaza por un botón resumen SIEMPRE visible (swatch +
 * nombre del color elegido + estado del borde) que abre un Sheet inferior con
 * las secciones en grilla (sin scroll) y un «Listo» sticky que solo cierra —
 * la selección escribe el MISMO store y aplica en vivo al canvas. Contrato:
 *  1. El resumen anuncia el estado actual (aria + visible) y abre el sheet.
 *  2. Elegir un color DENTRO del sheet aplica en vivo (mismo store) y el
 *     nombre del elegido queda visible bajo la grilla.
 *  3. «Listo» cierra el sheet y el resumen refleja el nuevo estado.
 *  4. «Sin borde» dentro del sheet gobierna borderColor igual que en desktop
 *     (tarjeta simple: null = sangre total).
 * En jsdom no hay media queries: la rama desktop (hidden sm:block) y la móvil
 * (sm:hidden) conviven en el DOM — por eso las consultas del sheet se acotan
 * con within(dialog); Radix además aria-oculta el resto mientras está abierto.
 */
describe("StudioStyleToolbar — bottom-sheet de estilo en móvil (2026-10-13)", () => {
  const RESUMEN_NAME = "Estilo actual: Con borde, color Rosa. Toca para cambiarlo.";

  it("el botón resumen muestra el estado actual y abre el sheet con las dos secciones", async () => {
    setup({
      slug: "cuadrados-simple",
      unitTemplate: squareUnit(),
      borderColor: "#E85B9F",
      frameOptions: ["blanco", "rosa"],
    });

    const resumen = screen.getByRole("button", { name: RESUMEN_NAME });
    expect(resumen).toHaveTextContent("Rosa");
    expect(resumen).toHaveTextContent("Con borde");

    fireEvent.click(resumen);

    const sheet = await screen.findByRole("dialog", { name: "Estilo de tu tarjeta" });
    expect(within(sheet).getByRole("radiogroup", { name: "Borde de foto" })).toBeInTheDocument();
    expect(within(sheet).getByRole("radiogroup", { name: "Color de tarjeta" })).toBeInTheDocument();
    // Nombre del color elegido visible bajo la grilla (refuerzo del indicador).
    expect(within(sheet).getByText("Elegido: Rosa")).toBeInTheDocument();
  });

  it("elegir color dentro del sheet aplica al canvas en vivo y «Listo» cierra", async () => {
    const store = setup({
      slug: "cuadrados-simple",
      unitTemplate: squareUnit(),
      borderColor: "#E85B9F",
      frameOptions: ["blanco", "rosa"],
    });

    fireEvent.click(screen.getByRole("button", { name: RESUMEN_NAME }));
    const sheet = await screen.findByRole("dialog", { name: "Estilo de tu tarjeta" });

    fireEvent.click(within(sheet).getByRole("radio", { name: "Blanco" }));

    // Aplica en vivo al MISMO store (no es un wizard con apply).
    expect(store.getState().canvasData!.borderColor).toBe("#FFFFFF");
    expect(within(sheet).getByText("Elegido: Blanco")).toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole("button", { name: "Listo" }));

    await vi.waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    // El resumen refleja el nuevo estado elegido.
    expect(
      screen.getByRole("button", {
        name: "Estilo actual: Con borde, color Blanco. Toca para cambiarlo.",
      }),
    ).toBeInTheDocument();
  });

  it("«Sin borde» dentro del sheet gobierna borderColor (sangre total) y la paleta se apaga", async () => {
    const store = setup({
      slug: "cuadrados-simple",
      unitTemplate: squareUnit(),
      borderColor: "#E85B9F",
      frameOptions: ["blanco", "rosa"],
    });

    fireEvent.click(screen.getByRole("button", { name: RESUMEN_NAME }));
    const sheet = await screen.findByRole("dialog", { name: "Estilo de tu tarjeta" });

    fireEvent.click(within(sheet).getByRole("radio", { name: "Sin borde" }));

    expect(store.getState().canvasData!.borderColor).toBeNull();
    // Mismo apagado de Ola 24 dentro del sheet: paleta inerte con aviso.
    expect(within(sheet).getByRole("radio", { name: "Rosa" })).toBeDisabled();
    expect(within(sheet).getByText(/la foto cubre toda la tarjeta/)).toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole("button", { name: "Listo" }));

    await vi.waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", {
        name: "Estilo actual: Sin borde, color Sin color. Toca para cambiarlo.",
      }),
    ).toBeInTheDocument();
  });
});

/*
 * Slider de GROSOR del borde (owner 2026-10-26): el admin habilita el rango por
 * producto (personalizationSchema.borderWidth), el cliente elige dentro de él y
 * el factor persiste en canvasData.borderWidthFactor (producción lo consume
 * igual — WYSIWYG). Contrato:
 *  1. Solo aparece si el producto lo habilita Y la plantilla lo consume
 *     (Cuadrados tarjeta simple / Tiras).
 *  2. Diseño sin el campo → el slider arranca en el DEFAULT del rango
 *     (retrocompat); el valor elegido escribe al store (undo + auto-save).
 *  3. Un valor persistido FUERA del rango vigente se muestra clampado.
 *  4. Con «Sin borde» el slider queda visible pero INERTE (no hay borde que
 *     engordar) y el valor se conserva para «Con borde».
 */
describe("StudioStyleToolbar — slider de grosor del borde (2026-10-26)", () => {
  const RANGE = { min: 1, max: 2.5, default: 1.5 };

  it("aparece en Cuadrados con el producto habilitado y escribe el factor al store (clamp incluido)", () => {
    const store = setup({
      slug: "cuadrados-simple",
      unitTemplate: squareUnit(),
      borderColor: "#E85B9F",
      frameOptions: ["blanco", "rosa"],
      borderWidth: RANGE,
    });
    const slider = screen.getByLabelText("Grosor del borde") as HTMLInputElement;
    // Sin valor persistido → el slider abre en el default del producto (150%).
    expect(slider.value).toBe("1.5");
    expect(screen.getByText("· 150%")).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: "2.25" } });
    expect(store.getState().canvasData!.borderWidthFactor).toBe(2.25);
  });

  it("también aplica a la tira photobooth (grilla 1 col, gap 0)", () => {
    setup({
      slug: "tira-photobooth",
      unitTemplate: squareUnit(),
      borderColor: "#E85B9F",
      frameOptions: ["blanco", "rosa"],
      strip: true,
      borderWidth: RANGE,
    });
    expect(screen.getByLabelText("Grosor del borde")).toBeInTheDocument();
  });

  it("un factor persistido FUERA del rango vigente se muestra clampado (el admin estrechó el rango)", () => {
    setup({
      slug: "cuadrados-simple",
      unitTemplate: squareUnit(),
      borderColor: "#E85B9F",
      frameOptions: ["blanco", "rosa"],
      borderWidth: RANGE,
      borderWidthFactor: 5, // quedó por encima del nuevo max (2.5)
    });
    const slider = screen.getByLabelText("Grosor del borde") as HTMLInputElement;
    expect(slider.value).toBe("2.5");
    expect(screen.getByText("· 250%")).toBeInTheDocument();
  });

  it("sin la config del producto NO hay slider (producto sin el feature)", () => {
    setup({
      slug: "cuadrados-simple",
      unitTemplate: squareUnit(),
      borderColor: "#E85B9F",
      frameOptions: ["blanco", "rosa"],
    });
    expect(screen.queryByLabelText("Grosor del borde")).not.toBeInTheDocument();
  });

  it("con «Sin borde» el slider queda inerte y el valor se conserva para «Con borde»", () => {
    const store = setup({
      slug: "cuadrados-simple",
      unitTemplate: squareUnit(),
      borderColor: "#E85B9F",
      frameOptions: ["blanco", "rosa"],
      borderWidth: RANGE,
      borderWidthFactor: 2,
    });
    const slider = screen.getByLabelText("Grosor del borde") as HTMLInputElement;
    expect(slider.value).toBe("2");

    // En Cuadrados «Sin borde» = borderColor null (sangre total) → sin borde
    // que engordar: el slider se deshabilita PERO el factor elegido sobrevive.
    fireEvent.click(screen.getByRole("radio", { name: "Sin borde" }));
    expect((screen.getByLabelText("Grosor del borde") as HTMLInputElement).disabled).toBe(true);
    expect(store.getState().canvasData!.borderWidthFactor).toBe(2);

    // Al volver a «Con borde» el slider revive con el mismo valor.
    fireEvent.click(screen.getByRole("radio", { name: "Con borde" }));
    expect((screen.getByLabelText("Grosor del borde") as HTMLInputElement).disabled).toBe(false);
    expect(store.getState().canvasData!.borderWidthFactor).toBe(2);
  });
});

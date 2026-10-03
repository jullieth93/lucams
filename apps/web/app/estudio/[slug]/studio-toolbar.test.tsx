// @vitest-environment jsdom

/*
 * Test de componente — StudioToolbar: botón «Vista previa» (Lucy 2026-09-09).
 *
 * Blinda el renombrado «¡Listo!» → «Vista previa» y el feedback de
 * PROCESAMIENTO del botón principal:
 *   1. Diseño completo → habilitado, rótulo «Vista previa» y nombre audible
 *      que empieza con el texto visible (WCAG 2.5.3 label-in-name).
 *   2. Diseño incompleto → deshabilitado con tooltip de fotos faltantes.
 *   3. isPreviewBuilding → spinner + «Preparando…» + aria-busy + disabled.
 *   4. isFinalizing (store, tras confirmar en la modal) → «Guardando diseño...».
 *
 * Los textos CMS caen al DEFAULT_STUDIO_TEXTS sin provider (mismo patrón que
 * studio-preview-modal.test.tsx). El store es una instancia real de zustand.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StudioToolbar } from "./studio-toolbar";
import { createStudioStore } from "./lib/store";
import type { CanvasDataV2 } from "./types";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ReactElement } from "react";

// El tooltip de marca (Hint, radix) exige un Provider — en la app lo monta
// app/layout.tsx. delayDuration 0 para que abra al instante en los asserts.
function renderStudio(ui: ReactElement) {
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
}

// El popover de radix (Fase 1A) usa ResizeObserver via react-use-size, ausente
// en jsdom → stub global (mismo patrón de global-search.test.tsx).
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

afterEach(() => cleanup());

function makeCanvasData(filled: number, total = 2): CanvasDataV2 {
  return {
    version: 2,
    unitTemplate: {
      version: 1,
      stage: { width: 1080, height: 1080 },
      layers: [{ id: "bg", type: "background", color: "#FFFFFF" }],
    },
    slotCount: total,
    slots: Array.from({ length: total }, (_, i) => ({
      slotIndex: i,
      assetId: i < filled ? `asset-${i}` : null,
      assetUrl: i < filled ? `https://img/${i}.jpg` : null,
    })),
    gridLayout: { cols: 2, rows: 1, gap: 16 },
  };
}

function setup(opts?: { filled?: number; isPreviewBuilding?: boolean }) {
  const store = createStudioStore();
  store.getState().init({
    designId: "d1",
    productSlug: "fotoimanes-cuadrados",
    canvasData: makeCanvasData(opts?.filled ?? 2),
    templates: [],
  });
  const onFinalize = vi.fn();
  renderStudio(
    <StudioToolbar
      store={store}
      productName="Fotoimanes cuadrados"
      productSlug="fotoimanes-cuadrados"
      isPreviewBuilding={opts?.isPreviewBuilding}
      onFinalize={onFinalize}
    />,
  );
  return { store, onFinalize };
}

describe("StudioToolbar — botón «Vista previa»", () => {
  it("diseño completo: habilitado, con el rótulo nuevo y nombre audible coherente", () => {
    setup({ filled: 2 });
    const btn = screen.getByRole("button", { name: "Vista previa de tu pedido" });
    expect(btn).toBeEnabled();
    expect(btn).toHaveTextContent("Vista previa");
    expect(btn).toHaveAttribute("aria-busy", "false");
  });

  it("diseño incompleto: deshabilitado con tooltip/aria de fotos faltantes", () => {
    setup({ filled: 1 });
    const btn = screen.getByRole("button", {
      name: "Faltan 1 fotos por cargar para ver la vista previa",
    });
    expect(btn).toBeDisabled();
  });

  it("mientras compone la vista previa: spinner «Preparando…», disabled y aria-busy", () => {
    const { onFinalize } = setup({ filled: 2, isPreviewBuilding: true });
    const btn = screen.getByRole("button", { name: "Vista previa de tu pedido" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toHaveTextContent("Preparando…");
    expect(btn.querySelector("svg.animate-spin")).not.toBeNull();
    // No dispara otro finalize estando ocupado.
    btn.click();
    expect(onFinalize).not.toHaveBeenCalled();
  });

  it("isFinalizing (confirmación en curso): «Guardando diseño...» + aria-busy", () => {
    const { store } = setup({ filled: 2 });
    act(() => store.getState().setIsFinalizing(true));
    const btn = screen.getByRole("button", { name: "Vista previa de tu pedido" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toHaveTextContent("Guardando diseño...");
  });

  it("Ola 26 — finalizeBlockReason (textos requeridos IG): bloqueado CON las fotos completas, tooltip con los campos", async () => {
    const store = createStudioStore();
    store.getState().init({
      designId: "d1",
      productSlug: "fotoimanes-polaroid",
      canvasData: makeCanvasData(2), // fotos completas: el bloqueo es por TEXTOS
      templates: [],
    });
    const onFinalize = vi.fn();
    const reason = "Completa los textos de tu diseño para ver la vista previa: usuario, hashtags";
    const { rerender } = renderStudio(
      <StudioToolbar
        store={store}
        productName="Fotoimanes Polaroid"
        productSlug="fotoimanes-polaroid"
        finalizeBlockReason={reason}
        onFinalize={onFinalize}
      />,
    );
    // Botón deshabilitado con el motivo como tooltip y nombre audible (patrón
    // del bloqueo por fotos faltantes).
    const btn = screen.getByRole("button", { name: reason });
    expect(btn).toBeDisabled();
    // El motivo ya no viaja en el title nativo: es el tooltip de marca (Hint),
    // que abre con foco de teclado sobre el wrapper focusable (el botón está
    // disabled y no recibe foco).
    const hintTrigger = btn.parentElement!;
    expect(hintTrigger).toHaveAttribute("data-slot", "tooltip-trigger");
    await act(async () => {
      fireEvent.focus(hintTrigger);
    });
    expect(await screen.findByRole("tooltip")).toHaveTextContent(reason);
    btn.click();
    expect(onFinalize).not.toHaveBeenCalled();
    // Sin el motivo (el cliente ya escribió los textos) → habilitado de nuevo.
    rerender(
      <TooltipProvider delayDuration={0}>
        <StudioToolbar
          store={store}
          productName="Fotoimanes Polaroid"
          productSlug="fotoimanes-polaroid"
          finalizeBlockReason={null}
          onFinalize={onFinalize}
        />
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "Vista previa de tu pedido" })).toBeEnabled();
  });

  // 2026-09-22 — cara B opcional (separadores backOptional): el guard exige
  // solo las caras A (slots pares); las B vacías no bloquean «Vista previa».
  it("backOptional: con caras A completas y B vacías, «Vista previa» habilitado", () => {
    const store = createStudioStore();
    store.getState().init({
      designId: "d1",
      productSlug: "separadores-magneticos",
      canvasData: makeCanvasData(0, 4), // 2 unidades × 2 caras
      templates: [],
    });
    // Llenar solo las caras A (slots 0 y 2).
    const canvas = store.getState().canvasData!;
    store.getState().init({
      designId: "d1",
      productSlug: "separadores-magneticos",
      canvasData: {
        ...canvas,
        slots: canvas.slots.map((s) =>
          s.slotIndex % 2 === 0 ? { ...s, assetId: "a", assetUrl: "https://img/a.jpg" } : s,
        ),
      },
      templates: [],
    });
    const onFinalize = vi.fn();
    renderStudio(
      <StudioToolbar
        store={store}
        productName="Separadores magnéticos"
        productSlug="separadores-magneticos"
        backOptional
        onFinalize={onFinalize}
      />,
    );
    expect(screen.getByRole("button", { name: "Vista previa de tu pedido" })).toBeEnabled();
  });

  it("backOptional: falta una cara A → bloqueado contando solo las A faltantes", () => {
    const store = createStudioStore();
    store.getState().init({
      designId: "d1",
      productSlug: "separadores-magneticos",
      canvasData: makeCanvasData(0, 4),
      templates: [],
    });
    const canvas = store.getState().canvasData!;
    store.getState().init({
      designId: "d1",
      productSlug: "separadores-magneticos",
      canvasData: {
        ...canvas,
        slots: canvas.slots.map((s) =>
          // Llena la cara A de la unidad 1 y la B de la unidad 2: sigue
          // faltando UNA cara A (slot 2) — la B no salva el guard.
          s.slotIndex === 0 || s.slotIndex === 3
            ? { ...s, assetId: "a", assetUrl: "https://img/a.jpg" }
            : s,
        ),
      },
      templates: [],
    });
    renderStudio(
      <StudioToolbar
        store={store}
        productName="Separadores magnéticos"
        productSlug="separadores-magneticos"
        backOptional
        onFinalize={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Faltan 1 fotos por cargar para ver la vista previa" }),
    ).toBeDisabled();
  });

  // Fase 1A (2026-09-27) — popover "qué falta": reemplaza al tooltip nativo con
  // un listado visible de las fotos faltantes (label de cada slot).
  it("popover de faltantes: lista las fotos por cargar con la label de cada slot", async () => {
    const store = createStudioStore();
    store.getState().init({
      designId: "d1",
      productSlug: "calendario-magnetico",
      canvasData: makeCanvasData(10, 12), // faltan los slots 10 y 11
      templates: [],
    });
    const months = [
      "Ene",
      "Feb",
      "Mar",
      "Abr",
      "May",
      "Jun",
      "Jul",
      "Ago",
      "Sep",
      "Oct",
      "Nov",
      "Dic",
    ];
    renderStudio(
      <StudioToolbar
        store={store}
        productName="Calendario magnético"
        productSlug="calendario-magnetico"
        slotLabels={months}
        onFinalize={vi.fn()}
      />,
    );
    // Bloqueado: el botón interno conserva su nombre/tooltip y el trigger del
    // popover tiene nombre audible propio (accesible por teclado).
    expect(
      screen.getByRole("button", { name: "Faltan 2 fotos por cargar para ver la vista previa" }),
    ).toBeDisabled();
    const trigger = screen.getByRole("button", { name: "Qué falta para ver la vista previa" });
    fireEvent.click(trigger);
    expect(await screen.findByText("Para ver tu vista previa te falta:")).toBeInTheDocument();
    expect(screen.getByText("Fotos por cargar:")).toBeInTheDocument();
    expect(screen.getByText("Nov")).toBeInTheDocument();
    expect(screen.getByText("Dic")).toBeInTheDocument();
    // Sin labels cae al número de slot (1-based).
    cleanup();
    renderStudio(
      <StudioToolbar
        store={store}
        productName="Calendario magnético"
        productSlug="calendario-magnetico"
        onFinalize={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Qué falta para ver la vista previa" }));
    expect(await screen.findByText("11")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("diseño completo: sin popover (el botón se habilita normal)", () => {
    setup({ filled: 2 });
    expect(
      screen.queryByRole("button", { name: "Qué falta para ver la vista previa" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vista previa de tu pedido" })).toBeEnabled();
  });
});

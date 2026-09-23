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
import { act, cleanup, render, screen } from "@testing-library/react";
import { StudioToolbar } from "./studio-toolbar";
import { createStudioStore } from "./lib/store";
import type { CanvasDataV2 } from "./types";

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
  render(
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

  it("Ola 26 — finalizeBlockReason (textos requeridos IG): bloqueado CON las fotos completas, tooltip con los campos", () => {
    const store = createStudioStore();
    store.getState().init({
      designId: "d1",
      productSlug: "fotoimanes-polaroid",
      canvasData: makeCanvasData(2), // fotos completas: el bloqueo es por TEXTOS
      templates: [],
    });
    const onFinalize = vi.fn();
    const reason = "Completa los textos de tu diseño para ver la vista previa: usuario, hashtags";
    const { rerender } = render(
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
    expect(btn).toHaveAttribute("title", reason);
    btn.click();
    expect(onFinalize).not.toHaveBeenCalled();
    // Sin el motivo (el cliente ya escribió los textos) → habilitado de nuevo.
    rerender(
      <StudioToolbar
        store={store}
        productName="Fotoimanes Polaroid"
        productSlug="fotoimanes-polaroid"
        finalizeBlockReason={null}
        onFinalize={onFinalize}
      />,
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
    render(
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
    render(
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
});

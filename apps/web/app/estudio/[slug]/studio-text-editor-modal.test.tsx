// @vitest-environment jsdom

/*
 * Test del StudioTextEditorForm — Lucy 2026-09-08: el botón «Aplicar» no mostraba
 * NINGÚN feedback de procesamiento (el commit es casi instantáneo pero el usuario
 * no sabía si había funcionado). Estos tests blindan el estado de procesamiento:
 * spinner + disabled desde el click hasta que el apply completa, y que el override
 * aplicado sigue siendo el correcto (solo campos que difieren del base).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StudioTextEditorForm } from "./studio-text-editor-modal";
import type { TextLayer } from "./types";

// jsdom no trae ResizeObserver (lo pide el Slider de Radix) — stub mínimo.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}

const LAYER: TextLayer = {
  id: "message",
  type: "text",
  x: 225,
  y: 512,
  text: "Escribe tu mensaje",
  fontFamily: "Fredoka",
  fontSize: 34,
  editable: true,
} as TextLayer;

afterEach(cleanup);

describe("StudioTextEditorForm — estado de procesamiento de «Aplicar» (Lucy 2026-09-08)", () => {
  it("al hacer click en Aplicar: spinner + disabled, y luego aplica el override", async () => {
    const onApply = vi.fn();
    render(<StudioTextEditorForm layer={LAYER} currentOverride={undefined} onApply={onApply} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Te amo mamá" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    // Estado de procesamiento visible de inmediato.
    const busyBtn = screen.getByRole("button", { name: /aplicando/i });
    expect(busyBtn).toBeDisabled();
    expect(busyBtn).toHaveAttribute("aria-busy", "true");

    // El commit va un frame después (el spinner pinta primero).
    await waitFor(() => expect(onApply).toHaveBeenCalledWith({ text: "Te amo mamá" }));

    // Al completar, el botón vuelve a su estado normal.
    await waitFor(() => expect(screen.getByRole("button", { name: "Aplicar" })).toBeEnabled(), {
      timeout: 1500,
    });
  });

  it("sin cambios aplica null (limpia el override) — también con feedback", async () => {
    const onApply = vi.fn();
    render(<StudioTextEditorForm layer={LAYER} currentOverride={undefined} onApply={onApply} />);

    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(screen.getByRole("button", { name: /aplicando/i })).toBeDisabled();
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(null));
  });
});

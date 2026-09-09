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

describe("StudioTextEditorForm — placeholder gris, nunca valor precargado (Ola 25, 2026-09-09)", () => {
  it("el input arranca VACÍO y muestra el default de la plantilla como placeholder", () => {
    render(<StudioTextEditorForm layer={LAYER} currentOverride={undefined} onApply={vi.fn()} />);
    const input = screen.getByRole("textbox");
    // Regla del dueño: la tarjeta nace sin texto — el default NO es el valor.
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("placeholder", "Escribe tu mensaje");
  });

  it("aplicar SIN escribir nada → null (la tarjeta queda sin texto, nada se imprime)", async () => {
    const onApply = vi.fn();
    render(<StudioTextEditorForm layer={LAYER} currentOverride={undefined} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(null));
  });

  it("escribir EXACTAMENTE el default SÍ guarda override.text (el cliente lo eligió)", async () => {
    // Antes el default precargado hacía que escribirlo fuera un no-op (text ===
    // layer.text → sin override → no se imprimía). Con el input vacío de entrada,
    // tipearlo es una elección explícita → viaja como texto del cliente.
    const onApply = vi.fn();
    render(<StudioTextEditorForm layer={LAYER} currentOverride={undefined} onApply={onApply} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Escribe tu mensaje" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith({ text: "Escribe tu mensaje" }));
  });

  it("con texto del cliente previo, el input SÍ arranca con ese texto (re-edición)", () => {
    render(
      <StudioTextEditorForm
        layer={LAYER}
        currentOverride={{ text: "Mi viaje" }}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("Mi viaje");
  });

  it("borrar el texto que tenía y aplicar → null (vacío = sin texto en la tarjeta)", async () => {
    const onApply = vi.fn();
    render(
      <StudioTextEditorForm
        layer={LAYER}
        currentOverride={{ text: "Mi viaje" }}
        onApply={onApply}
      />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(null));
  });

  it("«Volver al original» deja el input vacío (el default vuelve como placeholder gris)", () => {
    render(
      <StudioTextEditorForm
        layer={LAYER}
        currentOverride={{ text: "Mi viaje" }}
        onApply={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /volver al original/i }));
    expect(screen.getByRole("textbox")).toHaveValue("");
  });
});

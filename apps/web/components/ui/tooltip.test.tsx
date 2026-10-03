// @vitest-environment jsdom
/*
 * Test de componente — Tooltip/Hint (primitivo de marca que reemplaza el
 * `title=` nativo). Fija el contrato del atajo <Hint>: contenido vacío o
 * ausente debe renderizar el trigger pelado (sin tooltip), y con contenido
 * el trigger queda asociado al tooltip accesible de radix.
 */

import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Hint, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

// jsdom no implementa ResizeObserver (radix Popper lo usa al montar el
// contenido). Stub mínimo local, mismo patrón que otros tests UI del repo.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver ?? ResizeObserverStub;

afterEach(cleanup);

describe("Hint (atajo de migración title= → tooltip)", () => {
  it("con contenido envuelve el trigger sin romper su render", () => {
    render(
      <TooltipProvider>
        <Hint content="Ayuda contextual">
          <button type="button">Guardar</button>
        </Hint>
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("sin contenido (null/empty) renderiza el trigger pelado", () => {
    render(
      <TooltipProvider>
        <Hint content={null}>
          <button type="button">Pelado</button>
        </Hint>
      </TooltipProvider>,
    );
    const btn = screen.getByRole("button", { name: "Pelado" });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toHaveAttribute("data-slot", "tooltip-trigger");
  });

  it("muestra el contenido al enfocar el trigger (accesible por teclado)", async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Hint content="Texto de ayuda">
          <button type="button">Info</button>
        </Hint>
      </TooltipProvider>,
    );
    // Radix abre el tooltip con foco de teclado (no solo hover).
    await act(async () => {
      fireEvent.focus(screen.getByRole("button", { name: "Info" }));
    });
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Texto de ayuda");
  });
});

describe("Tooltip composicional", () => {
  it("Trigger + Content funcionan con asChild", () => {
    expect(() =>
      render(
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <a href="/x">Enlace</a>
            </TooltipTrigger>
            <TooltipContent>Ayuda</TooltipContent>
          </Tooltip>
        </TooltipProvider>,
      ),
    ).not.toThrow();
    expect(screen.getByRole("link", { name: "Enlace" })).toBeInTheDocument();
  });
});

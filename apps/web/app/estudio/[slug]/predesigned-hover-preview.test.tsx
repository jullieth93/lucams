// @vitest-environment jsdom

/*
 * Test de PredesignedHoverPreview (2026-10-26 — bugs del tap en móvil):
 *
 *  1. En puntero COARSE (táctil, `(pointer: coarse)`) el HoverCard NO se
 *     monta: radix también abre al ENFOCAR el trigger y en táctil el tap
 *     enfoca → la tarjeta flotante (portal body, z-50) quedaba SOBRE el modal
 *     de reemplazo/picker que el mismo tap abre. En táctil el preview lo da
 *     el botón «Ver» (PredesignedViewDialog).
 *  2. En desktop el trigger conserva el comportamiento radix (data-state) y
 *     el estado es CONTROLADO: el click del trigger (aplicar) cierra la
 *     tarjeta en el momento (no queda flotando sobre lo que la acción abre).
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PredesignedHoverPreview } from "./predesigned-hover-preview";

function stubPointerCoarse(coarse: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query === "(pointer: coarse)" ? coarse : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function renderCard() {
  const onApply = vi.fn();
  render(
    <PredesignedHoverPreview name="Diseño 1" imageUrl="https://cdn.example/g1.png">
      <button type="button" onClick={onApply}>
        Aplicar el diseño Diseño 1 al slot
      </button>
    </PredesignedHoverPreview>,
  );
  return {
    onApply,
    trigger: screen.getByRole("button", { name: "Aplicar el diseño Diseño 1 al slot" }),
  };
}

afterEach(cleanup);

describe("PredesignedHoverPreview — gate táctil y cierre al aplicar (2026-10-26)", () => {
  it("en TÁCTIL no monta el HoverCard: el trigger queda limpio (sin data-state) y el tap aplica directo", () => {
    stubPointerCoarse(true);
    const { onApply, trigger } = renderCard();

    // Sin wrapper radix: nada que abrir al enfocar/tapear (no invade modales).
    expect(trigger).not.toHaveAttribute("data-state");
    // La acción de la tarjeta sigue intacta.
    trigger.focus();
    trigger.click();
    expect(onApply).toHaveBeenCalledTimes(1);
    // Y no aparece ninguna tarjeta flotante.
    expect(document.querySelector("[data-radix-hover-card-content]")).toBeNull();
  });

  it("en DESKTOP el HoverCard sí envuelve el trigger (radix data-state) y el click sigue aplicando", () => {
    stubPointerCoarse(false);
    const { onApply, trigger } = renderCard();

    // Trigger radix cerrado en reposo.
    expect(trigger).toHaveAttribute("data-state", "closed");
    trigger.click();
    expect(onApply).toHaveBeenCalledTimes(1);
    // El click del trigger cierra la tarjeta (estado controlado) — sigue closed.
    expect(trigger).toHaveAttribute("data-state", "closed");
  });
});

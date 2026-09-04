// @vitest-environment jsdom
/*
 * Test de componente — CopiesQtyInput (selector de copias en la PDP).
 *
 * Blinda el contrato del stepper de UNIDADES (Lucy 2026-09-03: ahora en TODOS
 * los productos, no solo en compra directa):
 *   1. Arranca en 1 y lo expone como <input type="hidden" name="qty"> para
 *      que viaje en el form de addToCartAction (rama de compra directa).
 *   2. +/− actualizan el hidden input (el valor que multiplica el checkout).
 *   3. Respeta el rango 1..99 (mismo tope de AddToCartSchema y del carrito).
 *   4. El label visible es "Unidades", NO "Cantidad" — esa palabra es de la
 *      dimensión de pack (composición), no de copias.
 *   5. Fuente de verdad ÚNICA en el SelectedVariantProvider: el EstudioCtaLink
 *      de la rama personalizable lleva el conteo al Estudio como ?copies=N.
 *
 * El estado vive en el provider del buy-box (H12): los tests envuelven el
 * stepper en SelectedVariantProvider, como hace la PDP real.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { CopiesQtyInput } from "./copies-qty-input";
import { SelectedVariantProvider, EstudioCtaLink } from "./variant-actions";

// Mock de next/navigation (el provider hace router.replace al cambiar la
// variante: side-effect del deep-link ?variant=). Mismo patrón que
// variant-selector.test.tsx.
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}));

// vitest.config usa globals:false → cleanup manual entre tests.
afterEach(() => cleanup());
beforeEach(() => replace.mockClear());

function renderStepper() {
  return render(
    <SelectedVariantProvider variantIds={["v1"]} initialId="v1">
      <CopiesQtyInput />
    </SelectedVariantProvider>,
  );
}

/** Hidden input que viaja en el form (no tiene rol accesible → se lee del DOM). */
function qtyHidden(): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>('input[name="qty"]');
  if (!el) throw new Error("No se encontró el input hidden qty");
  return el;
}

describe("CopiesQtyInput", () => {
  it("renderiza el grupo 'Unidades' (no 'Cantidad') y arranca en 1 con el hidden en sync", () => {
    renderStepper();
    const unidades = screen.getByRole("group", { name: "Unidades" });
    expect(within(unidades).getByText("1")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Cantidad" })).not.toBeInTheDocument();
    expect(qtyHidden().value).toBe("1");
  });

  it("+/− actualizan el conteo y el hidden input que viaja en el form", () => {
    renderStepper();
    const unidades = screen.getByRole("group", { name: "Unidades" });

    fireEvent.click(screen.getByLabelText("Aumentar unidades"));
    fireEvent.click(screen.getByLabelText("Aumentar unidades"));
    expect(within(unidades).getByText("3")).toBeInTheDocument();
    expect(qtyHidden().value).toBe("3");

    fireEvent.click(screen.getByLabelText("Disminuir unidades"));
    expect(within(unidades).getByText("2")).toBeInTheDocument();
    expect(qtyHidden().value).toBe("2");
  });

  it("respeta el mínimo 1: − queda deshabilitado y el hidden no baja de 1", () => {
    renderStepper();
    const decrease = screen.getByLabelText("Disminuir unidades");
    expect(decrease).toBeDisabled();

    fireEvent.click(decrease); // no-op por disabled, pero blindamos el valor
    expect(qtyHidden().value).toBe("1");
  });

  it("respeta el máximo 99 (tope de AddToCartSchema): + se deshabilita al llegar", () => {
    renderStepper();
    const unidades = screen.getByRole("group", { name: "Unidades" });
    const increase = screen.getByLabelText("Aumentar unidades");

    for (let i = 0; i < 98; i++) {
      fireEvent.click(increase);
    }
    expect(within(unidades).getByText("99")).toBeInTheDocument();
    expect(qtyHidden().value).toBe("99");
    expect(increase).toBeDisabled();
    expect(screen.getByLabelText("Disminuir unidades")).toBeEnabled();
  });

  it("el CTA al Estudio lleva las copias como ?copies=N (fuente de verdad compartida)", () => {
    render(
      <SelectedVariantProvider variantIds={["v1"]} initialId="v1">
        <CopiesQtyInput />
        <EstudioCtaLink slug="calendario-set-12-tarjetas" ctaNoun="producto" />
      </SelectedVariantProvider>,
    );
    const cta = screen.getByRole("link", { name: /Personalizar producto/ });
    // Sin copias elegidas (1): la URL queda limpia (default del Estudio).
    expect(cta).toHaveAttribute("href", "/estudio/calendario-set-12-tarjetas?variant=v1");

    fireEvent.click(screen.getByLabelText("Aumentar unidades"));
    fireEvent.click(screen.getByLabelText("Aumentar unidades"));
    expect(cta).toHaveAttribute("href", "/estudio/calendario-set-12-tarjetas?variant=v1&copies=3");

    // Volver a 1 quita el parámetro (la modal arranca en 1 por defecto).
    fireEvent.click(screen.getByLabelText("Disminuir unidades"));
    fireEvent.click(screen.getByLabelText("Disminuir unidades"));
    expect(cta).toHaveAttribute("href", "/estudio/calendario-set-12-tarjetas?variant=v1");
  });
});

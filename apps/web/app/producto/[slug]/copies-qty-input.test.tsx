// @vitest-environment jsdom
/*
 * Test de componente — CopiesQtyInput (selector de copias en la PDP).
 *
 * Blinda el contrato del stepper de UNIDADES de la rama de compra directa:
 *   1. Arranca en 1 y lo expone como <input type="hidden" name="qty"> para
 *      que viaje en el form de addToCartAction.
 *   2. +/− actualizan el hidden input (el valor que multiplica el checkout).
 *   3. Respeta el rango 1..99 (mismo tope de AddToCartSchema y del carrito).
 *   4. El label visible es "Unidades", NO "Cantidad" — esa palabra es de la
 *      dimensión de pack (composición), no de copias.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { CopiesQtyInput } from "./copies-qty-input";

// vitest.config usa globals:false → cleanup manual entre tests.
afterEach(() => cleanup());

/** Hidden input que viaja en el form (no tiene rol accesible → se lee del DOM). */
function qtyHidden(): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>('input[name="qty"]');
  if (!el) throw new Error("No se encontró el input hidden qty");
  return el;
}

describe("CopiesQtyInput", () => {
  it("renderiza el grupo 'Unidades' (no 'Cantidad') y arranca en 1 con el hidden en sync", () => {
    render(<CopiesQtyInput />);
    const unidades = screen.getByRole("group", { name: "Unidades" });
    expect(within(unidades).getByText("1")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Cantidad" })).not.toBeInTheDocument();
    expect(qtyHidden().value).toBe("1");
  });

  it("+/− actualizan el conteo y el hidden input que viaja en el form", () => {
    render(<CopiesQtyInput />);
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
    render(<CopiesQtyInput />);
    const decrease = screen.getByLabelText("Disminuir unidades");
    expect(decrease).toBeDisabled();

    fireEvent.click(decrease); // no-op por disabled, pero blindamos el valor
    expect(qtyHidden().value).toBe("1");
  });

  it("respeta el máximo 99 (tope de AddToCartSchema): + se deshabilita al llegar", () => {
    render(<CopiesQtyInput />);
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
});

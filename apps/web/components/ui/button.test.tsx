// @vitest-environment jsdom
/*
 * Test de componente — Button (regresión React #143).
 *
 * Regresión: con `asChild`, Button monta un Slot de Radix, que corre
 * React.Children.only sobre sus hijos. La versión previa renderizaba
 * SIEMPRE el hermano `{showSpinner && <Loader2/>}` — que con asChild vale
 * `false` — antes de `{children}`, produciendo [false, child] (count 2) →
 * "React.Children.only expected to receive a single React element child"
 * (#143). Eso reventaba el render en prod de /carrito y /checkout/gracias
 * (ambos usan <Button asChild><Link/></Button>). Estos tests fijan que
 * asChild pase UN solo hijo y que el spinner siga funcionando sin asChild.
 */

import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Button } from "./button";

afterEach(cleanup);

describe("Button", () => {
  it("asChild con un único hijo NO lanza React.Children.only (#143)", () => {
    // El render lanzaría #143 con la implementación previa (hermano `false`).
    expect(() =>
      render(
        <Button asChild>
          <a href="/checkout/datos">Ir a pagar</a>
        </Button>,
      ),
    ).not.toThrow();

    // El Slot proyecta las props del Button sobre el <a> (no hay <button> extra).
    const link = screen.getByRole("link", { name: "Ir a pagar" });
    expect(link).toHaveAttribute("data-slot", "button");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("asChild ignora loading (Slot exige un hijo único) y no lanza", () => {
    expect(() =>
      render(
        <Button asChild loading>
          <a href="/x">Continuar</a>
        </Button>,
      ),
    ).not.toThrow();
    // Sin spinner inyectado: el único hijo del Slot es el <a>.
    expect(screen.getByRole("link", { name: "Continuar" })).toBeInTheDocument();
  });

  it("sin asChild renderiza un <button> real y el spinner cuando loading", () => {
    render(<Button loading>Guardar</Button>);
    const btn = screen.getByRole("button", { name: "Guardar" });
    expect(btn).toBeDisabled();
    // El Loader2 de lucide se monta como <svg>.
    expect(btn.querySelector("svg")).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
/*
 * Test de componente — LinkPendingLabel (fix 1.5).
 *
 * Fija el contrato del indicador de navegación pendiente para Links primarios
 * ("Ir a pagar →" del carrito, CTAs de /checkout/gracias):
 *   1. En reposo renderiza la etiqueta intacta, sin spinner y aria-busy=false.
 *   2. Vive DENTRO de un <Link> (requisito de useLinkStatus) proyectado por
 *      Button asChild — un solo interactivo (#31 / regresión React #143).
 * El estado pending=true solo lo produce una navegación real (router), así que
 * acá se cubre el estado base; el camino pending queda fijado por el propio
 * hook de Next (useLinkStatus).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Link from "next/link";
import { Button } from "./button";
import { LinkPendingLabel } from "./link-pending-label";

afterEach(cleanup);

describe("LinkPendingLabel", () => {
  it("renderiza la etiqueta dentro del Link, sin spinner y aria-busy=false en reposo", () => {
    render(
      <Link href="/checkout/datos" prefetch={false}>
        <LinkPendingLabel>Ir a pagar →</LinkPendingLabel>
      </Link>,
    );
    const link = screen.getByRole("link", { name: "Ir a pagar →" });
    expect(link).toHaveAttribute("href", "/checkout/datos");
    const label = link.querySelector("[aria-busy]");
    expect(label).toHaveAttribute("aria-busy", "false");
    expect(link.querySelector("svg.animate-spin")).toBeNull();
  });

  it("compone con Button asChild: un solo interactivo (el <a>), sin #143", () => {
    expect(() =>
      render(
        <Button asChild size="lg">
          <Link href="/checkout/datos" prefetch={false}>
            <LinkPendingLabel>Ir a pagar →</LinkPendingLabel>
          </Link>
        </Button>,
      ),
    ).not.toThrow();
    const link = screen.getByRole("link", { name: "Ir a pagar →" });
    expect(link).toHaveAttribute("data-slot", "button");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

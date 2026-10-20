// @vitest-environment jsdom

/*
 * Test de componente — AccountNav (/mi-cuenta), 2026-10-20.
 *
 * Cubre las affordances de overflow móvil:
 *   1. La pestaña activa (por pathname) se auto-centra con scrollIntoView al
 *      montar (un deep-link ya no la deja fuera de pantalla).
 *   2. El contenedor tiene scroll suave + snap y la máscara de fade solo se
 *      aplica cuando hay overflow real (en jsdom no hay layout → sin máscara).
 *   3. aria-current="page" en la pestaña activa (exacta para Resumen, por
 *      prefijo para el resto).
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

let pathname = "/mi-cuenta/pedidos";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

import { AccountNav } from "./account-nav";
import { DEFAULT_ACCOUNT_TEXTS } from "./account-texts";

afterEach(() => cleanup());

const labels = DEFAULT_ACCOUNT_TEXTS.nav;

describe("AccountNav — affordances de overflow móvil (2026-10-20)", () => {
  const scrollSpy = vi.fn();

  beforeEach(() => {
    scrollSpy.mockClear();
    // jsdom no implementa scrollIntoView.
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;
  });

  it("auto-centra la pestaña activa al montar (scrollIntoView inline center)", () => {
    render(<AccountNav labels={labels} />);
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  });

  it("marca la pestaña activa por prefijo y Resumen solo por match exacto", () => {
    pathname = "/mi-cuenta/pedidos/LCM-2026-0001";
    render(<AccountNav labels={labels} />);
    expect(screen.getByRole("link", { name: /pedidos/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /resumen/i })).not.toHaveAttribute("aria-current");
  });

  it("la lista scrolleable tiene scroll suave + snap y SIN máscara cuando no hay overflow", () => {
    pathname = "/mi-cuenta";
    const { container } = render(<AccountNav labels={labels} />);
    const list = container.querySelector("ul")!;
    expect(list.className).toContain("scroll-smooth");
    expect(list.className).toContain("snap-x");
    // jsdom no tiene layout (scrollWidth = 0) → no hay overflow → sin fade.
    expect(list.style.maskImage).toBe("");
  });
});

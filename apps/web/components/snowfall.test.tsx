// @vitest-environment jsdom

/*
 * Snowfall — caída de nieve de temporada (owner 2026-11-11): canvas fijo sin
 * eventos de puntero; NO se monta en /admin ni /estudio, ni con
 * prefers-reduced-motion.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

let mockPathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

// jsdom no implementa matchMedia: stub "sin preferencia de movimiento reducido".
beforeAll(() => {
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
});

import { Snowfall } from "./snowfall";

afterEach(() => cleanup());

describe("Snowfall — efecto de temporada", () => {
  it("monta el canvas fijo en el storefront", () => {
    mockPathname = "/";
    const { container } = render(<Snowfall />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
    expect(canvas?.className).toContain("pointer-events-none");
    expect(canvas?.className).toContain("fixed");
    expect(canvas).toHaveAttribute("aria-hidden", "true");
  });

  it.each(["/admin/dashboard", "/admin", "/estudio/set-fotoimanes-polaroid"])(
    "NO monta nada en %s",
    (path) => {
      mockPathname = path;
      const { container } = render(<Snowfall />);
      expect(container.querySelector("canvas")).not.toBeInTheDocument();
    },
  );
});

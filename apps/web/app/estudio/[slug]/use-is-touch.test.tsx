// @vitest-environment jsdom

/*
 * Test de useIsTouch — Lucy 2026-09-08: el hint de las vistas 3D ("Arrastra para
 * girar · pellizca con 2 dedos para acercar") se mostraba TAMBIÉN en desktop,
 * donde pellizcar es imposible. La detección ahora usa la media query
 * `(pointer: coarse)` (mecanismo de entrada principal), no `ontouchstart` /
 * `maxTouchPoints` (true en laptops con pantalla táctil → falso positivo).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useIsTouch } from "./use-is-touch";

function Probe() {
  return <span data-testid="probe">{useIsTouch() ? "touch" : "mouse"}</span>;
}

function stubMatchMedia(coarse: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(pointer: coarse)" ? coarse : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useIsTouch — hint 3D según dispositivo (Lucy 2026-09-08)", () => {
  it("desktop (pointer fino) → false: NO se muestra el copy de pellizco", () => {
    stubMatchMedia(false);
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("mouse");
  });

  it("móvil/tablet (pointer coarse) → true: copy de pellizco", () => {
    stubMatchMedia(true);
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("touch");
  });

  it("sin matchMedia (SSR/navegador viejo) → false (fallback desktop)", () => {
    vi.stubGlobal("matchMedia", undefined);
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("mouse");
  });
});

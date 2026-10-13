// @vitest-environment jsdom

/*
 * Test del Scene3DErrorBoundary (2026-10-12): si la escena 3D explota en render (p.ej.
 * useTexture con un dataURL inválido/enorme), el cliente ve el fallback amigable — los mismos
 * textos CMS del fallback de los compositores 2D (estudio.escenas.error / .error-hint) — en
 * vez de un canvas negro/colgado. Sin error, los children pasan intactos.
 */

import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Scene3DErrorBoundary } from "./scene-3d-error-boundary";
import { DEFAULT_STUDIO_TEXTS } from "./studio-texts";

afterEach(cleanup);

function Bomb(): ReactNode {
  throw new Error("THREE.TextureLoader: dataURL inválido");
}

describe("Scene3DErrorBoundary", () => {
  it("sin error renderiza los children intactos", () => {
    render(
      <Scene3DErrorBoundary>
        <p>escena ok</p>
      </Scene3DErrorBoundary>,
    );
    expect(screen.getByText("escena ok")).toBeInTheDocument();
  });

  it("un error en la escena muestra el fallback amigable (defaults CMS pre-CMS)", () => {
    // React loguea el error capturado por el boundary; se silencia para no ensuciar el run.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <Scene3DErrorBoundary>
        <Bomb />
      </Scene3DErrorBoundary>,
    );
    expect(screen.getByText(DEFAULT_STUDIO_TEXTS.escenas.error)).toBeInTheDocument();
    expect(screen.getByText(DEFAULT_STUDIO_TEXTS.escenas.errorHint)).toBeInTheDocument();
    spy.mockRestore();
  });
});

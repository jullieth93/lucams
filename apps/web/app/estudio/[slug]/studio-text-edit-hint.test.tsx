// @vitest-environment jsdom

/*
 * Test de StudioTextEditHint (Ola 2, 2026-10-26) — pista de descubribilidad de
 * la edición DIRECTA de texto en el lienzo («Toca un texto sobre el diseño
 * para editarlo»): pill dismissible cuyo descarte persiste en localStorage
 * (no vuelve a aparecer); en flujo, nunca encima del canvas.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StudioTextEditHint, TEXT_EDIT_HINT_STORAGE_KEY } from "./studio-text-edit-hint";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioTextEditHint — pista de edición directa de texto (Ola 2)", () => {
  it("se muestra la primera vez con el copy CMS y un botón de cierre accesible", () => {
    render(<StudioTextEditHint />);

    expect(screen.getByRole("note").textContent).toMatch(
      /toca un texto sobre el diseño para editarlo/i,
    );
    expect(screen.getByRole("button", { name: "Cerrar este tip" })).toBeInTheDocument();
  });

  it("al descartarla desaparece y el descarte PERSISTE (un segundo mount ya no la muestra)", () => {
    const first = render(<StudioTextEditHint />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar este tip" }));
    expect(screen.queryByRole("note")).toBeNull();
    expect(window.localStorage.getItem(TEXT_EDIT_HINT_STORAGE_KEY)).toBe("1");
    first.unmount();

    render(<StudioTextEditHint />);
    expect(screen.queryByRole("note")).toBeNull();
  });
});

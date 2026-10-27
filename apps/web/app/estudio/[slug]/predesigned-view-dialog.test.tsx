// @vitest-environment jsdom

/*
 * Test de PredesignedViewDialog (2026-10-26) — el preview en grande del
 * prediseñado vía botón «Ver» (ojo): única vía de ver el diseño antes de
 * aplicar en TÁCTIL (el HoverCard es hover-only y en puntero coarse ni se
 * monta). Compartido entre la grilla del sidebar y la del picker modal.
 *
 * Contrato: imagen en alta resolución (imageUrl, no el thumb) + nombre, CTA
 * «Usar este diseño» = la misma acción del click de la tarjeta, y cerrar sin
 * aplicar. Cerrado (item null) no renderiza nada.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PredesignedViewDialog } from "./predesigned-view-dialog";
import type { PredesignedItem } from "./studio-asset-picker-modal";

const ITEM: PredesignedItem = {
  id: "g1",
  name: "Diseño floral",
  imageUrl: "https://cdn.example/g1.png",
  thumbUrl: "https://cdn.example/thumbs/g1.webp",
};

afterEach(cleanup);

describe("PredesignedViewDialog — preview «Ver» del prediseñado (2026-10-26)", () => {
  it("muestra la imagen EN GRANDE (imageUrl, no el thumb) con el nombre del diseño", () => {
    render(<PredesignedViewDialog item={ITEM} onUse={() => {}} onClose={() => {}} />);

    const img = screen.getByRole("img", { name: "Diseño floral" });
    expect(img).toHaveAttribute("src", "https://cdn.example/g1.png");
    expect(img).toHaveAttribute("draggable", "false"); // anti-copia 3.10
    expect(screen.getByRole("dialog", { name: "Diseño floral" })).toBeInTheDocument();
  });

  it("«Usar este diseño» dispara onUse con el item (misma acción del click de la tarjeta)", () => {
    const onUse = vi.fn();
    render(<PredesignedViewDialog item={ITEM} onUse={onUse} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Usar este diseño" }));
    expect(onUse).toHaveBeenCalledWith(ITEM);
  });

  it("cerrar (botón del footer) dispara onClose SIN aplicar", () => {
    const onUse = vi.fn();
    const onClose = vi.fn();
    render(<PredesignedViewDialog item={ITEM} onUse={onUse} onClose={onClose} />);

    // Hay 2 «Cerrar» (la X propia del DialogContent y el botón del footer);
    // cualquiera cierra sin aplicar.
    const closeButtons = screen.getAllByRole("button", { name: "Cerrar" });
    expect(closeButtons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(closeButtons[closeButtons.length - 1]!);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onUse).not.toHaveBeenCalled();
  });

  it("cerrado (item null) no renderiza contenido", () => {
    render(<PredesignedViewDialog item={null} onUse={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

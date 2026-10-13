// @vitest-environment jsdom

/*
 * DesignPreviewDialog — pager por unidad + aviso de marca de agua (2026-10-13).
 *
 * El "Ver" del carrito/pedidos pagina por unidad cuando el diseño tiene páginas
 * watermark (wm/pages/NN.webp): flechas con topes, indicador "2 / 3", dots, y el
 * zoom se restablece al cambiar de página o al cerrar. Sin páginas, la imagen
 * única de siempre. El aviso "vista previa con marca de agua…" solo aparece
 * cuando la superficie lo pasa (imagen exhibida watermarked).
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { DesignPreviewDialog } from "./design-preview-dialog";

afterEach(() => cleanup());

const BASE = "https://cdn.test/design-previews/d1";
const PAGES = [`${BASE}/wm/pages/01.webp`, `${BASE}/wm/pages/02.webp`, `${BASE}/wm/pages/03.webp`];

function renderDialog(over?: Partial<Parameters<typeof DesignPreviewDialog>[0]>) {
  return render(
    <DesignPreviewDialog
      previewUrl={`${BASE}/preview-wm.webp`}
      productName="Fotoimanes"
      triggerLabel="Ver"
      title="Tu diseño ·"
      description="Vista previa ampliada"
      {...over}
    />,
  );
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Ver" }));
}

describe("DesignPreviewDialog — pager por unidad", () => {
  it("sin páginas: imagen única, sin pager", () => {
    renderDialog();
    openDialog();
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", `${BASE}/preview-wm.webp`);
    expect(screen.queryByText("1 / 3")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unidad siguiente" })).not.toBeInTheDocument();
  });

  it("con páginas: pagina con flechas (topes) y resetea al cerrar/reabrir", () => {
    renderDialog({ pages: PAGES });
    openDialog();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("src", PAGES[0]);

    const prev = screen.getByRole("button", { name: "Unidad anterior" });
    const next = screen.getByRole("button", { name: "Unidad siguiente" });
    expect(prev).toBeDisabled(); // tope en la primera

    fireEvent.click(next);
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("src", PAGES[1]);

    fireEvent.click(next);
    fireEvent.click(next); // tope en la última: no envuelve
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(next).toBeDisabled();

    // Cerrar y reabrir → vuelve a la primera página.
    fireEvent.keyDown(document.body, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("los dots navegan directo a la unidad", () => {
    renderDialog({ pages: PAGES });
    openDialog();
    fireEvent.click(screen.getByRole("tab", { name: "Unidad 3 de 3" }));
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("src", PAGES[2]);
  });

  it("muestra el aviso de marca de agua solo cuando llega la prop", () => {
    renderDialog({ pages: PAGES, watermarkNote: "Vista previa con marca de agua — tu impresión final no la lleva." });
    openDialog();
    expect(screen.getByText(/marca de agua/)).toBeInTheDocument();
    cleanup();
    renderDialog();
    openDialog();
    expect(screen.queryByText(/marca de agua/)).not.toBeInTheDocument();
  });
});

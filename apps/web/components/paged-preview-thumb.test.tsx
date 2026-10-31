// @vitest-environment jsdom

/*
 * PagedPreviewThumb — la miniatura de la línea (carrito / gracias) PAGINA por
 * unidad como cualquier otro preview (lineamiento transversal 2026-10-31,
 * owner): chevrons ‹ › con wrap-around sobre las páginas watermark, y click en
 * la imagen abre el lightbox compartido. Con 0-1 páginas es la imagen estática
 * de siempre, sin chevrons.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { PagedPreviewThumb } from "./paged-preview-thumb";

afterEach(() => cleanup());

const BASE = "/api/design-preview/d1";
const PAGES = [`${BASE}/wm/pages/01.webp`, `${BASE}/wm/pages/02.webp`, `${BASE}/wm/pages/03.webp`];

function renderThumb(over?: Partial<Parameters<typeof PagedPreviewThumb>[0]>) {
  return render(
    <PagedPreviewThumb
      pages={PAGES}
      fallbackUrl={`${BASE}/thumb.webp`}
      alt="Diseño de Fotoimanes"
      contain
      placeholder={<span>placeholder</span>}
      sizeClassName="h-24 w-24"
      previewUrl={`${BASE}/preview-wm.webp`}
      productName="Fotoimanes"
      title="Tu diseño ·"
      description="Vista previa ampliada"
      {...over}
    />,
  );
}

const thumbImg = () => screen.getByRole("img", { name: "Diseño de Fotoimanes" });

describe("PagedPreviewThumb — pager en la miniatura", () => {
  it("con varias páginas: arranca en la primera y los chevrons recorren con wrap-around", () => {
    renderThumb();
    expect(thumbImg()).toHaveAttribute("src", PAGES[0]);

    fireEvent.click(screen.getByRole("button", { name: "Unidad siguiente" }));
    expect(thumbImg()).toHaveAttribute("src", PAGES[1]);
    fireEvent.click(screen.getByRole("button", { name: "Unidad siguiente" }));
    expect(thumbImg()).toHaveAttribute("src", PAGES[2]);
    // Wrap-around: de la última vuelve a la primera (en la miniatura no hay
    // topes — el recorrido es circular, a diferencia del pager del lightbox).
    fireEvent.click(screen.getByRole("button", { name: "Unidad siguiente" }));
    expect(thumbImg()).toHaveAttribute("src", PAGES[0]);
    // Y hacia atrás desde la primera cae en la última.
    fireEvent.click(screen.getByRole("button", { name: "Unidad anterior" }));
    expect(thumbImg()).toHaveAttribute("src", PAGES[2]);
  });

  it("el click en la imagen NO lo captura el pager: abre el lightbox en la página visible", () => {
    renderThumb();
    fireEvent.click(screen.getByRole("button", { name: "Unidad siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver el diseño de Fotoimanes" }));
    // El lightbox compartido abre con su pager completo (indicador "N / M").
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("una sola página: miniatura estática sin chevrons", () => {
    renderThumb({ pages: [`${BASE}/wm/pages/01.webp`] });
    expect(thumbImg()).toHaveAttribute("src", `${BASE}/wm/pages/01.webp`);
    expect(screen.queryByRole("button", { name: "Unidad siguiente" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unidad anterior" })).not.toBeInTheDocument();
  });

  it("sin páginas: cae al fallbackUrl (thumb del diseño o foto de catálogo)", () => {
    renderThumb({ pages: [] });
    expect(thumbImg()).toHaveAttribute("src", `${BASE}/thumb.webp`);
    expect(screen.queryByRole("button", { name: "Unidad siguiente" })).not.toBeInTheDocument();
  });

  it("sin páginas ni fallback: muestra el placeholder del llamador", () => {
    renderThumb({ pages: [], fallbackUrl: null });
    expect(screen.getByText("placeholder")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

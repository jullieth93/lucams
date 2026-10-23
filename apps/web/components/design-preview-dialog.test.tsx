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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    renderDialog({
      pages: PAGES,
      watermarkNote: "Vista previa con marca de agua — tu impresión final no la lleva.",
    });
    openDialog();
    expect(screen.getByText(/marca de agua/)).toBeInTheDocument();
    cleanup();
    renderDialog();
    openDialog();
    expect(screen.queryByText(/marca de agua/)).not.toBeInTheDocument();
  });

  it("con trigger personalizado (miniatura clicable): reemplaza al botón «Ver»", () => {
    renderDialog({
      pages: PAGES,
      trigger: <button type="button">Miniatura del diseño</button>,
    });
    expect(screen.queryByRole("button", { name: "Ver" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Miniatura del diseño" }));
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("src", PAGES[0]);
  });

  // Regresión 2026-10-22: el DialogContent de Radix solo se monta al ABRIR, así
  // que el listener nativo de rueda debe (re)conectarse con el diálogo abierto
  // — antes el efecto corría una vez con viewerRef null y la rueda no zooomeaba
  // nunca en este diálogo.
  it("la rueda sobre la imagen zooomea con el diálogo abierto", () => {
    renderDialog();
    openDialog();
    const viewer = document.querySelector(".touch-none");
    expect(viewer).not.toBeNull();
    expect(screen.getByText("100%")).toBeInTheDocument();
    fireEvent.wheel(viewer!, { deltaY: -120 });
    expect(screen.getByText("120%")).toBeInTheDocument();
    fireEvent.wheel(viewer!, { deltaY: 120 });
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});

/*
 * 2026-10-19 — prefetch del pager: al abrir el diálogo se precargan las páginas
 * con new Image() (todas si ≤ 6; ventana ±1 con más) y la página en tránsito
 * muestra un spinner hasta su onLoad (en jsdom new Image() nunca carga, así
 * que el spinner se ve hasta simular el load del <img>).
 */
describe("DesignPreviewDialog — prefetch y estado de carga del pager", () => {
  const MANY = Array.from({ length: 8 }, (_, i) => `${BASE}/wm/pages/${i + 1}.webp`);
  let prefetchSrcs: string[];

  beforeEach(() => {
    prefetchSrcs = [];
    const captured = prefetchSrcs;
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(v: string) {
          captured.push(v);
        }
      },
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("con ≤ 6 páginas precarga TODAS al abrir", () => {
    renderDialog({ pages: PAGES });
    openDialog();
    expect(prefetchSrcs).toEqual(PAGES);
  });

  it("con más de 6 páginas precarga solo la ventana ±1 y amplía al paginar", () => {
    renderDialog({ pages: MANY });
    openDialog();
    // Página 1 visible: ventana = páginas 1 y 2 (no hay anterior).
    expect(prefetchSrcs).toEqual([MANY[0], MANY[1]]);

    fireEvent.click(screen.getByRole("button", { name: "Unidad siguiente" }));
    // Página 2 visible: la ventana suma la página 3 (las demás ya pedidas).
    expect(prefetchSrcs).toEqual([MANY[0], MANY[1], MANY[2]]);
  });

  it("sin abrir el diálogo NO precarga nada", () => {
    renderDialog({ pages: PAGES });
    expect(prefetchSrcs).toEqual([]);
  });

  it("muestra un spinner sutil mientras la página carga y lo retira en onLoad", () => {
    renderDialog({ pages: PAGES });
    openDialog();
    // jsdom no dispara la carga del <img>: el spinner queda visible.
    expect(screen.getByTestId("page-loading")).toBeInTheDocument();

    fireEvent.load(screen.getByRole("img"));
    expect(screen.queryByTestId("page-loading")).not.toBeInTheDocument();
  });
});

/*
 * 2026-10-22 — rótulo por página (pageLabels): el detalle de cada unidad ("Set
 * 2 · con borde") se muestra bajo el indicador "N / M". Alineado por índice con
 * `pages`; si el array no cuadra en largo se ignora completo (nunca rótulos
 * desalineados). Sin la prop, el pager se ve como siempre.
 */
describe("DesignPreviewDialog — rótulos por unidad (pageLabels)", () => {
  const LABELS = ["Set 1 · con borde", "Set 2 · sin borde", "Set 3 · con borde"];

  it("muestra el rótulo de la página actual y lo actualiza al paginar", () => {
    renderDialog({ pages: PAGES, pageLabels: LABELS });
    openDialog();
    expect(screen.getByText("Set 1 · con borde")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Unidad siguiente" }));
    expect(screen.getByText("Set 2 · sin borde")).toBeInTheDocument();
    expect(screen.queryByText("Set 1 · con borde")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Unidad 3 de 3" }));
    expect(screen.getByText("Set 3 · con borde")).toBeInTheDocument();
  });

  it("sin pageLabels el pager no muestra rótulos (comportamiento intacto)", () => {
    renderDialog({ pages: PAGES });
    openDialog();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.queryByText(/Set \d/)).not.toBeInTheDocument();
  });

  it("pageLabels de largo distinto a pages → se ignoran (guarda anti-desalineación)", () => {
    renderDialog({ pages: PAGES, pageLabels: ["Set 1 · con borde", "Set 2 · sin borde"] });
    openDialog();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.queryByText(/Set \d/)).not.toBeInTheDocument();
  });

  it("entradas null en el array solo callan esa página", () => {
    renderDialog({ pages: PAGES, pageLabels: [null, "Tira 2", null] });
    openDialog();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.queryByText("Tira 2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Unidad siguiente" }));
    expect(screen.getByText("Tira 2")).toBeInTheDocument();
  });
});

// @vitest-environment jsdom

/*
 * Test de la galería compacta de piezas de producción del admin (owner
 * 2026-11-03): grilla densa agrupada por set/unidad + lightbox con navegación.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  ProductionPiecesGallery,
  type ProductionPieceItem,
} from "./production-pieces-gallery";

const piece = (index: number, label: string): ProductionPieceItem => ({
  index,
  label,
  url: `/api/design-preview/x/p${index}.png`,
  downloadName: `pedido-pieza-${index}.png`,
  approved: true,
});

// jsdom + vitest sin globals: la limpieza del DOM entre tests es explícita.
afterEach(cleanup);

describe("ProductionPiecesGallery", () => {
  it("grilla plana sin grupos: una miniatura por pieza", () => {
    render(
      <ProductionPiecesGallery
        pieces={[piece(0, "Pieza 01"), piece(1, "Pieza 02"), piece(2, "Pieza 03")]}
        groups={null}
      />,
    );
    expect(screen.getByText("Pieza 01")).toBeInTheDocument();
    expect(screen.getByText("Pieza 03")).toBeInTheDocument();
    expect(screen.queryByText(/Set 1/)).not.toBeInTheDocument();
  });

  it("agrupada: encabezados de set con conteo y nota; piezas bajo su grupo", () => {
    render(
      <ProductionPiecesGallery
        pieces={[...Array.from({ length: 5 }, (_, i) => piece(i, `Ficha ${"AEIOU"[i]}`))]}
        groups={[
          { key: "set-1", title: "Set 1 de 2", note: "Solo letra", pieceIndexes: [0, 1, 2] },
          { key: "set-2", title: "Set 2 de 2", pieceIndexes: [3, 4] },
        ]}
      />,
    );
    expect(screen.getByText("Set 1 de 2")).toBeInTheDocument();
    expect(screen.getByText(/3 archivo\(s\) · Solo letra/)).toBeInTheDocument();
    expect(screen.getByText("Set 2 de 2")).toBeInTheDocument();
    expect(screen.getByText("Ficha U")).toBeInTheDocument();
  });

  it("clic en una miniatura abre el lightbox con su rótulo y navegación", () => {
    render(
      <ProductionPiecesGallery
        pieces={[piece(0, "Ficha A"), piece(1, "Ficha E")]}
        groups={null}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver Ficha E en grande" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Descargar/ })).toHaveAttribute(
      "href",
      "/api/design-preview/x/p1.png",
    );
    // Navegación circular: siguiente desde la última vuelve a la primera.
    fireEvent.click(screen.getByRole("button", { name: "Pieza siguiente" }));
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("pieza sin aprobar: marca ⚠️ en la miniatura y aviso en el lightbox", () => {
    const pendiente = { ...piece(0, "Ficha A"), approved: false };
    render(<ProductionPiecesGallery pieces={[pendiente]} groups={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver Ficha A en grande" }));
    expect(screen.getByText(/No imprimir hasta aprobar en Moderación/)).toBeInTheDocument();
  });
});

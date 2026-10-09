// @vitest-environment jsdom

/*
 * LetterSetPreviewButton (Fase 3 · 3.7) — vista previa del set de fichas del
 * abecedario en el admin.
 *
 * En jsdom no hay contexto canvas 2D → se ejerce el camino de DEGRADACIÓN
 * (grilla HTML de fichas crudas), que es justo el contrato "nunca rompe el
 * admin". La composición real reutiliza drawLetterTile del Estudio, ya
 * cubierto por app/estudio/[slug]/lib/letter-tile-textures.test.ts.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LetterSetPreviewButton, letterGridLayout } from "./letter-set-preview";

const ALPHABET = [..."ABCDE"];
const TILES = {
  A: { imageUrl: "https://cdn.example.com/a.png", label: "Abeja" },
  C: { imageUrl: "https://cdn.example.com/c.png", label: null },
};

afterEach(cleanup);

describe("letterGridLayout", () => {
  it("replica la regla del compositor del Estudio (min 5, máx 9 columnas)", () => {
    // Misma fórmula que renderLetterSetBlob: min(9, max(5, ceil(sqrt(n)))).
    expect(letterGridLayout(27)).toEqual({ cols: 6, rows: 5 }); // es (A-Z + Ñ)
    expect(letterGridLayout(26)).toEqual({ cols: 6, rows: 5 }); // en
    expect(letterGridLayout(5)).toEqual({ cols: 5, rows: 1 }); // vocales
    expect(letterGridLayout(100)).toEqual({ cols: 9, rows: 12 }); // tope 9 columnas
    expect(letterGridLayout(0)).toEqual({ cols: 5, rows: 1 }); // defensivo
  });
});

describe("LetterSetPreviewButton", () => {
  it("abre la modal accesible y muestra el set (fallback sin canvas 2D)", async () => {
    render(
      <LetterSetPreviewButton setName="Animales · Español" alphabet={ALPHABET} tiles={TILES} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /vista previa/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Vista previa · Animales · Español")).toBeInTheDocument();

    // jsdom no da canvas 2D → grilla HTML: fichas con imagen y letras estándar.
    await waitFor(() => {
      expect(screen.getByAltText("Ficha A")).toHaveAttribute(
        "src",
        "https://cdn.example.com/a.png",
      );
    });
    expect(screen.getByAltText("Ficha C")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText(/2\/5 fichas con ilustración/)).toBeInTheDocument();
  });

  it("cierra con el botón Cerrar", async () => {
    render(<LetterSetPreviewButton setName="Animales" alphabet={ALPHABET} tiles={{}} />);
    fireEvent.click(screen.getByRole("button", { name: /vista previa/i }));
    await screen.findByRole("dialog");

    // Hay dos "Cerrar" (la X del header y el botón del footer): usamos el del footer.
    const closeButtons = screen.getAllByRole("button", { name: "Cerrar" });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

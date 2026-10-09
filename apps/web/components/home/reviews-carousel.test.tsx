// @vitest-environment jsdom

/*
 * ReviewCard (carousel de reseñas destacadas de la home) — Fase 3 · 3.5.
 *
 * El producto reseñado es un CHIP visible con link al PDP (antes iba en
 * text-xs muted mezclado con la ciudad y se perdía). La ciudad queda como
 * dato secundario aparte. Las estrellas son decorativas: la calificación
 * real viaja en el sr-only.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReviewCard } from "./reviews-carousel";
import type { StorefrontReview } from "@/features/reviews/public-service";

const REVIEW: StorefrontReview = {
  id: "crev000000000000000000001",
  rating: 4,
  comment: "Quedó hermoso el imán con el nombre de mi hija.",
  authorName: "Camila R.",
  authorCity: "Bogotá",
  productName: "Imán Abecedario Kawaii",
  productSlug: "iman-abecedario-kawaii",
  productImage: null,
  createdAt: new Date("2026-10-01T12:00:00Z"),
};

afterEach(cleanup);

describe("ReviewCard", () => {
  it("muestra el producto como chip con link al PDP", () => {
    render(<ReviewCard review={REVIEW} />);
    const chip = screen.getByRole("link", { name: "Ver producto Imán Abecedario Kawaii" });
    expect(chip).toHaveAttribute("href", "/producto/iman-abecedario-kawaii");
    expect(chip).toHaveTextContent("Imán Abecedario Kawaii");
    // Jerarquía clara: el chip ya NO va mezclado con la ciudad en el mismo <p>.
    const city = screen.getByText("Bogotá");
    expect(city.contains(chip)).toBe(false);
  });

  it("E4: con imagen del producto la miniatura va dentro del link al PDP", () => {
    render(
      <ReviewCard
        review={{ ...REVIEW, productImage: "https://cdn.example.com/iman-kawaii.jpg" }}
      />,
    );
    const chip = screen.getByRole("link", { name: "Ver producto Imán Abecedario Kawaii" });
    const img = chip.querySelector("img");
    expect(img).toBeTruthy();
    expect(img).toHaveAttribute("src", expect.stringContaining("iman-kawaii"));
    expect(chip).toHaveTextContent("Imán Abecedario Kawaii");
  });

  it("E4: sin imagen del producto NO renderiza <img> (queda el chip con ícono, como antes)", () => {
    render(<ReviewCard review={{ ...REVIEW, productImage: null }} />);
    const chip = screen.getByRole("link", { name: "Ver producto Imán Abecedario Kawaii" });
    expect(chip.querySelector("img")).toBeNull();
    expect(chip).toHaveTextContent("Imán Abecedario Kawaii");
  });

  it("la ciudad no se duplica dentro del chip de producto", () => {
    render(<ReviewCard review={REVIEW} />);
    const chip = screen.getByRole("link", { name: "Ver producto Imán Abecedario Kawaii" });
    expect(chip).not.toHaveTextContent("Bogotá");
  });

  it("sin ciudad solo muestra autor + chip", () => {
    render(<ReviewCard review={{ ...REVIEW, authorCity: null }} />);
    expect(screen.queryByText("Bogotá")).toBeNull();
    expect(screen.getByText("Camila R.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver producto Imán Abecedario Kawaii" })).toBeTruthy();
  });

  it("sin autor cae al nombre genérico y anuncia la calificación en sr-only", () => {
    render(<ReviewCard review={{ ...REVIEW, authorName: null }} />);
    expect(screen.getByText("Cliente Lucams")).toBeTruthy();
    expect(screen.getByText("Calificación: 4 de 5")).toBeTruthy();
  });
});

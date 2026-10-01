// @vitest-environment jsdom
/*
 * Test de componente — ProductGallery fallback onError (T5).
 *
 * Regresión: una URL 404 en Product.images quedaba como imagen rota — peor en el hero,
 * que es el LCP con priority. Ahora cada imagen que falla (hero, thumbnails, lightbox)
 * cae al MISMO placeholder Sparkles del empty state. next/image se mockea a <img> plana
 * (mismo patrón que product-card.test.tsx); el Dialog (Radix) no se abre en estos tests.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { ProductGallery } from "./product-gallery";

afterEach(() => cleanup());

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as Record<string, string>)} />,
}));

describe("ProductGallery — fallback onError (T5)", () => {
  it("hero roto → placeholder Sparkles en vez de imagen quebrada; el thumbnail sano sigue", () => {
    const { container } = render(
      <ProductGallery images={["https://x/rota.jpg", "https://x/buena.jpg"]} alt="Imán" />,
    );
    const imgs = container.querySelectorAll("img");
    // Hero (rota) + 2 thumbnails.
    expect(imgs).toHaveLength(3);
    // El hero es la primera <img> (activa = índice 0). Al fallar, el set `failed` cubre
    // hero Y su thumbnail (misma URL) → quedan 2 placeholders + 1 img (thumbnail sano).
    fireEvent.error(imgs[0]!);
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelectorAll("img")[0]).toHaveAttribute("src", "https://x/buena.jpg");
    expect(container.querySelectorAll("svg").length).toBeGreaterThanOrEqual(2);
  });

  it("cambiar de imagen activa a una sana la muestra aunque otra esté rota", () => {
    const { container } = render(
      <ProductGallery images={["https://x/rota.jpg", "https://x/buena.jpg"]} alt="Imán" />,
    );
    fireEvent.error(container.querySelectorAll("img")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Ver imagen 2" }));
    const hero = container.querySelector("img");
    expect(hero).toHaveAttribute("src", "https://x/buena.jpg");
  });

  it("sin imágenes → empty state de marca (comportamiento previo intacto)", () => {
    const { container } = render(<ProductGallery images={[]} alt="Imán" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

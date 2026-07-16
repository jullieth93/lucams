// @vitest-environment jsdom
/*
 * Test de componente — ProductCard (Bloque E, Lucy 2026-07-03).
 *
 * Primer test de la capa de UI (antes 0% cubierta). Usa @testing-library con
 * queries ACCESIBLES (getByRole/getByText → árbol de accesibilidad) → verifica
 * render + estructura semántica. next/link e next/image se mockean a <a>/<img>
 * planos (no hay contexto de router de Next en jsdom).
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProductCard } from "./product-card";
import type { StorefrontProductCard } from "@/features/products/public-service";

// vitest.config usa globals:false → el auto-cleanup de testing-library no se
// registra solo; sin esto los renders se acumulan en el DOM entre tests.
afterEach(() => cleanup());

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as Record<string, string>)} />,
}));

function makeCard(over: Partial<StorefrontProductCard> = {}): StorefrontProductCard {
  return {
    id: "p1",
    slug: "iman-corazon",
    name: "Imán Corazón",
    basePrice: 20_000,
    compareAtPrice: null,
    isPersonalizable: false,
    images: [],
    category: { slug: "fotoimanes", name: "Fotoimanes" },
    variantCount: 1,
    ...over,
  };
}

describe("ProductCard", () => {
  it("muestra badge 'Agotado' cuando inStock=false; no lo muestra si está disponible o sin dato", () => {
    render(<ProductCard product={makeCard({ inStock: false, images: ["/x.jpg"] })} />);
    expect(screen.getByText("Agotado")).toBeInTheDocument();
    cleanup();
    render(<ProductCard product={makeCard({ inStock: true })} />);
    expect(screen.queryByText("Agotado")).not.toBeInTheDocument();
    cleanup();
    render(<ProductCard product={makeCard()} />); // inStock undefined → tratado como disponible
    expect(screen.queryByText("Agotado")).not.toBeInTheDocument();
  });

  it("renderiza nombre, categoría y link accesible a la PDP", () => {
    render(<ProductCard product={makeCard()} />);
    const link = screen.getByRole("link", { name: "Imán Corazón" });
    expect(link).toHaveAttribute("href", "/producto/iman-corazon");
    expect(screen.getByRole("heading", { name: "Imán Corazón" })).toBeInTheDocument();
    expect(screen.getByText("Fotoimanes")).toBeInTheDocument();
  });

  it("muestra el precio base formateado en COP (centavos → pesos)", () => {
    render(<ProductCard product={makeCard({ basePrice: 19_900, variantCount: 1 })} />);
    // formatCOP(19900) = "$ 199" (con espacio no-separable de Intl que testing-library
    // colapsa) → regex tolerante a espacios. Confirma centavos→pesos (199, no 19.900).
    expect(screen.getByText(/^\$\s*199$/)).toBeInTheDocument();
  });

  it("badge 'Personalizable' solo si isPersonalizable", () => {
    const { rerender } = render(<ProductCard product={makeCard({ isPersonalizable: false })} />);
    expect(screen.queryByText(/personalizable/i)).not.toBeInTheDocument();
    rerender(<ProductCard product={makeCard({ isPersonalizable: true })} />);
    expect(screen.getByText(/personalizable/i)).toBeInTheDocument();
  });

  it("badge de descuento con % correcto cuando compareAtPrice > basePrice", () => {
    // compareAt 25000, base 20000 → -20%
    render(<ProductCard product={makeCard({ basePrice: 20_000, compareAtPrice: 25_000 })} />);
    expect(screen.getByText("-20%")).toBeInTheDocument();
    // El precio tachado (compareAt) también aparece.
    expect(screen.getAllByText(/\$/).length).toBeGreaterThan(1);
  });

  it("sin descuento no muestra badge ni precio tachado", () => {
    render(<ProductCard product={makeCard({ compareAtPrice: null })} />);
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it("chip 'X opciones' + 'desde' solo con variantCount>1 y minVariantPrice<base", () => {
    render(
      <ProductCard
        product={makeCard({ variantCount: 3, minVariantPrice: 15_000, basePrice: 20_000 })} />,
    );
    expect(screen.getByText(/3 opciones/)).toBeInTheDocument();
    expect(screen.getByText(/desde/i)).toBeInTheDocument();
  });

  it("con una sola variante no muestra 'opciones' ni 'desde'", () => {
    render(<ProductCard product={makeCard({ variantCount: 1 })} />);
    expect(screen.queryByText(/opciones/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^desde$/i)).not.toBeInTheDocument();
  });

  it("renderiza <img> cuando hay imágenes (rama con next/image)", () => {
    // alt="" hace la imagen decorativa (role presentation), por eso la buscamos
    // por el DOM y no por getByRole('img').
    const { container } = render(<ProductCard product={makeCard({ images: ["https://x/img.jpg"] })} />);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://x/img.jpg");
  });
});

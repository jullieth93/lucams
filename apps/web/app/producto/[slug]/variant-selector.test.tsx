// @vitest-environment jsdom
/*
 * Test de componente — VariantSelector (bug PDP separadores-libros).
 *
 * Regression: las variants de separadores-libros declaran `quantity` y
 * `photoSlots` con valores IDÉNTICOS (1/3/5) y ambas dimensions tenían el
 * label "Cantidad" → la PDP pintaba DOS grupos "CANTIDAD". El selector ahora
 * deduplica dimensions cuyo valor es el mismo en TODAS las variants.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { VariantSelector } from "./variant-selector";

// vitest.config usa globals:false → cleanup manual entre tests.
afterEach(() => cleanup());

type TestVariant = {
  id: string;
  name: string;
  sku: string;
  price: number | null;
  attributes: unknown;
};

function makeVariant(id: string, attributes: Record<string, unknown>): TestVariant {
  return { id, name: id, sku: id.toUpperCase(), price: 100_000, attributes };
}

// Datos reales (2026-07) de separadores-libros: quantity == photoSlots en
// cada variant (cada separador lleva 1 foto) + 2 tamaños.
const separadoresVariants: TestVariant[] = [
  makeVariant("v-c1", { shape: "rectangle", sizeCm: "6×6", quantity: 1, photoSlots: 1 }),
  makeVariant("v-c3", { shape: "rectangle", sizeCm: "6×6", quantity: 3, photoSlots: 3 }),
  makeVariant("v-c5", { shape: "rectangle", sizeCm: "6×6", quantity: 5, photoSlots: 5 }),
  makeVariant("v-r1", { shape: "rectangle", sizeCm: "5×14", quantity: 1, photoSlots: 1 }),
  makeVariant("v-r3", { shape: "rectangle", sizeCm: "5×14", quantity: 3, photoSlots: 3 }),
  makeVariant("v-r5", { shape: "rectangle", sizeCm: "5×14", quantity: 5, photoSlots: 5 }),
];

describe("VariantSelector", () => {
  it("no duplica el grupo 'Cantidad' cuando quantity y photoSlots coinciden en todas las variants", () => {
    render(<VariantSelector productBasePrice={100_000} variants={separadoresVariants} />);
    // Un solo grupo "Cantidad" (antes salían dos) + un grupo "Tamaño".
    expect(screen.getAllByRole("group", { name: "Cantidad" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "Tamaño" })).toHaveLength(1);
    // Los chips de cantidad y tamaño siguen completos.
    const cantidad = screen.getByRole("group", { name: "Cantidad" });
    expect(within(cantidad).getAllByRole("button")).toHaveLength(3);
    const tamano = screen.getByRole("group", { name: "Tamaño" });
    expect(within(tamano).getAllByRole("button")).toHaveLength(2);
  });

  it("mantiene grupos separados cuando las dimensions NO coinciden (photoSlots vs sizeCm)", () => {
    // Estilo polaroid: cada variant combina fotos y tamaño distintos (no
    // coinciden como strings) → ambos grupos deben seguir apareciendo.
    const variants = [
      makeVariant("v-p6", { photoSlots: 6, sizeCm: "7×9" }),
      makeVariant("v-p12", { photoSlots: 12, sizeCm: "6×8" }),
    ];
    render(<VariantSelector productBasePrice={100_000} variants={variants} />);
    expect(screen.getAllByRole("group", { name: "Cantidad" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "Tamaño" })).toHaveLength(1);
    expect(screen.getByText("6 unidades")).toBeInTheDocument();
    expect(screen.getByText("12 unidades")).toBeInTheDocument();
  });

  it("muestra la dimensión Forma cuando shape tiene más de un valor", () => {
    // 2 formas × 2 tamaños → modo multi-dim (con 1 sola dimensión el selector
    // renderiza la lista vertical "Elige tu opción", sin grupos de chips).
    const variants = [
      makeVariant("v-s1", { shape: "rectangle", sizeCm: "6×6" }),
      makeVariant("v-s2", { shape: "heart", sizeCm: "6×6" }),
      makeVariant("v-s3", { shape: "rectangle", sizeCm: "5×14" }),
      makeVariant("v-s4", { shape: "heart", sizeCm: "5×14" }),
    ];
    render(<VariantSelector productBasePrice={100_000} variants={variants} />);
    expect(screen.getAllByRole("group", { name: "Forma" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "Tamaño" })).toHaveLength(1);
  });
});

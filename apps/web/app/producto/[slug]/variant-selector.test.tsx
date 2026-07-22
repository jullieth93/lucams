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

  it("pinta Cantidad/Tamaño/Marco una sola vez en la matriz fotoimanes (size × marco × qty)", () => {
    // Datos reales (2026-07-22) de set-fotoimanes-cuadrados: quantity == photoSlots
    // en todas las variants + frameStyle blanco/negro.
    const variants: TestVariant[] = [];
    for (const sizeCm of ["6.5×6.5", "7.5×10"]) {
      for (const frameStyle of ["blanco", "negro"]) {
        for (const qty of [1, 2]) {
          variants.push(
            makeVariant(`v-${sizeCm}-${frameStyle}-${qty}`, {
              shape: "rectangle",
              sizeCm,
              frameStyle,
              quantity: qty,
              photoSlots: qty,
              aspectRatio: sizeCm === "6.5×6.5" ? "1:1" : "3:4",
            }),
          );
        }
      }
    }
    render(<VariantSelector productBasePrice={100_000} variants={variants} />);
    expect(screen.getAllByRole("group", { name: "Cantidad" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "Tamaño" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "Marco" })).toHaveLength(1);
    const marco = screen.getByRole("group", { name: "Marco" });
    expect(within(marco).getByText("Blanco")).toBeInTheDocument();
    expect(within(marco).getByText("Negro")).toBeInTheDocument();
  });

  it("no pinta un grupo cuyo valor es único en todas las variants (marco fijo)", () => {
    // Si todas las variants tienen frameStyle "blanco", el grupo Marco no debe
    // aparecer (regla: solo dimensions con >1 valor distinto se muestran).
    const variants = [
      makeVariant("v-b1", { sizeCm: "6.5×6.5", frameStyle: "blanco", quantity: 1, photoSlots: 1 }),
      makeVariant("v-b2", { sizeCm: "6.5×6.5", frameStyle: "blanco", quantity: 2, photoSlots: 2 }),
      makeVariant("v-r1", { sizeCm: "7.5×10", frameStyle: "blanco", quantity: 1, photoSlots: 1 }),
      makeVariant("v-r2", { sizeCm: "7.5×10", frameStyle: "blanco", quantity: 2, photoSlots: 2 }),
    ];
    render(<VariantSelector productBasePrice={100_000} variants={variants} />);
    expect(screen.queryByRole("group", { name: "Marco" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: "Cantidad" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "Tamaño" })).toHaveLength(1);
  });

  it("muestra el grupo Estilo (polaroid) con sus 3 opciones en orden", () => {
    // 2 sets × 3 estilos → modo multi-dim (con 1 sola dimensión el selector
    // renderiza la lista vertical "Elige tu opción", sin grupos de chips).
    const variants = [
      makeVariant("v-p6-bc", { photoSlots: 6, sizeCm: "7×9", variantStyle: "blanco-clasico" }),
      makeVariant("v-p6-pas", { photoSlots: 6, sizeCm: "7×9", variantStyle: "pasteles" }),
      makeVariant("v-p6-ig", { photoSlots: 6, sizeCm: "7×9", variantStyle: "instagram" }),
      makeVariant("v-p12-bc", { photoSlots: 12, sizeCm: "6×8", variantStyle: "blanco-clasico" }),
      makeVariant("v-p12-pas", { photoSlots: 12, sizeCm: "6×8", variantStyle: "pasteles" }),
      makeVariant("v-p12-ig", { photoSlots: 12, sizeCm: "6×8", variantStyle: "instagram" }),
    ];
    render(<VariantSelector productBasePrice={100_000} variants={variants} />);
    const estilo = screen.getByRole("group", { name: "Estilo" });
    const chips = within(estilo).getAllByRole("button").map((b) => b.textContent);
    expect(chips).toEqual(["Blanco clásico", "Pasteles", "Instagram"]);
  });

  it("muestra los grupos Tema e Idioma (pack vocales) sin duplicados", () => {
    // Matriz real (2026-07-22): 2 temas × 2 idiomas × 1 tamaño × imán sí/no.
    const variants: TestVariant[] = [];
    for (const theme of ["animales", "frutas"]) {
      for (const language of ["es", "en"]) {
        for (const magnet of [true, false]) {
          variants.push(
            makeVariant(`v-${theme}-${language}-${magnet}`, {
              size: "mini",
              sizeCm: "5×7",
              magnet,
              theme,
              language,
            }),
          );
        }
      }
    }
    render(<VariantSelector productBasePrice={100_000} variants={variants} />);
    expect(screen.getAllByRole("group", { name: "Tema" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "Idioma" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "¿Con imán?" })).toHaveLength(1);
    const tema = screen.getByRole("group", { name: "Tema" });
    expect(within(tema).getByText("Animales")).toBeInTheDocument();
    expect(within(tema).getByText("Frutas")).toBeInTheDocument();
  });
});

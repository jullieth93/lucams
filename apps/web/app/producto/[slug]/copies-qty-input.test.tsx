// @vitest-environment jsdom
/*
 * Test de componente — CopiesQtyInput (stepper "Unidades" de copias en la PDP).
 *
 * Blinda el contrato del stepper de COPIAS (regla 2026-09-08b: productos de
 * composición fija — calendario, sets de letras, nombre, compra directa — y,
 * desde 2026-09-09, el HÍBRIDO tiras-magneticas-fotos, donde convive con la
 * dimensión "Fotos por tira"; el resto de los packs de tamaño variable tiene
 * su "Unidades" = pack size en el VariantSelector y NUNCA este stepper):
 *   1. Arranca en 1 y lo expone como <input type="hidden" name="qty"> para
 *      que viaje en el form de addToCartAction (rama de compra directa).
 *   2. +/− actualizan el hidden input (el valor que multiplica el checkout).
 *   3. Respeta el rango 1..99 (mismo tope de AddToCartSchema y del carrito).
 *   4. El label visible es "Unidades" (label unificado de cantidad).
 *   5. Fuente de verdad ÚNICA en el SelectedVariantProvider: el EstudioCtaLink
 *      de la rama personalizable lleva el conteo al Estudio como ?copies=N
 *      (solo cuando N>1 — con 1 la URL queda limpia, default del Estudio).
 *
 * El estado vive en el provider del buy-box (H12): los tests envuelven el
 * stepper en SelectedVariantProvider, como hace la PDP real.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { CopiesQtyInput } from "./copies-qty-input";
import { SelectedVariantProvider, EstudioCtaLink } from "./variant-actions";

// Mock de next/navigation (el provider hace router.replace al cambiar la
// variante: side-effect del deep-link ?variant=). Mismo patrón que
// variant-selector.test.tsx.
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}));

// vitest.config usa globals:false → cleanup manual entre tests.
afterEach(() => cleanup());
beforeEach(() => replace.mockClear());

function renderStepper() {
  return render(
    <SelectedVariantProvider variantIds={["v1"]} initialId="v1">
      <CopiesQtyInput />
    </SelectedVariantProvider>,
  );
}

/** Hidden input que viaja en el form (no tiene rol accesible → se lee del DOM). */
function qtyHidden(): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>('input[name="qty"]');
  if (!el) throw new Error("No se encontró el input hidden qty");
  return el;
}

describe("CopiesQtyInput", () => {
  it("renderiza el grupo 'Unidades' y arranca en 1 con el hidden en sync", () => {
    renderStepper();
    const unidades = screen.getByRole("group", { name: "Unidades" });
    expect(within(unidades).getByText("1")).toBeInTheDocument();
    expect(qtyHidden().value).toBe("1");
  });

  it("+/− actualizan el conteo y el hidden input que viaja en el form", () => {
    renderStepper();
    const unidades = screen.getByRole("group", { name: "Unidades" });

    fireEvent.click(screen.getByLabelText("Aumentar unidades"));
    fireEvent.click(screen.getByLabelText("Aumentar unidades"));
    expect(within(unidades).getByText("3")).toBeInTheDocument();
    expect(qtyHidden().value).toBe("3");

    fireEvent.click(screen.getByLabelText("Disminuir unidades"));
    expect(within(unidades).getByText("2")).toBeInTheDocument();
    expect(qtyHidden().value).toBe("2");
  });

  it("respeta el mínimo 1: − queda deshabilitado y el hidden no baja de 1", () => {
    renderStepper();
    const decrease = screen.getByLabelText("Disminuir unidades");
    expect(decrease).toBeDisabled();

    fireEvent.click(decrease); // no-op por disabled, pero blindamos el valor
    expect(qtyHidden().value).toBe("1");
  });

  it("respeta el máximo 100 (tope de compra directa ADR-209): + se deshabilita al llegar", () => {
    renderStepper();
    const unidades = screen.getByRole("group", { name: "Unidades" });
    const increase = screen.getByLabelText("Aumentar unidades");

    for (let i = 0; i < 99; i++) {
      fireEvent.click(increase);
    }
    expect(within(unidades).getByText("100")).toBeInTheDocument();
    expect(qtyHidden().value).toBe("100");
    expect(increase).toBeDisabled();
    expect(screen.getByLabelText("Disminuir unidades")).toBeEnabled();
  });

  it("el CTA al Estudio lleva las copias como ?copies=N (fuente de verdad compartida)", () => {
    render(
      <SelectedVariantProvider variantIds={["v1"]} initialId="v1">
        <CopiesQtyInput />
        <EstudioCtaLink slug="calendario-mes-a-mes-fotos" ctaNoun="producto" />
      </SelectedVariantProvider>,
    );
    const cta = screen.getByRole("link", { name: /Personalizar producto/ });
    // Sin copias elegidas (1): la URL queda limpia (default del Estudio).
    expect(cta).toHaveAttribute("href", "/estudio/calendario-mes-a-mes-fotos?variant=v1");

    fireEvent.click(screen.getByLabelText("Aumentar unidades"));
    fireEvent.click(screen.getByLabelText("Aumentar unidades"));
    expect(cta).toHaveAttribute("href", "/estudio/calendario-mes-a-mes-fotos?variant=v1&copies=3");

    // Volver a 1 quita el parámetro (la modal confirma con 1 por defecto).
    fireEvent.click(screen.getByLabelText("Disminuir unidades"));
    fireEvent.click(screen.getByLabelText("Disminuir unidades"));
    expect(cta).toHaveAttribute("href", "/estudio/calendario-mes-a-mes-fotos?variant=v1");
  });
});

describe("CopiesQtyInput — bola navideña", () => {
  it("cuenta bolas con su propio sustantivo y conserva el valor enviado al Estudio", () => {
    render(
      <SelectedVariantProvider variantIds={["v1"]} initialId="v1">
        <CopiesQtyInput
          max={25}
          unitNoun={{ one: "bola", many: "bolas", label: "Bolas" }}
          hint="Cada bola se diseña por separado en el Estudio"
        />
      </SelectedVariantProvider>,
    );
    const group = screen.getByRole("group", { name: "Bolas" });
    expect(within(group).getByText("1 bola")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Aumentar bolas"));
    expect(within(group).getByText("2 bolas")).toBeInTheDocument();
    expect(qtyHidden().value).toBe("2");
    expect(screen.getByText("Cada bola se diseña por separado en el Estudio")).toBeInTheDocument();
  });

  // Bug owner 2026-11-07: el stepper mostraba siempre múltiplos del precio base
  // (3 bolas = $30.000) aunque la promo por volumen cobra $27.000 en el carrito.
  it("aplica la promo por volumen al total vivo (3×$27.000, 5×$40.000) con el base tachado", () => {
    render(
      <SelectedVariantProvider variantIds={["v1"]} initialId="v1">
        <CopiesQtyInput
          max={25}
          unitNoun={{ one: "bola", many: "bolas", label: "Bolas" }}
          fallbackUnitPrice={1_000_000}
          volumeTiers={[
            { minQty: 3, unitPrice: 900_000, savingsPct: 10 },
            { minQty: 5, unitPrice: 800_000, savingsPct: 20 },
          ]}
        />
      </SelectedVariantProvider>,
    );
    // 1-2 bolas: sin nivel alcanzado → total plano, nada tachado.
    expect(screen.getByText("$ 10.000")).toBeInTheDocument();
    expect(document.querySelector(".line-through")).toBeNull();

    const increase = screen.getByLabelText("Aumentar bolas");
    fireEvent.click(increase);
    expect(screen.getByText("$ 20.000")).toBeInTheDocument();

    fireEvent.click(increase); // 3 bolas → nivel 3+ ($9.000 c/u)
    expect(screen.getByText("$ 27.000")).toBeInTheDocument();
    expect(screen.getByText("$ 30.000")).toHaveClass("line-through");
    expect(screen.getByText("$ 9.000 c/u")).toBeInTheDocument();

    fireEvent.click(increase);
    fireEvent.click(increase); // 5 bolas → nivel 5+ ($8.000 c/u)
    expect(screen.getByText("$ 40.000")).toBeInTheDocument();
    expect(screen.getByText("$ 50.000")).toHaveClass("line-through");
    expect(screen.getByText("$ 8.000 c/u")).toBeInTheDocument();

    // Bajar del umbral restaura el precio base sin tachado.
    fireEvent.click(screen.getByLabelText("Disminuir bolas"));
    fireEvent.click(screen.getByLabelText("Disminuir bolas"));
    fireEvent.click(screen.getByLabelText("Disminuir bolas")); // 2 bolas
    expect(screen.getByText("$ 20.000")).toBeInTheDocument();
    expect(document.querySelector(".line-through")).toBeNull();
  });

  it("un nivel que no rebaja el unitario de la variante NO se aplica (nunca subir el precio)", () => {
    render(
      <SelectedVariantProvider variantIds={["v1"]} initialId="v1">
        <CopiesQtyInput
          unitPriceByVariantId={{ v1: 700_000 }}
          volumeTiers={[{ minQty: 2, unitPrice: 800_000, savingsPct: 1 }]}
        />
      </SelectedVariantProvider>,
    );
    fireEvent.click(screen.getByLabelText("Aumentar unidades"));
    expect(screen.getByText("$ 14.000")).toBeInTheDocument();
    expect(document.querySelector(".line-through")).toBeNull();
  });
});

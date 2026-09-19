// @vitest-environment jsdom
/*
 * Regresión (owner 2026-09-18) — feedback del form de producto.
 *
 * Síntoma: "edito el nombre / destaco, doy guardar, aparentemente no hace
 * nada y no se refleja el cambio". Causa raíz doble:
 *
 *   1. updateProductAction retornaba {} al guardar → cero feedback de éxito.
 *   2. Si Zod rechazaba (ej. producto legado con garantía < 12 meses — el
 *      schema subió min(0)→min(12) en el barrido legal ADR-072), el alert
 *      global exigía `state.error && !state.fieldErrors` → con fieldErrors
 *      NO se renderizaba nada y el campo garantía no pinta error propio:
 *      el guardado se perdía EN SILENCIO.
 *
 * Estos tests fijan que:
 *   - el error global se muestra AUNQUE haya fieldErrors, nombrando el campo
 *     con etiqueta humana + su mensaje;
 *   - al guardar OK se muestra la confirmación "Cambios guardados".
 *
 * Se mockea next/navigation (AdminTabBar usa useSearchParams/useRouter — no
 * hay App Router en jsdom). La action se inyecta como prop → stub directo.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { ProductForm } from "./product-form";
import type { ProductActionState } from "./actions";

afterEach(cleanup);

const CATEGORIES = [{ id: "clucat0000000000000000001", name: "Imanes", slug: "imanes" }];

const INITIAL_PRODUCT = {
  id: "cluprod000000000000000001",
  name: "Imán de foto",
  slug: "iman-de-foto",
  description: "Imán personalizado con tu foto favorita.",
  basePrice: 1500000,
  compareAtPrice: null,
  cost: null,
  sku: "IMAN-FOTO",
  categoryId: "clucat0000000000000000001",
  isPersonalizable: true,
  isActive: true,
  isFeatured: false,
  seoTitle: null,
  seoDescription: null,
};

function renderForm(state: ProductActionState) {
  const action = vi.fn(async () => state);
  render(
    <ProductForm
      categories={CATEGORIES}
      initialProduct={INITIAL_PRODUCT}
      action={action}
      submitLabel="Guardar cambios"
    />,
  );
  const form = document.querySelector("form");
  if (!form) throw new Error("ProductForm no renderizó <form>");
  return form;
}

describe("ProductForm — feedback de guardado (regresión 2026-09-18)", () => {
  it("muestra el error global AUNQUE haya fieldErrors, con etiqueta humana del campo", async () => {
    const form = renderForm({
      error: "Datos inválidos.",
      fieldErrors: { warrantyMonths: ["Mínimo 12 meses (la garantía legal es de 1 año)"] },
    });
    fireEvent.submit(form);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Datos inválidos");
    expect(alert).toHaveTextContent("Garantía (meses)");
    expect(alert).toHaveTextContent("Mínimo 12 meses");
  });

  it("muestra confirmación visible cuando el guardado aplica", async () => {
    const form = renderForm({ success: true });
    fireEvent.submit(form);

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/cambios guardados/i);
  });

  it("error sin fieldErrors (fallo de servicio) también se muestra", async () => {
    const form = renderForm({ error: "Algo salió mal actualizando el producto." });
    fireEvent.submit(form);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Algo salió mal actualizando el producto");
  });
});

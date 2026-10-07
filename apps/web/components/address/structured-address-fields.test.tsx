// @vitest-environment jsdom
/*
 * Test de componente — StructuredAddressFields (/mi-cuenta/direcciones).
 *
 * Fix QA STG 2026-10 (items 3.1 + 3.2, mismo criterio que el checkout):
 *   1. El CP ya NO se autorrellena con el municipal DANE al elegir ciudad
 *      (el "110111" prellenado se confundía con el número de pedido) y su
 *      placeholder es neutro ("Opcional").
 *   2. Los hints de vía/cruce muestran ejemplo por tipo de vía y explican
 *      el segundo tramo del cruce.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_STRUCTURED_ADDRESS, StructuredAddressFields } from "./structured-address-fields";

afterEach(cleanup);

function renderFields(value = EMPTY_STRUCTURED_ADDRESS) {
  const onChange = vi.fn();
  const utils = render(
    <StructuredAddressFields value={value} onChange={onChange} neighborhoodPlaceholder="Barrio" />,
  );
  return { onChange, ...utils };
}

describe("StructuredAddressFields — código postal derivado de la ciudad (owner 2026-10-07)", () => {
  it("el placeholder del CP es neutro (no '110111')", () => {
    const { container } = renderFields();
    expect(container.querySelector<HTMLInputElement>("#zip")!.placeholder).toBe("Opcional");
  });

  it("elegir ciudad propaga el CP real del catálogo DANE", () => {
    const { container, onChange } = renderFields({ ...EMPTY_STRUCTURED_ADDRESS, deptCode: "11" });
    fireEvent.change(container.querySelector<HTMLSelectElement>("#cityCode")!, {
      target: { value: "11001" },
    });
    expect(onChange).toHaveBeenCalledWith({ cityCode: "11001", zip: "110111" });
  });

  it("ciudad sin CP municipal propaga el prefijo departamental", () => {
    const { container, onChange } = renderFields({ ...EMPTY_STRUCTURED_ADDRESS, deptCode: "05" });
    // Abejorral (05002) no tiene zip municipal en el catálogo.
    fireEvent.change(container.querySelector<HTMLSelectElement>("#cityCode")!, {
      target: { value: "05002" },
    });
    expect(onChange).toHaveBeenCalledWith({ cityCode: "05002", zip: "05" });
  });
});

describe("StructuredAddressFields — hints con ejemplo por tipo de vía", () => {
  it("el hint de la vía sigue al tipo elegido y el del cruce explica el segundo tramo", () => {
    const { container, getByText } = renderFields({
      ...EMPTY_STRUCTURED_ADDRESS,
      viaType: "Diagonal",
    });
    expect(getByText(/Diagonal 40A/)).toBeInTheDocument();
    expect(getByText(/segundo tramo/)).toBeInTheDocument();
    // El placeholder "110111" ya no aparece como ejemplo en ningún campo.
    expect(container.querySelector('[placeholder="110111"]')).toBeNull();
  });
});

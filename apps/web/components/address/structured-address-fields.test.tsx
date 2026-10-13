// @vitest-environment jsdom
/*
 * Test de componente — StructuredAddressFields (/mi-cuenta/direcciones).
 *
 * Cubre:
 *   1. CP derivado de la ciudad: solo el CP REAL del catálogo DANE; si la
 *      ciudad no lo tiene, el campo queda VACÍO (el prefijo departamental NO
 *      es un CP válido — antes se prellenaba como si lo fuera).
 *   2. Localidad/zona de entrega (lib/lucams-zones): select obligatorio solo
 *      cuando la ciudad está en el catálogo (mismo criterio del checkout) y
 *      reset al cambiar de ciudad/departamento.
 *   3. Hints de vía/cruce con ejemplo por tipo de vía.
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

describe("StructuredAddressFields — código postal derivado de la ciudad", () => {
  it("el placeholder del CP es neutro (no '110111')", () => {
    const { container } = renderFields();
    expect(container.querySelector<HTMLInputElement>("#zip")!.placeholder).toBe("Opcional");
  });

  it("elegir ciudad propaga el CP real del catálogo DANE (y resetea la localidad)", () => {
    const { container, onChange } = renderFields({ ...EMPTY_STRUCTURED_ADDRESS, deptCode: "11" });
    fireEvent.change(container.querySelector<HTMLSelectElement>("#cityCode")!, {
      target: { value: "11001" },
    });
    expect(onChange).toHaveBeenCalledWith({ cityCode: "11001", localityId: "", zip: "110111" });
  });

  it("ciudad sin CP municipal → CP queda VACÍO (no se inventa el prefijo departamental)", () => {
    const { container, onChange } = renderFields({ ...EMPTY_STRUCTURED_ADDRESS, deptCode: "05" });
    // Abejorral (05002) no tiene zip municipal en el catálogo.
    fireEvent.change(container.querySelector<HTMLSelectElement>("#cityCode")!, {
      target: { value: "05002" },
    });
    expect(onChange).toHaveBeenCalledWith({ cityCode: "05002", localityId: "", zip: "" });
  });
});

describe("StructuredAddressFields — localidad/zona de entrega (lib/lucams-zones)", () => {
  it("Bogotá (11001, en el catálogo) muestra el select de Localidad con sus zonas", () => {
    const { container, getByText } = renderFields({
      ...EMPTY_STRUCTURED_ADDRESS,
      deptCode: "11",
      cityCode: "11001",
    });
    expect(getByText(/Localidad/)).toBeInTheDocument();
    const select = container.querySelector<HTMLSelectElement>("#localityId")!;
    expect(select).toBeInTheDocument();
    expect(select.required).toBe(true);
    // Las 20 localidades oficiales de Bogotá están en el catálogo.
    expect(select.querySelectorAll("option").length).toBe(20 + 1); // + placeholder
  });

  it("ciudad fuera del catálogo de zonas (Medellín) NO muestra el select", () => {
    const { container, queryByText } = renderFields({
      ...EMPTY_STRUCTURED_ADDRESS,
      deptCode: "05",
      cityCode: "05001",
    });
    expect(queryByText(/Localidad/)).toBeNull();
    expect(container.querySelector("#localityId")).toBeNull();
  });

  it("cambiar de departamento resetea ciudad, localidad y CP", () => {
    const { container, onChange } = renderFields({
      ...EMPTY_STRUCTURED_ADDRESS,
      deptCode: "11",
      cityCode: "11001",
      localityId: "chapinero",
      zip: "110111",
    });
    fireEvent.change(container.querySelector<HTMLSelectElement>("#deptCode")!, {
      target: { value: "05" },
    });
    expect(onChange).toHaveBeenCalledWith({
      deptCode: "05",
      cityCode: "",
      localityId: "",
      zip: "",
    });
  });

  it("elegir localidad propaga el id de la zona", () => {
    const { container, onChange } = renderFields({
      ...EMPTY_STRUCTURED_ADDRESS,
      deptCode: "11",
      cityCode: "11001",
    });
    fireEvent.change(container.querySelector<HTMLSelectElement>("#localityId")!, {
      target: { value: "suba" },
    });
    expect(onChange).toHaveBeenCalledWith({ localityId: "suba" });
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

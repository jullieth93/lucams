// @vitest-environment jsdom
/*
 * Test de componente — DatosForm.
 *
 * 2026-10-20 — la sección de facturación («Quiero documento tributario») se
 * ocultó detrás de BILLING_DOCUMENT_ENABLED (decisión del owner: persona
 * natural sin trámites DIAN). Acá se prueba el flag OFF (módulo real): la
 * sección NO se renderiza. La cobertura con flag ON (copia "Usar los datos
 * del comprador", names de los campos) vive en ./datos-form.billing.test.tsx,
 * que mockea el flag.
 *
 * `./actions` se mockea: es un módulo "use server" (db, cookies) que no
 * aplica a un render unitario — mismo patrón que quote-form.test.tsx.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("./actions", () => ({
  saveDatosAction: vi.fn(async () => null),
}));

import { DatosForm } from "./datos-form";
import { saveDatosAction } from "./actions";
import { DEFAULT_CHECKOUT_TEXTS } from "../checkout-texts";

afterEach(cleanup);

function renderForm() {
  return render(
    <DatosForm initial={{ step: 1, updatedAt: 0 }} texts={DEFAULT_CHECKOUT_TEXTS.datos} />,
  );
}

describe("DatosForm — facturación apagada (BILLING_DOCUMENT_ENABLED = false, 2026-10-20)", () => {
  it("NO renderiza el checkbox «documento tributario» ni los campos de facturación", () => {
    renderForm();
    expect(document.querySelector('input[name="wantsInvoice"]')).not.toBeInTheDocument();
    expect(document.querySelector('select[name="billingDocumentType"]')).not.toBeInTheDocument();
    expect(document.querySelector('input[name="billingDocumentNumber"]')).not.toBeInTheDocument();
    expect(document.querySelector('input[name="billingName"]')).not.toBeInTheDocument();
    expect(screen.queryByText(DEFAULT_CHECKOUT_TEXTS.datos.billingTitle)).not.toBeInTheDocument();
  });

  it("el flujo sigue igual: el submit no exige nada de facturación", async () => {
    const { container } = renderForm();
    expect(container.querySelector("form")).toBeInTheDocument();
    // Sin wantsInvoice en el DOM, el FormData lo lleva ausente → el server lo
    // fuerza a false (gate en saveDatosAction) y el pipeline sigue intacto.
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(vi.mocked(saveDatosAction)).toHaveBeenCalled());
  });
});

/*
 * Fix QA STG 2026-10 — "al continuar con campos inválidos no pasa nada":
 * tras un submit fallido el form debe (a) mostrar un resumen anunciable de
 * los campos a revisar sobre el botón, (b) marcar los inputs inválidos con
 * aria-invalid + borde rojo y (c) hacer scroll + foco al PRIMER campo con
 * error (el FieldHint solo queda fuera de pantalla en un form largo).
 */
describe("DatosForm — feedback de errores tras submit fallido", () => {
  const scrollSpy = vi.fn();

  beforeEach(() => {
    // jsdom no implementa scrollIntoView.
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;
  });

  afterEach(() => {
    scrollSpy.mockClear();
    // {} ≡ state sin errores (el mock original devuelve null; {} es el
    // equivalente tipado de DatosActionState sin error ni fieldErrors).
    vi.mocked(saveDatosAction).mockResolvedValue({});
  });

  function submitForm() {
    const form = document.querySelector("form");
    if (!form) throw new Error("DatosForm no renderizó <form>");
    fireEvent.submit(form);
  }

  it("muestra el resumen anunciable (role=alert) con los campos con error del server", async () => {
    vi.mocked(saveDatosAction).mockResolvedValue({
      error: "Revisa los datos de contacto",
      fieldErrors: {
        phone: ["Debe ser un móvil colombiano de 10 dígitos (300...)"],
        cruceNumber: ["Formato: número-número (ej. 15-20, 13B-42)"],
      },
    });
    renderForm();

    submitForm();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Revisa estos campos antes de continuar:");
    expect(alert).toHaveTextContent("Teléfono móvil");
    expect(alert).toHaveTextContent("Cruce");
    // Campos sin error NO salen en el resumen.
    expect(alert).not.toHaveTextContent("Nombre completo");
  });

  it("marca los campos inválidos con aria-invalid + aria-describedby al FieldHint", async () => {
    vi.mocked(saveDatosAction).mockResolvedValue({
      error: "Revisa los datos de contacto",
      fieldErrors: {
        phone: ["Debe ser un móvil colombiano de 10 dígitos (300...)"],
        cruceNumber: ["Formato: número-número (ej. 15-20, 13B-42)"],
      },
    });
    renderForm();

    submitForm();

    await screen.findByRole("alert");
    const phone = document.querySelector<HTMLInputElement>("#phone-display")!;
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(phone).toHaveAttribute("aria-describedby", "phone-error");
    expect(document.querySelector("#phone-error")).toHaveTextContent(
      "Debe ser un móvil colombiano de 10 dígitos (300...)",
    );
    const cruce = document.querySelector<HTMLInputElement>("#cruceNumber")!;
    expect(cruce).toHaveAttribute("aria-invalid", "true");
    expect(cruce).toHaveAttribute("aria-describedby", "cruceNumber-error");
    // Campo sin error no queda marcado.
    expect(document.querySelector("#fullName")).toHaveAttribute("aria-invalid", "false");
  });

  it("hace scrollIntoView + foco al PRIMER campo con error (orden del form)", async () => {
    vi.mocked(saveDatosAction).mockResolvedValue({
      error: "Revisa los datos de contacto",
      fieldErrors: {
        phone: ["Debe ser un móvil colombiano de 10 dígitos (300...)"],
        cruceNumber: ["Formato: número-número (ej. 15-20, 13B-42)"],
      },
    });
    renderForm();

    submitForm();

    // phone va antes que cruceNumber en el form → es el destino del scroll.
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    const phone = document.querySelector<HTMLInputElement>("#phone-display")!;
    expect(scrollSpy.mock.contexts[0]).toBe(phone);
    expect(document.activeElement).toBe(phone);
  });

  it("también funciona con errores de validación cliente (formato inválido, sin server)", async () => {
    renderForm();
    // Teléfono con formato inválido: pasa la validación nativa (required) pero
    // no validatePhone → error cliente visible tras el submit (punish late).
    fireEvent.change(document.querySelector("#phone-display")!, { target: { value: "123" } });

    submitForm();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Teléfono móvil");
    expect(document.querySelector("#phone-display")).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
  });

  it("los items del resumen saltan al campo correspondiente", async () => {
    vi.mocked(saveDatosAction).mockResolvedValue({
      error: "Revisa los datos de contacto",
      fieldErrors: {
        phone: ["Debe ser un móvil colombiano de 10 dígitos (300...)"],
        cruceNumber: ["Formato: número-número (ej. 15-20, 13B-42)"],
      },
    });
    renderForm();

    submitForm();
    const alert = await screen.findByRole("alert");
    scrollSpy.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Cruce" }));

    expect(alert).toBeInTheDocument();
    expect(scrollSpy).toHaveBeenCalled();
    expect(document.activeElement).toBe(document.querySelector("#cruceNumber"));
  });
});

/*
 * CP derivado de la ciudad (owner 2026-10-07): el catálogo DANE trae el CP REAL
 * de las principales ciudades (Bogotá 110111, Medellín 050001) y se prellena al
 * elegir ciudad — editable siempre. Ciudades sin CP municipal → prefijo
 * departamental parcial. Placeholder neutro y hint que aclara que no se pide
 * para cotizar.
 */
describe("DatosForm — código postal derivado de la ciudad (owner 2026-10-07)", () => {
  it("elegir Bogotá prellena el CP real (110111), editable", () => {
    renderForm();
    fireEvent.change(document.querySelector("#deptCode")!, { target: { value: "11" } });
    fireEvent.change(document.querySelector("#cityCode")!, { target: { value: "11001" } });
    expect(document.querySelector<HTMLInputElement>("#zip")!.value).toBe("110111");
    fireEvent.change(document.querySelector("#zip")!, { target: { value: "110411" } });
    expect(document.querySelector<HTMLInputElement>("#zip")!.value).toBe("110411");
  });

  it("elegir Medellín prellena su CP real (050001), no el de Bogotá", () => {
    renderForm();
    fireEvent.change(document.querySelector("#deptCode")!, { target: { value: "05" } });
    fireEvent.change(document.querySelector("#cityCode")!, { target: { value: "05001" } });
    expect(document.querySelector<HTMLInputElement>("#zip")!.value).toBe("050001");
  });

  it("ciudad sin CP municipal → prellena solo el prefijo departamental", () => {
    renderForm();
    fireEvent.change(document.querySelector("#deptCode")!, { target: { value: "05" } });
    // Abejorral (05002) no tiene zip municipal en el catálogo.
    fireEvent.change(document.querySelector("#cityCode")!, { target: { value: "05002" } });
    expect(document.querySelector<HTMLInputElement>("#zip")!.value).toBe("05");
  });

  it("cambiar de departamento limpia el CP", () => {
    renderForm();
    fireEvent.change(document.querySelector("#deptCode")!, { target: { value: "11" } });
    fireEvent.change(document.querySelector("#cityCode")!, { target: { value: "11001" } });
    fireEvent.change(document.querySelector("#deptCode")!, { target: { value: "05" } });
    expect(document.querySelector<HTMLInputElement>("#zip")!.value).toBe("");
  });

  it("el placeholder del CP es neutro (no '110111')", () => {
    renderForm();
    expect(document.querySelector<HTMLInputElement>("#zip")!.placeholder).toBe("Opcional");
  });
});

/*
 * Fix QA STG 2026-10 (item 3.2) — validación de dirección con mensaje
 * ESPECÍFICO de qué falta: el cruce incompleto ("15-") y la vía sin número
 * se rechazan en cliente al salir del campo (mismo validador del server).
 */
describe("DatosForm — validación de vía/cruce con mensaje específico", () => {
  it('cruce incompleto "15-" → "Falta el número después del guion…" al salir del campo', () => {
    renderForm();
    const cruce = document.querySelector<HTMLInputElement>("#cruceNumber")!;
    fireEvent.change(cruce, { target: { value: "15-" } });
    fireEvent.blur(cruce);
    expect(cruce).toHaveAttribute("aria-invalid", "true");
    expect(document.querySelector("#cruceNumber-error")).toHaveTextContent(
      "Falta el número después del guion",
    );
  });

  it('cruce completo "45-10" no muestra error', () => {
    renderForm();
    const cruce = document.querySelector<HTMLInputElement>("#cruceNumber")!;
    fireEvent.change(cruce, { target: { value: "45-10" } });
    fireEvent.blur(cruce);
    expect(cruce).toHaveAttribute("aria-invalid", "false");
  });

  it("vía con letras sueltas (sin número) → mensaje de que empieza con número", () => {
    renderForm();
    const via = document.querySelector<HTMLInputElement>("#viaNumber")!;
    fireEvent.change(via, { target: { value: "sur" } });
    fireEvent.blur(via);
    expect(document.querySelector("#viaNumber-error")).toHaveTextContent("empieza con número");
  });

  it("el hint de la vía muestra un ejemplo según el tipo elegido", () => {
    renderForm();
    // Default "Calle" → ejemplo "Calle 3".
    expect(document.querySelector("#viaNumber-error")).toHaveTextContent("Calle 3");
    fireEvent.change(document.querySelector('select[name="viaType"]')!, {
      target: { value: "Transversal" },
    });
    expect(document.querySelector("#viaNumber-error")).toHaveTextContent("Transversal 2Bis");
  });
});

/*
 * "Guardar esta dirección en mi cuenta" vs direcciones guardadas (2026-10-12):
 * cuando el cliente logueado aplica una dirección guardada y NO edita nada,
 * guardarla de nuevo no tendría efecto → el checkbox queda DESHABILITADO con
 * hint "Ya está guardada en tu cuenta" (más transparente que ocultarlo). Si
 * edita cualquier campo de la dirección, el checkbox se rehabilita (hay una
 * variante nueva que sí tiene sentido guardar).
 */
describe("DatosForm — 'Guardar en mi cuenta' con dirección guardada aplicada", () => {
  const SAVED = {
    id: "addr-1",
    label: "Casa",
    line1: "Calle 45 # 12-34 (Apto 301)",
    isDefault: true,
    structured: {
      deptCode: "11",
      cityCode: "11001",
      zip: "110111",
      localityId: "",
      neighborhood: "Chapinero",
      kind: "urban",
      viaType: "Calle",
      viaNumber: "45",
      viaBis: false,
      viaCardinal: "",
      cruceNumber: "12-34",
      cruceCardinal: "",
      detail: "Apto 301",
    },
    deptCode: "11",
    cityCode: "11001",
    zip: "110111",
    phone: "3001234567",
  };

  function renderWithSaved() {
    return render(
      <DatosForm
        initial={{ step: 1, updatedAt: 0 }}
        texts={DEFAULT_CHECKOUT_TEXTS.datos}
        canSaveAddress
        savedAddresses={[SAVED]}
      />,
    );
  }

  function saveCheckbox() {
    return document.querySelector<HTMLInputElement>('input[name="saveToAccount"]')!;
  }

  function applySaved() {
    fireEvent.change(document.querySelector("#saved-address")!, { target: { value: "addr-1" } });
  }

  it("sin dirección guardada aplicada, el checkbox está habilitado (flujo normal)", () => {
    renderWithSaved();
    expect(saveCheckbox()).toBeEnabled();
  });

  it("aplicar una guardada SIN editar nada → checkbox deshabilitado + hint", () => {
    renderWithSaved();
    applySaved();
    // Sanidad: los campos efectivamente quedaron precargados.
    expect(document.querySelector<HTMLInputElement>("#viaNumber")!.value).toBe("45");
    expect(saveCheckbox()).toBeDisabled();
    expect(saveCheckbox()).not.toBeChecked();
    expect(screen.getByText(DEFAULT_CHECKOUT_TEXTS.datos.saveCheckSavedHint)).toBeInTheDocument();
  });

  it("editar cualquier campo de la dirección rehabilita el checkbox", () => {
    renderWithSaved();
    applySaved();
    expect(saveCheckbox()).toBeDisabled();
    fireEvent.change(document.querySelector("#viaNumber")!, { target: { value: "45A" } });
    expect(saveCheckbox()).toBeEnabled();
    expect(screen.queryByText(DEFAULT_CHECKOUT_TEXTS.datos.saveCheckSavedHint)).toBeNull();
  });

  it("aplicar una guardada desmarca un 'guardar' previamente marcado", () => {
    renderWithSaved();
    fireEvent.click(saveCheckbox());
    expect(saveCheckbox()).toBeChecked();
    applySaved();
    expect(saveCheckbox()).not.toBeChecked();
    expect(saveCheckbox()).toBeDisabled();
  });
});

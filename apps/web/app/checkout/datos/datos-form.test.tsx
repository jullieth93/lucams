// @vitest-environment jsdom
/*
 * Test de componente — DatosForm, sección Facturación (2026-10-05).
 *
 * Cubre el botón "Usar los datos del comprador":
 *   1. Copia EXPLÍCITA (no sincronización opaca) de nombre + documento del
 *      bloque de contacto a los campos de facturación.
 *   2. La copia se puede re-disparar tras editar el contacto.
 *   3. Tipo de documento del contacto no facturable (TI) no se aplica al
 *      select de billing (no lo ofrece); nombre y número sí copian.
 *   4. Los campos conservan los mismos `name` (el envío del form no cambia).
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

function enableBilling() {
  fireEvent.click(document.querySelector<HTMLInputElement>('input[name="wantsInvoice"]')!);
}

function billingFields() {
  return {
    type: document.querySelector<HTMLSelectElement>("#billingDocumentType")!,
    number: document.querySelector<HTMLInputElement>("#billingDocumentNumber")!,
    name: document.querySelector<HTMLInputElement>("#billingName")!,
  };
}

describe("DatosForm — 'Usar los datos del comprador' (facturación)", () => {
  it("copia nombre y documento del bloque de contacto a facturación", () => {
    renderForm();
    fireEvent.change(document.querySelector("#fullName")!, {
      target: { value: "Valentina Rojas" },
    });
    fireEvent.change(document.querySelector('select[name="contactDocumentType"]')!, {
      target: { value: "CC" },
    });
    fireEvent.change(document.querySelector("#contactDocumentNumber")!, {
      target: { value: "1032509876" },
    });
    enableBilling();

    fireEvent.click(screen.getByRole("button", { name: /usar los datos del comprador/i }));

    const billing = billingFields();
    expect(billing.name.value).toBe("Valentina Rojas");
    expect(billing.type.value).toBe("CC");
    expect(billing.number.value).toBe("1032509876");
  });

  it("la copia es una acción re-disparable: si el contacto cambia, se re-copia", () => {
    renderForm();
    enableBilling();
    const copyBtn = screen.getByRole("button", { name: /usar los datos del comprador/i });

    fireEvent.change(document.querySelector("#fullName")!, { target: { value: "Ana Gómez" } });
    fireEvent.click(copyBtn);
    expect(billingFields().name.value).toBe("Ana Gómez");

    // El cliente edita el contacto DESPUÉS de la primera copia → re-dispara.
    fireEvent.change(document.querySelector("#fullName")!, { target: { value: "Ana Gómez Paz" } });
    fireEvent.click(copyBtn);
    expect(billingFields().name.value).toBe("Ana Gómez Paz");
  });

  it("documento de contacto tipo TI (no facturable) no cambia el select de billing", () => {
    renderForm();
    fireEvent.change(document.querySelector('select[name="contactDocumentType"]')!, {
      target: { value: "TI" },
    });
    fireEvent.change(document.querySelector("#contactDocumentNumber")!, {
      target: { value: "1088123456" },
    });
    fireEvent.change(document.querySelector("#fullName")!, { target: { value: "Luis Niño" } });
    enableBilling();

    fireEvent.click(screen.getByRole("button", { name: /usar los datos del comprador/i }));

    const billing = billingFields();
    expect(billing.type.value).toBe("NIT"); // default intacto
    expect(billing.number.value).toBe("1088123456");
    expect(billing.name.value).toBe("Luis Niño");
  });

  it("los campos de facturación conservan los names que espera saveDatosAction", () => {
    renderForm();
    enableBilling();
    expect(document.querySelector('select[name="billingDocumentType"]')).toBeInTheDocument();
    expect(document.querySelector('input[name="billingDocumentNumber"]')).toBeInTheDocument();
    expect(document.querySelector('input[name="billingName"]')).toBeInTheDocument();
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
 * Fix QA STG 2026-10 (item 3.1) — el CP de Bogotá ("110111") se AUTORRELLENABA
 * al elegir ciudad y el owner lo confundió con el número de pedido. Ahora:
 * NO hay autofill, el placeholder es neutro ("Opcional") y el hint explica
 * que no se pide para cotizar.
 */
describe("DatosForm — código postal sin autofill (fix QA STG 2026-10)", () => {
  it("elegir departamento + ciudad NO rellena el CP", () => {
    renderForm();
    fireEvent.change(document.querySelector("#deptCode")!, { target: { value: "11" } });
    fireEvent.change(document.querySelector("#cityCode")!, { target: { value: "11001" } });
    expect(document.querySelector<HTMLInputElement>("#zip")!.value).toBe("");
  });

  it("el placeholder del CP es neutro (no '110111')", () => {
    renderForm();
    expect(document.querySelector<HTMLInputElement>("#zip")!.placeholder).toBe("Opcional");
  });

  it("el CP que el cliente escribe se conserva (sigue siendo editable)", () => {
    renderForm();
    fireEvent.change(document.querySelector("#zip")!, { target: { value: "110411" } });
    expect(document.querySelector<HTMLInputElement>("#zip")!.value).toBe("110411");
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

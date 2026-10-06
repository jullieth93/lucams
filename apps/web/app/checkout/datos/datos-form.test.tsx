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

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("./actions", () => ({
  saveDatosAction: vi.fn(async () => null),
}));

import { DatosForm } from "./datos-form";
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

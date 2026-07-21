// @vitest-environment jsdom
/*
 * Test de componente — QuoteForm (checkout modo catálogo, Etapa 1).
 *
 * Cubre SOLO la lógica propia del form (el schema Zod ya tiene sus tests en
 * features/quotes/service.test.ts):
 *   - render de los campos que espera createQuoteAction (nombres exactos).
 *   - validación de vacíos: el form no pasa checkValidity sin los requeridos.
 *   - wiring del WhatsApp: el display se auto-formatea ("300 887 3826") y el
 *     hidden `customerWhatsapp` viaja sin formato (10 dígitos).
 *   - wiring DANE: los <select> guardan el CÓDIGO y los hidden
 *     `department`/`city` llevan el NOMBRE humano (lo que persiste la Quote).
 *   - copy clave visible: "El envío se coordina por WhatsApp…".
 *
 * Se mockea @/features/quotes/actions (importa la capa server "server-only")
 * y useRouter de next/navigation (no hay App Router montado en jsdom).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/features/quotes/actions", () => ({
  createQuoteAction: vi.fn(async () => null),
}));

import { QuoteForm } from "./quote-form";

afterEach(cleanup);

function getForm(): HTMLFormElement {
  const form = document.querySelector("form");
  if (!form) throw new Error("QuoteForm no renderizó <form>");
  return form;
}

describe("QuoteForm", () => {
  it("renderiza los campos que espera createQuoteAction (nombres exactos)", () => {
    render(<QuoteForm />);

    expect(screen.getByText(/pide tu cotización/i)).toBeInTheDocument();
    expect(document.querySelector('input[name="customerName"]')).toBeInTheDocument();
    expect(document.querySelector('input[name="customerWhatsapp"]')).toBeInTheDocument();
    expect(document.querySelector('input[name="customerEmail"]')).toBeInTheDocument();
    expect(document.querySelector('input[name="department"]')).toBeInTheDocument();
    expect(document.querySelector('input[name="city"]')).toBeInTheDocument();
    expect(document.querySelector('textarea[name="notes"]')).toBeInTheDocument();
  });

  it("muestra el copy clave: el envío se coordina por WhatsApp", () => {
    render(<QuoteForm />);
    expect(
      screen.getByText(/el envío se coordina por whatsapp al confirmar tu cotización/i),
    ).toBeInTheDocument();
  });

  it("el form vacío NO pasa validación nativa (requeridos: nombre, WhatsApp, depto, ciudad)", () => {
    render(<QuoteForm />);
    expect(getForm().checkValidity()).toBe(false);
  });

  it("auto-formatea el WhatsApp en pantalla y envía los 10 dígitos limpios en el hidden", () => {
    render(<QuoteForm />);
    const display = document.querySelector<HTMLInputElement>("#whatsapp-display")!;
    fireEvent.change(display, { target: { value: "3008873826" } });

    expect(display.value).toBe("300 887 3826");
    expect(document.querySelector<HTMLInputElement>('input[name="customerWhatsapp"]')!.value).toBe(
      "3008873826",
    );
  });

  it("sincroniza los hidden department/city con el NOMBRE humano al elegir en los selects DANE", () => {
    render(<QuoteForm />);

    fireEvent.change(document.querySelector("#deptCode")!, { target: { value: "11" } });
    // La ciudad se habilita solo tras elegir departamento.
    const citySelect = document.querySelector<HTMLSelectElement>("#cityCode")!;
    expect(citySelect.disabled).toBe(false);
    fireEvent.change(citySelect, { target: { value: "11001" } });

    expect(document.querySelector<HTMLInputElement>('input[name="department"]')!.value).toBe(
      "Bogotá D.C.",
    );
    expect(document.querySelector<HTMLInputElement>('input[name="city"]')!.value).toBe(
      "Bogotá D.C.",
    );
  });
});

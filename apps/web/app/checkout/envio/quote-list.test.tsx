// @vitest-environment jsdom
/*
 * Test de componente — QuoteList (logos de transportadora, 2026-09-29).
 *
 * Cubre la rama nueva del step 2 de checkout:
 *   1. Carrier con logo en el mapa (lib/carrier-logos.ts) → <img> con el asset
 *      correcto (Servientrega oficial, mascota Lucam's para el envío propio).
 *   2. Carrier SIN logo → fallback al ícono genérico (círculo Truck/Check),
 *      sin <img> de carrier.
 *   3. La lógica de selección queda intacta (primer quote preseleccionado).
 *
 * `./actions` se mockea: es un módulo "use server" (db, stage-guard) que no
 * aplica a un render unitario.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CheckoutTexts } from "../checkout-texts";
import type { ShippingSelectionInput } from "@/features/checkout/schemas";
import { QuoteList } from "./quote-list";

vi.mock("./actions", () => ({
  selectShippingAction: vi.fn(),
}));

afterEach(cleanup);

const TEXTS: CheckoutTexts["shipping"] = {
  loading: "Cargando",
  loadingSub: "Un momento",
  errorTitle: "Error",
  errorNote: "Nota",
  estimatedNote: "Estimado",
  errorReselectSuffix: "Re-selecciona",
  errorAddress: "Dirección",
  errorWa: "WhatsApp",
  listTitle: "Opciones de envío",
  free: "Gratis",
  lucamsToday: "Entrega hoy (pedido antes de las {{cutoff}}:00)",
  lucamsDays: "{{days}} días hábiles",
  note: "Nota de tiempos",
  back: "Volver",
  next: "Continuar",
};

function quote(partial: Partial<ShippingSelectionInput>): ShippingSelectionInput {
  return {
    carrier: "servientrega",
    carrierName: "Servientrega",
    fleteCop: 1200000,
    deliveryDays: 2,
    contraentrega: false,
    quoteId: `q-${partial.carrier ?? "x"}`,
    ...partial,
  };
}

function renderList(quotes: ShippingSelectionInput[]) {
  return render(
    <QuoteList quotes={quotes} offersToken="token" texts={TEXTS} lucamsCutoffHour={12} />,
  );
}

describe("QuoteList — logos de transportadora", () => {
  it("muestra el logo oficial cuando el carrier está en el mapa", () => {
    renderList([quote({ carrier: "servientrega", carrierName: "Servientrega" })]);
    const img = screen.getByAltText("Logo de Servientrega");
    expect(decodeURIComponent(img.getAttribute("src") ?? "")).toContain(
      "/carriers/servientrega.svg",
    );
  });

  it("el envío propio lucams usa el asset de marca existente", () => {
    renderList([
      quote({ carrier: "lucams", carrierName: "Envío Lucam's", quoteId: "lucams-bog-chapinero" }),
    ]);
    const img = screen.getByAltText("Logo de Lucam's");
    expect(decodeURIComponent(img.getAttribute("src") ?? "")).toContain("/brand/lucams-mascot.png");
  });

  it("cae al ícono genérico (sin <img> de carrier) cuando no hay logo en el mapa", () => {
    const { container } = renderList([
      quote({ carrier: "dhl-express", carrierName: "DHL Express" }),
    ]);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    // El ícono Truck de lucide es un <svg> dentro del círculo fallback.
    expect(container.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("DHL Express")).toBeInTheDocument();
  });

  it("mapea variantes de Aveonline con sufijo societario al logo existente", () => {
    renderList([quote({ carrier: "TCC S.A.S.", carrierName: "TCC S.A.S." })]);
    const img = screen.getByAltText("Logo de TCC");
    expect(decodeURIComponent(img.getAttribute("src") ?? "")).toContain("/carriers/tcc-sa.svg");
  });

  it("sin logo, el nombre crudo en MAYÚSCULAS se muestra formateado (title case)", () => {
    renderList([quote({ carrier: "transcol", carrierName: "TRANSCOL SOLUTIONS" })]);
    expect(screen.getByText("Transcol Solutions")).toBeInTheDocument();
    expect(screen.queryByText("TRANSCOL SOLUTIONS")).not.toBeInTheDocument();
  });

  it("mantiene la selección por defecto (primer quote) con logos presentes", () => {
    renderList([
      quote({ carrier: "servientrega", quoteId: "q-1" }),
      quote({ carrier: "tcc-sa", carrierName: "TCC SA", quoteId: "q-2" }),
    ]);
    const radios = screen.getAllByRole("radio");
    expect(radios[0]).toBeChecked();
    expect(radios[1]).not.toBeChecked();
  });
});

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
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  lucamsBadge: "LUCAMS",
  lucamsBadgeToday: "LUCAMS · mismo día",
  note: "Nota de tiempos",
  back: "Volver",
  next: "Continuar",
  nextPending: "Continuando…",
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

  it("el envío propio lucams usa el asset de marca existente y el nombre corto LUCAMS", () => {
    renderList([
      quote({ carrier: "lucams", carrierName: "LUCAMS", quoteId: "lucams-bog-chapinero" }),
    ]);
    const img = screen.getByAltText("Logo de Lucam's");
    expect(decodeURIComponent(img.getAttribute("src") ?? "")).toContain("/brand/lucams-mascot.png");
    // Nombre corto de marca (title del div del nombre — también hay badge LUCAMS).
    expect(screen.getByTitle("LUCAMS")).toBeInTheDocument();
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

  it("resuelve la promesa del envío propio: hoy (0 días) vs días hábiles, con el cutoff inyectado", () => {
    renderList([
      quote({
        carrier: "lucams",
        carrierName: "LUCAMS",
        quoteId: "lucams-bog-chapinero",
        deliveryDays: 0,
      }),
      quote({
        carrier: "lucams",
        carrierName: "LUCAMS",
        quoteId: "lucams-bog-usaquen",
        deliveryDays: 2,
      }),
    ]);
    expect(screen.getByText(/Entrega hoy \(pedido antes de las 12:00\)/)).toBeInTheDocument();
    expect(screen.getByText(/^2 días hábiles$/)).toBeInTheDocument();
    expect(screen.getByText(/LUCAMS · mismo día/)).toBeInTheDocument();
  });
});

describe("QuoteList — feedback del CTA (SubmitButton, fix 1.5)", () => {
  it("el CTA principal es un submit con aria-busy (patrón useFormStatus anti doble-click)", () => {
    renderList([quote({ carrier: "servientrega" })]);
    const cta = screen.getByRole("button", { name: "Continuar" });
    expect(cta).toHaveAttribute("type", "submit");
    // aria-busy lo pone SubmitButton (useFormStatus) — en reposo es false.
    expect(cta).toHaveAttribute("aria-busy", "false");
    expect(cta).not.toBeDisabled();
  });

  it("muestra spinner + texto pending mientras el server action procesa", async () => {
    // Form action colgado: useFormStatus queda pending=true hasta que resuelva.
    let resolveAction: (() => void) | undefined;
    const { container } = render(
      <QuoteList
        quotes={[quote({ carrier: "servientrega" })]}
        offersToken="token"
        texts={TEXTS}
        lucamsCutoffHour={12}
      />,
    );
    const form = container.querySelector("form")!;
    // Interceptamos el action del form con una promesa que controlamos.
    const { selectShippingAction } = await import("./actions");
    vi.mocked(selectShippingAction).mockReturnValue(
      new Promise<void>((res) => {
        resolveAction = res;
      }),
    );
    fireEvent.submit(form);
    const cta = await screen.findByRole("button", { name: /Continuando…/ });
    expect(cta).toHaveAttribute("aria-busy", "true");
    expect(cta).toBeDisabled();
    expect(container.querySelector("svg.animate-spin")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Continuar" })).not.toBeInTheDocument();
    resolveAction?.();
  });
});

describe("QuoteList — layout robusto (fix QA STG 2026-10)", () => {
  it("la caja del logo tiene dimensiones FIJAS (mismo alto y ancho en todas las filas)", () => {
    renderList([
      quote({ carrier: "servientrega", quoteId: "q-1" }),
      quote({ carrier: "interrapidisimo", carrierName: "Interrapidísimo", quoteId: "q-2" }),
      quote({ carrier: "lucams", carrierName: "LUCAMS", quoteId: "q-3" }),
    ]);
    const boxes = screen
      .getAllByRole("img")
      .map((img) => img.parentElement)
      .filter(Boolean) as HTMLElement[];
    expect(boxes).toHaveLength(3);
    for (const box of boxes) {
      expect(box.className).toContain("h-10");
      expect(box.className).toContain("w-24");
    }
  });

  it("el nombre se trunca con elegancia (truncate + title con el nombre completo)", () => {
    renderList([
      quote({
        carrier: "servientrega",
        carrierName: "Servientrega Con Un Nombre Larguísimo S.A.S.",
      }),
    ]);
    const name = screen.getByTitle("Servientrega Con Un Nombre Larguísimo S.A.S.");
    expect(name.className).toContain("truncate");
  });

  it("el precio móvil va en su PROPIA fila (no comparte fila con el nombre)", () => {
    renderList([quote({ carrier: "servientrega" })]);
    const name = screen.getByTitle("Servientrega");
    // El precio móvil (sm:hidden) NO es hermano del nombre dentro de un
    // flex justify-between: vive en un div propio debajo del bloque de texto.
    const mobilePrice = name.parentElement!.querySelector(".sm\\:hidden");
    expect(mobilePrice).not.toBeNull();
    expect(mobilePrice).toHaveTextContent("$");
    expect(name.parentElement!.querySelector(".justify-between")).toBeNull();
    // Y la copia desktop sigue existiendo (hidden sm:block).
    const label = name.closest("label")!;
    const desktopPrice = label.querySelector(":scope > .hidden.sm\\:block");
    expect(desktopPrice).not.toBeNull();
  });

  it("el badge del envío propio usa los textos CMS (marca corta LUCAMS)", () => {
    renderList([
      quote({ carrier: "lucams", carrierName: "LUCAMS", quoteId: "l-1", deliveryDays: 3 }),
    ]);
    expect(screen.getByText("LUCAMS", { selector: "span" })).toBeInTheDocument();
  });
});

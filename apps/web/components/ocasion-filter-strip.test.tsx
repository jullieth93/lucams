// @vitest-environment jsdom
/*
 * Test de componente — OcasionFilterStrip (Lucy 2026-07-03).
 *
 * Strip de chips para filtrar por ocasión (mutually exclusive, toggle).
 * Sigue el estilo de product-card.test.tsx: queries ACCESIBLES
 * (getByRole('button')) y cleanup manual (globals:false).
 *
 * next/navigation se mockea: useRouter().push captura la URL construida y
 * useSearchParams() devuelve un URLSearchParams real controlado por test →
 * verificamos el estado activo (según ?ocasion) y el params que se empuja al
 * router al hacer click (agregar / toggle-off / cambiar / preservar otros).
 *
 * NOTA: el repo no tiene @testing-library/user-event instalado → usamos
 * fireEvent (viene con @testing-library/react). Para <button> nativo, un
 * fireEvent.click cubre la interacción real del usuario.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { OcasionFilterStrip } from "./ocasion-filter-strip";
import type { OcasionData } from "@/lib/catalog";

// vitest.config usa globals:false → sin cleanup manual los renders se acumulan.
afterEach(() => cleanup());

// --- Mock de next/navigation --------------------------------------------
// push captura la última URL. currentSearch controla lo que devuelve
// useSearchParams (URLSearchParams REAL, mismo API que en runtime).
const push = vi.fn();
let currentSearch = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

// lucide-react X: no lo mockeamos (es SVG puro sin deps de Next), pero
// aseguramos su presencia por el marcador del botón activo abajo.

beforeEach(() => {
  push.mockClear();
  currentSearch = "";
});

function makeOcasion(over: Partial<OcasionData> = {}): OcasionData {
  return {
    slug: "cumpleanos",
    name: "Cumpleaños",
    description: "",
    monthHint: null,
    suggestedQuantityRange: null,
    productCount: 5,
    ...over,
  };
}

const OCASIONES: OcasionData[] = [
  makeOcasion({ slug: "cumpleanos", name: "Cumpleaños" }),
  makeOcasion({ slug: "aniversario", name: "Aniversario" }),
  makeOcasion({ slug: "navidad", name: "Navidad" }),
];

describe("OcasionFilterStrip", () => {
  it("renderiza un botón por ocasión con su nombre + el label 'Ocasión'", () => {
    render(<OcasionFilterStrip ocasiones={OCASIONES} />);
    expect(screen.getByText("Ocasión")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    for (const o of OCASIONES) {
      expect(screen.getByRole("button", { name: o.name })).toBeInTheDocument();
    }
  });

  it("no renderiza nada cuando la lista de ocasiones está vacía", () => {
    const { container } = render(<OcasionFilterStrip ocasiones={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Ocasión")).not.toBeInTheDocument();
  });

  it("marca como activa la ocasión que coincide con ?ocasion (fondo brand + icono X)", () => {
    currentSearch = "ocasion=navidad";
    render(<OcasionFilterStrip ocasiones={OCASIONES} />);

    const activa = screen.getByRole("button", { name: /Navidad/ });
    expect(activa).toHaveClass("bg-brand-purple");
    // El botón activo antepone el icono X (lucide → <svg>).
    expect(activa.querySelector("svg")).toBeInTheDocument();

    // Las demás NO están activas: sin fondo brand ni icono.
    const inactiva = screen.getByRole("button", { name: "Cumpleaños" });
    expect(inactiva).not.toHaveClass("bg-brand-purple");
    expect(inactiva.querySelector("svg")).not.toBeInTheDocument();
  });

  it("sin ?ocasion ninguna ocasión aparece activa", () => {
    currentSearch = "";
    render(<OcasionFilterStrip ocasiones={OCASIONES} />);
    for (const o of OCASIONES) {
      const btn = screen.getByRole("button", { name: o.name });
      expect(btn).not.toHaveClass("bg-brand-purple");
      expect(btn.querySelector("svg")).not.toBeInTheDocument();
    }
  });

  it("click en una ocasión no seleccionada empuja /productos?ocasion=<slug>", () => {
    render(<OcasionFilterStrip ocasiones={OCASIONES} />);

    fireEvent.click(screen.getByRole("button", { name: "Aniversario" }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/productos?ocasion=aniversario");
  });

  it("click en la ocasión YA seleccionada la quita (toggle-off → sin ?ocasion)", () => {
    currentSearch = "ocasion=cumpleanos";
    render(<OcasionFilterStrip ocasiones={OCASIONES} />);

    // El botón activo lleva el icono X en el nombre accesible.
    fireEvent.click(screen.getByRole("button", { name: /Cumpleaños/ }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/productos?");
  });

  it("click en OTRA ocasión reemplaza la selección (mutually exclusive)", () => {
    currentSearch = "ocasion=cumpleanos";
    render(<OcasionFilterStrip ocasiones={OCASIONES} />);

    fireEvent.click(screen.getByRole("button", { name: "Navidad" }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/productos?ocasion=navidad");
  });

  it("preserva otros query params al cambiar la ocasión", () => {
    currentSearch = "categoria=fotoimanes&sort=precio-asc";
    render(<OcasionFilterStrip ocasiones={OCASIONES} />);

    fireEvent.click(screen.getByRole("button", { name: "Cumpleaños" }));

    expect(push).toHaveBeenCalledTimes(1);
    const url = push.mock.calls[0][0] as string;
    expect(url.startsWith("/productos?")).toBe(true);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("categoria")).toBe("fotoimanes");
    expect(params.get("sort")).toBe("precio-asc");
    expect(params.get("ocasion")).toBe("cumpleanos");
  });

  it("preserva otros params al hacer toggle-off (solo elimina ocasion)", () => {
    currentSearch = "ocasion=navidad&categoria=stickers";
    render(<OcasionFilterStrip ocasiones={OCASIONES} />);

    fireEvent.click(screen.getByRole("button", { name: /Navidad/ }));

    expect(push).toHaveBeenCalledTimes(1);
    const url = push.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.has("ocasion")).toBe(false);
    expect(params.get("categoria")).toBe("stickers");
  });

  it("los chips son <button> nativos (semántica accesible + activables por teclado)", () => {
    render(<OcasionFilterStrip ocasiones={OCASIONES} />);

    const btn = screen.getByRole("button", { name: "Cumpleaños" });
    // <button> nativo → foco por teclado y activación por Enter/Espacio via
    // semántica del navegador (no un <div> con onClick sin rol/tabindex).
    expect(btn.tagName).toBe("BUTTON");
    btn.focus();
    expect(btn).toHaveFocus();
  });
});

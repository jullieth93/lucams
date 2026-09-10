// @vitest-environment jsdom

/*
 * Test de la modal de vista previa pre-carrito — SIN stepper "Copias"
 * (regla 2026-09-08b, Lucy: UN concepto de cantidad, "Unidades", elegido en
 * la PDP). Las copias llegan ya decididas vía `initialCopies` (?copies=N de
 * la PDP — solo productos de composición fija) y la modal solo CONFIRMA.
 * Blinda:
 *   1. No hay stepper ni grupo "Copias" (la cantidad se ajusta en el carrito).
 *   2. El total mostrado es unitario × copias de la PDP (mismo cálculo del carrito).
 *   3. onConfirm recibe las copias de la PDP (van como qty al carrito) — 1 por defecto.
 *   4. Con >1 copia se muestra el dato ("N copias idénticas") para que el total no sorprenda.
 *   5. initialCopies fuera de rango se acota a 1..99 (la URL la puede editar cualquiera).
 *
 * La modal usa el mismo Radix Dialog de StudioSlotEditModal (ya testeado en
 * jsdom) y los textos CMS caen al DEFAULT_STUDIO_TEXTS sin provider.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { formatCOP } from "@/lib/format";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as Record<string, string>)} />,
}));

import { StudioPreviewModal } from "./studio-preview-modal";

afterEach(() => cleanup());

// formatCOP usa NBSP (U+00A0) tras el "$"; el comparador de testing-library
// colapsa whitespace. Helper: esperado con espacios normales.
const cop = (centavos: number) => formatCOP(centavos).replace(/\s+/g, " ");

const UNIT_PRICE = 2_400_000; // centavos COP

function baseProps() {
  return {
    isOpen: true,
    previewUrl: "data:image/png;base64,xyz",
    productName: "Fotoimanes cuadrados",
    slotCount: 6,
    unitPrice: UNIT_PRICE,
    isFinalizing: false,
    errorMessage: null,
    onEdit: vi.fn(),
    onConfirm: vi.fn(),
  };
}

describe("StudioPreviewModal — sin stepper de copias (regla 2026-09-08b)", () => {
  it("NO muestra stepper ni grupo 'Copias' (la cantidad viene de la PDP / se ajusta en el carrito)", () => {
    render(<StudioPreviewModal {...baseProps()} initialCopies={4} />);
    expect(screen.queryByRole("group", { name: "Copias" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Aumentar copias")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Disminuir copias")).not.toBeInTheDocument();
  });

  it("con 1 copia (default): total = precio unitario, sin desglose de copias ni c/u", () => {
    render(<StudioPreviewModal {...baseProps()} />);
    expect(screen.getByText(cop(UNIT_PRICE))).toBeInTheDocument();
    expect(screen.queryByText(/c\/u/)).not.toBeInTheDocument();
    expect(screen.queryByText(/copias idénticas/)).not.toBeInTheDocument();
  });

  it("con N copias de la PDP: total = unitario × N, con c/u y el dato de copias", () => {
    render(<StudioPreviewModal {...baseProps()} initialCopies={4} />);
    expect(screen.getByText(cop(UNIT_PRICE * 4))).toBeInTheDocument();
    expect(screen.getByText(`${cop(UNIT_PRICE)} c/u`)).toBeInTheDocument();
    expect(screen.getByText(/4 copias idénticas de tu diseño/)).toBeInTheDocument();
  });

  it("onConfirm recibe las copias de la PDP (van como qty al carrito)", () => {
    const props = baseProps();
    render(<StudioPreviewModal {...props} initialCopies={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Sí, agregar al carrito" }));
    expect(props.onConfirm).toHaveBeenCalledWith(3);
  });

  it("sin initialCopies, onConfirm recibe 1 (default del carrito)", () => {
    const props = baseProps();
    render(<StudioPreviewModal {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Sí, agregar al carrito" }));
    expect(props.onConfirm).toHaveBeenCalledWith(1);
  });

  it("acota initialCopies fuera de rango a 1..99 (la URL la puede editar cualquiera)", () => {
    const propsAlto = baseProps();
    const { unmount } = render(<StudioPreviewModal {...propsAlto} initialCopies={150} />);
    fireEvent.click(screen.getByRole("button", { name: "Sí, agregar al carrito" }));
    expect(propsAlto.onConfirm).toHaveBeenCalledWith(99);
    unmount();

    const propsBajo = baseProps();
    render(<StudioPreviewModal {...propsBajo} initialCopies={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Sí, agregar al carrito" }));
    expect(propsBajo.onConfirm).toHaveBeenCalledWith(1);
  });
});

describe("StudioPreviewModal — modelo MULTI-UNIDAD (unitCount: las unidades van EN el diseño)", () => {
  it("con N unidades: total = unitario × N, dato de unidades y onConfirm recibe 1 (qty del carrito)", () => {
    const props = baseProps();
    render(<StudioPreviewModal {...props} unitCount={2} />);
    expect(screen.getByText(cop(UNIT_PRICE * 2))).toBeInTheDocument();
    expect(screen.getByText(`${cop(UNIT_PRICE)} c/u`)).toBeInTheDocument();
    // La línea dice unidades DISEÑADAS, no "copias idénticas" (concepto eliminado).
    expect(screen.getByText(/2 unidades — cada una con su propio diseño/)).toBeInTheDocument();
    expect(screen.queryByText(/copias idénticas/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, agregar al carrito" }));
    expect(props.onConfirm).toHaveBeenCalledWith(1);
  });

  it("con 1 unidad (unitCount=1): total = precio unitario, sin desglose", () => {
    render(<StudioPreviewModal {...baseProps()} unitCount={1} />);
    expect(screen.getByText(cop(UNIT_PRICE))).toBeInTheDocument();
    expect(screen.queryByText(/c\/u/)).not.toBeInTheDocument();
    expect(screen.queryByText(/unidades — cada una/)).not.toBeInTheDocument();
  });

  it("tiras (productKind=strips): la descripción habla de tiras y fotos por tira, no de imanes", () => {
    render(
      <StudioPreviewModal
        {...baseProps()}
        productKind="strips"
        slotCount={2}
        slotsPerUnit={3}
        unitCount={2}
      />,
    );
    expect(
      screen.getByText(/Esta es la vista previa de las 2 tiras que vas a recibir — cada una con 3 fotos\./),
    ).toBeInTheDocument();
    expect(screen.getByText("2 tiras personalizadas · 3 fotos c/u")).toBeInTheDocument();
    expect(screen.queryByText(/imanes que vas a recibir/)).not.toBeInTheDocument();
  });

  it("una tira (strips, 1 unidad): singular", () => {
    render(
      <StudioPreviewModal {...baseProps()} productKind="strips" slotCount={1} slotsPerUnit={4} />,
    );
    expect(
      screen.getByText(/Esta es la vista previa de la tira que vas a recibir — con 4 fotos\./),
    ).toBeInTheDocument();
    expect(screen.getByText("1 tira personalizada · 4 fotos")).toBeInTheDocument();
  });

  it("calendarios ×2: la descripción y el resumen hablan de 2 calendarios de 12 páginas", () => {
    render(
      <StudioPreviewModal
        {...baseProps()}
        productKind="calendar"
        slotCount={2}
        slotsPerUnit={12}
        unitCount={2}
        calendarYear={2027}
      />,
    );
    expect(
      screen.getByText(/vista previa de tus 2 calendarios 2027 — cada uno con 12 páginas\./),
    ).toBeInTheDocument();
    expect(screen.getByText("2 calendarios personalizados · 12 páginas c/u")).toBeInTheDocument();
  });

  it("unitCount manda sobre initialCopies cuando llegan ambos (modelo nuevo > legacy)", () => {
    const props = baseProps();
    render(<StudioPreviewModal {...props} unitCount={2} initialCopies={5} />);
    expect(screen.getByText(cop(UNIT_PRICE * 2))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, agregar al carrito" }));
    expect(props.onConfirm).toHaveBeenCalledWith(1);
  });
});

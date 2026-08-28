// @vitest-environment jsdom

/*
 * Test del stepper de COPIAS de la modal de vista previa pre-carrito.
 *
 * Las copias (CartItem.qty 1..99) son cuántas unidades IDÉNTICAS del diseño
 * aprobado se imprimen — distinto del tamaño del pack, que ya va horneado en
 * el diseño. Blinda:
 *   1. Arranca en 1 y el total mostrado es el precio unitario.
 *   2. El stepper actualiza el total (unitario × copias) y el "c/u".
 *   3. onConfirm recibe las copias elegidas (van como qty al carrito).
 *   4. Las copias se reinician a 1 en cada apertura de la modal.
 *   5. Respeta min 1 / max 99 (mismo tope del carrito).
 *
 * La modal usa el mismo Radix Dialog de StudioSlotEditModal (ya testeado en
 * jsdom) y los textos CMS caen al DEFAULT_STUDIO_TEXTS sin provider.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

describe("StudioPreviewModal — stepper de copias", () => {
  it("arranca en 1 copia: total = precio unitario y − deshabilitado", () => {
    render(<StudioPreviewModal {...baseProps()} />);
    const copias = screen.getByRole("group", { name: "Copias" });
    expect(within(copias).getByText("1")).toBeInTheDocument();
    expect(screen.getByText(/Imprimimos 1 copia idéntica de tu diseño/)).toBeInTheDocument();
    expect(screen.getByText(cop(UNIT_PRICE))).toBeInTheDocument();
    // Sin "c/u" auxiliar con 1 sola copia.
    expect(screen.queryByText(/c\/u/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Disminuir copias")).toBeDisabled();
  });

  it("el stepper actualiza el total (unitario × copias) y muestra el c/u", () => {
    render(<StudioPreviewModal {...baseProps()} />);
    const copias = screen.getByRole("group", { name: "Copias" });

    fireEvent.click(screen.getByLabelText("Aumentar copias"));
    expect(within(copias).getByText("2")).toBeInTheDocument();
    expect(screen.getByText(cop(UNIT_PRICE * 2))).toBeInTheDocument();
    expect(screen.getByText(`${cop(UNIT_PRICE)} c/u`)).toBeInTheDocument();
    expect(screen.getByText(/Imprimimos 2 copias idénticas de tu diseño/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Disminuir copias"));
    expect(within(copias).getByText("1")).toBeInTheDocument();
    expect(screen.getByText(cop(UNIT_PRICE))).toBeInTheDocument();
  });

  it("onConfirm recibe las copias elegidas (van como qty al carrito)", () => {
    const props = baseProps();
    render(<StudioPreviewModal {...props} />);

    fireEvent.click(screen.getByLabelText("Aumentar copias"));
    fireEvent.click(screen.getByLabelText("Aumentar copias"));
    fireEvent.click(screen.getByRole("button", { name: "Sí, agregar al carrito" }));
    expect(props.onConfirm).toHaveBeenCalledWith(3);
  });

  it("reinicia las copias a 1 cada vez que la modal se abre", () => {
    const props = baseProps();
    const { rerender } = render(<StudioPreviewModal {...props} />);
    fireEvent.click(screen.getByLabelText("Aumentar copias"));
    fireEvent.click(screen.getByLabelText("Aumentar copias"));
    expect(screen.getByText(cop(UNIT_PRICE * 3))).toBeInTheDocument();

    // Cerrar y reabrir: la decisión anterior no se arrastra.
    rerender(<StudioPreviewModal {...props} isOpen={false} />);
    rerender(<StudioPreviewModal {...props} isOpen={true} />);
    const copias = screen.getByRole("group", { name: "Copias" });
    expect(within(copias).getByText("1")).toBeInTheDocument();
    expect(screen.getByText(cop(UNIT_PRICE))).toBeInTheDocument();
  });

  it("respeta el máximo 99 (tope del carrito): + se deshabilita al llegar", () => {
    render(<StudioPreviewModal {...baseProps()} />);
    const increase = screen.getByLabelText("Aumentar copias");
    for (let i = 0; i < 98; i++) {
      fireEvent.click(increase);
    }
    const copias = screen.getByRole("group", { name: "Copias" });
    expect(within(copias).getByText("99")).toBeInTheDocument();
    expect(screen.getByText(cop(UNIT_PRICE * 99))).toBeInTheDocument();
    expect(increase).toBeDisabled();
    expect(screen.getByLabelText("Disminuir copias")).toBeEnabled();
  });
});

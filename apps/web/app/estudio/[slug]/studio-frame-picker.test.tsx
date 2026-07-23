// @vitest-environment jsdom

/*
 * Test del selector de color del marco (Ola 3b, Lucy 2026-07-22): color LIBRE
 * (input type="color") + los 6 de marca como atajos + "Sin marco". El valor viaja
 * como hex #RRGGBB en canvasData.borderColor (mismo contrato de siempre).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StudioFramePicker } from "./studio-frame-picker";
import { FRAME_COLORS } from "@/features/personalization/frame-palette";

afterEach(cleanup);

describe("StudioFramePicker — color libre + atajos (Lucy 2026-07-22)", () => {
  it("los chips de marca llaman onChange con su hex (atajos)", () => {
    const onChange = vi.fn();
    render(<StudioFramePicker colors={FRAME_COLORS} value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Marco rosa" }));
    expect(onChange).toHaveBeenCalledWith("#E85B9F");
    fireEvent.click(screen.getByRole("radio", { name: "Marco negro" }));
    expect(onChange).toHaveBeenCalledWith("#221E25");
  });

  it("'Sin marco' llama onChange(null)", () => {
    const onChange = vi.fn();
    render(<StudioFramePicker colors={FRAME_COLORS} value="#E85B9F" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Sin marco" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("el picker libre emite el hex elegido en MAYÚSCULAS (contrato canvasData.borderColor)", () => {
    const onChange = vi.fn();
    render(<StudioFramePicker colors={FRAME_COLORS} value={null} onChange={onChange} />);
    const input = screen.getByLabelText("Elegir otro color de marco");
    fireEvent.change(input, { target: { value: "#12ab34" } });
    expect(onChange).toHaveBeenCalledWith("#12AB34");
  });

  it("un color personalizado activo marca el chip del picker y muestra el hex", () => {
    render(<StudioFramePicker colors={FRAME_COLORS} value="#123456" onChange={() => {}} />);
    const custom = screen.getByRole("radio", { name: "Elegir otro color" });
    expect(custom.getAttribute("aria-checked")).toBe("true");
    // Ningún chip de marca queda activo.
    expect(screen.getByRole("radio", { name: "Marco rosa" }).getAttribute("aria-checked")).toBe(
      "false",
    );
    expect(screen.getByText(/Color personalizado #123456/i)).toBeTruthy();
  });

  it("un color de la paleta NO cuenta como personalizado", () => {
    render(<StudioFramePicker colors={FRAME_COLORS} value="#5DD9D1" onChange={() => {}} />);
    expect(
      screen.getByRole("radio", { name: "Marco aguamarina" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByRole("radio", { name: "Elegir otro color" }).getAttribute("aria-checked"),
    ).toBe("false");
    expect(screen.queryByText(/Color personalizado/i)).toBeNull();
  });
});

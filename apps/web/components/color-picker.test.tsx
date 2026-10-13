// @vitest-environment jsdom

/*
 * CustomColorPicker — paridad de color en todas las plataformas (reemplazo del
 * <input type="color"> nativo). Contrato cubierto:
 *   1. El trigger conserva el affordance de marca (conic-gradient sin color
 *      elegido; hex sólido + check cuando `active` y hay valor).
 *   2. El panel inline abre/cierra con el trigger, con la X y con Escape.
 *   3. Área saturación/luminosidad: arrastre por pointer events (mock de
 *      getBoundingClientRect) y flechas de teclado (role="slider").
 *   4. Slider de tono nativo y campo HEX con validación (inválido no propaga).
 *   5. Disabled: trigger inerte, el panel no abre.
 *
 * jsdom no implementa PointerEvent ni setPointerCapture: se inyecta un shim de
 * PointerEvent sobre MouseEvent y el componente tolera la falta de capture.
 * Sin @testing-library/user-event en el repo → fireEvent (patrón del repo).
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { hslToHex } from "@/lib/color";
import { CustomColorPicker } from "./color-picker";

beforeAll(() => {
  if (!window.PointerEvent) {
    // @ts-expect-error shim mínimo para jsdom
    window.PointerEvent = class PointerEvent extends MouseEvent {};
  }
});

afterEach(() => cleanup());

function setup(props?: Partial<React.ComponentProps<typeof CustomColorPicker>>) {
  const onChange = vi.fn();
  render(
    <TooltipProvider>
      <CustomColorPicker value={null} onChange={onChange} label="Personalizado" {...props} />
    </TooltipProvider>,
  );
  return onChange;
}

const openPanel = () => {
  fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
  return screen.getByRole("group", { name: "Personalizado" });
};

describe("CustomColorPicker — trigger", () => {
  it("sin valor muestra el conic-gradient de marca y aria-expanded=false", () => {
    setup();
    const trigger = screen.getByRole("button", { name: "Personalizado" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    // jsdom serializa los hex del gradiente a rgb(); basta el affordance.
    expect(trigger.style.background).toContain("conic-gradient");
  });

  it("con valor + active muestra el hex sólido y el check", () => {
    setup({ value: "#E85B9F", active: true });
    const trigger = screen.getByRole("button", { name: "Personalizado" });
    expect(trigger.style.background).toContain("rgb(232, 91, 159)");
    expect(trigger.querySelector("svg")).toBeInTheDocument();
  });

  it("disabled: botón inerte y el panel no abre", () => {
    setup({ disabled: true, hint: "Personalizado" });
    const trigger = screen.getByRole("button", { name: "Personalizado" });
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByRole("group", { name: "Personalizado" })).not.toBeInTheDocument();
  });
});

describe("CustomColorPicker — panel inline", () => {
  it("abre con el trigger y cierra con la X y con Escape", () => {
    setup();
    openPanel();
    expect(screen.getByRole("button", { name: "Personalizado" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Cerrar selector de color" }));
    expect(screen.queryByRole("group")).not.toBeInTheDocument();

    const reopened = openPanel();
    fireEvent.keyDown(reopened, { key: "Escape" });
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("el arrastre en el área sat/lum emite el hex correspondiente (pointer events)", () => {
    const onChange = setup({ value: "#FF0000" }); // h=0, s=100, l=50
    openPanel();
    const area = screen.getByRole("slider", { name: "Saturación y luminosidad" });
    vi.spyOn(area, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    // Centro del área: s=50, l=50 con tono 0 → hslToHex(0, 50, 50).
    fireEvent.pointerDown(area, { clientX: 50, clientY: 50, buttons: 1, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(hslToHex(0, 50, 50));

    // Esquina inferior derecha: s=100, l=0 → negro.
    fireEvent.pointerMove(area, { clientX: 100, clientY: 100, buttons: 1, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith("#000000");
  });

  it("las flechas del teclado ajustan saturación/luminosidad", () => {
    const onChange = setup({ value: "#808080" }); // h=0, s=0, l=50.2
    openPanel();
    const area = screen.getByRole("slider", { name: "Saturación y luminosidad" });

    fireEvent.keyDown(area, { key: "ArrowUp" }); // l 50.2 → 55.2
    expect(onChange).toHaveBeenLastCalledWith(hslToHex(0, 0, 55.2));
    fireEvent.keyDown(area, { key: "ArrowRight" }); // s 0 → 5 (l ya resincronizada)
    expect(onChange).toHaveBeenLastCalledWith(hslToHex(0, 5, 55.2));
  });

  it("el slider de tono emite el nuevo hex", () => {
    const onChange = setup({ value: "#FF0000" }); // h=0, s=100, l=50
    openPanel();
    fireEvent.change(screen.getByRole("slider", { name: "Tono del color" }), {
      target: { value: "120" },
    });
    expect(onChange).toHaveBeenLastCalledWith("#00FF00");
  });

  it("el campo HEX propaga valores válidos normalizados y marca los inválidos", () => {
    const onChange = setup({ value: "#7C6AAD" });
    openPanel();
    const input = screen.getByRole("textbox", { name: "Código de color hexadecimal" });

    fireEvent.change(input, { target: { value: "e85b9f" } });
    expect(onChange).toHaveBeenLastCalledWith("#E85B9F");
    expect(input).not.toHaveAttribute("aria-invalid");

    fireEvent.change(input, { target: { value: "zz" } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(/hex inválido/i);
    // El inválido NO pisa el último color válido.
    expect(onChange).toHaveBeenLastCalledWith("#E85B9F");

    // Forma corta #rgb también vale.
    fireEvent.change(input, { target: { value: "#fff" } });
    expect(onChange).toHaveBeenLastCalledWith("#FFFFFF");
  });

  it("sincroniza el panel cuando el valor externo cambia con el panel abierto", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <TooltipProvider>
        <CustomColorPicker value="#FF0000" onChange={onChange} label="Personalizado" />
      </TooltipProvider>,
    );
    openPanel();
    expect(screen.getByText("#FF0000")).toBeInTheDocument();

    rerender(
      <TooltipProvider>
        <CustomColorPicker value="#00FF00" onChange={onChange} label="Personalizado" />
      </TooltipProvider>,
    );
    expect(screen.getByText("#00FF00")).toBeInTheDocument();
    // El área se repinta sobre el nuevo tono.
    expect(screen.getByRole("slider", { name: "Saturación y luminosidad" })).toHaveAttribute(
      "aria-valuetext",
      expect.stringContaining("#00FF00"),
    );
  });
});

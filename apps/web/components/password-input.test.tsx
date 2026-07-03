// @vitest-environment jsdom
/*
 * Test de componente — PasswordInput (Lucy 2026-07-03).
 *
 * Cubre las cuatro ramas visibles del componente:
 *   1. Toggle mostrar/ocultar → alterna type password↔text + aria-label/aria-pressed.
 *   2. Propagación del value (controlado vía onValueChange + no-controlado interno).
 *   3. Strength meter opcional (segmentos + label + suggestion, solo con showStrength y value).
 *   4. Aviso de Caps Lock (getModifierState en keydown/keyup, se limpia en blur).
 *
 * Notas de setup (heredadas de product-card.test.tsx):
 *   - vitest.config usa globals:false → afterEach(cleanup) manual, si no los
 *     renders se acumulan en el DOM entre tests.
 *   - No hay @testing-library/user-event instalado → usamos fireEvent.
 *   - Un <input type="password"> NO expone role "textbox" en el árbol de
 *     accesibilidad, así que lo localizamos por placeholder (getByPlaceholderText),
 *     que funciona con cualquier type.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PasswordInput } from "./password-input";

afterEach(() => cleanup());

// El componente solo depende de lucide-react (iconos), @/components/ui/input
// (wrapper de <input> nativo) y @/lib/password-strength (pura). Nada de Next
// runtime → no hace falta mockear next/link, next/image ni next/navigation.

describe("PasswordInput", () => {
  it("arranca oculto: type=password y el botón invita a mostrar", () => {
    render(<PasswordInput placeholder="Contraseña" defaultValue="" />);
    const input = screen.getByPlaceholderText("Contraseña");
    expect(input).toHaveAttribute("type", "password");

    const toggle = screen.getByRole("button", { name: "Mostrar contraseña" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    // El botón es type=button para no enviar el formulario contenedor.
    expect(toggle).toHaveAttribute("type", "button");
  });

  it("el toggle alterna type password↔text y actualiza aria-label / aria-pressed", () => {
    render(<PasswordInput placeholder="Contraseña" />);
    const input = screen.getByPlaceholderText("Contraseña");
    expect(input).toHaveAttribute("type", "password");

    // Mostrar
    fireEvent.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(input).toHaveAttribute("type", "text");
    const hide = screen.getByRole("button", { name: "Ocultar contraseña" });
    expect(hide).toHaveAttribute("aria-pressed", "true");

    // Ocultar de nuevo → vuelve a password
    fireEvent.click(hide);
    expect(input).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Mostrar contraseña" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("propaga el valor al escribir vía onValueChange (modo controlado)", () => {
    const onValueChange = vi.fn();
    const onChange = vi.fn();
    // controlledValue definido → el value lo manda el padre; onValueChange recibe el texto.
    const { rerender } = render(
      <PasswordInput
        placeholder="Contraseña"
        value=""
        onValueChange={onValueChange}
        onChange={onChange}
      />,
    );
    const input = screen.getByPlaceholderText("Contraseña");

    fireEvent.change(input, { target: { value: "hunter2" } });
    // onValueChange recibe el string; el onChange nativo pasado por props también se dispara.
    expect(onValueChange).toHaveBeenCalledWith("hunter2");
    expect(onChange).toHaveBeenCalledTimes(1);

    // Controlado: hasta que el padre no re-renderiza con el nuevo value, el input no cambia.
    expect(input).toHaveValue("");
    rerender(
      <PasswordInput
        placeholder="Contraseña"
        value="hunter2"
        onValueChange={onValueChange}
        onChange={onChange}
      />,
    );
    expect(screen.getByPlaceholderText("Contraseña")).toHaveValue("hunter2");
  });

  it("modo no-controlado: mantiene su propio value sin prop `value`", () => {
    render(<PasswordInput placeholder="Contraseña" />);
    const input = screen.getByPlaceholderText("Contraseña");
    fireEvent.change(input, { target: { value: "abcdef" } });
    // Sin controlledValue el componente guarda internalValue y lo refleja solo.
    expect(input).toHaveValue("abcdef");
  });

  it("no muestra strength meter cuando showStrength es false (default)", () => {
    render(<PasswordInput placeholder="Contraseña" value="MyStr0ng#Passw0rd" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("Muy fuerte")).not.toBeInTheDocument();
  });

  it("no muestra strength meter con showStrength pero value vacío", () => {
    render(<PasswordInput placeholder="Contraseña" showStrength value="" />);
    // La rama es `strength && value` → value vacío la apaga.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("muestra label, suggestion y aria-label de fuerza para una contraseña muy fuerte", () => {
    // "MyStr0ng#Passw0rd" (len 17, 4 clases) → score 4 = "Muy fuerte" (verificado
    // contra calculatePasswordStrength; "Passw0rd" con cero no dispara la penalización
    // del término "password").
    render(<PasswordInput placeholder="Contraseña" showStrength value="MyStr0ng#Passw0rd" />);
    const meter = screen.getByRole("status", { name: "Fuerza de la contraseña: Muy fuerte" });
    expect(meter).toBeInTheDocument();
    expect(screen.getByText("Muy fuerte")).toBeInTheDocument();
    expect(screen.getByText("Inquebrantable. Bien hecho.")).toBeInTheDocument();
  });

  it("refleja fuerza baja: 'Muy débil' con sugerencia de longitud mínima", () => {
    // "weak" (len 4 < 8) → score 0 = "Muy débil".
    render(<PasswordInput placeholder="Contraseña" showStrength value="weak" />);
    expect(
      screen.getByRole("status", { name: "Fuerza de la contraseña: Muy débil" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Muy débil")).toBeInTheDocument();
    expect(screen.getByText("Muy corta — usa al menos 8 caracteres.")).toBeInTheDocument();
  });

  it("el número de segmentos rellenos (color de fuerza) crece con el score", () => {
    // Score 4 → los 4 segmentos usan la clase de color, ninguno queda en bg-muted.
    const { container, rerender } = render(
      <PasswordInput placeholder="Contraseña" showStrength value="MyStr0ng#Passw0rd" />,
    );
    const strongMuted = container.querySelectorAll("div.bg-muted");
    expect(strongMuted.length).toBe(0);

    // Score 3 ("Xk9$Lp2#Wm", len 10, 4 clases) → 3 segmentos con color, 1 en bg-muted.
    rerender(<PasswordInput placeholder="Contraseña" showStrength value="Xk9$Lp2#Wm" />);
    expect(screen.getByText("Fuerte")).toBeInTheDocument();
    const strongish = container.querySelectorAll("div.bg-muted");
    expect(strongish.length).toBe(1);
  });

  it("aviso de Caps Lock aparece en keydown con la tecla activa y desaparece en blur", () => {
    render(<PasswordInput placeholder="Contraseña" />);
    const input = screen.getByPlaceholderText("Contraseña");

    // Sin Caps Lock no hay aviso.
    fireEvent.keyDown(input, { key: "a" });
    expect(screen.queryByText("Bloq Mayús activado")).not.toBeInTheDocument();

    // Con el modificador activo → aviso role=status.
    fireEvent.keyDown(input, { key: "A", modifierCapsLock: true });
    const warn = screen.getByText("Bloq Mayús activado");
    expect(warn).toBeInTheDocument();
    expect(warn).toHaveAttribute("role", "status");

    // Al perder el foco el aviso se limpia (setCapsLock(false) en onBlur).
    fireEvent.blur(input);
    expect(screen.queryByText("Bloq Mayús activado")).not.toBeInTheDocument();
  });

  it("reenvía props nativas del <input> (disabled, name) al elemento real", () => {
    render(<PasswordInput placeholder="Contraseña" name="password" disabled />);
    const input = screen.getByPlaceholderText("Contraseña");
    expect(input).toHaveAttribute("name", "password");
    expect(input).toBeDisabled();
  });
});

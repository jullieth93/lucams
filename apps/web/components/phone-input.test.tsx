// @vitest-environment jsdom
/*
 * Test de componente — PhoneInput (components/phone-input.tsx): indicativo de
 * país con bandera + número nacional. El <form> recibe UN hidden con
 * "+<indicativo> <nacional>"; Colombia (+57, default 🇨🇴) auto-formatea
 * "320 887 3826".
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhoneInput } from "./phone-input";

afterEach(cleanup);

function hiddenValue(container: HTMLElement): string {
  return container.querySelector<HTMLInputElement>('input[type="hidden"]')!.value;
}

function dialSelect(getByLabelText: (t: string) => HTMLElement): HTMLSelectElement {
  return getByLabelText("Indicativo de país") as HTMLSelectElement;
}

function numberInput(getByRole: (r: string) => HTMLElement): HTMLInputElement {
  return getByRole("textbox") as HTMLInputElement;
}

describe("PhoneInput — indicativo + bandera", () => {
  it("Colombia (+57 🇨🇴) es el indicativo por defecto", () => {
    const { getByLabelText } = render(<PhoneInput name="phone" />);
    const select = dialSelect(getByLabelText);
    expect(select.value).toBe("57");
    expect(select.querySelector("option")!.textContent).toContain("🇨🇴");
  });

  it("ofrece la lista corta LatAm (sin exóticos)", () => {
    const { getByLabelText } = render(<PhoneInput name="phone" />);
    const options = [...dialSelect(getByLabelText).options].map((o) => o.value);
    expect(options).toEqual(["57", "52", "54", "56", "51", "593", "58", "598", "507", "506", "1"]);
  });

  it("escribir dígitos (CO) auto-formatea y el hidden viaja '+57 <10 dígitos>'", () => {
    const onChange = vi.fn();
    const { container, getByRole } = render(<PhoneInput name="phone" onChange={onChange} />);
    fireEvent.change(getByRole("textbox"), { target: { value: "3208873826" } });
    expect(numberInput(getByRole).value).toBe("320 887 3826");
    expect(hiddenValue(container)).toBe("+57 3208873826");
    expect(onChange).toHaveBeenLastCalledWith("3208873826", "57");
  });

  it("cambiar el indicativo conserva el número y actualiza el hidden", () => {
    const { container, getByLabelText, getByRole } = render(<PhoneInput name="phone" />);
    fireEvent.change(getByRole("textbox"), { target: { value: "9112345678" } });
    fireEvent.change(getByLabelText("Indicativo de país"), { target: { value: "54" } });
    expect(hiddenValue(container)).toBe("+54 9112345678");
    // Fuera de Colombia no hay auto-formato con espacios.
    expect(numberInput(getByRole).value).toBe("9112345678");
  });

  it("sin dígitos el hidden viaja vacío (campo opcional en perfil)", () => {
    const { container } = render(<PhoneInput name="phone" />);
    expect(hiddenValue(container)).toBe("");
  });

  it("hidrata un móvil CO persistido como 10 dígitos (legado sin indicativo)", () => {
    const { getByLabelText, getByRole } = render(
      <PhoneInput name="phone" defaultValue="3208873826" />,
    );
    expect(dialSelect(getByLabelText).value).toBe("57");
    expect(numberInput(getByRole).value).toBe("320 887 3826");
  });

  it("hidrata un número internacional persistido ('+54 9112345678' → AR)", () => {
    const { getByLabelText, getByRole } = render(
      <PhoneInput name="phone" defaultValue="+54 9112345678" />,
    );
    expect(dialSelect(getByLabelText).value).toBe("54");
    expect(numberInput(getByRole).value).toBe("9112345678");
  });

  it("muestra el error del server/padre con aria-invalid + aria-describedby", () => {
    const { getByRole, getByText } = render(
      <PhoneInput id="phone" name="phone" error="Teléfono inválido" />,
    );
    expect(getByText("Teléfono inválido")).toBeInTheDocument();
    expect(getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    expect(getByRole("textbox")).toHaveAttribute("aria-describedby", "phone-error");
  });
});

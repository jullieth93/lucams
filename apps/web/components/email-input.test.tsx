// @vitest-environment jsdom
/*
 * Test de componente — EmailInput (Bloque E-continuación, Lucy 2026-07-03).
 *
 * Cubre el UX real del componente:
 *   - Atributos accesibles: type="email", pattern HTML5, autoComplete="email"
 *     por default (y override), label vía htmlFor/id.
 *   - Propagación del value: modo controlado (value + onValueChange) y
 *     uncontrolled (name para <form action>, defaultValue inicial).
 *   - Autocomplete de dominios: aparece con "@", filtra por prefijo, se
 *     limita a 5, no aparece con dominio ya completo, y al seleccionar
 *     completa el value (local@domain) y cierra el dropdown.
 *   - Cierre del dropdown por click-fuera.
 *   - onChange propio del consumidor sigue disparándose.
 *
 * Nota: el JSDoc del componente menciona "validación" pero la validación real
 * es HTML5 nativa (type=email + pattern) — el componente NO renderiza mensajes
 * de error propios ni normaliza el value (lo pasa tal cual). Se verifica el
 * comportamiento real, no el descrito.
 *
 * Sin @testing-library/user-event en el repo → fireEvent (igual que
 * product-card.test.tsx). globals:false → cleanup manual en afterEach.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { EmailInput } from "./email-input";

afterEach(() => cleanup());

describe("EmailInput — accesibilidad y atributos", () => {
  it("expone type=email, pattern HTML5 y autoComplete=email por default", () => {
    render(<EmailInput aria-label="Correo" />);
    const input = screen.getByRole("textbox", { name: "Correo" });
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveAttribute("autocomplete", "email");
    // pattern: exige punto en dominio + TLD 2-24 chars (más estricto que HTML5).
    expect(input).toHaveAttribute("pattern", "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,24}$");
  });

  it("permite override de autoComplete", () => {
    render(<EmailInput aria-label="Correo" autoComplete="username" />);
    expect(screen.getByRole("textbox", { name: "Correo" })).toHaveAttribute(
      "autocomplete",
      "username",
    );
  });

  it("es accesible por <label htmlFor> asociado al id del input", () => {
    render(
      <>
        <label htmlFor="email-field">Tu correo</label>
        <EmailInput id="email-field" name="email" />
      </>,
    );
    // getByLabelText resuelve el árbol de accesibilidad label→input.
    const input = screen.getByLabelText("Tu correo");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveAttribute("name", "email");
  });
});

describe("EmailInput — propagación del value", () => {
  it("uncontrolled: renderiza defaultValue y actualiza al escribir", () => {
    render(<EmailInput aria-label="Correo" defaultValue="hola@" />);
    const input = screen.getByRole("textbox", { name: "Correo" }) as HTMLInputElement;
    expect(input.value).toBe("hola@");
    fireEvent.change(input, { target: { value: "hola@g" } });
    expect(input.value).toBe("hola@g");
  });

  it("controlado: refleja el prop value y NO cambia solo (padre manda)", () => {
    const onValueChange = vi.fn();
    render(<EmailInput aria-label="Correo" value="fija@gmail.com" onValueChange={onValueChange} />);
    const input = screen.getByRole("textbox", { name: "Correo" }) as HTMLInputElement;
    expect(input.value).toBe("fija@gmail.com");
    // El padre controla: escribir dispara onValueChange pero el input no se
    // actualiza solo (value sigue fijado por el prop).
    fireEvent.change(input, { target: { value: "otro@x" } });
    expect(onValueChange).toHaveBeenCalledWith("otro@x");
    expect(input.value).toBe("fija@gmail.com");
  });

  it("dispara el onChange propio del consumidor además de onValueChange", () => {
    const onChange = vi.fn();
    const onValueChange = vi.fn();
    render(<EmailInput aria-label="Correo" onChange={onChange} onValueChange={onValueChange} />);
    const input = screen.getByRole("textbox", { name: "Correo" });
    fireEvent.change(input, { target: { value: "a@b" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("a@b");
  });
});

describe("EmailInput — autocomplete de dominios", () => {
  it("no muestra dropdown sin '@' o con parte local vacía", () => {
    render(<EmailInput aria-label="Correo" />);
    const input = screen.getByRole("textbox", { name: "Correo" });
    // Sin '@': sin sugerencias.
    fireEvent.change(input, { target: { value: "lucy" } });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    // '@' pero parte local vacía: sin sugerencias.
    fireEvent.change(input, { target: { value: "@gmail" } });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("muestra sugerencias (máx 5) al escribir 'local@'", () => {
    render(<EmailInput aria-label="Correo" />);
    const input = screen.getByRole("textbox", { name: "Correo" });
    fireEvent.change(input, { target: { value: "lucy@" } });
    const listbox = screen.getByRole("listbox", { name: "Sugerencias de dominio" });
    const options = within(listbox).getAllByRole("option");
    // 8 dominios definidos pero .slice(0,5) → tope de 5.
    expect(options).toHaveLength(5);
    // Cada opción muestra el local + el dominio.
    expect(within(listbox).getByText("gmail.com")).toBeInTheDocument();
  });

  it("filtra los dominios por el prefijo tras '@'", () => {
    render(<EmailInput aria-label="Correo" />);
    const input = screen.getByRole("textbox", { name: "Correo" });
    fireEvent.change(input, { target: { value: "lucy@gma" } });
    const options = screen.getAllByRole("option");
    // Solo gmail.com empieza por "gma".
    expect(options).toHaveLength(1);
    expect(screen.getByText("gmail.com")).toBeInTheDocument();
  });

  it("no muestra dropdown cuando el dominio ya está completo", () => {
    render(<EmailInput aria-label="Correo" />);
    const input = screen.getByRole("textbox", { name: "Correo" });
    fireEvent.change(input, { target: { value: "lucy@gmail.com" } });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("prefijo sin match no abre dropdown", () => {
    render(<EmailInput aria-label="Correo" />);
    const input = screen.getByRole("textbox", { name: "Correo" });
    fireEvent.change(input, { target: { value: "lucy@zzz" } });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("seleccionar una sugerencia completa 'local@domain', cierra el dropdown y propaga el value", () => {
    const onValueChange = vi.fn();
    render(<EmailInput aria-label="Correo" onValueChange={onValueChange} />);
    const input = screen.getByRole("textbox", { name: "Correo" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "lucy@ho" } });
    // "ho" → hotmail.com, hotmail.es.
    const option = screen.getByRole("option", { name: /hotmail\.com/ });
    fireEvent.click(within(option).getByRole("button"));
    expect(onValueChange).toHaveBeenLastCalledWith("lucy@hotmail.com");
    expect(input.value).toBe("lucy@hotmail.com");
    // handleSelect cierra el dropdown.
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("respeta el último '@' para separar local y dominio", () => {
    const onValueChange = vi.fn();
    render(<EmailInput aria-label="Correo" onValueChange={onValueChange} />);
    const input = screen.getByRole("textbox", { name: "Correo" });
    // Dos '@': el local es todo hasta el último '@'.
    fireEvent.change(input, { target: { value: "a@b@gm" } });
    const option = screen.getByRole("option", { name: /gmail\.com/ });
    fireEvent.click(within(option).getByRole("button"));
    expect(onValueChange).toHaveBeenLastCalledWith("a@b@gmail.com");
  });

  it("click fuera del wrapper cierra el dropdown", () => {
    render(<EmailInput aria-label="Correo" />);
    const input = screen.getByRole("textbox", { name: "Correo" });
    fireEvent.change(input, { target: { value: "lucy@" } });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    // El handler escucha "mousedown" en document.
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

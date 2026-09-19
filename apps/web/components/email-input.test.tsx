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
 * Nota Fase 7a (feedback Lucy 2026-09-18): el componente SÍ renderiza mensajes
 * inline propios desde la validación en vivo on-blur (ver último describe);
 * la validación de submit sigue siendo HTML5 nativa + Zod server-side.
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
    // pattern: exige punto en dominio + TLD 2-24 chars (más estricto que HTML5),
    // con los `-` escapados para la flag /v con la que el navegador compila pattern.
    expect(input).toHaveAttribute(
      "pattern",
      "^[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,24}$",
    );
    // El pattern es VÁLIDO bajo la flag /v (unicodeSets) de los navegadores modernos.
    expect(() => new RegExp(input.getAttribute("pattern")!, "v")).not.toThrow();
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

describe("EmailInput — validación en vivo on-blur (Fase 7a)", () => {
  it("no valida mientras se escribe la primera vez (sin blur no hay mensaje)", () => {
    render(<EmailInput aria-label="Correo" />);
    const input = screen.getByRole("textbox", { name: "Correo" });
    fireEvent.change(input, { target: { value: "lucy@" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-invalid", "true");
  });

  it("on-blur con formato inválido muestra mensaje + aria-invalid/aria-describedby", () => {
    render(<EmailInput aria-label="Correo" />);
    const input = screen.getByRole("textbox", { name: "Correo" });
    fireEvent.change(input, { target: { value: "lucy@" } });
    fireEvent.blur(input);
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent(/falta el @ o el dominio/i);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain(error.id);
  });

  it("on-blur con email válido no muestra nada", () => {
    render(<EmailInput aria-label="Correo" />);
    const input = screen.getByRole("textbox", { name: "Correo" });
    fireEvent.change(input, { target: { value: "lucy@gmail.com" } });
    fireEvent.blur(input);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-invalid", "true");
  });

  it("on-blur con campo vacío no muestra nada (el required HTML5 lo cubre en submit)", () => {
    render(<EmailInput aria-label="Correo" required />);
    const input = screen.getByRole("textbox", { name: "Correo" });
    fireEvent.blur(input);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-invalid", "true");
  });

  it("typo de dominio conocido sugiere corrección sin marcar error ni auto-corregir", () => {
    const onValueChange = vi.fn();
    render(<EmailInput aria-label="Correo" onValueChange={onValueChange} />);
    const input = screen.getByRole("textbox", { name: "Correo" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "lucy@gmial.com" } });
    fireEvent.blur(input);
    // Sugerencia como status (aria-live polite), NO como alert de error.
    const hint = screen.getByRole("status");
    expect(hint).toHaveTextContent("¿Quisiste decir lucy@gmail.com?");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-invalid", "true");
    // El value NO se auto-corrige.
    expect(input.value).toBe("lucy@gmial.com");
    expect(onValueChange).not.toHaveBeenCalledWith("lucy@gmail.com");
  });

  it("dominio válido que no es typo no muestra sugerencia", () => {
    render(<EmailInput aria-label="Correo" />);
    const input = screen.getByRole("textbox", { name: "Correo" });
    fireEvent.change(input, { target: { value: "lucy@empresa.com.co" } });
    fireEvent.blur(input);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("una vez mostrado el error, se re-evalúa on-change y desaparece al corregir", () => {
    render(<EmailInput aria-label="Correo" />);
    const input = screen.getByRole("textbox", { name: "Correo" });
    fireEvent.change(input, { target: { value: "lucy@" } });
    fireEvent.blur(input);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    // Corrige sin salir del campo: el mensaje se limpia solo.
    fireEvent.change(input, { target: { value: "lucy@gmail.com" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-invalid", "true");
  });

  it("preserva el aria-describedby del padre (errores server-side) junto al live", () => {
    render(<EmailInput aria-label="Correo" aria-describedby="email-error" aria-invalid={true} />);
    const input = screen.getByRole("textbox", { name: "Correo" });
    fireEvent.change(input, { target: { value: "lucy@" } });
    fireEvent.blur(input);
    const error = screen.getByRole("alert");
    const describedBy = input.getAttribute("aria-describedby")!;
    expect(describedBy).toContain("email-error");
    expect(describedBy).toContain(error.id);
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});

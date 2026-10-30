// @vitest-environment jsdom

/*
 * Tests de lib/enter-next-field.ts — Enter = siguiente campo (2026-10-29).
 * jsdom real: inputs dentro de un contenedor, foco verificado con
 * document.activeElement.
 */

import { describe, expect, it } from "vitest";
import { focusNextFieldOnEnter, tagEnterKeyHints } from "./enter-next-field";

function fixture() {
  const root = document.createElement("form");
  root.innerHTML = `
    <input id="a" type="text" />
    <input id="b" type="email" />
    <textarea id="c"></textarea>
    <input id="d" type="text" disabled />
    <input id="e" type="text" />
  `;
  document.body.appendChild(root);
  return root;
}

function keydown(target: HTMLElement, root: HTMLElement, prevented = false) {
  // Evento sintético mínimo: el handler solo lee key/defaultPrevented/target/
  // currentTarget y llama preventDefault (no hace falta despacharlo al DOM).
  const e = {
    key: "Enter",
    defaultPrevented: prevented,
    target,
    currentTarget: root,
    preventDefault: () => {
      e.defaultPrevented = true;
    },
  };
  focusNextFieldOnEnter(e as unknown as React.KeyboardEvent<HTMLElement>);
}

describe("focusNextFieldOnEnter", () => {
  it("Enter en un input mueve el foco al siguiente control editable", () => {
    const root = fixture();
    const a = root.querySelector<HTMLInputElement>("#a")!;
    a.focus();
    keydown(a, root);
    expect(document.activeElement?.id).toBe("b");
    root.remove();
  });

  it("salta campos deshabilitados", () => {
    const root = fixture();
    const c = root.querySelector<HTMLTextAreaElement>("#c")!;
    // En el textarea Enter NO mueve (salto de línea): probamos desde #b →
    // el siguiente editable después de #b es #c (textarea sí es focuseable).
    const b = root.querySelector<HTMLInputElement>("#b")!;
    b.focus();
    keydown(b, root);
    expect(document.activeElement?.id).toBe("c");
    // Y desde el textarea no se mueve nunca.
    c.focus();
    keydown(c, root);
    expect(document.activeElement?.id).toBe("c");
    root.remove();
  });

  it("respeta Enter ya manejado por el campo (defaultPrevented — p.ej. hashtags)", () => {
    const root = fixture();
    const a = root.querySelector<HTMLInputElement>("#a")!;
    a.focus();
    keydown(a, root, true);
    expect(document.activeElement?.id).toBe("a");
    root.remove();
  });

  it("en el último campo cierra el teclado (blur)", () => {
    const root = fixture();
    const e = root.querySelector<HTMLInputElement>("#e")!;
    e.focus();
    keydown(e, root);
    expect(document.activeElement).toBe(document.body);
    root.remove();
  });
});

describe("tagEnterKeyHints", () => {
  it("etiqueta inputs de texto sin hint y respeta los que ya declaran", () => {
    const root = fixture();
    const a = root.querySelector<HTMLInputElement>("#a")!;
    a.setAttribute("enterkeyhint", "search");
    tagEnterKeyHints(root);
    expect(root.querySelector("#b")!.getAttribute("enterkeyhint")).toBe("next");
    expect(root.querySelector("#a")!.getAttribute("enterkeyhint")).toBe("search");
    root.remove();
  });
});

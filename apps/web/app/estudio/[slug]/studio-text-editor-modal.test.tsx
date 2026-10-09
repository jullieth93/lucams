// @vitest-environment jsdom

/*
 * Test del StudioTextEditorForm — Lucy 2026-09-08: el botón «Aplicar» no mostraba
 * NINGÚN feedback de procesamiento (el commit es casi instantáneo pero el usuario
 * no sabía si había funcionado). Estos tests blindan el estado de procesamiento:
 * spinner + disabled desde el click hasta que el apply completa, y que el override
 * aplicado sigue siendo el correcto (solo campos que difieren del base).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StudioTextEditorForm } from "./studio-text-editor-modal";
import type { TextLayer } from "./types";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ReactElement } from "react";

// El tooltip de marca (Hint, radix) exige un Provider — en la app lo monta
// app/layout.tsx.
function renderStudio(ui: ReactElement) {
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
}

// jsdom no trae ResizeObserver (lo pide el Slider de Radix) — stub mínimo.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}

const LAYER: TextLayer = {
  id: "message",
  type: "text",
  x: 225,
  y: 512,
  text: "Escribe tu mensaje",
  fontFamily: "Fredoka",
  fontSize: 34,
  editable: true,
} as TextLayer;

afterEach(cleanup);

describe("StudioTextEditorForm — «Aplicar» arriba (owner 2026-10-05)", () => {
  it("el botón «Aplicar» va ANTES del input en el DOM (visible sin scroll) y «Restablecer» queda abajo", () => {
    renderStudio(
      <StudioTextEditorForm layer={LAYER} currentOverride={undefined} onApply={vi.fn()} />,
    );
    const apply = screen.getByRole("button", { name: "Aplicar" });
    const input = screen.getByRole("textbox");
    const reset = screen.getByRole("button", { name: /volver al original/i });
    // DOCUMENT_POSITION_FOLLOWING: apply precede al input y al reset.
    expect(apply.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(apply.compareDocumentPosition(reset) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("StudioTextEditorForm — estado de procesamiento de «Aplicar» (Lucy 2026-09-08)", () => {
  it("al hacer click en Aplicar: spinner + disabled, y luego aplica el override", async () => {
    const onApply = vi.fn();
    renderStudio(
      <StudioTextEditorForm layer={LAYER} currentOverride={undefined} onApply={onApply} />,
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Te amo mamá" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    // Estado de procesamiento visible de inmediato.
    const busyBtn = screen.getByRole("button", { name: /aplicando/i });
    expect(busyBtn).toBeDisabled();
    expect(busyBtn).toHaveAttribute("aria-busy", "true");

    // El commit va un frame después (el spinner pinta primero).
    await waitFor(() => expect(onApply).toHaveBeenCalledWith({ text: "Te amo mamá" }));

    // Al completar, el botón vuelve a su estado normal.
    await waitFor(() => expect(screen.getByRole("button", { name: "Aplicar" })).toBeEnabled(), {
      timeout: 1500,
    });
  });

  it("sin cambios es NO-OP (undefined): NO limpia el override — también con feedback", async () => {
    // QA 1.2 — antes «Aplicar» sin cambios enviaba null → BORRABA el override del
    // slot. Ahora undefined = no-op (el override vigente se conserva).
    const onApply = vi.fn();
    renderStudio(
      <StudioTextEditorForm layer={LAYER} currentOverride={undefined} onApply={onApply} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(screen.getByRole("button", { name: /aplicando/i })).toBeDisabled();
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(undefined));
    expect(onApply).not.toHaveBeenCalledWith(null);
  });
});

describe("StudioTextEditorForm — placeholder gris, nunca valor precargado (Ola 25, 2026-09-09)", () => {
  it("el input arranca VACÍO y muestra el default de la plantilla como placeholder", () => {
    renderStudio(
      <StudioTextEditorForm layer={LAYER} currentOverride={undefined} onApply={vi.fn()} />,
    );
    const input = screen.getByRole("textbox");
    // Regla del dueño: la tarjeta nace sin texto — el default NO es el valor.
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("placeholder", "Escribe tu mensaje");
  });

  it("aplicar SIN escribir nada (sin override previo) → no-op (la tarjeta queda sin texto, nada se imprime)", async () => {
    const onApply = vi.fn();
    renderStudio(
      <StudioTextEditorForm layer={LAYER} currentOverride={undefined} onApply={onApply} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    // Sin override previo y sin texto escrito no hay nada que mutar: no-op.
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(undefined));
  });

  it("escribir EXACTAMENTE el default SÍ guarda override.text (el cliente lo eligió)", async () => {
    // Antes el default precargado hacía que escribirlo fuera un no-op (text ===
    // layer.text → sin override → no se imprimía). Con el input vacío de entrada,
    // tipearlo es una elección explícita → viaja como texto del cliente.
    const onApply = vi.fn();
    renderStudio(
      <StudioTextEditorForm layer={LAYER} currentOverride={undefined} onApply={onApply} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Escribe tu mensaje" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith({ text: "Escribe tu mensaje" }));
  });

  it("con texto del cliente previo, el input SÍ arranca con ese texto (re-edición)", () => {
    renderStudio(
      <StudioTextEditorForm
        layer={LAYER}
        currentOverride={{ text: "Mi viaje" }}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("Mi viaje");
  });

  it("borrar el texto que tenía y aplicar → null (vacío = sin texto en la tarjeta)", async () => {
    const onApply = vi.fn();
    renderStudio(
      <StudioTextEditorForm
        layer={LAYER}
        currentOverride={{ text: "Mi viaje" }}
        onApply={onApply}
      />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(null));
  });

  it("«Volver al original» deja el input vacío (el default vuelve como placeholder gris)", () => {
    renderStudio(
      <StudioTextEditorForm
        layer={LAYER}
        currentOverride={{ text: "Mi viaje" }}
        onApply={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /volver al original/i }));
    expect(screen.getByRole("textbox")).toHaveValue("");
  });
});

describe("StudioTextEditorForm — QA 1.2: «Aplicar» tras «aplicar a todas» no borra nada (2026-10-07)", () => {
  // Bug de QA en STG (Polaroid Clásica/Instagram): con el texto masivo aplicado,
  // abrir el editor de UNA foto y dar «Aplicar» sin tocar nada BORRABA el
  // override de ese slot (el texto desaparecía y el campo masivo "saltaba").
  it("«Aplicar» sin cambios sobre un override vigente es NO-OP: el texto se conserva", async () => {
    const onApply = vi.fn();
    renderStudio(
      <StudioTextEditorForm layer={LAYER} currentOverride={{ text: "Hola" }} onApply={onApply} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(undefined));
    expect(onApply).not.toHaveBeenCalledWith(null);
  });

  it("editar el texto de UNA unidad aplica el nuevo texto a la primera", async () => {
    const onApply = vi.fn();
    renderStudio(
      <StudioTextEditorForm layer={LAYER} currentOverride={{ text: "Hola" }} onApply={onApply} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Chao" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith({ text: "Chao" }));
  });

  it("cambiar SOLO el estilo conserva el texto vigente (el store reemplaza el override entero)", async () => {
    // Segundo filo del bug: el override viejo solo llevaba los campos que
    // CAMBIARON; con un override { text } vigente, tocar la paleta y aplicar
    // reemplazaba el override por { fill } → el texto se perdía.
    const onApply = vi.fn();
    renderStudio(
      <StudioTextEditorForm layer={LAYER} currentOverride={{ text: "Hola" }} onApply={onApply} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Blanco" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith({ text: "Hola", fill: "#FFFFFF" }));
  });
});

describe("StudioTextEditorForm — contraste texto/tarjeta en el preview (Ola 28, 2026-09-11 · 1.2.1.A)", () => {
  // Reporte del owner: en «Editar» con texto BLANCO sobre tarjeta BLANCA el
  // preview (fondo crema fijo) no mostraba NADA. Ahora el preview pinta el
  // fondo de la tarjeta y, con contraste casi nulo, cambia a la cuadrícula de
  // "transparencia" + aviso para que lo escrito siempre se vea al editar.
  it("texto blanco sobre tarjeta blanca → preview en cuadrícula + aviso visible", () => {
    renderStudio(
      <StudioTextEditorForm
        layer={LAYER}
        currentOverride={undefined}
        onApply={vi.fn()}
        cardColor="#FFFFFF"
      />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Hola!" } });
    fireEvent.click(screen.getByRole("button", { name: "Blanco" }));

    const preview = screen.getByText("Hola!");
    expect(preview.style.backgroundImage).toContain("repeating-conic-gradient");
    expect(screen.getByRole("note")).toHaveTextContent(/casi no se va a ver sobre la tarjeta/);
  });

  it("texto oscuro sobre tarjeta blanca → fondo tarjeta plano, SIN aviso", () => {
    renderStudio(
      <StudioTextEditorForm
        layer={LAYER}
        currentOverride={undefined}
        onApply={vi.fn()}
        cardColor="#FFFFFF"
      />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Hola!" } });

    const preview = screen.getByText("Hola!");
    // El default de letra es oscuro (#262626) → contrasta con la tarjeta blanca.
    // (jsdom normaliza el shorthand `background` a backgroundImage "none").
    expect(preview.style.backgroundImage).toBe("none");
    expect(preview.style.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("texto negro sobre tarjeta NEGRA → también avisa (el espejo del caso del owner)", () => {
    renderStudio(
      <StudioTextEditorForm
        layer={LAYER}
        currentOverride={{ text: "Hola!" }}
        onApply={vi.fn()}
        cardColor="#221E25"
      />,
    );
    // fill default #262626 sobre #221E25: ratio ≈ 1.0 → bajo contraste.
    const preview = screen.getByText("Hola!");
    expect(preview.style.backgroundImage).toContain("repeating-conic-gradient");
    expect(screen.getByRole("note")).toBeInTheDocument();
  });

  it("sin cardColor (superficie sin tarjeta de color) → crema de siempre, sin aviso", () => {
    renderStudio(
      <StudioTextEditorForm layer={LAYER} currentOverride={undefined} onApply={vi.fn()} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Hola!" } });
    fireEvent.click(screen.getByRole("button", { name: "Blanco" }));

    const preview = screen.getByText("Hola!");
    expect(preview.className).toContain("from-brand-cream");
    expect(preview.style.backgroundImage).toBe("");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});

describe("StudioTextEditorForm — color inicial = default del lienzo sobre la tarjeta (Ola 29, ronda 5 · 1.2.1.A)", () => {
  // El owner: "si es rosado el lienzo del fondo, blanco puede ser el preview del
  // texto". cardDefaultFill (lo calcula el host con la regla del lienzo) fija la
  // base: el form arranca en blanco sobre la tarjeta rosada y, si el cliente no
  // toca la paleta, NO se guarda override de color (el lienzo sigue con su default).
  it("tarjeta rosada + default blanco del lienzo → el preview arranca blanco sobre rosado y Aplicar no guarda fill", async () => {
    const onApply = vi.fn();
    renderStudio(
      <StudioTextEditorForm
        layer={LAYER}
        currentOverride={undefined}
        onApply={onApply}
        cardColor="#E85B9F"
        cardDefaultFill="#FFFFFF"
      />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Hola!" } });

    const preview = screen.getByText("Hola!");
    expect(preview.style.color).toBe("rgb(255, 255, 255)");
    expect(preview.style.backgroundColor).toBe("rgb(232, 91, 159)");
    // Blanco sobre rosado SÍ se ve (ratio ≈ 3.3) → sin aviso de bajo contraste.
    expect(screen.queryByRole("note")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    // Solo el texto viaja: el fill quedó igual a la base → no se guarda override.
    await waitFor(() => expect(onApply).toHaveBeenCalledWith({ text: "Hola!" }));
  });

  it("sin cardDefaultFill (superficie vieja) → la base sigue siendo el fill de la plantilla", () => {
    renderStudio(
      <StudioTextEditorForm layer={LAYER} currentOverride={undefined} onApply={vi.fn()} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Hola!" } });
    // LAYER no declara fill → base #262626 (comportamiento histórico intacto).
    expect(screen.getByText("Hola!").style.color).toBe("rgb(38, 38, 38)");
  });
});

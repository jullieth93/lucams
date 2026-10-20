// @vitest-environment jsdom

/*
 * Test del StudioTextEditorForm — 2026-10-19 (decisión del owner): el formulario
 * ya NO tiene botón «Aplicar» propio; el commit de la edición lo dispara el
 * «Listo» del footer del modal a través del `applyRef` que el form REGISTRA.
 * Estos tests blindan el nuevo contrato:
 *   1. No existe botón «Aplicar» en el formulario.
 *   2. applyRef queda registrado al montar (y se desregistra al desmontar).
 *   3. Invocarlo aplica el override SÍNCRONO con la semántica de siempre:
 *      solo campos que difieren del base, null = limpiar, undefined = no-op.
 *   4. El «Listo» del modal (StudioTextEditorModal) aplica Y cierra.
 *
 * (Historia: los tests del spinner de «Aplicar» — Lucy 2026-09-08 — se retiraron
 * con el botón: el commit ahora es síncrono y el modal cierra de inmediato.)
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StudioTextEditorForm, StudioTextEditorModal } from "./studio-text-editor-modal";
import type { TextLayer, TextOverride } from "./types";
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

type ApplyRef = { current: (() => void) | null };

function renderForm(opts: {
  currentOverride?: TextOverride;
  onApply?: (o: TextOverride | null | undefined) => void;
  cardColor?: string;
  cardDefaultFill?: string;
}) {
  const applyRef: ApplyRef = { current: null };
  const onApply = opts.onApply ?? vi.fn();
  const utils = renderStudio(
    <StudioTextEditorForm
      layer={LAYER}
      currentOverride={opts.currentOverride}
      onApply={onApply}
      applyRef={applyRef}
      cardColor={opts.cardColor ?? null}
      cardDefaultFill={opts.cardDefaultFill}
    />,
  );
  return { applyRef, onApply, ...utils };
}

afterEach(cleanup);

describe("StudioTextEditorForm — un solo «Listo» (owner 2026-10-19)", () => {
  it("ya NO hay botón «Aplicar» dentro del formulario", () => {
    renderForm({});
    expect(screen.queryByRole("button", { name: "Aplicar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /aplicando/i })).not.toBeInTheDocument();
  });

  it("applyRef queda registrado al montar y se desregistra al desmontar", () => {
    const { applyRef, unmount } = renderForm({});
    expect(applyRef.current).toBeTypeOf("function");
    unmount();
    expect(applyRef.current).toBeNull();
  });

  it("el commit vía applyRef es SÍNCRONO y aplica el override (solo campos que difieren)", () => {
    const onApply = vi.fn();
    const { applyRef } = renderForm({ onApply });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Te amo mamá" } });
    applyRef.current!();
    expect(onApply).toHaveBeenCalledWith({ text: "Te amo mamá" });
  });

  it("sin cambios es NO-OP (undefined): NO limpia el override vigente", () => {
    // QA 1.2 — antes «Aplicar» sin cambios enviaba null → BORRABA el override
    // del slot. undefined = no-op (el override vigente se conserva).
    const onApply = vi.fn();
    const { applyRef } = renderForm({ onApply });
    applyRef.current!();
    expect(onApply).toHaveBeenCalledWith(undefined);
    expect(onApply).not.toHaveBeenCalledWith(null);
  });

  it("sin cambios sobre un override vigente (tras «aplicar a todas») es NO-OP: el texto se conserva", () => {
    const onApply = vi.fn();
    const { applyRef } = renderForm({ onApply, currentOverride: { text: "Hola" } });
    applyRef.current!();
    expect(onApply).toHaveBeenCalledWith(undefined);
    expect(onApply).not.toHaveBeenCalledWith(null);
  });

  it("editar el texto aplica el nuevo texto", () => {
    const onApply = vi.fn();
    const { applyRef } = renderForm({ onApply, currentOverride: { text: "Hola" } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Chao" } });
    applyRef.current!();
    expect(onApply).toHaveBeenCalledWith({ text: "Chao" });
  });

  it("cambiar SOLO el estilo conserva el texto vigente (el store reemplaza el override entero)", () => {
    const onApply = vi.fn();
    const { applyRef } = renderForm({ onApply, currentOverride: { text: "Hola" } });
    fireEvent.click(screen.getByRole("button", { name: "Blanco" }));
    applyRef.current!();
    expect(onApply).toHaveBeenCalledWith({ text: "Hola", fill: "#FFFFFF" });
  });
});

describe("StudioTextEditorForm — placeholder gris, nunca valor precargado (Ola 25, 2026-09-09)", () => {
  it("el input arranca VACÍO y muestra el default de la plantilla como placeholder", () => {
    renderForm({});
    const input = screen.getByRole("textbox");
    // Regla del dueño: la tarjeta nace sin texto — el default NO es el valor.
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("placeholder", "Escribe tu mensaje");
  });

  it("aplicar SIN escribir nada (sin override previo) → no-op (la tarjeta queda sin texto, nada se imprime)", () => {
    const onApply = vi.fn();
    const { applyRef } = renderForm({ onApply });
    applyRef.current!();
    // Sin override previo y sin texto escrito no hay nada que mutar: no-op.
    expect(onApply).toHaveBeenCalledWith(undefined);
  });

  it("escribir EXACTAMENTE el default SÍ guarda override.text (el cliente lo eligió)", () => {
    // Antes el default precargado hacía que escribirlo fuera un no-op (text ===
    // layer.text → sin override → no se imprimía). Con el input vacío de entrada,
    // tipearlo es una elección explícita → viaja como texto del cliente.
    const onApply = vi.fn();
    const { applyRef } = renderForm({ onApply });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Escribe tu mensaje" } });
    applyRef.current!();
    expect(onApply).toHaveBeenCalledWith({ text: "Escribe tu mensaje" });
  });

  it("con texto del cliente previo, el input SÍ arranca con ese texto (re-edición)", () => {
    renderForm({ currentOverride: { text: "Mi viaje" } });
    expect(screen.getByRole("textbox")).toHaveValue("Mi viaje");
  });

  it("borrar el texto que tenía y aplicar → null (vacío = sin texto en la tarjeta)", () => {
    const onApply = vi.fn();
    const { applyRef } = renderForm({ onApply, currentOverride: { text: "Mi viaje" } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    applyRef.current!();
    expect(onApply).toHaveBeenCalledWith(null);
  });

  it("«Volver al original» deja el input vacío (el default vuelve como placeholder gris)", () => {
    renderForm({ currentOverride: { text: "Mi viaje" } });
    fireEvent.click(screen.getByRole("button", { name: /volver al original/i }));
    expect(screen.getByRole("textbox")).toHaveValue("");
  });
});

describe("StudioTextEditorForm — contraste texto/tarjeta en el preview (Ola 28, 2026-09-11 · 1.2.1.A)", () => {
  // Reporte del owner: en «Editar» con texto BLANCO sobre tarjeta BLANCA el
  // preview (fondo crema fijo) no mostraba NADA. Ahora el preview pinta el
  // fondo de la tarjeta y, con contraste casi nulo, el texto lleva un delineado
  // sutil de contraste + aviso para que lo escrito siempre se vea al editar
  // (2026-10-12 — antes cambiaba el fondo a la cuadrícula de "transparencia";
  // eliminada con la bandeja checkerboard del lienzo).
  it("texto blanco sobre tarjeta blanca → fondo tarjeta + delineado de contraste + aviso visible", () => {
    renderForm({ cardColor: "#FFFFFF" });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Hola!" } });
    fireEvent.click(screen.getByRole("button", { name: "Blanco" }));

    const preview = screen.getByText("Hola!");
    // Sin checkerboard: el fondo es la tarjeta misma y el texto se lee por el halo.
    expect(preview.style.backgroundImage).toBe("none");
    expect(preview.style.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(preview.style.textShadow).toContain("rgba(38, 28, 46");
    expect(screen.getByRole("note")).toHaveTextContent(/casi no se va a ver sobre la tarjeta/);
  });

  it("texto oscuro sobre tarjeta blanca → fondo tarjeta plano, SIN aviso", () => {
    renderForm({ cardColor: "#FFFFFF" });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Hola!" } });

    const preview = screen.getByText("Hola!");
    // El default de letra es oscuro (#262626) → contrasta con la tarjeta blanca.
    // (jsdom normaliza el shorthand `background` a backgroundImage "none").
    expect(preview.style.backgroundImage).toBe("none");
    expect(preview.style.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("texto negro sobre tarjeta NEGRA → también avisa (el espejo del caso del owner)", () => {
    renderForm({ currentOverride: { text: "Hola!" }, cardColor: "#221E25" });
    // fill default #262626 sobre #221E25: ratio ≈ 1.0 → bajo contraste → halo claro.
    const preview = screen.getByText("Hola!");
    expect(preview.style.backgroundImage).toBe("none");
    expect(preview.style.backgroundColor).toBe("rgb(34, 30, 37)");
    expect(preview.style.textShadow).toContain("rgba(255, 255, 255");
    expect(screen.getByRole("note")).toBeInTheDocument();
  });

  it("sin cardColor (superficie sin tarjeta de color) → crema de siempre, sin aviso", () => {
    renderForm({});
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
  it("tarjeta rosada + default blanco del lienzo → el preview arranca blanco sobre rosado y aplicar no guarda fill", () => {
    const onApply = vi.fn();
    const { applyRef } = renderForm({
      onApply,
      cardColor: "#E85B9F",
      cardDefaultFill: "#FFFFFF",
    });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Hola!" } });

    const preview = screen.getByText("Hola!");
    expect(preview.style.color).toBe("rgb(255, 255, 255)");
    expect(preview.style.backgroundColor).toBe("rgb(232, 91, 159)");
    // Blanco sobre rosado SÍ se ve (ratio ≈ 3.3) → sin aviso de bajo contraste.
    expect(screen.queryByRole("note")).not.toBeInTheDocument();

    applyRef.current!();
    // Solo el texto viaja: el fill quedó igual a la base → no se guarda override.
    expect(onApply).toHaveBeenCalledWith({ text: "Hola!" });
  });

  it("sin cardDefaultFill (superficie vieja) → la base sigue siendo el fill de la plantilla", () => {
    renderForm({});
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Hola!" } });
    // LAYER no declara fill → base #262626 (comportamiento histórico intacto).
    expect(screen.getByText("Hola!").style.color).toBe("rgb(38, 38, 38)");
  });
});

describe("StudioTextEditorModal — el «Listo» del footer APLICA y CIERRA (2026-10-19)", () => {
  function renderModal(opts: { currentOverride?: TextOverride } = {}) {
    const onApply = vi.fn();
    const onClose = vi.fn();
    renderStudio(
      <StudioTextEditorModal
        isOpen
        layer={LAYER}
        currentOverride={opts.currentOverride}
        onClose={onClose}
        onApply={onApply}
      />,
    );
    return { onApply, onClose };
  }

  it("«Listo» persiste el override editado (como el viejo «Aplicar») y cierra el modal", () => {
    const { onApply, onClose } = renderModal();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Feliz día" } });
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(onApply).toHaveBeenCalledWith({ text: "Feliz día" });
    expect(onClose).toHaveBeenCalled();
  });

  it("«Listo» sin cambios es no-op de datos (undefined) pero igual cierra", () => {
    const { onApply, onClose } = renderModal({ currentOverride: { text: "Hola" } });
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(onApply).toHaveBeenCalledWith(undefined);
    expect(onApply).not.toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalled();
  });

  it("la bajada del modal ya no promete un «Aplicar» inexistente", () => {
    renderModal();
    expect(screen.getByText("Los cambios se guardan con «Listo»")).toBeInTheDocument();
  });
});

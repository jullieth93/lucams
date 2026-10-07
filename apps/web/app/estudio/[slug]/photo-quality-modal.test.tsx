// @vitest-environment jsdom

/*
 * Test del PhotoQualityModal — fix STG 2026-10-07 (bug QA: "Entendido" no
 * funciona y en móvil HORIZONTAL el modal se desfasa).
 *
 * Causa: el panel era `fixed top-1/2 left-1/2 -translate-*` SIN max-h ni
 * overflow → en viewports bajos (844×390 landscape) el contenido se salía de
 * pantalla y el footer con "Entendido" quedaba fuera del viewport. Blinda:
 *   1. El panel tiene max-h en dvh + layout flex-col (cabe en cualquier viewport).
 *   2. El body es la zona scrolleable (overflow-y-auto + min-h-0).
 *   3. Header y footer son shrink-0: siempre visibles, fuera del scroll.
 *   4. Regresión del centrado: el panel NO usa clases -translate-* (framer-motion
 *      escribe `transform` inline para la animación; el centrado vive en un
 *      wrapper flex para que no compitan).
 *   5. "Entendido" sigue llamando onClose y el CTA secundario onAction.
 *
 * Los textos caen al DEFAULT_STUDIO_TEXTS sin provider (mismo patrón de
 * studio-preview-modal.test.tsx).
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { PhotoQualityModal } from "./photo-quality-modal";

afterEach(() => cleanup());

function baseProps() {
  return {
    open: true,
    onClose: vi.fn(),
    severity: "error" as const,
    message: "Se va a ver pixelada al imprimir a tamaño real (5×5 cm).",
    recommendation: "Una foto más grande va a quedar mejor al imprimir.",
    imageUrl: "https://signed.example/foto-baja.jpg",
  };
}

describe("PhotoQualityModal — layout viewport-proof (fix STG 2026-10-07)", () => {
  it("el panel tiene max-h en dvh y flex-col (cabe en móvil vertical y horizontal)", () => {
    render(<PhotoQualityModal {...baseProps()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-h-[90dvh]");
    expect(dialog.className).toContain("flex-col");
    expect(dialog.className).toContain("overflow-hidden");
  });

  it("el panel NO usa clases -translate-* para centrarse (framer-motion escribe transform inline)", () => {
    render(<PhotoQualityModal {...baseProps()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).not.toContain("-translate-x-1/2");
    expect(dialog.className).not.toContain("-translate-y-1/2");
    // El centrado vive en el wrapper flex, no en el nodo animado.
    const wrapper = dialog.parentElement;
    expect(wrapper?.className).toContain("items-center");
    expect(wrapper?.className).toContain("justify-center");
  });

  it("el body es la zona scrolleable (overflow-y-auto + min-h-0) y contiene el mensaje", () => {
    render(<PhotoQualityModal {...baseProps()} />);
    const message = screen.getByText("Se va a ver pixelada al imprimir a tamaño real (5×5 cm).");
    const scrollable = message.closest('[class*="overflow-y-auto"]');
    expect(scrollable).not.toBeNull();
    expect(scrollable?.className).toContain("min-h-0");
  });

  it("el footer con 'Entendido' es shrink-0 y queda FUERA de la zona scrolleable", () => {
    render(<PhotoQualityModal {...baseProps()} />);
    const cerrar = screen.getByRole("button", { name: "Entendido" });
    const footer = cerrar.parentElement;
    expect(footer?.className).toContain("shrink-0");
    // El footer no está dentro del body scrolleable: siempre alcanzable.
    expect(footer?.closest('[class*="overflow-y-auto"]')).toBeNull();
  });

  it("el header también es shrink-0 (no lo comprime el scroll del body)", () => {
    render(<PhotoQualityModal {...baseProps()} />);
    const titulo = screen.getByText("Cuidado con esta foto");
    const header = titulo.closest('[class*="shrink-0"]');
    expect(header).not.toBeNull();
  });
});

describe("PhotoQualityModal — acciones", () => {
  it("'Entendido' llama onClose", () => {
    const props = baseProps();
    render(<PhotoQualityModal {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("con actionLabel + onAction muestra el CTA secundario y lo dispara", () => {
    const onAction = vi.fn();
    render(
      <PhotoQualityModal {...baseProps()} actionLabel="Usar de todos modos" onAction={onAction} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Usar de todos modos" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom

/*
 * Test de canvas UNIFORME (2026-10-12 — reemplaza al test de la bandeja
 * WHITE_CARD_TRAY, eliminada): el Stage SIEMPRE llena el footprint del slot,
 * en todos los productos — sin bandeja cuadriculada ni encogimiento inset,
 * también para la tarjeta BLANCA (su legibilidad white-on-white la da el
 * filete de contraste `outline` del wrapper, no una cuadrícula).
 *
 * Konva no corre en jsdom → react-konva mockeado (patrón de
 * studio-slot-badge.test.tsx); el Stage mock captura sus props.
 */

import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";

let stageProps: { width?: number; height?: number } | null = null;

vi.mock("react-konva", () => {
  const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const noop = () => null;
  return {
    Stage: (props: { width?: number; height?: number; children?: ReactNode }) => {
      stageProps = props;
      return <div>{props.children}</div>;
    },
    Layer: passthrough,
    Group: passthrough,
    Rect: noop,
    Image: noop,
    Text: noop,
    Circle: noop,
    Path: noop,
  };
});

vi.mock("use-image", () => ({ default: () => [null, "loading"] }));

import { StudioSlot } from "./studio-slot";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { CanvasDataV1, SlotState } from "./types";

afterEach(() => {
  cleanup();
  stageProps = null;
});

// Plantilla de tarjeta BLANCA (fondo #FFFFFF — el caso que antes llevaba bandeja).
function whiteTemplate(width: number, height: number): CanvasDataV1 {
  return {
    version: 1,
    stage: { width, height },
    layers: [{ id: "bg", type: "background", color: "#FFFFFF" }],
  } as unknown as CanvasDataV1;
}

function filledSlot(): SlotState {
  return {
    slotIndex: 0,
    assetId: "a",
    assetUrl: "https://img.example/0.jpg",
  } as unknown as SlotState;
}

function renderSlot(template: CanvasDataV1, displaySize: number, displayHeight: number) {
  // TooltipProvider: el slot usa Hint (tooltip radix de marca) en sus chips —
  // en app lo monta app/layout.tsx.
  return render(
    <TooltipProvider delayDuration={0}>
      <StudioSlot
        slotState={filledSlot()}
        unitTemplate={template}
        displaySize={displaySize}
        displayHeight={displayHeight}
        isSelected={false}
        totalSlots={2}
        onClick={vi.fn()}
        onClear={vi.fn()}
        onAssetDrop={vi.fn()}
        onKeyboardNav={vi.fn()}
      />
    </TooltipProvider>,
  );
}

describe("StudioSlot — canvas uniforme (sin bandeja checkerboard ni inset, 2026-10-12)", () => {
  it("tarjeta blanca baja (1:1.33, tipo Polaroid): el Stage llena el footprint del slot", () => {
    // Antes: width 300-16 y height derivado del inset. Ahora: tamaño exacto del slot.
    renderSlot(whiteTemplate(600, 800), 300, 400);
    expect(stageProps).not.toBeNull();
    expect(stageProps!.width).toBe(300);
    expect(stageProps!.height).toBe(400);
  });

  it("separador alargado 1:3 (4×12): mismo contrato — Stage a tamaño completo", () => {
    renderSlot(whiteTemplate(400, 1200), 204, 612);
    expect(stageProps).not.toBeNull();
    expect(stageProps!.width).toBe(204);
    expect(stageProps!.height).toBe(612);
  });

  it("tarjeta cuadrada (1:1): sin inset — el Stage es el slot", () => {
    renderSlot(whiteTemplate(1080, 1080), 300, 300);
    expect(stageProps!.width).toBe(300);
    expect(stageProps!.height).toBe(300);
  });

  it("la tarjeta BLANCA queda legible por el filete de contraste (sin cuadrícula)", () => {
    const { container } = renderSlot(whiteTemplate(1080, 1080), 300, 300);
    const wrapper = container.querySelector("[data-slot-index]") as HTMLElement;
    // Filete neutro sutil (adorno DOM, nunca entra al snapshot)…
    expect(wrapper.style.outline).toBe("1px solid rgba(124, 106, 173, 0.35)");
    // …y NADA de checkerboard en el wrapper.
    expect(wrapper.style.backgroundImage).toBe("");
  });
});

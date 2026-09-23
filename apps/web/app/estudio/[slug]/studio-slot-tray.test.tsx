// @vitest-environment jsdom

/*
 * Test de regresión — bandeja de tarjeta blanca (WHITE_CARD_TRAY) en slots
 * ALTOS (bug 2026-09-22, "banda azul" del feedback del usuario).
 *
 * Causa raíz: el inset de la bandeja era FIJO en px en ambos ejes
 * (stageSlotWidth = slotWidth−16, stageSlotHeight = slotHeight−16). El
 * contenido Konva escala por ANCHO (scaleX=scaleY=ancho/stage.width), así que
 * en tarjetas no cuadradas (separadores alargados 1:3 / 1:3.75) el canvas
 * quedaba más alto que el contenido → banda vacía grande en la parte INFERIOR
 * del marco (~40px abajo vs 8px arriba en un 4×12), en vez de aire parejo.
 *
 * Contrato blindado: con bandeja, el alto del Stage se DERIVA del ancho inset
 * conservando el aspect del slot (el contenido llena el canvas y la bandeja,
 * que centra con flex, reparte el aire arriba/abajo en partes iguales).
 * Productos cuadrados (1:1) quedan idénticos a antes.
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
import type { CanvasDataV1, SlotState } from "./types";

afterEach(() => {
  cleanup();
  stageProps = null;
});

// Plantilla de tarjeta BLANCA (fondo #FFFFFF → bandeja cuadriculada activa).
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
  return render(
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
    />,
  );
}

describe("StudioSlot — bandeja de tarjeta blanca conserva el aspect (bug banda inferior)", () => {
  it("separador alargado 1:3 (4×12): el Stage inset conserva la proporción, sin banda muerta", () => {
    // Caso real: cara 400×1200, display 204×612 (slotDisplaySize × aspect).
    renderSlot(whiteTemplate(400, 1200), 204, 612);
    expect(stageProps).not.toBeNull();
    expect(stageProps!.width).toBe(204 - 16);
    // Antes: 612−16 = 596 (canvas más alto que el contenido 564 → banda abajo).
    // Ahora: (204−16) × 3 = 564 — el contenido llena el canvas exactamente.
    expect(stageProps!.height).toBe((204 - 16) * 3);
  });

  it("separador alargado 1:3.75 (4×15): mismo contrato", () => {
    renderSlot(whiteTemplate(400, 1500), 176, 660);
    expect(stageProps!.width).toBe(176 - 16);
    expect(stageProps!.height).toBe((176 - 16) * 3.75);
  });

  it("tarjeta cuadrada (1:1): idéntica a antes (inset simétrico 16px)", () => {
    renderSlot(whiteTemplate(1080, 1080), 300, 300);
    expect(stageProps!.width).toBe(284);
    expect(stageProps!.height).toBe(284);
  });
});

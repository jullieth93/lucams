// @vitest-environment jsdom

/*
 * Test de la bandeja de tarjeta blanca (WHITE_CARD_TRAY) — dos rondas de QA:
 *
 * 2026-09-22 ("banda azul"): el inset era FIJO en px en ambos ejes y rompía el
 *   aspect en tarjetas no cuadradas → banda de canvas muerta abajo. Fix: el alto
 *   del Stage se deriva del ancho inset.
 * 2026-09-24 (este contrato): en tarjetas MUY altas (aspect ≥ 2, separadores
 *   alargados/magnéticos 1:3+) la bandeja con aspect conservado dejaba márgenes
 *   checkerboard grandes en los 4 lados → el usuario pidió espacio MÍNIMO
 *   alrededor de la imagen: esas tarjetas NO llevan bandeja (el Stage llena el
 *   marco; el borde lo da el filete de contraste). Tarjetas bajas/cuadradas
 *   conservan la bandeja con aspect (Polaroid Clásica blanca, cuadrados).
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
  it("tarjeta blanca baja (1:1.33, tipo Polaroid): bandeja con aspect conservado", () => {
    // 600×800 → aspect 1.33 < 2 → bandeja activa; alto derivado del ancho inset.
    renderSlot(whiteTemplate(600, 800), 300, 400);
    expect(stageProps).not.toBeNull();
    expect(stageProps!.width).toBe(300 - 16);
    expect(stageProps!.height).toBe((300 - 16) * (800 / 600));
  });

  it("separador alargado 1:3 (4×12): SIN bandeja — el Stage llena el marco (margen mínimo)", () => {
    // 2026-09-24 (QA STG): con bandeja el usuario veía márgenes checkerboard
    // grandes alrededor de la foto (el inset con aspect conservado crece con el
    // aspect). En tarjetas ≥2:1 el Stage llena el marco y el borde lo da el
    // filete de contraste — cero aire muerto alrededor del diseño.
    renderSlot(whiteTemplate(400, 1200), 204, 612);
    expect(stageProps).not.toBeNull();
    expect(stageProps!.width).toBe(204);
    expect(stageProps!.height).toBe(612);
  });

  it("separador alargado 1:3.75 (4×15): mismo contrato (sin bandeja)", () => {
    renderSlot(whiteTemplate(400, 1500), 176, 660);
    expect(stageProps!.width).toBe(176);
    expect(stageProps!.height).toBe(660);
  });

  it("tarjeta cuadrada (1:1): bandeja activa, inset simétrico 16px", () => {
    renderSlot(whiteTemplate(1080, 1080), 300, 300);
    expect(stageProps!.width).toBe(284);
    expect(stageProps!.height).toBe(284);
  });
});

// @vitest-environment jsdom

/*
 * Test del identificador de slot (número / mes) — fix Lucy 2026-09-07 +
 * extensión Ola 22 (Lucy 2026-09-08).
 *
 * Contrato blindado: el identificador vive SIEMPRE en la barra de acciones de
 * ABAJO (chip), FUERA del template — para todos los modos:
 *   - slot genérico con foto → chip con el número.
 *   - calendario (slotLabel) → chip con el mes abreviado (antes era un badge
 *     absoluto top-left dentro de la tarjeta, encima de la plantilla).
 *   - modo tira (overlayActions) → chip dentro de la barra flotante (antes el
 *     badge flotaba sobre la foto).
 * YA NO existe ningún badge absoluto top-left dentro del slot: flotaba sobre
 * la plantilla y tapaba el avatar del chrome de la Polaroid Instagram
 * (círculo en (34,34) r=16, ver instagram-template-spec.ts).
 *
 * Konva no corre en jsdom → se mockea react-konva (passthrough de children) y
 * use-image, igual que el patrón de studio-slot-edit-modal.test.tsx.
 */

import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("react-konva", () => {
  const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const noop = () => null;
  return {
    Stage: passthrough,
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

afterEach(() => cleanup());

const UNIT_TEMPLATE = {
  version: 1,
  stage: { width: 450, height: 600 },
  layers: [{ id: "bg", type: "background", color: "#FFFFFF" }],
} as unknown as CanvasDataV1;

function filledSlot(slotIndex = 0): SlotState {
  return {
    slotIndex,
    assetId: `asset-${slotIndex}`,
    assetUrl: `https://img.example/${slotIndex}.jpg`,
  } as unknown as SlotState;
}

function renderSlot(overrides: Partial<Parameters<typeof StudioSlot>[0]> = {}) {
  return render(
    <StudioSlot
      slotState={filledSlot()}
      unitTemplate={UNIT_TEMPLATE}
      displaySize={439}
      displayHeight={586}
      isSelected={false}
      totalSlots={4}
      onClick={vi.fn()}
      onClear={vi.fn()}
      onAssetDrop={vi.fn()}
      onKeyboardNav={vi.fn()}
      {...overrides}
    />,
  );
}

// Selector CSS de las clases Tailwind del viejo badge absoluto (top-1.5 left-1.5).
const ABSOLUTE_BADGE_SELECTOR = ".top-1\\.5.left-1\\.5";

describe("StudioSlot — identificador de slot (chip en la barra de acciones)", () => {
  it("slot con foto (sin slotLabel): el número va como chip en la barra de acciones, NO como badge absoluto", () => {
    const { container } = renderSlot();

    // Chip en la barra de acciones con aria-label "Imán #1" (slotIndicator default).
    const chip = container.querySelector('[aria-label="Imán #1"]');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe("1");
    // Mismo estilo de chip que el tamaño físico (anillo + fondo cream).
    expect(chip!.className).toContain("ring-1");
    expect(chip!.className).toContain("bg-brand-cream/90");

    // Ya NO existe el badge absoluto top-1.5 left-1.5 (tapa el avatar IG).
    expect(container.querySelector(ABSOLUTE_BADGE_SELECTOR)).toBeNull();
  });

  it("slot vacío: tampoco hay badge absoluto (como antes, solo se mostraba con foto)", () => {
    const { container } = renderSlot({
      slotState: { slotIndex: 0, assetId: null, assetUrl: null } as unknown as SlotState,
    });
    expect(container.querySelector(ABSOLUTE_BADGE_SELECTOR)).toBeNull();
  });

  it("calendario (slotLabel): el mes va como chip en la barra de acciones, NO como badge sobre la tarjeta", () => {
    const { container } = renderSlot({ slotLabel: "Enero" });

    // Nada flota sobre la plantilla.
    expect(container.querySelector(ABSOLUTE_BADGE_SELECTOR)).toBeNull();
    // El chip lleva el mes abreviado (mismo formato que el viejo badge).
    const chip = container.querySelector('[aria-label="Enero"]');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe("Ene");
  });

  it("modo tira (overlayActions): el número va como chip en la barra flotante, NO como badge sobre la foto", () => {
    const { container } = renderSlot({ overlayActions: true });
    expect(container.querySelector(ABSOLUTE_BADGE_SELECTOR)).toBeNull();
    const chip = container.querySelector('[aria-label="Imán #1"]');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe("1");
  });

  it("el chip de zoom % (top-right) no se vio afectado por el cambio", () => {
    const { container } = renderSlot({
      slotState: {
        ...filledSlot(),
        photoTransform: { scale: 1.5 },
      } as unknown as SlotState,
    });
    // Zoom chip en top-1.5 right-1.5 con el porcentaje.
    const zoomChip = container.querySelector(".top-1\\.5.right-1\\.5");
    expect(zoomChip).not.toBeNull();
    expect(zoomChip!.textContent).toBe("150%");
  });
});

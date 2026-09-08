// @vitest-environment jsdom

/*
 * Test del badge de número de slot — fix Lucy 2026-09-07.
 *
 * Antes el número de slot era un div absoluto top-1.5 left-1.5 dentro del slot,
 * que caía EXACTAMENTE sobre el avatar del chrome de la Polaroid Instagram.
 * Ahora es un chip al inicio de la barra de acciones (mismo estilo del chip de
 * tamaño). El calendario (slotLabel) conserva su badge de mes dentro del slot.
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

// Selector CSS de las clases Tailwind del badge absoluto (top-1.5 left-1.5).
const ABSOLUTE_BADGE_SELECTOR = ".top-1\\.5.left-1\\.5";

describe("StudioSlot — badge de número de slot", () => {
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

  it("calendario (slotLabel): conserva el badge de mes abreviado dentro del slot", () => {
    const { container } = renderSlot({ slotLabel: "Enero" });

    const badge = container.querySelector(ABSOLUTE_BADGE_SELECTOR);
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe("Ene");

    // El chip numérico NO aparece (el calendario identifica por mes).
    expect(container.querySelector('[aria-label="Imán #1"]')).toBeNull();
  });

  it("modo tira (overlayActions): conserva el badge absoluto (la barra flota sobre la foto)", () => {
    const { container } = renderSlot({ overlayActions: true });
    expect(container.querySelector(ABSOLUTE_BADGE_SELECTOR)).not.toBeNull();
    expect(container.querySelector('[aria-label="Imán #1"]')).toBeNull();
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

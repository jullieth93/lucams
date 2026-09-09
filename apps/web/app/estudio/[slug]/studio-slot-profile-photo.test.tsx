// @vitest-environment jsdom

/*
 * Test del avatar tappeable de la plantilla Polaroid Instagram — Ola 22
 * (Lucy 2026-09-08).
 *
 * Contrato blindado: cuando la plantilla trae la capa `profile-photo` y el slot
 * recibe `onProfilePhotoEdit`, el círculo del avatar (centro 34,34 r=16, ver
 * instagram-template-spec.ts) es una hit region interactiva que dispara el
 * callback — con anillo de affordance + tooltip marcados `edit-indicator` (no
 * se hornean en producción). Sin callback (vista previa del modal) la capa
 * queda no interactiva. Debe funcionar también SIN foto elegida (el uso
 * principal: elegirla por primera vez tapando el placeholder del SVG).
 *
 * Konva no corre en jsdom → react-konva se mockea capturando los props de los
 * Circle (hit region + anillo) para poder asertarlos, igual que el patrón de
 * studio-slot-badge.test.tsx.
 */

import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";

const circleProps = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock("react-konva", () => {
  const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const noop = () => null;
  const Circle = (props: Record<string, unknown>) => {
    circleProps.push(props);
    return <div data-konva="circle" data-name={String(props.name ?? "")} />;
  };
  return {
    Stage: passthrough,
    Layer: passthrough,
    Group: passthrough,
    Rect: noop,
    Image: noop,
    Text: noop,
    Circle,
    Path: noop,
  };
});

vi.mock("use-image", () => ({ default: () => [null, "loading"] }));

import { StudioSlot } from "./studio-slot";
import type { CanvasDataV1, SlotState } from "./types";

afterEach(() => {
  cleanup();
  circleProps.length = 0;
});

const IG_TEMPLATE = {
  version: 1,
  stage: { width: 450, height: 600 },
  layers: [
    { id: "bg", type: "background", color: "#FFFFFF" },
    // Misma geometría que IG_PROFILE_PHOTO_LAYER (instagram-template-spec.ts).
    { id: "profile_photo", type: "profile-photo", x: 34, y: 34, radius: 16 },
  ],
} as unknown as CanvasDataV1;

const PLAIN_TEMPLATE = {
  version: 1,
  stage: { width: 450, height: 600 },
  layers: [{ id: "bg", type: "background", color: "#FFFFFF" }],
} as unknown as CanvasDataV1;

function filledSlot(): SlotState {
  return {
    slotIndex: 0,
    assetId: "asset-0",
    assetUrl: "https://img.example/0.jpg",
  } as unknown as SlotState;
}

function renderSlot(overrides: Partial<Parameters<typeof StudioSlot>[0]> = {}) {
  return render(
    <StudioSlot
      slotState={filledSlot()}
      unitTemplate={IG_TEMPLATE}
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

describe("StudioSlot — avatar tappeable (foto de perfil)", () => {
  it("con onProfilePhotoEdit: hay hit region interactiva sobre el avatar + anillo edit-indicator", () => {
    renderSlot({ onProfilePhotoEdit: vi.fn() });

    // Anillo de affordance permanente (marcado edit-indicator → no se hornea).
    const ring = circleProps.find((p) => p.name === "edit-indicator");
    expect(ring).toBeDefined();
    // Hit region: Circle sin name, con handlers de click/tap.
    const hit = circleProps.find((p) => !p.name && typeof p.onClick === "function");
    expect(hit).toBeDefined();
    // El hit no bloquea el scroll táctil de la página (mismo criterio que los textos).
    expect(hit!.preventDefault).toBe(false);
  });

  it("el click sobre la hit region dispara onProfilePhotoEdit y corta la propagación al wrapper", () => {
    const onProfilePhotoEdit = vi.fn();
    const { container } = renderSlot({ onProfilePhotoEdit });

    const hit = circleProps.find((p) => !p.name && typeof p.onClick === "function")!;
    const stopPropagation = vi.fn();
    // Simula el handler Konva: cancelBubble en Konva + stopPropagation DOM.
    (hit.onClick as (e: unknown) => void)({ cancelBubble: false, evt: { stopPropagation } });

    expect(onProfilePhotoEdit).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    // El click NO abrió el picker genérico del wrapper.
    expect(container.querySelector('[data-state="filled"]')).not.toBeNull();
  });

  it("sin onProfilePhotoEdit (vista previa del modal): la capa queda NO interactiva", () => {
    renderSlot(); // sin callback
    const hit = circleProps.find((p) => !p.name && typeof p.onClick === "function");
    expect(hit).toBeUndefined();
    const ring = circleProps.find((p) => p.name === "edit-indicator");
    expect(ring).toBeUndefined();
  });

  it("plantilla sin capa profile-photo: no se renderiza ninguna hit region", () => {
    renderSlot({ unitTemplate: PLAIN_TEMPLATE, onProfilePhotoEdit: vi.fn() });
    const hits = circleProps.filter((p) => typeof p.onClick === "function");
    expect(hits.length).toBe(0);
  });
});

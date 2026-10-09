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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render } from "@testing-library/react";

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
import { TooltipProvider } from "@/components/ui/tooltip";
import type { CanvasDataV1, SlotState } from "./types";

afterEach(() => {
  cleanup();
  circleProps.length = 0;
});

beforeEach(() => {
  // 2.7a — el "visto" del pulso de descubrimiento vive en localStorage.
  window.localStorage.clear();
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
  // TooltipProvider: el slot usa Hint (tooltip radix de marca) en sus chips —
  // en app lo monta app/layout.tsx.
  return render(
    <TooltipProvider delayDuration={0}>
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
      />
    </TooltipProvider>,
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

/*
 * Fase 2 · 2.7a (2026-10-07) — la foto de perfil pasaba desapercibida: affordance
 * PERMANENTE (botón lápiz, `edit-indicator profile-avatar-badge`) + anillo
 * PULSANTE de descubrimiento la primera vez (`edit-indicator profile-avatar-pulse`),
 * que se apaga cuando el cliente toca el avatar o ya tiene foto (localStorage).
 * Ambos marcados `edit-indicator` → jamás se hornean en el snapshot de producción.
 * En jsdom el pulso queda estático (sin loop rAF), pero se renderiza.
 */
describe("StudioSlot — descubrimiento de la foto de perfil (2.7a)", () => {
  const PULSE = '[data-name~="profile-avatar-pulse"]';
  const BADGE = '[data-name~="profile-avatar-badge"]';
  const SEEN_KEY = "lucams:studio:profile-avatar-hint-seen";

  it("primera vez (sin localStorage ni foto): pulso + badge lápiz sobre el avatar, ambos edit-indicator", () => {
    const { container } = renderSlot({ onProfilePhotoEdit: vi.fn() });

    // data-name conserva el token "edit-indicator" (el snapshot los excluye por ese token).
    const pulse = container.querySelector(PULSE);
    const badge = container.querySelector(BADGE);
    expect(pulse).not.toBeNull();
    expect(badge).not.toBeNull();
    expect(pulse!.getAttribute("data-name")).toContain("edit-indicator");
    expect(badge!.getAttribute("data-name")).toContain("edit-indicator");
  });

  it("tap en el avatar: marca el hint como visto (localStorage) y el pulso desaparece", () => {
    const { container } = renderSlot({ onProfilePhotoEdit: vi.fn() });
    expect(container.querySelector(PULSE)).not.toBeNull();

    const hit = circleProps.find((p) => !p.name && typeof p.onClick === "function")!;
    act(() => {
      (hit.onClick as (e: unknown) => void)({
        cancelBubble: false,
        evt: { stopPropagation: vi.fn() },
      });
    });

    expect(window.localStorage.getItem(SEEN_KEY)).toBe("1");
    expect(container.querySelector(PULSE)).toBeNull();
    // El affordance permanente (badge) NO se va: la edición sigue siendo descubrible.
    expect(container.querySelector(BADGE)).not.toBeNull();
  });

  it("hint ya visto (localStorage): no hay pulso, pero el badge permanente sigue", () => {
    window.localStorage.setItem(SEEN_KEY, "1");
    const { container } = renderSlot({ onProfilePhotoEdit: vi.fn() });

    expect(container.querySelector(PULSE)).toBeNull();
    expect(container.querySelector(BADGE)).not.toBeNull();
  });

  it("con foto de perfil ya elegida: no hay pulso (y persiste el «visto»)", () => {
    const slot = { ...filledSlot(), profileAssetUrl: "https://img.example/profile.jpg" };
    const { container } = renderSlot({ slotState: slot, onProfilePhotoEdit: vi.fn() });

    expect(container.querySelector(PULSE)).toBeNull();
    expect(window.localStorage.getItem(SEEN_KEY)).toBe("1");
    expect(container.querySelector(BADGE)).not.toBeNull();
  });

  it("sin onProfilePhotoEdit: ni pulso ni badge (capa no interactiva)", () => {
    const { container } = renderSlot();
    expect(container.querySelector(PULSE)).toBeNull();
    expect(container.querySelector(BADGE)).toBeNull();
  });
});

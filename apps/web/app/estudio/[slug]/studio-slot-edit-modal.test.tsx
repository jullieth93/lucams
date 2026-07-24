// @vitest-environment jsdom

/*
 * Test del modal unificado de edición por slot — Ola 9 (Lucy 2026-07-24):
 * el slider de zoom se ELIMINÓ de toda la UI; el zoom/encuadre se hace con
 * gestos directos (rueda/pellizco/arrastre) sobre el preview interactivo de la
 * pestaña Foto. Estos tests blindan ese contrato:
 *   1. No existe ningún input[type=range] (slider) en la pestaña Foto.
 *   2. El preview interactivo recibe el slotState actual (foto + transform)
 *      y propaga onTransformChange.
 *   3. Se conservan los controles accesibles (cruceta, centrar, filtros).
 *
 * Konva no corre en jsdom → se mockea StudioPhotoPreview (su interacción real
 * la cubre la lógica compartida de gestos del slot).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { StudioPhotoPreviewProps } from "./studio-photo-preview";

const previewSpy = vi.fn<(props: StudioPhotoPreviewProps) => void>();

vi.mock("./studio-photo-preview", () => ({
  StudioPhotoPreview: (props: StudioPhotoPreviewProps) => {
    previewSpy(props);
    return <div data-testid="photo-preview-mock" />;
  },
}));

vi.mock("./studio-text-editor-modal", () => ({
  StudioTextEditorForm: () => <div data-testid="text-editor-mock" />,
}));

import { StudioSlotEditModal } from "./studio-slot-edit-modal";
import type { CanvasDataV1 } from "./types";

const UNIT_TEMPLATE: CanvasDataV1 = {
  version: 1,
  stage: { width: 450, height: 600, dpiPreview: 90, dpiProduction: 300 },
  layers: [
    { id: "background", type: "background", color: "#FFFFFF" },
    {
      id: "p1",
      type: "image-placeholder",
      x: 25,
      y: 54,
      width: 400,
      height: 400,
      cornerRadius: 0,
      rotation: 0,
      label: "Tu foto",
    },
  ],
} as unknown as CanvasDataV1;

function baseProps() {
  return {
    isOpen: true,
    slotIndex: 0,
    hasPhoto: true,
    hasText: false,
    photoUrl: "blob:foto-de-prueba",
    currentFilter: null,
    currentTransform: { offsetX: 12, offsetY: -4, scale: 1.5, rotation: 0 },
    currentTextOverrides: undefined,
    textLayers: [],
    allowFilters: true,
    onClose: vi.fn(),
    onApplyFilter: vi.fn(),
    onResetTransform: vi.fn(),
    onNudge: vi.fn(),
    onRotate: vi.fn(),
    onApplyTextOverride: vi.fn(),
    preview: {
      unitTemplate: UNIT_TEMPLATE,
      totalSlots: 1,
      borderColor: null,
      allowText: false,
      frameFullBleed: false,
      calendarCard: null,
      onTransformChange: vi.fn(),
    },
  };
}

afterEach(() => {
  cleanup();
  previewSpy.mockClear();
});

describe("StudioSlotEditModal — Ola 9 sin slider de zoom", () => {
  it("la pestaña Foto NO contiene ningún slider (input[type=range])", () => {
    render(<StudioSlotEditModal {...baseProps()} />);
    expect(document.querySelectorAll("input[type=range]")).toHaveLength(0);
  });

  it("monta el preview interactivo con el estado ACTUAL del slot (foto + transform)", () => {
    const props = baseProps();
    render(<StudioSlotEditModal {...props} />);
    expect(screen.getByTestId("photo-preview-mock")).toBeTruthy();
    const last = previewSpy.mock.calls.at(-1)?.[0];
    expect(last?.slotState.assetUrl).toBe("blob:foto-de-prueba");
    expect(last?.slotState.photoTransform).toEqual({
      offsetX: 12,
      offsetY: -4,
      scale: 1.5,
      rotation: 0,
    });
    expect(last?.totalSlots).toBe(1);
  });

  it("los gestos del preview propagan onTransformChange (zoom/pan directo)", () => {
    const props = baseProps();
    render(<StudioSlotEditModal {...props} />);
    const last = previewSpy.mock.calls.at(-1)?.[0];
    last?.onTransformChange({ scale: 2 });
    expect(props.preview.onTransformChange).toHaveBeenCalledWith({ scale: 2 });
  });

  it("conserva los controles accesibles: cruceta de movimiento y centrar", () => {
    const props = baseProps();
    render(<StudioSlotEditModal {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Mover la foto hacia arriba" }));
    expect(props.onNudge).toHaveBeenCalledWith(0, -12);
    fireEvent.click(screen.getByRole("button", { name: /Centrar y resetear zoom/i }));
    expect(props.onResetTransform).toHaveBeenCalled();
  });
});

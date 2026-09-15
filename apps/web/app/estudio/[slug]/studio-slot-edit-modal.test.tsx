// @vitest-environment jsdom

/*
 * Test del modal unificado de edición por slot — Ola 9 (Lucy 2026-07-24):
 * el slider de zoom se ELIMINÓ de toda la UI; el zoom/encuadre se hace con
 * gestos directos (rueda/pellizco/arrastre) sobre el preview interactivo de la
 * pestaña Foto. Estos tests blindan ese contrato:
 *   1. No existe ningún input[type=range] (slider) en la pestaña Foto.
 *   2. El preview interactivo recibe el slotState actual (foto + transform)
 *      y propaga onTransformChange.
 *   3. Se conserva el control accesible de centrar/reset (la cruceta "Mover" se
 *      retiró el 2026-09-08 a pedido del owner: el pan se hace arrastrando la
 *      foto directamente en el preview).
 *
 * Konva no corre en jsdom → se mockea StudioPhotoPreview (su interacción real
 * la cubre la lógica compartida de gestos del slot).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("conserva los controles de encuadre: centrar/reset y rotar (sin cruceta «Mover»)", () => {
    const props = baseProps();
    render(<StudioSlotEditModal {...props} />);
    // Lucy 2026-09-08 — la cruceta "Mover" se retiró del modal (pedido del owner).
    expect(screen.queryByRole("button", { name: /Mover la foto/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Centrar y resetear zoom/i }));
    expect(props.onResetTransform).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Rotar la foto 90 grados/i }));
    expect(props.onRotate).toHaveBeenCalled();
  });

  // Lucy 2026-09-08 — al aplicar un filtro debe verse un estado de PROCESAMIENTO
  // (spinner + cards deshabilitadas) hasta que el apply completa.
  it("aplicar un filtro muestra estado de procesamiento hasta completar", async () => {
    const props = baseProps();
    render(<StudioSlotEditModal {...props} />);
    const card = screen.getByRole("radio", { name: /^Vivid/i });
    fireEvent.click(card);
    // Feedback inmediato: la card elegida queda ocupada y el grupo deshabilitado.
    expect(card).toHaveAttribute("aria-busy", "true");
    expect(card).toBeDisabled();
    // El commit al store va un frame después (el spinner pinta primero).
    await waitFor(() => expect(props.onApplyFilter).toHaveBeenCalledWith("vivid"));
    // Al completar, el grupo se rehabilita.
    await waitFor(() => expect(card).not.toBeDisabled(), { timeout: 1500 });
    expect(card).not.toHaveAttribute("aria-busy", "true");
  });
});

describe("StudioSlotEditModal — letra del calendario dentro de «Ajustar Foto» (Lucy 2026-09-08)", () => {
  it("con onCalendarFontChange: el selector aparece en la pestaña Foto con las 8 fuentes", () => {
    const onCalendarFontChange = vi.fn();
    render(
      <StudioSlotEditModal
        {...baseProps()}
        calendarFont="fredoka"
        onCalendarFontChange={onCalendarFontChange}
      />,
    );
    const select = document.querySelector<HTMLSelectElement>("#cal-font-select");
    expect(select).not.toBeNull();
    // Las 8 opciones curadas (CALENDAR_FONT_OPTIONS, owner 2026-09-14), fredoka seleccionada.
    expect(select!.options.length).toBe(8);
    expect(select!.value).toBe("fredoka");
    expect(screen.getByText("Esta letra aplica a los 12 meses de tu calendario.")).toBeTruthy();

    fireEvent.change(select!, { target: { value: "caveat" } });
    expect(onCalendarFontChange).toHaveBeenCalledWith("caveat");
  });

  it("sin onCalendarFontChange (no calendario): NO hay selector de letra", () => {
    render(<StudioSlotEditModal {...baseProps()} />);
    expect(document.querySelector("#cal-font-select")).toBeNull();
  });

  it("el selector refleja la fuente actual que viene del store (p.ej. inter)", () => {
    render(
      <StudioSlotEditModal {...baseProps()} calendarFont="inter" onCalendarFontChange={vi.fn()} />,
    );
    expect(document.querySelector<HTMLSelectElement>("#cal-font-select")!.value).toBe("inter");
  });
});

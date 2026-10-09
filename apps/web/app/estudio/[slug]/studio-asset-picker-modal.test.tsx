// @vitest-environment jsdom

/*
 * StudioAssetPickerModal — paridad desktop/móvil de avisos de calidad
 * (2026-10-02). Antes la foto con warning se asignaba con 1 click y el detalle
 * solo vivía en un title= nativo (inalcanzable en táctil). Ahora:
 *   1. Click en foto con warning (warning-soft / warning-strong / error) abre
 *      el PhotoQualityModal compartido y NO asigna.
 *   2. El CTA "Usar de todos modos" SÍ asigna (mismo handlePickAsset) y cierra.
 *   3. Fotos sin warning mantienen la asignación directa de 1 click.
 *   4. "Entendido" cierra el modal sin asignar.
 *
 * Los textos CMS caen al DEFAULT_STUDIO_TEXTS sin provider (mismo patrón que
 * studio-preview-modal.test.tsx).
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { StudioAsset } from "./types";

vi.mock("@/features/personalization/actions", () => ({
  uploadDesignAssetAction: vi.fn(),
  assignPredesignedToDesignAction: vi.fn(),
}));

import { StudioAssetPickerModal } from "./studio-asset-picker-modal";

afterEach(() => cleanup());

const WARNED: StudioAsset = {
  id: "warned",
  signedUrl: "https://example.com/warned.jpg",
  width: 400,
  height: 300,
  validationLevel: "warning-strong",
  validationMessage: "Resolución baja para el tamaño de impresión",
};

const OK: StudioAsset = {
  id: "ok",
  signedUrl: "https://example.com/ok.jpg",
  width: 2400,
  height: 2400,
};

function renderPicker(assets: StudioAsset[]) {
  const props = {
    isOpen: true,
    slotIndex: 0,
    totalSlots: 3,
    assets,
    designId: null,
    onClose: vi.fn(),
    onSelectAsset: vi.fn(),
    onAssetUploaded: vi.fn(),
  };
  render(
    <TooltipProvider>
      <StudioAssetPickerModal {...props} />
    </TooltipProvider>,
  );
  return props;
}

describe("StudioAssetPickerModal — avisos de calidad con PhotoQualityModal", () => {
  it("el badge ⚠️ Revisar queda FUERA de la imagen (fila-caption debajo, 2026-10-02)", () => {
    renderPicker([WARNED]);

    const chip = screen.getByText(/Revisar/);
    const img = screen.getByAltText("Foto subida");
    const imageBox = img.parentElement!;
    // La imagen sigue recortada en su propio contenedor…
    expect(imageBox.className).toContain("overflow-hidden");
    // …y el chip ya NO vive dentro de él (antes tapaba la miniatura de ~77px).
    expect(imageBox.contains(chip)).toBe(false);
  });

  it("click en foto con warning abre el modal de calidad y NO asigna", () => {
    const props = renderPicker([WARNED, OK]);

    fireEvent.click(
      screen.getByRole("gridcell", {
        name: `Asignar foto al slot. Aviso: ${WARNED.validationMessage}`,
      }),
    );

    // El modal compartido se abre (header de severidad fuerte) con el mensaje del asset.
    expect(screen.getByRole("dialog", { name: "Cuidado con esta foto" })).toBeInTheDocument();
    expect(screen.getByText(WARNED.validationMessage!)).toBeInTheDocument();
    // El badge ⚠️ Revisar sigue visible, en la fila-caption debajo de la miniatura.
    expect(screen.getByText(/Revisar/)).toBeInTheDocument();
    // Y NO se asignó nada todavía.
    expect(props.onSelectAsset).not.toHaveBeenCalled();
  });

  it("'Usar de todos modos' asigna la foto con warning y cierra el modal", async () => {
    const props = renderPicker([WARNED]);

    fireEvent.click(
      screen.getByRole("gridcell", {
        name: `Asignar foto al slot. Aviso: ${WARNED.validationMessage}`,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Usar de todos modos" }));

    // El modal de calidad se cierra (la salida de AnimatePresence tarda unos
    // frames en jsdom)…
    await vi.waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Cuidado con esta foto" }),
      ).not.toBeInTheDocument();
    });
    // …y la asignación corre por el mismo handlePickAsset (rAF + commit al slot).
    await vi.waitFor(() => {
      expect(props.onSelectAsset).toHaveBeenCalledWith(0, WARNED);
    });
  });

  it("foto sin warning mantiene asignación directa de 1 click (sin modal)", async () => {
    const props = renderPicker([OK]);

    fireEvent.click(screen.getByRole("gridcell", { name: "Asignar esta foto al slot" }));

    expect(screen.queryByRole("dialog", { name: "Cuidado con esta foto" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Aviso sobre esta foto" })).not.toBeInTheDocument();
    await vi.waitFor(() => {
      expect(props.onSelectAsset).toHaveBeenCalledWith(0, OK);
    });
  });

  it("'Entendido' cierra el modal sin asignar la foto", async () => {
    const props = renderPicker([WARNED]);

    fireEvent.click(
      screen.getByRole("gridcell", {
        name: `Asignar foto al slot. Aviso: ${WARNED.validationMessage}`,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));

    await vi.waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Cuidado con esta foto" }),
      ).not.toBeInTheDocument();
    });
    expect(props.onSelectAsset).not.toHaveBeenCalled();
  });
});

describe("StudioAssetPickerModal — estado 'procesando' se resetea al cerrar (fix STG 2026-10-05)", () => {
  const OK2: StudioAsset = {
    id: "ok2",
    signedUrl: "https://example.com/ok2.jpg",
    width: 2400,
    height: 2400,
  };

  it("reabrir el picker para OTRO slot no deja las miniaturas deshabilitadas ni el spinner", async () => {
    const props = {
      isOpen: true,
      slotIndex: 0,
      totalSlots: 3,
      assets: [OK, OK2],
      designId: null,
      onClose: vi.fn(),
      onSelectAsset: vi.fn(),
      onAssetUploaded: vi.fn(),
    };
    // El editor mantiene el componente SIEMPRE montado (solo lo oculta con
    // isOpen) — la regresión vivía exactamente en ese ciclo de vida.
    const { rerender } = render(
      <TooltipProvider>
        <StudioAssetPickerModal {...props} />
      </TooltipProvider>,
    );
    const renderWith = (isOpen: boolean, slotIndex: number) =>
      rerender(
        <TooltipProvider>
          <StudioAssetPickerModal {...props} isOpen={isOpen} slotIndex={slotIndex} />
        </TooltipProvider>,
      );

    // Asignar una foto al slot 1: queda el estado "procesando" (spinner +
    // resto deshabilitado) hasta que cierra el timer de feedback.
    fireEvent.click(screen.getAllByRole("gridcell", { name: "Asignar esta foto al slot" })[0]);
    await vi.waitFor(() => {
      expect(props.onSelectAsset).toHaveBeenCalledWith(0, OK);
    });
    expect(
      screen.getAllByRole("gridcell", { name: "Asignar esta foto al slot" })[1],
    ).toBeDisabled();

    // El editor cierra el picker (onClose del timer o backdrop) y luego lo
    // reabre para el slot 2.
    renderWith(false, 0);
    renderWith(true, 1);

    // Todas las miniaturas vuelven a estar habilitadas: sin el fix quedaban
    // disabled para siempre ("procesando" eterno).
    for (const cell of screen.getAllByRole("gridcell", { name: "Asignar esta foto al slot" })) {
      expect(cell).not.toBeDisabled();
      expect(cell).not.toHaveAttribute("aria-busy", "true");
    }
  });
});

describe("StudioAssetPickerModal — tabs «Mis fotos» / «Prediseñados» (Fase 2 · 2.5)", () => {
  const PREDESIGNED = [
    { id: "g1", name: "Amor pastel", imageUrl: "https://example.com/g1.png" },
    { id: "g2", name: "Selva", imageUrl: "https://example.com/g2.png" },
  ];

  function renderPickerWithPredesigned(
    assets: StudioAsset[],
    overrides: Partial<Parameters<typeof StudioAssetPickerModal>[0]> = {},
  ) {
    const props = {
      isOpen: true,
      slotIndex: 0,
      totalSlots: 3,
      assets,
      designId: null,
      predesigned: PREDESIGNED,
      onClose: vi.fn(),
      onSelectAsset: vi.fn(),
      onAssetUploaded: vi.fn(),
      ...overrides,
    };
    render(
      <TooltipProvider>
        <StudioAssetPickerModal {...props} />
      </TooltipProvider>,
    );
    return props;
  }

  it("con prediseñados: tabs con «Mis fotos» PRIMERO y seleccionada por defecto; «Subir nueva» visible", () => {
    renderPickerWithPredesigned([OK]);

    const tabs = screen.getAllByRole("tab");
    // Orden: Mis fotos primero, Prediseñados segundo.
    expect(tabs[0]).toHaveAccessibleName(/Mis fotos/);
    expect(tabs[1]).toHaveAccessibleName(/Prediseñados/);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");

    // Tab activa = Mis fotos: su grid visible, los prediseñados NO.
    expect(screen.getByRole("gridcell", { name: "Asignar esta foto al slot" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aplicar el diseño/ })).toBeNull();

    // "Subir nueva" vive en la zona fija: accesible sin importar el tab.
    expect(
      screen.getByRole("button", { name: "Subir foto desde tu dispositivo" }),
    ).toBeInTheDocument();
  });

  it("el tab «Prediseñados» muestra su grid y oculta «Mis fotos» (sin scroll eterno)", () => {
    renderPickerWithPredesigned([OK]);

    // Radix Tabs activa el trigger en mouseDown (no en click).
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Prediseñados/ }));

    expect(
      screen.getByRole("button", { name: "Aplicar el diseño Amor pastel al slot" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Aplicar el diseño Selva al slot" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("gridcell", { name: "Asignar esta foto al slot" })).toBeNull();
    // El CTA de subir sigue accesible desde este tab.
    expect(
      screen.getByRole("button", { name: "Subir foto desde tu dispositivo" }),
    ).toBeInTheDocument();
  });

  it("modo profile (foto de perfil IG): NO hay tab de prediseñados aunque existan", () => {
    renderPickerWithPredesigned([OK], { mode: "profile" });

    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("button", { name: /Aplicar el diseño/ })).toBeNull();
    // Mis fotos va directo, con su encabezado de sección (sin tabs).
    expect(screen.getByRole("gridcell", { name: "Asignar esta foto al slot" })).toBeInTheDocument();
    expect(screen.getByText(/Mis fotos/)).toBeInTheDocument();
  });

  it("sin prediseñados: no hay tabs (comportamiento previo intacto)", () => {
    renderPicker([OK]);

    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByRole("gridcell", { name: "Asignar esta foto al slot" })).toBeInTheDocument();
  });

  // Fase 3 · 3.10 (2026-10-07) — la tarjeta exhibe la MINIATURA watermark
  // (thumbUrl) cuando existe; el original solo es fallback transitorio
  // (filas pre-backfill). Disuasión anti-copia: draggable=false + contextmenu
  // bloqueado sobre la imagen.
  it("3.10 — exhibe la miniatura watermark (thumbUrl) con disuasión anti-copia", () => {
    renderPickerWithPredesigned([OK], {
      predesigned: [
        {
          id: "g1",
          name: "Amor pastel",
          imageUrl: "https://example.com/g1.png",
          thumbUrl: "https://example.com/thumbs/g1.webp",
        },
      ],
    });
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Prediseñados/ }));

    const img = screen.getByAltText("Amor pastel");
    expect(img).toHaveAttribute("src", "https://example.com/thumbs/g1.webp");
    expect(img).toHaveAttribute("draggable", "false");
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    img.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("3.10 — sin thumbUrl (pre-backfill) cae al imageUrl original (fallback transitorio)", () => {
    renderPickerWithPredesigned([OK], {
      predesigned: [{ id: "g2", name: "Selva", imageUrl: "https://example.com/g2.png" }],
    });
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Prediseñados/ }));

    expect(screen.getByAltText("Selva")).toHaveAttribute("src", "https://example.com/g2.png");
  });
});

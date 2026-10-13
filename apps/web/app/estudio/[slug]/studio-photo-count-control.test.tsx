// @vitest-environment jsdom

/*
 * Test de componente — StudioPhotoCountControl (Lucy 2026-09-05).
 *
 * "¿Cuántos separadores quieres?" — stepper de N UNIDADES del pack (2026-10-12:
 * el N son unidades del producto, no fotos; el sustantivo llega por prop
 * `unitNoun`, mismo par {one, many, feminine?} que resuelve resolveSlotNoun en
 * el editor y pasa la toolbar), junto a la toolbar del Estudio. Blinda el
 * contrato del cambio de N:
 *   1. Muestra el N del diseño y el label con el sustantivo de la unidad.
 *   2. Al subir N: slotCount = N × facesPerUnit, slots preservados por índice
 *      (los que quedan fuera sueltan la foto, los nuevos quedan vacíos) y
 *      gridLayout recalculado.
 *   3. Al bajar N: los slots se recortan y las fotos dentro del nuevo conteo
 *      se conservan por índice.
 *   4. Respeta min/max (max = mayor photoSlots del catálogo para el tamaño).
 *   5. Modo fijo (min === max, ej. tiras): stepper deshabilitado + hint.
 *   6. Sin unitNoun cae al sustantivo CMS de respaldo ("foto/s", femenino).
 *
 * Los textos CMS caen al DEFAULT_STUDIO_TEXTS sin provider (mismo patrón que
 * studio-preview-modal.test.tsx). El store es una instancia real de zustand.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StudioPhotoCountControl } from "./studio-photo-count-control";
import { createStudioStore } from "./lib/store";
import type { SlotNoun } from "./lib/slot-noun";
import type { CanvasDataV2 } from "./types";

afterEach(() => cleanup());

function makeCanvasData(photoSlots: number): CanvasDataV2 {
  const slotCount = photoSlots * 2; // separadores: facesPerUnit=2
  return {
    version: 2,
    unitTemplate: {
      version: 1,
      stage: { width: 1080, height: 1080 },
      layers: [{ id: "bg", type: "background", color: "#FFFFFF" }],
    },
    slotCount,
    photoSlots,
    sizeCm: "6×6",
    slots: Array.from({ length: slotCount }, (_, i) => ({
      slotIndex: i,
      assetId: i === 0 || i === 4 ? `asset-${i}` : null,
      assetUrl: i === 0 || i === 4 ? `https://img/${i}.jpg` : null,
    })),
    gridLayout: { cols: 3, rows: 2, gap: 16 },
  };
}

// Sustantivo que la toolbar pasa para separadores (resolveSlotNoun bookmarks).
const SEPARADOR: SlotNoun = { one: "separador", many: "separadores" };

function setup(
  photoSlots = 3,
  opts?: { min?: number; max?: number; magnet?: boolean; unitNoun?: SlotNoun | null },
) {
  const store = createStudioStore();
  const canvasData = makeCanvasData(photoSlots);
  store.getState().init({
    designId: "d1",
    productSlug: "separadores-magneticos",
    canvasData,
    templates: [],
  });
  render(
    <StudioPhotoCountControl
      store={store}
      min={opts?.min ?? 1}
      max={opts?.max ?? 6}
      facesPerUnit={2}
      sizeCm="6×6"
      // null explícito = sin prop (fallback CMS); undefined = el de separadores.
      {...(opts && "unitNoun" in opts
        ? opts.unitNoun == null
          ? {}
          : { unitNoun: opts.unitNoun }
        : { unitNoun: SEPARADOR })}
      magnet={opts?.magnet}
    />,
  );
  return store;
}

describe("StudioPhotoCountControl", () => {
  it("muestra el label y el N del diseño con el sustantivo de la unidad", () => {
    setup(3);
    expect(screen.getByText("¿Cuántos separadores quieres?")).toBeInTheDocument();
    // El conteo y su sustantivo viven en el mismo nodo ("3 separadores").
    expect(screen.getByText("3 separadores")).toBeInTheDocument();
    expect(screen.getByText("Tus fotos se conservan al cambiar el número")).toBeInTheDocument();
  });

  it("concuerda en femenino cuando el sustantivo de la unidad es femenino", () => {
    setup(3, { unitNoun: { one: "ficha", many: "fichas", feminine: true } });
    expect(screen.getByText("¿Cuántas fichas quieres?")).toBeInTheDocument();
    expect(screen.getByText("3 fichas")).toBeInTheDocument();
    expect(screen.getByLabelText("Quitar una ficha")).toBeInTheDocument();
    expect(screen.getByLabelText("Agregar una ficha")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Cantidad de fichas" })).toBeInTheDocument();
  });

  it("sin unitNoun cae al sustantivo CMS de respaldo (foto/fotos)", () => {
    setup(3, { unitNoun: null });
    expect(screen.getByText("¿Cuántas fotos quieres?")).toBeInTheDocument();
    expect(screen.getByText("3 fotos")).toBeInTheDocument();
    expect(screen.getByLabelText("Quitar una foto")).toBeInTheDocument();
  });

  // El cambio de N se aplica en el frame siguiente al click (feedback de
  // procesamiento 2026-09-09: spinner + stepper bloqueado mientras el lienzo
  // Konva se redibuja) → los asserts del store esperan el apply con waitFor.
  it("subir N reconstruye slots preservando fotos por índice y recalcula el grid", async () => {
    const store = setup(3);
    fireEvent.click(screen.getByLabelText("Agregar un separador"));
    await waitFor(() => expect(store.getState().canvasData!.photoSlots).toBe(4));
    const cd = store.getState().canvasData!;
    expect(cd.slotCount).toBe(8); // 4 unidades × 2 caras
    expect(cd.slots).toHaveLength(8);
    // Fotos preservadas por índice (slots 0 y 4), el resto vacío.
    expect(cd.slots[0].assetId).toBe("asset-0");
    expect(cd.slots[4].assetId).toBe("asset-4");
    expect(cd.slots[6].assetId).toBeNull();
    expect(cd.slots[7].assetId).toBeNull();
    // Grid recalculado (preset 8 → 4×2) y tamaño persistido para el carrito.
    expect(cd.gridLayout).toEqual({ cols: 4, rows: 2, gap: 16 });
    expect(cd.sizeCm).toBe("6×6");
    // El cambio queda marcado sucio → el auto-save lo persiste (ruta del carrito).
    expect(store.getState().isDirty).toBe(true);
  });

  it("bajar N recorta slots: las fotos dentro del nuevo conteo se conservan", async () => {
    const store = setup(3);
    fireEvent.click(screen.getByLabelText("Quitar un separador"));
    await waitFor(() => expect(store.getState().canvasData!.photoSlots).toBe(2));
    const cd = store.getState().canvasData!;
    expect(cd.slotCount).toBe(4);
    // Slot 0 conserva su foto; el slot 4 quedó fuera del conteo (se suelta).
    expect(cd.slots[0].assetId).toBe("asset-0");
    expect(cd.slots).toHaveLength(4);
  });

  it("mientras reconstruye el lienzo da feedback: spinner y stepper bloqueado", async () => {
    const store = setup(3);
    fireEvent.click(screen.getByLabelText("Agregar un separador"));
    // Feedback inmediato (antes de que corra el rebuild síncrono del canvas):
    // ambos botones bloqueados y el grupo marcado ocupado.
    expect(screen.getByLabelText("Agregar un separador")).toBeDisabled();
    expect(screen.getByLabelText("Quitar un separador")).toBeDisabled();
    expect(screen.getByRole("group", { name: "Cantidad de separadores" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await waitFor(() => expect(store.getState().canvasData!.photoSlots).toBe(4));
    // Terminó: el stepper vuelve a la normalidad con el nuevo N.
    expect(screen.getByLabelText("Agregar un separador")).toBeEnabled();
    expect(screen.getByText("4 separadores")).toBeInTheDocument();
  });

  it("respeta max: en el tope del catálogo el + se deshabilita", () => {
    setup(6, { min: 1, max: 6 });
    expect(screen.getByLabelText("Agregar un separador")).toBeDisabled();
    expect(screen.getByLabelText("Quitar un separador")).toBeEnabled();
  });

  it("modo fijo (min === max): stepper deshabilitado + hint de unidades fijas", () => {
    // Réplica tiras-magneticas 6.5×20: ese tamaño lleva siempre 3 unidades.
    setup(3, { min: 3, max: 3 });
    expect(screen.getByLabelText("Agregar un separador")).toBeDisabled();
    expect(screen.getByLabelText("Quitar un separador")).toBeDisabled();
    expect(screen.getByText("Este tamaño lleva 3 separadores")).toBeInTheDocument();
    expect(
      screen.queryByText("Tus fotos se conservan al cambiar el número"),
    ).not.toBeInTheDocument();
  });

  // Lucy 2026-09-08 — "¿Con imán?" en los packs: badge read-only de la elección
  // de la PDP (no es un control; cambiarla es cambiar de variante, eso pasa en la ficha).
  it("muestra el badge «Con imán» read-only cuando la PDP lo eligió", () => {
    setup(3, { magnet: true });
    expect(screen.getByText(/Con imán/)).toBeInTheDocument();
    expect(screen.getByText(/se elige en la página del producto/)).toBeInTheDocument();
    // No es un botón ni un control: no hay nada clicable del imán.
    expect(screen.queryByRole("button", { name: /imán/i })).not.toBeInTheDocument();
  });

  it("muestra el badge «Sin imán» cuando la PDP eligió esa opción", () => {
    setup(3, { magnet: false });
    expect(screen.getByText(/Sin imán/)).toBeInTheDocument();
    expect(screen.queryByText(/Con imán/)).not.toBeInTheDocument();
  });

  it("sin dato de magnet (catálogo sin la dimensión) no renderiza badge", () => {
    setup(3);
    expect(screen.queryByText(/Con imán/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sin imán/)).not.toBeInTheDocument();
  });
});

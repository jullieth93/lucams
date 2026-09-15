// @vitest-environment jsdom

/*
 * Test de componente — StudioUnitCountControl (Ola 28, owner 2026-09-11 · 1.3.A).
 *
 * Stepper "Unidades" del Estudio para productos de COMPOSICIÓN fija (tiras):
 * la composición (fotos por tira) se eligió en la PDP; acá el cliente ajusta
 * CUÁNTAS tiras diseñar. Blinda el contrato:
 *   1. Muestra "Unidades" y el N vivo del diseño (canvasData.unitCount).
 *   2. Subir/bajar N redeclara el modelo (slotCount = unitSlots × N) con las
 *      fotos preservadas por índice y el grid por unidad recalculado.
 *   3. Tope = cap de 50 slots del schema (maxUnitsForProduct).
 *   4. Guard: con unitSlots = 1 (imán suelto) el store no hace nada (allí el
 *      stepper de fotos YA es el de unidades — este control no se monta).
 *
 * Los textos CMS caen al DEFAULT_STUDIO_TEXTS sin provider (mismo patrón que
 * studio-photo-count-control.test.tsx). El store es una instancia real de zustand.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StudioUnitCountControl } from "./studio-unit-count-control";
import { createStudioStore, selectIsComplete } from "./lib/store";
import type { CanvasDataV2 } from "./types";

afterEach(() => cleanup());

/** Tira de 3 fotos × `units` unidades (celda 390×530, 1 columna, gap 0). */
function makeStripCanvas(units: number): CanvasDataV2 {
  const unitSlots = 3;
  const slotCount = unitSlots * units;
  return {
    version: 2,
    unitTemplate: {
      version: 1,
      stage: { width: 390, height: 530 },
      layers: [{ id: "bg", type: "background", color: "#FFFFFF" }],
      gridCols: 1,
      gridGap: 0,
    } as CanvasDataV2["unitTemplate"],
    slotCount,
    photoSlots: 3,
    unitCount: units,
    unitSlots,
    sizeCm: "6.5×20",
    slots: Array.from({ length: slotCount }, (_, i) => ({
      slotIndex: i,
      assetId: i === 0 || i === 4 ? `asset-${i}` : null,
      assetUrl: i === 0 || i === 4 ? `https://img/${i}.jpg` : null,
    })),
    gridLayout: { cols: 1, rows: unitSlots, gap: 0 },
  };
}

function setup(units = 2, opts?: { magnet?: boolean; bare?: CanvasDataV2 }) {
  const store = createStudioStore();
  store.getState().init({
    designId: "d1",
    productSlug: "tiras-magneticas-fotos",
    canvasData: opts?.bare ?? makeStripCanvas(units),
    templates: [],
  });
  render(<StudioUnitCountControl store={store} facesPerUnit={1} magnet={opts?.magnet} />);
  return store;
}

describe("StudioUnitCountControl", () => {
  it("muestra el label «Unidades» y el N vivo del diseño", () => {
    setup(2);
    expect(screen.getByText("Unidades")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Unidades a diseñar" }).textContent).toContain(
      "2 unidades",
    );
    expect(screen.getByText("Las fotos por tira se eligen en la página del producto"));
  });

  // El cambio se aplica en el frame siguiente al click (feedback de
  // procesamiento) → los asserts del store esperan el apply con waitFor.
  it("subir N agrega UNA unidad (unitSlots slots vacíos) preservando lo diseñado", async () => {
    const store = setup(2);
    fireEvent.click(screen.getByLabelText("Aumentar unidades"));
    await waitFor(() => expect(store.getState().canvasData!.unitCount).toBe(3));
    const cd = store.getState().canvasData!;
    expect(cd.slotCount).toBe(9); // 3 tiras × 3 fotos
    expect(cd.unitSlots).toBe(3); // la composición NO cambia
    expect(cd.photoSlots).toBe(3);
    expect(cd.slots).toHaveLength(9);
    // Fotos preservadas por índice (slots 0 y 4); la unidad nueva nace vacía.
    expect(cd.slots[0].assetId).toBe("asset-0");
    expect(cd.slots[4].assetId).toBe("asset-4");
    expect(cd.slots[6].assetId).toBeNull();
    expect(cd.slots[8].assetId).toBeNull();
    // Grid por UNIDAD (multi-unidad): 1 columna × 3 filas (la tira), no 9 filas.
    expect(cd.gridLayout).toEqual({ cols: 1, rows: 3, gap: 0 });
    expect(store.getState().isDirty).toBe(true);
  });

  it("bajar N recorta la ÚLTIMA unidad y conserva las demás", async () => {
    const store = setup(2);
    fireEvent.click(screen.getByLabelText("Disminuir unidades"));
    await waitFor(() => expect(store.getState().canvasData!.unitCount).toBe(1));
    const cd = store.getState().canvasData!;
    expect(cd.slotCount).toBe(3);
    expect(cd.slots[0].assetId).toBe("asset-0"); // la tira 1 queda intacta
  });

  it("mínimo 1: con 1 unidad el − se deshabilita", () => {
    setup(1);
    expect(screen.getByLabelText("Disminuir unidades")).toBeDisabled();
    expect(screen.getByLabelText("Aumentar unidades")).toBeEnabled();
  });

  it("tope del cap de 50 slots (tira de 4 → 12 unidades): el + se deshabilita", () => {
    const bare = makeStripCanvas(12);
    bare.unitSlots = 4;
    bare.photoSlots = 4;
    bare.slotCount = 48;
    bare.slots = Array.from({ length: 48 }, (_, i) => ({
      slotIndex: i,
      assetId: null,
      assetUrl: null,
    }));
    setup(12, { bare });
    expect(screen.getByLabelText("Aumentar unidades")).toBeDisabled();
    expect(screen.getByLabelText("Disminuir unidades")).toBeEnabled();
  });

  it("guard: con unitSlots = 1 (imán suelto) el store NO hace nada", async () => {
    const polaroid = makeStripCanvas(2);
    delete polaroid.unitCount;
    delete polaroid.unitSlots;
    const store = setup(2, { bare: polaroid });
    fireEvent.click(screen.getByLabelText("Aumentar unidades"));
    // Espera corta: el frame del apply corre aunque la acción sea no-op.
    await new Promise((r) => setTimeout(r, 100));
    expect(store.getState().canvasData!.slotCount).toBe(6);
    expect(store.getState().canvasData!.unitCount).toBeUndefined();
  });

  it("mientras reconstruye el lienzo da feedback: stepper bloqueado + aria-busy", async () => {
    const store = setup(2);
    fireEvent.click(screen.getByLabelText("Aumentar unidades"));
    expect(screen.getByLabelText("Aumentar unidades")).toBeDisabled();
    expect(screen.getByRole("group", { name: "Unidades a diseñar" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await waitFor(() => expect(store.getState().canvasData!.unitCount).toBe(3));
    expect(screen.getByLabelText("Aumentar unidades")).toBeEnabled();
  });

  it("badge «Con imán» read-only cuando la PDP lo eligió (no es control)", () => {
    setup(2, { magnet: true });
    expect(screen.getByText(/Con imán/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /imán/i })).not.toBeInTheDocument();
  });
});

// Uniformidad de la vista previa bloqueada (owner 2026-09-14 — regla D3):
// NINGÚN producto muestra vista previa con fotos requeridas vacías. El gate es
// selectIsComplete (todos los slots con asset) — acá se blinda que AGREGAR
// unidades re-bloquea el diseño aunque las unidades previas estén completas.
describe("gate uniforme de vista previa (owner 2026-09-14)", () => {
  it("diseño completo → agregar una unidad re-bloquea (slots nuevos vacíos)", async () => {
    const full = makeStripCanvas(1);
    full.slots = full.slots.map((s, i) => ({
      ...s,
      assetId: `a${i}`,
      assetUrl: `https://img/${i}.jpg`,
    }));
    const store = setup(1, { bare: full });
    expect(selectIsComplete(store.getState())).toBe(true);

    fireEvent.click(screen.getByLabelText("Aumentar unidades"));
    await waitFor(() => expect(store.getState().canvasData!.unitCount).toBe(2));
    expect(selectIsComplete(store.getState())).toBe(false);
  });
});

/*
 * Tests del cache de snapshots Konva por slot (Paquete J, 2026-10-02).
 *
 * Lo que se congela acá es la INVALIDACIÓN — el riesgo real del feature:
 * un snapshot viejo en la Vista previa/3D sería un bug de fidelidad de
 * imprenta. El stage es un fake estructural (SnapshotStageSource), sin Konva.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSlotSnapshotCache,
  SLOT_SNAPSHOT_CACHE_LIMIT,
  snapshotRasterPlan,
  snapshotSlotForPreview,
  slotSnapshotCacheSize,
  type SnapshotStageSource,
} from "./slot-snapshot-cache";
import type { CanvasDataV1, SlotState } from "../types";

function makeSlot(index: number, extra: Partial<SlotState> = {}): SlotState {
  return { slotIndex: index, assetId: `a${index}`, assetUrl: `https://x/${index}.png`, ...extra };
}

function makeTemplate(tag: string): CanvasDataV1 {
  return {
    version: 1,
    stage: { width: 100, height: 100 },
    layers: [],
    background: null,
    tag,
  } as unknown as CanvasDataV1;
}

function makeStage(w = 450, h = 575) {
  const indicator = { hide: vi.fn(), show: vi.fn() };
  const stage: SnapshotStageSource & { toDataURL: ReturnType<typeof vi.fn> } = {
    width: () => w,
    height: () => h,
    find: vi.fn(() => [indicator]),
    toDataURL: vi.fn(() => `data:image/png;base64,shot-${Math.random()}`),
  };
  return { stage, indicator };
}

describe("snapshotSlotForPreview — cache e invalidación", () => {
  beforeEach(() => clearSlotSnapshotCache());

  it("mismo slot (misma referencia) + mismo contexto → rasteriza UNA vez", () => {
    const { stage } = makeStage();
    const slot = makeSlot(0);
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    const first = snapshotSlotForPreview(stage, slot, ctx);
    const second = snapshotSlotForPreview(stage, slot, ctx);
    expect(second).toBe(first);
    expect(stage.toDataURL).toHaveBeenCalledTimes(1);
  });

  it("slot con contenido NUEVO (nueva referencia) → invalida y re-rasteriza", () => {
    const { stage } = makeStage();
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    snapshotSlotForPreview(stage, makeSlot(0), ctx);
    // El store es inmutable: cualquier cambio (foto/encuadre/filtro/texto)
    // produce un objeto slot nuevo aunque tenga los mismos campos visibles.
    snapshotSlotForPreview(stage, makeSlot(0), ctx);
    expect(stage.toDataURL).toHaveBeenCalledTimes(2);
  });

  it("cambio de borderColor (estilo de tarjeta) → invalida", () => {
    const { stage } = makeStage();
    const slot = makeSlot(0);
    const unitTemplate = makeTemplate("t1");
    snapshotSlotForPreview(stage, slot, { unitTemplate, borderColor: null });
    snapshotSlotForPreview(stage, slot, { unitTemplate, borderColor: "#FF0000" });
    expect(stage.toDataURL).toHaveBeenCalledTimes(2);
  });

  it("cambio de plantilla (unitTemplate nuevo) → invalida", () => {
    const { stage } = makeStage();
    const slot = makeSlot(0);
    snapshotSlotForPreview(stage, slot, { unitTemplate: makeTemplate("t1"), borderColor: null });
    snapshotSlotForPreview(stage, slot, { unitTemplate: makeTemplate("t2"), borderColor: null });
    expect(stage.toDataURL).toHaveBeenCalledTimes(2);
  });

  it("cambio de tamaño DISPLAY del stage (zoom de lienzo) NO invalida: la salida es fija", () => {
    // Fix STG 2026-10-05 — el snapshot se rasteriza al ancho objetivo (720px),
    // no al tamaño display: el mismo diseño al mismo tamaño de salida produce
    // el mismo PNG aunque el stage esté zoomado, así que el cache PEGA.
    const slot = makeSlot(0);
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    const a = makeStage(450, 575);
    const first = snapshotSlotForPreview(a.stage, slot, ctx);
    const b = makeStage(900, 1150); // zoom 200%
    const second = snapshotSlotForPreview(b.stage, slot, ctx);
    expect(second).toBe(first);
    expect(b.stage.toDataURL).not.toHaveBeenCalled();
  });

  it("cambio de tamaño objetivo (otro consumidor) → invalida y re-rasteriza", () => {
    const { stage } = makeStage();
    const slot = makeSlot(0);
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    snapshotSlotForPreview(stage, slot, ctx);
    snapshotSlotForPreview(stage, slot, ctx, { targetWidth: 1024 });
    expect(stage.toDataURL).toHaveBeenCalledTimes(2);
  });

  it("los indicadores de edición se ocultan SOLO al rasterizar (no en cache hit)", () => {
    const { stage, indicator } = makeStage();
    const slot = makeSlot(0);
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    snapshotSlotForPreview(stage, slot, ctx);
    expect(indicator.hide).toHaveBeenCalledTimes(1);
    expect(indicator.show).toHaveBeenCalledTimes(1);
    snapshotSlotForPreview(stage, slot, ctx);
    expect(indicator.hide).toHaveBeenCalledTimes(1);
  });

  it("los indicadores se restauran aunque toDataURL lance", () => {
    const { stage, indicator } = makeStage();
    stage.toDataURL.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() =>
      snapshotSlotForPreview(stage, makeSlot(0), { unitTemplate: makeTemplate("t1") }),
    ).toThrow("boom");
    expect(indicator.show).toHaveBeenCalledTimes(1);
  });

  it("desaloja FIFO al superar el tope (memoria acotada)", () => {
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    const count = SLOT_SNAPSHOT_CACHE_LIMIT + 2;
    const slots = Array.from({ length: count }, (_, i) => makeSlot(i));
    const stages = slots.map(() => makeStage());
    slots.forEach((slot, i) => snapshotSlotForPreview(stages[i]!.stage, slot, ctx));
    expect(slotSnapshotCacheSize()).toBe(SLOT_SNAPSHOT_CACHE_LIMIT);
    // El slot 0 (el más viejo) fue desalojado → miss → segunda rasterización.
    snapshotSlotForPreview(stages[0]!.stage, slots[0]!, ctx);
    expect(stages[0]!.stage.toDataURL).toHaveBeenCalledTimes(2);
    // El último sigue en cache → hit, NO vuelve a rasterizar.
    const last = count - 1;
    snapshotSlotForPreview(stages[last]!.stage, slots[last]!, ctx);
    expect(stages[last]!.stage.toDataURL).toHaveBeenCalledTimes(1);
  });

  it("cachear no confunde slots distintos con el mismo stage", () => {
    const { stage } = makeStage();
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    const a = snapshotSlotForPreview(stage, makeSlot(0), ctx);
    const b = snapshotSlotForPreview(stage, makeSlot(1), ctx);
    expect(a).not.toBe(b);
    expect(stage.toDataURL).toHaveBeenCalledTimes(2);
  });
});

describe("snapshotRasterPlan — tamaño de salida fijo (fix STG 2026-10-05)", () => {
  it("stage grande (zoom/desktop) se rasteriza al ancho objetivo, no al display", () => {
    // 1200px display → 720px de salida (era 1200 a pixelRatio 1).
    const plan = snapshotRasterPlan(1200, 1520);
    expect(plan.outW).toBe(720);
    expect(plan.pixelRatio).toBeCloseTo(0.6);
    expect(plan.outH).toBe(Math.round(1520 * plan.pixelRatio));
  });

  it("stage pequeño no se sobremuestrea más allá de pixelRatio 2", () => {
    const plan = snapshotRasterPlan(300, 380);
    expect(plan.pixelRatio).toBe(2);
    expect(plan.outW).toBe(600);
  });

  it("toDataURL recibe el pixelRatio del plan (no 1 fijo)", () => {
    clearSlotSnapshotCache();
    const { stage } = makeStage(1200, 1520);
    snapshotSlotForPreview(stage, makeSlot(0), {
      unitTemplate: makeTemplate("t1"),
      borderColor: null,
    });
    expect(stage.toDataURL).toHaveBeenCalledWith({
      pixelRatio: expect.closeTo(0.6) as unknown as number,
      mimeType: "image/png",
    });
  });

  it("stage degenerado (0) cae a pixelRatio 1 sin dividir por cero", () => {
    expect(snapshotRasterPlan(0, 0)).toEqual({ pixelRatio: 1, outW: 0, outH: 0 });
  });
});

// ──────────────────────────────────────────────────────────────────
//  Auto-cura de snapshots tomados a medio cargar (bug STG 2026-10-08 —
//  separador plano "en blanco" en el libro 3D, frente y respaldo)
// ──────────────────────────────────────────────────────────────────

/**
 * Fake cuyo `find` distingue selectores: `.edit-indicator` siempre devuelve el
 * indicador; `.slot-photo` solo cuando `photoLoaded` es true (espejo de la rama
 * de ImagePlaceholder: el nodo de la foto SOLO existe con la imagen decodificada;
 * mientras carga, el stage dibuja el placeholder #F4ECFF sin ese nodo).
 */
function makePhotoStage(photoLoaded: { value: boolean }) {
  const indicator = { hide: vi.fn(), show: vi.fn() };
  const photoNode = { hide: vi.fn(), show: vi.fn() };
  const stage: SnapshotStageSource & { toDataURL: ReturnType<typeof vi.fn> } = {
    width: () => 450,
    height: () => 575,
    find: vi.fn((selector: string) => {
      if (selector === ".slot-photo") return photoLoaded.value ? [photoNode] : [];
      return [indicator];
    }),
    toDataURL: vi.fn(() => `data:image/png;base64,shot-${Math.random()}`),
  };
  return { stage };
}

describe("photoPending — snapshot a medio cargar (placeholder #F4ECFF)", () => {
  beforeEach(() => clearSlotSnapshotCache());

  it("se re-rasteriza cuando la foto aparece, AUNQUE la referencia del slot no cambie", () => {
    // La carga de useImage NO toca el store: sin la re-validación photoPending,
    // la clave (misma referencia de slot) serviría el placeholder para siempre.
    const loaded = { value: false };
    const { stage } = makePhotoStage(loaded);
    const slot = makeSlot(0);
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    snapshotSlotForPreview(stage, slot, ctx); // placeholder horneado (cargando)
    expect(stage.toDataURL).toHaveBeenCalledTimes(1);
    loaded.value = true; // useImage resolvió y el slot renderizó la foto
    const second = snapshotSlotForPreview(stage, slot, ctx);
    expect(stage.toDataURL).toHaveBeenCalledTimes(2); // auto-cura: re-rasteriza
    expect(second).not.toBe(""); // dataURL nuevo (con la foto)
    // Tercera llamada: la entrada ya es buena → hit normal, sin re-rasterizar.
    snapshotSlotForPreview(stage, slot, ctx);
    expect(stage.toDataURL).toHaveBeenCalledTimes(2);
  });

  it("mientras la foto SIGUE cargando, el hit provisional se sirve (re-rasterizar daría el mismo placeholder)", () => {
    const loaded = { value: false };
    const { stage } = makePhotoStage(loaded);
    const slot = makeSlot(0);
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    const first = snapshotSlotForPreview(stage, slot, ctx);
    const second = snapshotSlotForPreview(stage, slot, ctx);
    expect(second).toBe(first);
    expect(stage.toDataURL).toHaveBeenCalledTimes(1);
  });

  it("slot SIN assetUrl nunca queda provisional (placeholder de slot vacío es contenido válido)", () => {
    const loaded = { value: false }; // sin foto que esperar
    const { stage } = makePhotoStage(loaded);
    const slot = makeSlot(0, { assetUrl: undefined });
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    snapshotSlotForPreview(stage, slot, ctx);
    snapshotSlotForPreview(stage, slot, ctx);
    expect(stage.toDataURL).toHaveBeenCalledTimes(1);
  });
});

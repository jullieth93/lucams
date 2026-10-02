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
  snapshotSlotForPreview,
  slotSnapshotCacheSize,
  type SnapshotStageSource,
} from "./slot-snapshot-cache";
import type { CanvasDataV1, SlotState } from "../types";

function makeSlot(index: number, extra: Partial<SlotState> = {}): SlotState {
  return { slotIndex: index, assetId: `a${index}`, assetUrl: `https://x/${index}.png`, ...extra };
}

function makeTemplate(tag: string): CanvasDataV1 {
  return { version: 1, stage: { width: 100, height: 100 }, layers: [], background: null, tag } as unknown as CanvasDataV1;
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

  it("cambio de tamaño del stage (zoom de lienzo / resize) → invalida", () => {
    const slot = makeSlot(0);
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    const a = makeStage(450, 575);
    snapshotSlotForPreview(a.stage, slot, ctx);
    const b = makeStage(900, 1150); // zoom 200%
    snapshotSlotForPreview(b.stage, slot, ctx);
    expect(b.stage.toDataURL).toHaveBeenCalledTimes(1);
    // Volver al tamaño original también es un cambio → re-rasteriza.
    snapshotSlotForPreview(a.stage, slot, ctx);
    expect(a.stage.toDataURL).toHaveBeenCalledTimes(2);
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

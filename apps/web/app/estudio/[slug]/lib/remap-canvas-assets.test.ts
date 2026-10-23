/*
 * Tests de remapCanvasAssetUrls (boot del recover, 2026-10-12 — bug "lila
 * translúcido" al editar desde el carrito / Mis diseños: las signed URLs
 * persistidas en slot.assetUrl caducan a 1 h y el render las usa tal cual).
 *
 * Contrato:
 *  - Las URLs de los slots se reescriben por assetId con las frescas del
 *    servidor (foto principal Y foto de perfil IG).
 *  - Un asset que ya no existe en el servidor deja su slot VACÍO (estado
 *    "vuelve a subirla") y se reporta en missingAssetIds (el boot avisa).
 *  - Sin cambios necesarios → MISMA referencia de canvasData (no invalidar
 *    caches por referencia aguas abajo).
 */

import { describe, expect, it } from "vitest";
import { remapCanvasAssetUrls } from "./remap-canvas-assets";
import type { CanvasDataV2, SlotState, StudioAsset } from "../types";

function makeCanvas(slots: SlotState[]): CanvasDataV2 {
  return {
    version: 2,
    unitTemplate: { version: 1, stage: { width: 450, height: 600 }, layers: [] },
    slotCount: slots.length,
    slots,
    gridLayout: { cols: 2, rows: 2, gap: 16 },
  } as unknown as CanvasDataV2;
}

const fresh = (id: string): StudioAsset => ({
  id,
  signedUrl: `https://fresh.example/${id}.jpg?token=nuevo`,
  width: 100,
  height: 100,
});

describe("remapCanvasAssetUrls", () => {
  it("reescribe slot.assetUrl con la URL fresca del mismo assetId (la persistida caducó)", () => {
    const canvas = makeCanvas([
      { slotIndex: 0, assetId: "a1", assetUrl: "https://old.example/a1.jpg?token=vencido" },
      { slotIndex: 1, assetId: null, assetUrl: null },
    ]);
    const { canvasData, missingAssetIds } = remapCanvasAssetUrls(canvas, [fresh("a1")]);
    expect(canvasData.slots[0]!.assetUrl).toBe("https://fresh.example/a1.jpg?token=nuevo");
    expect(canvasData.slots[0]!.assetId).toBe("a1");
    expect(canvasData.slots[1]!.assetUrl).toBeNull();
    expect(missingAssetIds).toEqual([]);
  });

  it("también re-mapea la foto de PERFIL IG por su assetId", () => {
    const canvas = makeCanvas([
      {
        slotIndex: 0,
        assetId: "a1",
        assetUrl: "https://old.example/a1.jpg",
        profileAssetId: "p1",
        profileAssetUrl: "https://old.example/p1.jpg",
      } as SlotState,
    ]);
    const { canvasData } = remapCanvasAssetUrls(canvas, [fresh("a1"), fresh("p1")]);
    expect(canvasData.slots[0]!.profileAssetUrl).toBe("https://fresh.example/p1.jpg?token=nuevo");
  });

  it("asset que YA NO EXISTE en el servidor → slot vacío + reportado en missingAssetIds", () => {
    const canvas = makeCanvas([
      { slotIndex: 0, assetId: "borrado", assetUrl: "https://old.example/borrado.jpg" },
      { slotIndex: 1, assetId: "a1", assetUrl: "https://old.example/a1.jpg" },
    ]);
    const { canvasData, missingAssetIds } = remapCanvasAssetUrls(canvas, [fresh("a1")]);
    expect(canvasData.slots[0]!.assetId).toBeNull();
    expect(canvasData.slots[0]!.assetUrl).toBeNull();
    expect(missingAssetIds).toEqual(["borrado"]);
    // El que sí existe se re-mapea con normalidad.
    expect(canvasData.slots[1]!.assetUrl).toBe("https://fresh.example/a1.jpg?token=nuevo");
  });

  it("foto de perfil cuyo asset ya no existe → se limpia con su encuadre (vuelve al avatar placeholder)", () => {
    const canvas = makeCanvas([
      {
        slotIndex: 0,
        assetId: "a1",
        assetUrl: "https://old.example/a1.jpg",
        profileAssetId: "p-borrado",
        profileAssetUrl: "https://old.example/p.jpg",
        profileTransform: { offsetX: 3, offsetY: -2, scale: 1.2 },
      } as SlotState,
    ]);
    const { canvasData, missingAssetIds } = remapCanvasAssetUrls(canvas, [fresh("a1")]);
    const slot = canvasData.slots[0]!;
    expect(slot.assetId).toBe("a1"); // la foto principal sobrevive
    expect(slot.profileAssetId).toBeNull();
    expect(slot.profileAssetUrl).toBeUndefined();
    expect(slot.profileTransform).toBeUndefined();
    expect(missingAssetIds).toEqual(["p-borrado"]);
  });

  it("sin cambios necesarios → MISMA referencia de canvasData", () => {
    const canvas = makeCanvas([
      { slotIndex: 0, assetId: "a1", assetUrl: "https://fresh.example/a1.jpg?token=nuevo" },
      { slotIndex: 1, assetId: null, assetUrl: null },
    ]);
    const { canvasData, missingAssetIds } = remapCanvasAssetUrls(canvas, [fresh("a1")]);
    expect(canvasData).toBe(canvas);
    expect(missingAssetIds).toEqual([]);
  });

  it("ADR-166 — re-mapea canvasUrl con el derivado fresco del mismo assetId", () => {
    const canvas = makeCanvas([
      {
        slotIndex: 0,
        assetId: "a1",
        assetUrl: "https://old.example/a1.jpg",
        canvasUrl: "https://old.example/a1.canvas.webp",
      } as SlotState,
    ]);
    const asset: StudioAsset = { ...fresh("a1"), canvasUrl: "https://fresh.example/a1.canvas.webp" };
    const { canvasData } = remapCanvasAssetUrls(canvas, [asset]);
    expect(canvasData.slots[0]!.assetUrl).toBe("https://fresh.example/a1.jpg?token=nuevo");
    expect(canvasData.slots[0]!.canvasUrl).toBe("https://fresh.example/a1.canvas.webp");
  });

  it("ADR-166 — asset que PERDIÓ su derivado → canvasUrl null (el lienzo cae al master)", () => {
    const canvas = makeCanvas([
      {
        slotIndex: 0,
        assetId: "a1",
        assetUrl: "https://fresh.example/a1.jpg?token=nuevo",
        canvasUrl: "https://old.example/a1.canvas.webp",
      } as SlotState,
    ]);
    // fresh("a1") no trae canvasUrl (derivado inexistente/purgado).
    const { canvasData } = remapCanvasAssetUrls(canvas, [fresh("a1")]);
    expect(canvasData.slots[0]!.assetUrl).toBe("https://fresh.example/a1.jpg?token=nuevo");
    expect(canvasData.slots[0]!.canvasUrl).toBeNull();
  });

  it("ADR-166 — re-mapea profileCanvasUrl y la limpia cuando el asset perfil desaparece", () => {
    const canvas = makeCanvas([
      {
        slotIndex: 0,
        assetId: null,
        assetUrl: null,
        profileAssetId: "p1",
        profileAssetUrl: "https://old.example/p1.jpg",
        profileCanvasUrl: "https://old.example/p1.canvas.webp",
      } as SlotState,
    ]);
    const profileAsset: StudioAsset = {
      ...fresh("p1"),
      canvasUrl: "https://fresh.example/p1.canvas.webp",
    };
    const { canvasData } = remapCanvasAssetUrls(canvas, [profileAsset]);
    expect(canvasData.slots[0]!.profileCanvasUrl).toBe("https://fresh.example/p1.canvas.webp");

    const gone = remapCanvasAssetUrls(canvasData, []);
    expect(gone.canvasData.slots[0]!.profileCanvasUrl).toBeUndefined();
    expect(gone.missingAssetIds).toEqual(["p1"]);
  });
});

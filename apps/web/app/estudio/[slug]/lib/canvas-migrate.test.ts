/*
 * canvas-migrate — migración V1→V2 del canvas del Estudio (audit v3 · #5).
 *
 * El Estudio es el diferenciador #1 y no tenía NINGÚN test unitario. El de mayor valor es este:
 * cubre el escenario "corromper diseños al reabrirlos". Funciones puras → sin mocks.
 */

import { describe, expect, it } from "vitest";
import { migrateCanvasV1ToV2, ensureCanvasV2 } from "./canvas-migrate";
import type { CanvasDataV1, MultiSlotCanvasData } from "../types";

function v1WithAsset(): CanvasDataV1 {
  return {
    version: 1,
    stage: { width: 1080, height: 1080 },
    layers: [
      { id: "bg", type: "background", color: "#FFF8F0" },
      {
        id: "p1",
        type: "image-placeholder",
        x: 540,
        y: 540,
        width: 1000,
        height: 1000,
        assetId: "a1",
        assetUrl: "https://cdn.example/a1.png",
      },
    ],
  } as CanvasDataV1;
}

describe("migrateCanvasV1ToV2", () => {
  it("V1 con foto → V2: el asset viaja a slots[0], los demás slots quedan vacíos", () => {
    const v2 = migrateCanvasV1ToV2(v1WithAsset(), 6);
    expect(v2.version).toBe(2);
    expect(v2.slotCount).toBe(6);
    expect(v2.slots).toHaveLength(6);
    expect(v2.slots[0]).toMatchObject({
      slotIndex: 0,
      assetId: "a1",
      assetUrl: "https://cdn.example/a1.png",
    });
    // slots 1..5 vacíos.
    for (let i = 1; i < 6; i++) {
      expect(v2.slots[i]).toMatchObject({ slotIndex: i, assetId: null, assetUrl: null });
    }
  });

  it("limpia assetId/assetUrl del image-placeholder en unitTemplate (en V2 viven en slots)", () => {
    const v2 = migrateCanvasV1ToV2(v1WithAsset(), 1);
    const img = v2.unitTemplate.layers.find((l) => l.type === "image-placeholder") as Record<
      string,
      unknown
    >;
    expect(img).toBeDefined();
    expect(img.assetId).toBeUndefined();
    expect(img.assetUrl).toBeUndefined();
    // Geometría preservada.
    expect(img.width).toBe(1000);
  });

  it("es idempotente: un V2 se devuelve tal cual (no re-migra ni corrompe)", () => {
    const v2 = migrateCanvasV1ToV2(v1WithAsset(), 4);
    const again = migrateCanvasV1ToV2(v2 as unknown as CanvasDataV1, 99);
    expect(again).toBe(v2); // misma referencia (short-circuit isCanvasV2)
    expect((again as MultiSlotCanvasData).slotCount).toBe(4); // NO cambia a 99
  });

  it("slotCount se acota a mínimo 1 (0 o negativo → 1)", () => {
    expect(migrateCanvasV1ToV2(v1WithAsset(), 0).slotCount).toBe(1);
    expect(migrateCanvasV1ToV2(v1WithAsset(), -3).slotCount).toBe(1);
  });

  it("V1 SIN foto → slots[0] vacío", () => {
    const v1: CanvasDataV1 = {
      version: 1,
      stage: { width: 1080, height: 1080 },
      layers: [{ id: "bg", type: "background", color: "#FFF" }],
    } as CanvasDataV1;
    const v2 = migrateCanvasV1ToV2(v1, 2);
    expect(v2.slots[0]).toMatchObject({ slotIndex: 0, assetId: null, assetUrl: null });
  });

  it("ensureCanvasV2: migra un V1 y respeta el slotCount de un V2 existente", () => {
    // V1 → migra con el slotCount del parámetro.
    expect(ensureCanvasV2(v1WithAsset(), 3).slotCount).toBe(3);
    // V2 → conserva su propio slotCount (no rehace slots).
    const v2 = migrateCanvasV1ToV2(v1WithAsset(), 6);
    expect(ensureCanvasV2(v2, 2).slotCount).toBe(6);
  });
});

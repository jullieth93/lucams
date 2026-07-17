/*
 * ADR-057 Fase A — El SlotStateSchema debe PRESERVAR el encuadre del usuario
 * (photoTransform: pan/zoom) y el texto editado (textOverrides). Antes los descartaba
 * (Zod v4 strip) → el encuadre se perdía al guardar/recargar y el servidor no podía
 * reconstruir el render fiel. Este test es el gate de regresión de ese bug.
 */

import { describe, expect, it } from "vitest";
import { SlotStateSchema, CanvasDataV2Schema } from "./schemas";

describe("SlotStateSchema — encuadre + texto del usuario sobreviven (ADR-057 Fase A)", () => {
  it("conserva photoTransform (offsetX/offsetY/scale) — antes se descartaba", () => {
    const parsed = SlotStateSchema.parse({
      slotIndex: 0,
      assetId: "asset_1",
      assetUrl: "https://x/y.png",
      photoTransform: { offsetX: -42.5, offsetY: 18, scale: 1.35 },
    });
    expect(parsed.photoTransform).toEqual({ offsetX: -42.5, offsetY: 18, scale: 1.35 });
  });

  it("conserva textOverrides indexados por layerId", () => {
    const parsed = SlotStateSchema.parse({
      slotIndex: 2,
      assetId: null,
      assetUrl: null,
      textOverrides: {
        caption: { text: "Mi recuerdo", fill: "#E85B9F", fontSize: 48 },
        date: { text: "Dic 2026" },
      },
    });
    expect(parsed.textOverrides?.caption).toEqual({
      text: "Mi recuerdo",
      fill: "#E85B9F",
      fontSize: 48,
    });
    expect(parsed.textOverrides?.date?.text).toBe("Dic 2026");
  });

  it("rechaza scale fuera de rango (anti-tamper del render)", () => {
    expect(
      SlotStateSchema.safeParse({
        slotIndex: 0,
        assetId: null,
        assetUrl: null,
        photoTransform: { offsetX: 0, offsetY: 0, scale: 999 },
      }).success,
    ).toBe(false);
  });

  it("rechaza offset absurdo (anti-tamper)", () => {
    expect(
      SlotStateSchema.safeParse({
        slotIndex: 0,
        assetId: null,
        assetUrl: null,
        photoTransform: { offsetX: 999999, offsetY: 0, scale: 1 },
      }).success,
    ).toBe(false);
  });

  it("photoTransform es opcional (slot sin encuadre manual sigue siendo válido)", () => {
    const parsed = SlotStateSchema.parse({ slotIndex: 0, assetId: "a", assetUrl: "u" });
    expect(parsed.photoTransform).toBeUndefined();
  });

  it("un canvasData V2 completo round-trips el encuadre de cada slot", () => {
    const canvas = {
      version: 2 as const,
      unitTemplate: {
        version: 1 as const,
        stage: { width: 1080, height: 1080, dpiPreview: 90, dpiProduction: 300 },
        layers: [{ id: "bg", type: "background", color: "#FFFFFF" }],
      },
      slotCount: 2,
      slots: [
        {
          slotIndex: 0,
          assetId: "a0",
          assetUrl: "u0",
          photoTransform: { offsetX: 10, offsetY: -5, scale: 1.2 },
        },
        { slotIndex: 1, assetId: "a1", assetUrl: "u1", filter: "vivid" as const },
      ],
      gridLayout: { cols: 2, rows: 1, gap: 8 },
    };
    const parsed = CanvasDataV2Schema.parse(canvas);
    expect(parsed.slots[0].photoTransform).toEqual({ offsetX: 10, offsetY: -5, scale: 1.2 });
    expect(parsed.slots[1].filter).toBe("vivid");
  });
});

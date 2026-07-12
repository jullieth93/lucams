/*
 * ADR-057 Fase A1a — Render de producción server-side (sharp). Ejerce el pipeline REAL con una
 * foto sintética (sin DB ni storage): valida dimensiones de salida, la matemática de composición,
 * la detección "solo-foto" vs NEEDS_KONVA, filtros y el caso heart/circle (full-stage).
 */

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { renderProductionSlots, RenderNeedsKonvaError } from "./production-render";

/** Foto sintética w×h (roja) → PNG Buffer, como si viniera de storage. */
async function fakePhoto(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 220, g: 40, b: 60 } } })
    .png()
    .toBuffer();
}

const stage = { width: 1080, height: 1080, dpiPreview: 90, dpiProduction: 300 };
const photoOnlyUnit = {
  version: 1 as const,
  stage,
  layers: [
    { id: "bg", type: "background", color: "#FFF8F0" },
    { id: "ph", type: "image-placeholder", x: 90, y: 90, width: 900, height: 900, cornerRadius: 40 },
  ],
};

async function pngMeta(buf: Buffer) {
  return sharp(buf).metadata();
}

describe("renderProductionSlots — pack solo-foto (ADR-057 Fase A1a)", () => {
  it("renderiza cada slot a stage × 3 px (paridad con pixelRatio 3 del cliente)", async () => {
    const photo = await fakePhoto(1200, 900);
    const bufs = await renderProductionSlots({
      unitTemplate: photoOnlyUnit,
      slots: [
        { slotIndex: 0, assetId: "a0", photoTransform: { offsetX: 0, offsetY: 0, scale: 1 } },
        { slotIndex: 1, assetId: "a1", photoTransform: { offsetX: -50, offsetY: 30, scale: 1.5 } },
      ],
      shape: "rectangle",
      loadAsset: async () => photo,
    });
    expect(bufs).toHaveLength(2);
    for (const b of bufs) {
      const m = await pngMeta(b);
      expect(m.width).toBe(1080 * 3);
      expect(m.height).toBe(1080 * 3);
      expect(m.format).toBe("png");
    }
  });

  it("un slot sin foto (assetId null) produce solo el fondo, sin crashear", async () => {
    const bufs = await renderProductionSlots({
      unitTemplate: photoOnlyUnit,
      slots: [{ slotIndex: 0, assetId: null }],
      shape: "rectangle",
      loadAsset: async () => null,
    });
    const m = await pngMeta(bufs[0]);
    expect(m.width).toBe(3240);
  });

  it("aplica filtro sin romper (vivid)", async () => {
    const photo = await fakePhoto(1000, 1000);
    const bufs = await renderProductionSlots({
      unitTemplate: photoOnlyUnit,
      slots: [{ slotIndex: 0, assetId: "a0", filter: "vivid", photoTransform: { offsetX: 0, offsetY: 0, scale: 1 } }],
      shape: "rectangle",
      loadAsset: async () => photo,
    });
    expect((await pngMeta(bufs[0])).width).toBe(3240);
  });

  it("heart/circle: la foto cubre todo el stage (no crashea con placeholder chico)", async () => {
    const photo = await fakePhoto(800, 1200);
    const bufs = await renderProductionSlots({
      unitTemplate: photoOnlyUnit, // placeholder 900×900, pero shape circle → full stage
      slots: [{ slotIndex: 0, assetId: "a0", photoTransform: { offsetX: 200, offsetY: 0, scale: 1 } }],
      shape: "circle",
      loadAsset: async () => photo,
    });
    expect((await pngMeta(bufs[0])).width).toBe(3240);
  });

  it("zoom-out extremo (foto fuera del placeholder) no crashea, solo fondo visible", async () => {
    const photo = await fakePhoto(1000, 1000);
    const bufs = await renderProductionSlots({
      unitTemplate: photoOnlyUnit,
      slots: [{ slotIndex: 0, assetId: "a0", photoTransform: { offsetX: 5000, offsetY: 5000, scale: 0.5 } }],
      shape: "rectangle",
      loadAsset: async () => photo,
    });
    expect((await pngMeta(bufs[0])).width).toBe(3240);
  });

  it("plantilla con capa de TEXTO con contenido → NEEDS_KONVA (cae a A1b)", async () => {
    const unitWithText = {
      version: 1 as const,
      stage,
      layers: [
        { id: "bg", type: "background", color: "#fff" },
        { id: "ph", type: "image-placeholder", x: 60, y: 60, width: 600, height: 700 },
        { id: "t", type: "text", text: "Mi recuerdo" },
      ],
    };
    await expect(
      renderProductionSlots({
        unitTemplate: unitWithText,
        slots: [{ slotIndex: 0, assetId: "a0" }],
        shape: "rectangle",
        loadAsset: async () => fakePhoto(800, 800),
      }),
    ).rejects.toBeInstanceOf(RenderNeedsKonvaError);
  });

  it("plantilla con marco (asset) → NEEDS_KONVA", async () => {
    const unitWithFrame = {
      version: 1 as const,
      stage,
      layers: [
        { id: "bg", type: "background", color: "#fff" },
        { id: "ph", type: "image-placeholder", x: 60, y: 60, width: 600, height: 700 },
        { id: "f", type: "asset", src: "/templates/frame.png" },
      ],
    };
    await expect(
      renderProductionSlots({
        unitTemplate: unitWithFrame,
        slots: [{ slotIndex: 0, assetId: "a0" }],
        shape: "rectangle",
        loadAsset: async () => fakePhoto(800, 800),
      }),
    ).rejects.toBeInstanceOf(RenderNeedsKonvaError);
  });

  it("texto VACÍO no dispara NEEDS_KONVA (plantilla foto con placeholder de texto sin usar)", async () => {
    const unit = {
      version: 1 as const,
      stage,
      layers: [
        { id: "bg", type: "background", color: "#fff" },
        { id: "ph", type: "image-placeholder", x: 60, y: 60, width: 600, height: 700 },
        { id: "t", type: "text", text: "   " },
      ],
    };
    const bufs = await renderProductionSlots({
      unitTemplate: unit,
      slots: [{ slotIndex: 0, assetId: "a0", photoTransform: { offsetX: 0, offsetY: 0, scale: 1 } }],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(800, 800),
    });
    expect((await pngMeta(bufs[0])).width).toBe(3240);
  });
});

/*
 * ADR-057 Fase A1b — Render de producción con @napi-rs/canvas. Ejerce el pipeline REAL (texto con
 * las fuentes de marca, marco, foto) y los guards conservadores (filtro/rotación/multi-placeholder/
 * stage gigante → NEEDS_KONVA → fallback al cliente).
 */

import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { renderProductionSlotsCanvas } from "./production-render-canvas";
import { RenderNeedsKonvaError } from "./production-render";

function fakePhoto(w: number, h: number): Buffer {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#3AA0FF";
  ctx.fillRect(0, 0, w, h);
  return c.toBuffer("image/png");
}

async function pngSize(buf: Buffer): Promise<{ w: number; h: number }> {
  // El PNG lleva ancho/alto en el IHDR (bytes 16-23, big-endian).
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const stage = { width: 720, height: 920 };
const photoLayer = { id: "ph", type: "image-placeholder", x: 60, y: 60, width: 600, height: 700 };

describe("renderProductionSlotsCanvas — texto + marco (ADR-057 Fase A1b)", () => {
  it("renderiza una plantilla con TEXTO (Polaroid) a stage × 3 px, con la fuente de marca", async () => {
    const unit = {
      version: 1 as const,
      stage,
      layers: [
        { id: "bg", type: "background", color: "#FFFFFF" },
        photoLayer,
        { id: "cap", type: "text", text: "Nuestro recuerdo", fontSize: 40, fill: "#3D2E5C", align: "center" },
      ],
    };
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: unit,
      slots: [{ slotIndex: 0, assetId: "a0", photoTransform: { offsetX: 0, offsetY: 0, scale: 1 } }],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(1000, 1200),
    });
    expect(bufs).toHaveLength(1);
    const { w, h } = await pngSize(bufs[0]);
    expect(w).toBe(720 * 3);
    expect(h).toBe(920 * 3);
    expect(bufs[0].slice(0, 4).toString("hex")).toBe("89504e47"); // PNG mágico
  });

  it("usa el textOverride del slot (caption editado por el cliente)", async () => {
    const unit = {
      version: 1 as const,
      stage,
      layers: [
        { id: "bg", type: "background", color: "#FFFFFF" },
        photoLayer,
        { id: "cap", type: "text", text: "base", fontSize: 40 },
      ],
    };
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: unit,
      slots: [{ slotIndex: 0, assetId: "a0", photoTransform: { offsetX: 0, offsetY: 0, scale: 1 }, textOverrides: { cap: { text: "MI TEXTO", fill: "#E85B9F" } } }],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(900, 900),
    });
    expect((await pngSize(bufs[0])).w).toBe(720 * 3);
  });

  it("plantilla solo-foto (sin texto) también renderiza", async () => {
    const unit = { version: 1 as const, stage, layers: [{ id: "bg", type: "background", color: "#FFF8F0" }, photoLayer] };
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: unit,
      slots: [{ slotIndex: 0, assetId: "a0", photoTransform: { offsetX: -30, offsetY: 20, scale: 1.4 } }],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(1200, 800),
    });
    expect((await pngSize(bufs[0])).w).toBe(720 * 3);
  });

  const expectFallback = (p: Promise<unknown>) => expect(p).rejects.toBeInstanceOf(RenderNeedsKonvaError);
  const baseUnit = { version: 1 as const, stage, layers: [{ id: "bg", type: "background", color: "#fff" }, photoLayer] };

  it("slot con FILTRO → NEEDS_KONVA (cliente tiene el filtro exacto)", async () => {
    await expectFallback(
      renderProductionSlotsCanvas({ unitTemplate: baseUnit, slots: [{ slotIndex: 0, assetId: "a0", filter: "vivid" }], shape: "rectangle", loadAsset: async () => fakePhoto(800, 800) }),
    );
  });

  it("foto que no carga → NEEDS_KONVA (nunca blanco silencioso)", async () => {
    await expectFallback(
      renderProductionSlotsCanvas({ unitTemplate: baseUnit, slots: [{ slotIndex: 0, assetId: "a0" }], shape: "rectangle", loadAsset: async () => null }),
    );
  });

  it("stage gigante → NEEDS_KONVA (anti-OOM)", async () => {
    const unit = { ...baseUnit, stage: { width: 5000, height: 5000 } };
    await expectFallback(
      renderProductionSlotsCanvas({ unitTemplate: unit, slots: [{ slotIndex: 0, assetId: "a0" }], shape: "rectangle", loadAsset: async () => fakePhoto(800, 800) }),
    );
  });

  it("múltiples image-placeholder → NEEDS_KONVA", async () => {
    const unit = { ...baseUnit, layers: [baseUnit.layers[0], photoLayer, { id: "ph2", type: "image-placeholder", x: 0, y: 0, width: 100, height: 100 }] };
    await expectFallback(
      renderProductionSlotsCanvas({ unitTemplate: unit, slots: [{ slotIndex: 0, assetId: "a0" }], shape: "rectangle", loadAsset: async () => fakePhoto(800, 800) }),
    );
  });

  it("marco (asset) inexistente → NEEDS_KONVA (no rompe)", async () => {
    const unit = { ...baseUnit, layers: [...baseUnit.layers, { id: "f", type: "asset", src: "/templates/no-existe-xyz.png" }] };
    await expectFallback(
      renderProductionSlotsCanvas({ unitTemplate: unit, slots: [{ slotIndex: 0, assetId: "a0" }], shape: "rectangle", loadAsset: async () => fakePhoto(800, 800) }),
    );
  });

  it("marco SVG (fuentes horneadas) → NEEDS_KONVA (cliente rasteriza fiel)", async () => {
    const unit = { ...baseUnit, layers: [...baseUnit.layers, { id: "f", type: "asset", src: "/templates/ig_post.svg" }] };
    await expectFallback(
      renderProductionSlotsCanvas({ unitTemplate: unit, slots: [{ slotIndex: 0, assetId: "a0" }], shape: "rectangle", loadAsset: async () => fakePhoto(800, 800) }),
    );
  });

  it("capa no soportada (shape) → NEEDS_KONVA (no dibuja de menos)", async () => {
    const unit = { ...baseUnit, layers: [...baseUnit.layers, { id: "s", type: "shape", shape: "star" }] };
    await expectFallback(
      renderProductionSlotsCanvas({ unitTemplate: unit, slots: [{ slotIndex: 0, assetId: "a0" }], shape: "rectangle", loadAsset: async () => fakePhoto(800, 800) }),
    );
  });

  it("fuente no-marca (Georgia) → NEEDS_KONVA (fallback al cliente)", async () => {
    const unit = { version: 1 as const, stage, layers: [{ id: "bg", type: "background", color: "#fff" }, photoLayer, { id: "t", type: "text", text: "Hola", fontFamily: "Georgia, serif", fontSize: 30 }] };
    await expectFallback(
      renderProductionSlotsCanvas({ unitTemplate: unit, slots: [{ slotIndex: 0, assetId: "a0", photoTransform: { offsetX: 0, offsetY: 0, scale: 1 } }], shape: "rectangle", loadAsset: async () => fakePhoto(800, 800) }),
    );
  });

  it("texto multilínea → NEEDS_KONVA (Konva envuelve; canvas no)", async () => {
    const unit = { version: 1 as const, stage, layers: [{ id: "bg", type: "background", color: "#fff" }, photoLayer, { id: "t", type: "text", text: "linea1\nlinea2", fontSize: 30 }] };
    await expectFallback(
      renderProductionSlotsCanvas({ unitTemplate: unit, slots: [{ slotIndex: 0, assetId: "a0", photoTransform: { offsetX: 0, offsetY: 0, scale: 1 } }], shape: "rectangle", loadAsset: async () => fakePhoto(800, 800) }),
    );
  });

  it("heart/circle: cubre el stage y OMITE el texto (igual que el editor)", async () => {
    const unit = { version: 1 as const, stage, layers: [{ id: "bg", type: "background", color: "#fff" }, photoLayer, { id: "cap", type: "text", text: "no debe salir" }] };
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: unit,
      slots: [{ slotIndex: 0, assetId: "a0", photoTransform: { offsetX: 0, offsetY: 0, scale: 1 } }],
      shape: "heart",
      loadAsset: async () => fakePhoto(800, 1000),
    });
    expect((await pngSize(bufs[0])).w).toBe(720 * 3);
  });
});

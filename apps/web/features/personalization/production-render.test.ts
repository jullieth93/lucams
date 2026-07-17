/*
 * ADR-057 Fase A1a — Render de producción server-side (sharp). Ejerce el pipeline REAL con una
 * foto sintética (sin DB ni storage): dimensiones, matemática de composición, y — tras la
 * revisión adversarial — el comportamiento CONSERVADOR: solo renderiza los casos 100% fieles;
 * filtro / rotación / cornerRadius / múltiples placeholders / stage gigante / foto que no carga
 * → NEEDS_KONVA (fallback al PNG del cliente). Nunca produce un PNG en blanco silencioso.
 */

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { renderProductionSlots, RenderNeedsKonvaError } from "./production-render";

async function fakePhoto(w: number, h: number): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r: 220, g: 40, b: 60 } },
  })
    .png()
    .toBuffer();
}

const stage = { width: 1080, height: 1080, dpiPreview: 90, dpiProduction: 300 };
// Plantilla solo-foto FIEL: rect plano, sin cornerRadius/rotación.
const photoOnlyUnit = {
  version: 1 as const,
  stage,
  layers: [
    { id: "bg", type: "background", color: "#FFF8F0" },
    { id: "ph", type: "image-placeholder", x: 90, y: 90, width: 900, height: 900 },
  ],
};

const pngMeta = (buf: Buffer) => sharp(buf).metadata();

describe("renderProductionSlots — pack solo-foto FIEL (ADR-057 Fase A1a)", () => {
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

  it("heart/circle: delega al renderer canvas (NEEDS_KONVA) para recortar a la silueta (FOTO1)", async () => {
    // ADR-063 FOTO1 — sharp no puede clipear un path arbitrario; heart/circle exigen recorte a la
    // silueta (transparente afuera → troquel). El renderer sharp lanza NEEDS_KONVA → el service lo
    // enruta al tier canvas (renderProductionSlotsCanvas), que sí clipa a la forma.
    const photo = await fakePhoto(800, 1200);
    for (const shape of ["circle", "heart"] as const) {
      await expect(
        renderProductionSlots({
          unitTemplate: photoOnlyUnit,
          slots: [
            { slotIndex: 0, assetId: "a0", photoTransform: { offsetX: 0, offsetY: 0, scale: 1 } },
          ],
          shape,
          loadAsset: async () => photo,
        }),
      ).rejects.toBeInstanceOf(RenderNeedsKonvaError);
    }
  });

  it("zoom-out/drag extremo (foto fuera del placeholder): solo fondo (WYSIWYG), sin crashear", async () => {
    const photo = await fakePhoto(1000, 1000);
    const bufs = await renderProductionSlots({
      unitTemplate: photoOnlyUnit,
      slots: [
        {
          slotIndex: 0,
          assetId: "a0",
          photoTransform: { offsetX: 5000, offsetY: 5000, scale: 0.5 },
        },
      ],
      shape: "rectangle",
      loadAsset: async () => photo,
    });
    expect((await pngMeta(bufs[0])).width).toBe(3240);
  });
});

describe("renderProductionSlots — guards CONSERVADORES → NEEDS_KONVA (fallback al cliente)", () => {
  const expectNeedsKonva = (p: Promise<unknown>) =>
    expect(p).rejects.toBeInstanceOf(RenderNeedsKonvaError);

  it("CRÍTICO: foto que no carga (loadAsset null) → THROW, nunca un PNG en blanco", async () => {
    await expectNeedsKonva(
      renderProductionSlots({
        unitTemplate: photoOnlyUnit,
        slots: [{ slotIndex: 0, assetId: "a0" }],
        shape: "rectangle",
        loadAsset: async () => null, // simula download fallido / asset borrado
      }),
    );
  });

  it("slot sin assetId → THROW (un pack de foto siempre trae foto)", async () => {
    await expectNeedsKonva(
      renderProductionSlots({
        unitTemplate: photoOnlyUnit,
        slots: [{ slotIndex: 0, assetId: null }],
        shape: "rectangle",
        loadAsset: async () => null,
      }),
    );
  });

  it("slot con FILTRO → THROW (el cliente tiene el filtro exacto de Konva)", async () => {
    await expectNeedsKonva(
      renderProductionSlots({
        unitTemplate: photoOnlyUnit,
        slots: [{ slotIndex: 0, assetId: "a0", filter: "vivid" }],
        shape: "rectangle",
        loadAsset: async () => fakePhoto(1000, 1000),
      }),
    );
  });

  it("placeholder con cornerRadius → THROW", async () => {
    const unit = {
      ...photoOnlyUnit,
      layers: [photoOnlyUnit.layers[0], { ...photoOnlyUnit.layers[1], cornerRadius: 40 }],
    };
    await expectNeedsKonva(
      renderProductionSlots({
        unitTemplate: unit,
        slots: [{ slotIndex: 0, assetId: "a0" }],
        shape: "rectangle",
        loadAsset: async () => fakePhoto(1000, 1000),
      }),
    );
  });

  it("placeholder con rotación → THROW", async () => {
    const unit = {
      ...photoOnlyUnit,
      layers: [photoOnlyUnit.layers[0], { ...photoOnlyUnit.layers[1], rotation: 15 }],
    };
    await expectNeedsKonva(
      renderProductionSlots({
        unitTemplate: unit,
        slots: [{ slotIndex: 0, assetId: "a0" }],
        shape: "rectangle",
        loadAsset: async () => fakePhoto(1000, 1000),
      }),
    );
  });

  it("múltiples image-placeholder → THROW", async () => {
    const unit = {
      ...photoOnlyUnit,
      layers: [
        photoOnlyUnit.layers[0],
        { id: "ph1", type: "image-placeholder", x: 0, y: 0, width: 500, height: 500 },
        { id: "ph2", type: "image-placeholder", x: 500, y: 500, width: 500, height: 500 },
      ],
    };
    await expectNeedsKonva(
      renderProductionSlots({
        unitTemplate: unit,
        slots: [{ slotIndex: 0, assetId: "a0" }],
        shape: "rectangle",
        loadAsset: async () => fakePhoto(1000, 1000),
      }),
    );
  });

  it("stage gigante → THROW (anti-OOM)", async () => {
    const unit = { ...photoOnlyUnit, stage: { ...stage, width: 5000, height: 5000 } };
    await expectNeedsKonva(
      renderProductionSlots({
        unitTemplate: unit,
        slots: [{ slotIndex: 0, assetId: "a0" }],
        shape: "rectangle",
        loadAsset: async () => fakePhoto(1000, 1000),
      }),
    );
  });

  it("plantilla con capa de TEXTO con contenido → THROW (A1b)", async () => {
    const unit = {
      ...photoOnlyUnit,
      layers: [...photoOnlyUnit.layers, { id: "t", type: "text", text: "Mi recuerdo" }],
    };
    await expectNeedsKonva(
      renderProductionSlots({
        unitTemplate: unit,
        slots: [{ slotIndex: 0, assetId: "a0" }],
        shape: "rectangle",
        loadAsset: async () => fakePhoto(800, 800),
      }),
    );
  });

  it("plantilla con marco (asset) → THROW", async () => {
    const unit = {
      ...photoOnlyUnit,
      layers: [...photoOnlyUnit.layers, { id: "f", type: "asset", src: "/templates/frame.png" }],
    };
    await expectNeedsKonva(
      renderProductionSlots({
        unitTemplate: unit,
        slots: [{ slotIndex: 0, assetId: "a0" }],
        shape: "rectangle",
        loadAsset: async () => fakePhoto(800, 800),
      }),
    );
  });

  it("texto VACÍO no dispara THROW (placeholder de texto sin usar)", async () => {
    const unit = {
      ...photoOnlyUnit,
      layers: [...photoOnlyUnit.layers, { id: "t", type: "text", text: "   " }],
    };
    const bufs = await renderProductionSlots({
      unitTemplate: unit,
      slots: [
        { slotIndex: 0, assetId: "a0", photoTransform: { offsetX: 0, offsetY: 0, scale: 1 } },
      ],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(800, 800),
    });
    expect((await pngMeta(bufs[0])).width).toBe(3240);
  });
});

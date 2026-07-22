/*
 * ADR-057 Fase A1b — Render de producción con @napi-rs/canvas. Ejerce el pipeline REAL (texto con
 * las fuentes de marca, marco, foto) y los guards conservadores (filtro/rotación/multi-placeholder/
 * stage gigante → NEEDS_KONVA → fallback al cliente).
 */

import { describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { renderProductionSlotsCanvas } from "./production-render-canvas";
import { RenderNeedsKonvaError } from "./production-render";

/** Alpha (0..255) de un pixel del PNG, decodificándolo con @napi-rs/canvas. */
async function alphaAt(png: Buffer, x: number, y: number): Promise<number> {
  const img = await loadImage(png);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(x, y, 1, 1).data[3];
}

async function rgbaAt(
  png: Buffer,
  x: number,
  y: number,
): Promise<[number, number, number, number]> {
  const img = await loadImage(png);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

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
        {
          id: "cap",
          type: "text",
          text: "Nuestro recuerdo",
          fontSize: 40,
          fill: "#3D2E5C",
          align: "center",
        },
      ],
    };
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: unit,
      slots: [
        { slotIndex: 0, assetId: "a0", photoTransform: { offsetX: 0, offsetY: 0, scale: 1 } },
      ],
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
      slots: [
        {
          slotIndex: 0,
          assetId: "a0",
          photoTransform: { offsetX: 0, offsetY: 0, scale: 1 },
          textOverrides: { cap: { text: "MI TEXTO", fill: "#E85B9F" } },
        },
      ],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(900, 900),
    });
    expect((await pngSize(bufs[0])).w).toBe(720 * 3);
  });

  it("plantilla solo-foto (sin texto) también renderiza", async () => {
    const unit = {
      version: 1 as const,
      stage,
      layers: [{ id: "bg", type: "background", color: "#FFF8F0" }, photoLayer],
    };
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: unit,
      slots: [
        { slotIndex: 0, assetId: "a0", photoTransform: { offsetX: -30, offsetY: 20, scale: 1.4 } },
      ],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(1200, 800),
    });
    expect((await pngSize(bufs[0])).w).toBe(720 * 3);
  });

  const expectFallback = (p: Promise<unknown>) =>
    expect(p).rejects.toBeInstanceOf(RenderNeedsKonvaError);
  const baseUnit = {
    version: 1 as const,
    stage,
    layers: [{ id: "bg", type: "background", color: "#fff" }, photoLayer],
  };

  it("slot con FILTRO → NEEDS_KONVA (cliente tiene el filtro exacto)", async () => {
    await expectFallback(
      renderProductionSlotsCanvas({
        unitTemplate: baseUnit,
        slots: [{ slotIndex: 0, assetId: "a0", filter: "vivid" }],
        shape: "rectangle",
        loadAsset: async () => fakePhoto(800, 800),
      }),
    );
  });

  it("foto que no carga → NEEDS_KONVA (nunca blanco silencioso)", async () => {
    await expectFallback(
      renderProductionSlotsCanvas({
        unitTemplate: baseUnit,
        slots: [{ slotIndex: 0, assetId: "a0" }],
        shape: "rectangle",
        loadAsset: async () => null,
      }),
    );
  });

  it("stage gigante → NEEDS_KONVA (anti-OOM)", async () => {
    const unit = { ...baseUnit, stage: { width: 5000, height: 5000 } };
    await expectFallback(
      renderProductionSlotsCanvas({
        unitTemplate: unit,
        slots: [{ slotIndex: 0, assetId: "a0" }],
        shape: "rectangle",
        loadAsset: async () => fakePhoto(800, 800),
      }),
    );
  });

  it("múltiples image-placeholder → NEEDS_KONVA", async () => {
    const unit = {
      ...baseUnit,
      layers: [
        baseUnit.layers[0],
        photoLayer,
        { id: "ph2", type: "image-placeholder", x: 0, y: 0, width: 100, height: 100 },
      ],
    };
    await expectFallback(
      renderProductionSlotsCanvas({
        unitTemplate: unit,
        slots: [{ slotIndex: 0, assetId: "a0" }],
        shape: "rectangle",
        loadAsset: async () => fakePhoto(800, 800),
      }),
    );
  });

  it("marco (asset) inexistente → NEEDS_KONVA (no rompe)", async () => {
    const unit = {
      ...baseUnit,
      layers: [...baseUnit.layers, { id: "f", type: "asset", src: "/templates/no-existe-xyz.png" }],
    };
    await expectFallback(
      renderProductionSlotsCanvas({
        unitTemplate: unit,
        slots: [{ slotIndex: 0, assetId: "a0" }],
        shape: "rectangle",
        loadAsset: async () => fakePhoto(800, 800),
      }),
    );
  });

  it("marco SVG (fuentes horneadas) → NEEDS_KONVA (cliente rasteriza fiel)", async () => {
    const unit = {
      ...baseUnit,
      layers: [...baseUnit.layers, { id: "f", type: "asset", src: "/templates/ig_post.svg" }],
    };
    await expectFallback(
      renderProductionSlotsCanvas({
        unitTemplate: unit,
        slots: [{ slotIndex: 0, assetId: "a0" }],
        shape: "rectangle",
        loadAsset: async () => fakePhoto(800, 800),
      }),
    );
  });

  it("capa no soportada (shape) → NEEDS_KONVA (no dibuja de menos)", async () => {
    const unit = {
      ...baseUnit,
      layers: [...baseUnit.layers, { id: "s", type: "shape", shape: "star" }],
    };
    await expectFallback(
      renderProductionSlotsCanvas({
        unitTemplate: unit,
        slots: [{ slotIndex: 0, assetId: "a0" }],
        shape: "rectangle",
        loadAsset: async () => fakePhoto(800, 800),
      }),
    );
  });

  it("fuente no-marca (Georgia) → NEEDS_KONVA (fallback al cliente)", async () => {
    const unit = {
      version: 1 as const,
      stage,
      layers: [
        { id: "bg", type: "background", color: "#fff" },
        photoLayer,
        { id: "t", type: "text", text: "Hola", fontFamily: "Georgia, serif", fontSize: 30 },
      ],
    };
    await expectFallback(
      renderProductionSlotsCanvas({
        unitTemplate: unit,
        slots: [
          { slotIndex: 0, assetId: "a0", photoTransform: { offsetX: 0, offsetY: 0, scale: 1 } },
        ],
        shape: "rectangle",
        loadAsset: async () => fakePhoto(800, 800),
      }),
    );
  });

  it("texto multilínea → NEEDS_KONVA (Konva envuelve; canvas no)", async () => {
    const unit = {
      version: 1 as const,
      stage,
      layers: [
        { id: "bg", type: "background", color: "#fff" },
        photoLayer,
        { id: "t", type: "text", text: "linea1\nlinea2", fontSize: 30 },
      ],
    };
    await expectFallback(
      renderProductionSlotsCanvas({
        unitTemplate: unit,
        slots: [
          { slotIndex: 0, assetId: "a0", photoTransform: { offsetX: 0, offsetY: 0, scale: 1 } },
        ],
        shape: "rectangle",
        loadAsset: async () => fakePhoto(800, 800),
      }),
    );
  });

  it("heart/circle: cubre el stage, OMITE el texto y RECORTA a la silueta (FOTO1)", async () => {
    // ADR-063 FOTO1 — heart/circle imprimen recortados a su silueta física (transparente afuera →
    // troquel), sin el texto del template (igual que el editor). El FONDO se pinta DENTRO de la
    // silueta (#1). Verificamos que las esquinas quedan transparentes (alpha 0) y el centro opaco.
    const unit = {
      version: 1 as const,
      stage,
      layers: [
        { id: "bg", type: "background", color: "#fff" },
        photoLayer,
        { id: "cap", type: "text", text: "no debe salir" },
      ],
    };
    for (const shape of ["heart", "circle"] as const) {
      const bufs = await renderProductionSlotsCanvas({
        unitTemplate: unit,
        slots: [
          { slotIndex: 0, assetId: "a0", photoTransform: { offsetX: 0, offsetY: 0, scale: 1 } },
        ],
        shape,
        loadAsset: async () => fakePhoto(800, 1000),
      });
      const png = bufs[0];
      const { w, h } = await pngSize(png);
      expect(w).toBe(720 * 3);
      // Esquina superior-izquierda → FUERA de la silueta → transparente.
      expect(await alphaAt(png, 3, 3)).toBe(0);
      // Centro → DENTRO → opaco.
      expect(await alphaAt(png, Math.floor(w / 2), Math.floor(h / 2))).toBeGreaterThan(200);
    }
  });

  it("#1 circle con foto encogida: el hueco DENTRO de la silueta imprime el fondo, no transparente", async () => {
    // Antes el fondo se OMITÍA en heart/circle → un zoom-out dejaba huecos transparentes = blanco al
    // imprimir (divergía del editor, que muestra crema). Ahora el fondo se pinta recortado a la
    // silueta: los huecos salen del color del fondo, y fuera del troquel sigue transparente.
    const unit = {
      version: 1 as const,
      stage,
      layers: [
        { id: "bg", type: "background", color: "#FFF8F0" }, // crema del template default
        photoLayer,
      ],
    };
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: unit,
      slots: [
        // scale 0.5 → la foto (cover×0.5) no llena la silueta → quedan huecos arriba/abajo.
        { slotIndex: 0, assetId: "a0", photoTransform: { offsetX: 0, offsetY: 0, scale: 0.5 } },
      ],
      shape: "circle",
      loadAsset: async () => fakePhoto(800, 1000),
    });
    const png = bufs[0];
    // Punto lógico (360,100): DENTRO de la elipse (centro 360,460 · radios 360,460) pero ARRIBA de la
    // foto encogida (y∈[230,690]) → debe ser el crema del fondo (r alto), no transparente ni el azul.
    const [r, g, b, a] = await rgbaAt(png, 360 * 3, 100 * 3);
    expect(a).toBeGreaterThan(200); // fondo pintado (antes: 0 = transparente)
    expect(r).toBeGreaterThan(240); // crema (#FFF8F0), no el azul de la foto (r≈58)
    expect(g).toBeGreaterThan(230);
    void b;
    // La esquina sigue FUERA de la silueta → transparente (el fondo se recorta al troquel).
    expect(await alphaAt(png, 9, 9)).toBe(0);
  });
});

/** ¿Hay algún píxel que cumpla el predicado en la región? (escaneo paso 2, suficiente para texto). */
async function hasPixel(
  png: Buffer,
  region: { x: number; y: number; w: number; h: number },
  pred: (r: number, g: number, b: number, a: number) => boolean,
): Promise<boolean> {
  const img = await loadImage(png);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(region.x, region.y, region.w, region.h).data;
  for (let i = 0; i < data.length; i += 8) {
    if (pred(data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!)) return true;
  }
  return false;
}

describe("renderProductionSlotsCanvas — Ola 3 (frame-card Polaroid Clásica + includeText)", () => {
  // Plantilla espejo del seed "photo-pack-polaroid-clasica": tarjeta con franja,
  // foto arriba y mensaje editable. Stage chico (300×400 = 3:4) para tests rápidos.
  const clasicaUnit = {
    version: 1 as const,
    stage: { width: 300, height: 400 },
    layers: [
      { id: "bg", type: "background", color: "#FFFFFF" },
      { id: "card", type: "frame-card", fill: "#FFFFFF", cornerRadius: 12 },
      { id: "ph", type: "image-placeholder", x: 19, y: 19, width: 262, height: 262 },
      { id: "msg", type: "text", x: 150, y: 340, text: "Escribe tu mensaje", fontSize: 24 },
    ],
  };
  const slotOk = {
    slotIndex: 0,
    assetId: "a0",
    photoTransform: { offsetX: 0, offsetY: 0, scale: 1 },
  };
  // Franja del mensaje (debajo de la foto) en px de salida (stage × 3).
  const band = { x: 10 * 3, y: 315 * 3, w: 280 * 3, h: 50 * 3 };
  const nearWhite = (r: number, g: number, b: number, a: number) =>
    a > 200 && r > 235 && g > 235 && b > 235;

  it("frame-card: la tarjeta toma el COLOR DEL BORDE elegido (borderColor)", async () => {
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: clasicaUnit,
      slots: [slotOk],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: "#5DD9D1", // aguamarina de la paleta
    });
    expect(bufs).toHaveLength(1);
    // Esquina inferior de la tarjeta (dentro del redondeo) → color del borde.
    const [r, g, b, a] = await rgbaAt(bufs[0], 150 * 3, 390 * 3);
    expect(a).toBeGreaterThan(200);
    expect([r, g, b]).toEqual([0x5d, 0xd9, 0xd1]);
  });

  it("frame-card sin borderColor → tarjeta blanca (fallback del layer)", async () => {
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: clasicaUnit,
      slots: [slotOk],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: null,
    });
    const [r, g, b, a] = await rgbaAt(bufs[0], 150 * 3, 390 * 3);
    expect(a).toBeGreaterThan(200);
    expect([r, g, b]).toEqual([255, 255, 255]);
  });

  it("tarjeta OSCURA → el texto por defecto sale CLARO (legible); override del cliente manda", async () => {
    // Negro de marca: el mensaje sin override debe dibujarse blanco.
    const dark = await renderProductionSlotsCanvas({
      unitTemplate: clasicaUnit,
      slots: [slotOk],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: "#221E25",
    });
    expect(await hasPixel(dark[0], band, nearWhite)).toBe(true);

    // Con override de color (rosa), NO hay texto blanco: el cliente manda.
    const overridden = await renderProductionSlotsCanvas({
      unitTemplate: clasicaUnit,
      slots: [{ ...slotOk, textOverrides: { msg: { fill: "#E85B9F" } } }],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: "#221E25",
    });
    expect(await hasPixel(overridden[0], band, nearWhite)).toBe(false);
    expect(
      await hasPixel(overridden[0], band, (r, g, b, a) => a > 200 && r > 200 && b > 120 && g < 120),
    ).toBe(true);
  });

  it("tarjeta clara (blanco) → el texto por defecto sale oscuro (morado marca)", async () => {
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: clasicaUnit,
      slots: [slotOk],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: "#FFFFFF",
    });
    expect(
      await hasPixel(bufs[0], band, (r, g, b, a) => a > 200 && r < 110 && g < 80 && b < 130),
    ).toBe(true);
  });

  it("includeText=false (producto sin texto, Cuadrados): la capa de texto NO se dibuja", async () => {
    const unit = {
      version: 1 as const,
      stage,
      layers: [
        { id: "bg", type: "background", color: "#221E25" },
        photoLayer,
        {
          id: "t",
          type: "text",
          text: "NO DEBE SALIR",
          fontSize: 60,
          fill: "#FFFFFF",
          y: 800,
          x: 360,
        },
      ],
    };
    const textZone = { x: 60 * 3, y: 770 * 3, w: 600 * 3, h: 60 * 3 };
    const withoutText = await renderProductionSlotsCanvas({
      unitTemplate: unit,
      slots: [slotOk],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(800, 800),
      includeText: false,
    });
    expect(await hasPixel(withoutText[0], textZone, nearWhite)).toBe(false);
    // Control: con includeText normal sí aparece (la fuente está disponible en tests).
    const withText = await renderProductionSlotsCanvas({
      unitTemplate: unit,
      slots: [slotOk],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(800, 800),
    });
    expect(await hasPixel(withText[0], textZone, nearWhite)).toBe(true);
  });
});

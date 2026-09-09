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

describe("renderProductionSlotsCanvas — Ola 3b (marco FULL-BLEED, 'fin del papel')", () => {
  // Bug Lucy 2026-07-22: con marco de color la tarjeta exterior quedaba BLANCA (solo
  // un stroke alrededor de la foto). Referencia correcta: TODA la tarjeta del color.
  // Stage chico (300×400) → franja mínima = max(6, 4% de 300) = 12px.
  const slotOk2 = {
    slotIndex: 0,
    assetId: "a0",
    photoTransform: { offsetX: 0, offsetY: 0, scale: 1 },
  };
  const PINK: [number, number, number] = [0xe8, 0x5b, 0x9f]; // #E85B9F (rosa paleta)
  const BLUE: [number, number, number] = [0x3a, 0xa0, 0xff]; // fakePhoto

  it("plantilla con aire (foto inserta 40px): el margen exterior se pinta del COLOR (antes: blanco)", async () => {
    // Ola 4 (Lucy 2026-07-23): en "tarjetas simples" (fondo + foto, sin chrome) la franja es
    // UNIFORME en los 4 lados (frameBleedMargin = 12px acá), NO los márgenes de la plantilla
    // (40px asimétricos) — la referencia de Lucy es un marco parejo alrededor de la foto.
    const unit = {
      version: 1 as const,
      stage: { width: 300, height: 400 },
      layers: [
        { id: "bg", type: "background", color: "#FFFFFF" },
        { id: "ph", type: "image-placeholder", x: 40, y: 40, width: 220, height: 320 },
      ],
    };
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: unit,
      slots: [slotOk2],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: "#E85B9F",
      frameFullBleed: true,
    });
    // Franja uniforme 12px: (6,6) dentro de la franja → color de la tarjeta.
    const [r1, g1, b1, a1] = await rgbaAt(bufs[0], 6 * 3, 6 * 3);
    expect(a1).toBeGreaterThan(200);
    expect([r1, g1, b1]).toEqual(PINK);
    // (20,20) ya dentro de la foto insertada (ventana 12..288 × 12..388) → la foto.
    const [r2, g2, b2] = await rgbaAt(bufs[0], 20 * 3, 20 * 3);
    expect([r2, g2, b2]).toEqual(BLUE);
    // La franja es PAREJA: mismo grosor abajo-derecha que arriba-izquierda.
    expect((await rgbaAt(bufs[0], 294 * 3, 394 * 3)).slice(0, 3)).toEqual(PINK);
  });

  it("misma plantilla SIN frameFullBleed (legado): el margen exterior sigue BLANCO (control del bug)", async () => {
    const unit = {
      version: 1 as const,
      stage: { width: 300, height: 400 },
      layers: [
        { id: "bg", type: "background", color: "#FFFFFF" },
        { id: "ph", type: "image-placeholder", x: 40, y: 40, width: 220, height: 320 },
      ],
    };
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: unit,
      slots: [slotOk2],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: "#E85B9F",
      frameFullBleed: false,
    });
    const [r, g, b, a] = await rgbaAt(bufs[0], 20 * 3, 20 * 3);
    expect(a).toBeGreaterThan(200);
    expect([r, g, b]).toEqual([255, 255, 255]); // el bug: blanco fuera del stroke
  });

  it("plantilla a sangre (foto 0,0): la foto se INSERTA dejando la franja mínima de color (12px)", async () => {
    const unit = {
      version: 1 as const,
      stage: { width: 300, height: 400 },
      layers: [
        { id: "bg", type: "background", color: "#FFFFFF" },
        { id: "ph", type: "image-placeholder", x: 0, y: 0, width: 300, height: 400 },
      ],
    };
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: unit,
      slots: [slotOk2],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 800),
      borderColor: "#E85B9F",
      frameFullBleed: true,
    });
    // Franja: (6,6) dentro del margen de 12px → color.
    expect((await rgbaAt(bufs[0], 6 * 3, 6 * 3)).slice(0, 3)).toEqual(PINK);
    // (20,20) ya dentro de la foto insertada (ventana 12..288 × 12..388) → foto.
    expect((await rgbaAt(bufs[0], 20 * 3, 20 * 3)).slice(0, 3)).toEqual(BLUE);
    // Borde inferior-derecho también es color ("el fin del papel").
    expect((await rgbaAt(bufs[0], 294 * 3, 394 * 3)).slice(0, 3)).toEqual(PINK);
  });

  it("sin borderColor no hay full-bleed aunque el producto lo pida (fondo de plantilla)", async () => {
    const unit = {
      version: 1 as const,
      stage: { width: 300, height: 400 },
      layers: [
        { id: "bg", type: "background", color: "#FFF8F0" },
        { id: "ph", type: "image-placeholder", x: 0, y: 0, width: 300, height: 400 },
      ],
    };
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: unit,
      slots: [slotOk2],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 800),
      borderColor: null,
      frameFullBleed: true,
    });
    // Ventana intacta (a sangre) → esquina = foto, no fondo ni franja.
    expect((await rgbaAt(bufs[0], 2 * 3, 2 * 3)).slice(0, 3)).toEqual(BLUE);
  });
});

describe("renderProductionSlotsCanvas — Ola 3c (rotación de la foto)", () => {
  // Foto 100×50: mitad izquierda ROJA, mitad derecha AZUL. Ventana 100×100.
  function halfPhoto(): Buffer {
    const c = createCanvas(100, 50);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#FF0000";
    ctx.fillRect(0, 0, 50, 50);
    ctx.fillStyle = "#0000FF";
    ctx.fillRect(50, 0, 50, 50);
    return c.toBuffer("image/png");
  }
  const rotUnit = {
    version: 1 as const,
    stage: { width: 100, height: 100 },
    layers: [
      { id: "bg", type: "background", color: "#FFFFFF" },
      { id: "ph", type: "image-placeholder", x: 0, y: 0, width: 100, height: 100 },
    ],
  };

  it("rotación 90°: el cover usa las dimensiones intercambiadas y la foto gira (rojo arriba)", async () => {
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: rotUnit,
      slots: [
        {
          slotIndex: 0,
          assetId: "a0",
          photoTransform: { offsetX: 0, offsetY: 0, scale: 1, rotation: 90 },
        },
      ],
      shape: "rectangle",
      loadAsset: async () => halfPhoto(),
    });
    // Konva rotation +90 = horario: la mitad izquierda (roja) queda ARRIBA.
    const top = await rgbaAt(bufs[0], 50 * 3, 10 * 3);
    expect(top[0]).toBeGreaterThan(200); // rojo
    expect(top[2]).toBeLessThan(60);
    const bottom = await rgbaAt(bufs[0], 50 * 3, 90 * 3);
    expect(bottom[2]).toBeGreaterThan(200); // azul
    expect(bottom[0]).toBeLessThan(60);
  });

  it("rotación 0 (control): mitad roja a la IZQUIERDA sin intercambio de dims", async () => {
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: rotUnit,
      slots: [
        {
          slotIndex: 0,
          assetId: "a0",
          photoTransform: { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 },
        },
      ],
      shape: "rectangle",
      loadAsset: async () => halfPhoto(),
    });
    const left = await rgbaAt(bufs[0], 10 * 3, 50 * 3);
    expect(left[0]).toBeGreaterThan(200); // rojo
    const right = await rgbaAt(bufs[0], 90 * 3, 50 * 3);
    expect(right[2]).toBeGreaterThan(200); // azul
  });
});

describe("renderProductionSlotsCanvas — Ola 4 (Lucy 2026-07-23)", () => {
  const slotOk3 = {
    slotIndex: 0,
    assetId: "a0",
    photoTransform: { offsetX: 0, offsetY: 0, scale: 1 },
  };
  const BLUE: [number, number, number] = [0x3a, 0xa0, 0xff]; // fakePhoto
  const PINK: [number, number, number] = [0xe8, 0x5b, 0x9f];

  // T4 — Cuadrados: sin borde → foto a sangre TOTAL aunque la plantilla tenga aire.
  it("T4 tarjeta simple SIN borde (borderColor null): la foto cubre TODA la tarjeta (0 margen)", async () => {
    const unit = {
      version: 1 as const,
      stage: { width: 300, height: 300 },
      layers: [
        { id: "bg", type: "background", color: "#FFFFFF" },
        // Plantilla con aire (40px): antes dejaba franja blanca aunque el cliente eligiera ∅.
        { id: "ph", type: "image-placeholder", x: 40, y: 40, width: 220, height: 220 },
      ],
    };
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: unit,
      slots: [slotOk3],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: null,
      frameFullBleed: true,
    });
    // Esquina (2,2): la foto llega al borde (antes: franja blanca de 40px).
    expect((await rgbaAt(bufs[0], 2 * 3, 2 * 3)).slice(0, 3)).toEqual(BLUE);
    // Y el centro sigue siendo foto.
    expect((await rgbaAt(bufs[0], 150 * 3, 150 * 3)).slice(0, 3)).toEqual(BLUE);
  });

  it("T4 tarjeta simple CON borde: franja UNIFORME de color (12px) en los 4 lados", async () => {
    const unit = {
      version: 1 as const,
      stage: { width: 300, height: 300 },
      layers: [
        { id: "bg", type: "background", color: "#FFFFFF" },
        { id: "ph", type: "image-placeholder", x: 40, y: 40, width: 220, height: 180 },
      ],
    };
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: unit,
      slots: [slotOk3],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: "#E85B9F",
      frameFullBleed: true,
    });
    // Franja uniforme 12px (4% de 300): arriba-izquierda y abajo-derecha iguales.
    expect((await rgbaAt(bufs[0], 6 * 3, 6 * 3)).slice(0, 3)).toEqual(PINK);
    expect((await rgbaAt(bufs[0], 294 * 3, 294 * 3)).slice(0, 3)).toEqual(PINK);
    expect((await rgbaAt(bufs[0], 294 * 3, 6 * 3)).slice(0, 3)).toEqual(PINK);
    // Dentro de la ventana (12..288) → foto.
    expect((await rgbaAt(bufs[0], 20 * 3, 20 * 3)).slice(0, 3)).toEqual(BLUE);
    expect((await rgbaAt(bufs[0], 150 * 3, 150 * 3)).slice(0, 3)).toEqual(BLUE);
  });

  // T3 — Polaroid Clásica: el texto es OPCIONAL. La capa EDITABLE imprime solo su
  // override; el placeholder base ("Escribe tu mensaje") es guía del editor.
  const clasicaEditable = {
    version: 1 as const,
    stage: { width: 300, height: 400 },
    layers: [
      { id: "bg", type: "background", color: "#FFFFFF" },
      { id: "card", type: "frame-card", fill: "#FFFFFF", cornerRadius: 12 },
      { id: "ph", type: "image-placeholder", x: 19, y: 19, width: 262, height: 262 },
      {
        id: "msg",
        type: "text",
        x: 150,
        y: 340,
        text: "Escribe tu mensaje",
        fontSize: 24,
        fill: "#3D2E5C",
        editable: true,
      },
    ],
  };
  // Franja del mensaje en px de salida (stage × 3).
  const msgBand = { x: 10 * 3, y: 315 * 3, w: 280 * 3, h: 50 * 3 };
  const darkInk = (r: number, g: number, b: number, a: number) =>
    a > 200 && r < 120 && g < 120 && b < 160;

  it("T3 texto EDITABLE sin override → NO se imprime (el placeholder es solo guía)", async () => {
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: clasicaEditable,
      slots: [slotOk3],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: null,
    });
    expect(await hasPixel(bufs[0], msgBand, darkInk)).toBe(false);
  });

  it('T3 texto EDITABLE con override vacío ("") → NO se imprime; con override → se imprime', async () => {
    const empty = await renderProductionSlotsCanvas({
      unitTemplate: clasicaEditable,
      slots: [{ ...slotOk3, textOverrides: { msg: { text: "" } } }],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: null,
    });
    expect(await hasPixel(empty[0], msgBand, darkInk)).toBe(false);

    const filled = await renderProductionSlotsCanvas({
      unitTemplate: clasicaEditable,
      slots: [{ ...slotOk3, textOverrides: { msg: { text: "Te amo mamá" } } }],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: null,
    });
    expect(await hasPixel(filled[0], msgBand, darkInk)).toBe(true);
  });

  it("T3 capa NO editable (decorativa) sin override → imprime su texto base (control)", async () => {
    const unit = {
      version: 1 as const,
      stage: { width: 300, height: 400 },
      layers: [
        { id: "bg", type: "background", color: "#FFFFFF" },
        { id: "ph", type: "image-placeholder", x: 19, y: 19, width: 262, height: 262 },
        // Sin `editable`: texto fijo de la plantilla (ej. firma) → sí se imprime.
        { id: "sig", type: "text", x: 150, y: 340, text: "Lucams", fontSize: 24, fill: "#3D2E5C" },
      ],
    };
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: unit,
      slots: [slotOk3],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: null,
    });
    expect(await hasPixel(bufs[0], msgBand, darkInk)).toBe(true);
  });

  // T5 — Tira photobooth: UNA pieza continua con canaletas visibles ENTRE fotos
  // (regla 2026-09-08, Lucy: la tira física separa las fotos con canales del color
  // del marco). La separación se dibuja DENTRO de cada celda (stripPhotoRect:
  // media canaleta de 8px por cara → 16px entre fotos); el borde exterior (color
  // frame-card) sigue en first/last (12px) + lados. Misma matemática que el editor.
  const stripUnit = {
    version: 1 as const,
    stage: { width: 390, height: 400 },
    gridCols: 1,
    gridGap: 0,
    layers: [
      { id: "bg", type: "background", color: "#FFFFFF" },
      { id: "card", type: "frame-card", fill: "#FFFFFF", cornerRadius: 0 },
      // Ventana de la plantilla: sangre vertical (y=0), lados 12px (espejo del seed Ola 4).
      { id: "ph", type: "image-placeholder", x: 12, y: 0, width: 366, height: 400 },
    ],
  };
  const stripSlots = [0, 1, 2].map((i) => ({ ...slotOk3, slotIndex: i, assetId: `a${i}` }));
  const nearWhiteRgb = [255, 255, 255];

  it("T5 celda del MEDIO: media canaleta arriba y abajo (la foto ya NO toca los bordes)", async () => {
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: stripUnit,
      slots: stripSlots,
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: null,
      frameFullBleed: true,
    });
    expect(bufs).toHaveLength(3);
    const middle = bufs[1];
    // Borde superior de la celda del medio → canaleta del color de la tarjeta
    // (8px de stage = 24px de producción; y=1 cae dentro).
    expect((await rgbaAt(middle, 195 * 3, 1 * 3)).slice(0, 3)).toEqual(nearWhiteRgb);
    // Borde inferior → media canaleta también (y=398 ≥ 392 donde termina la foto).
    expect((await rgbaAt(middle, 195 * 3, 398 * 3)).slice(0, 3)).toEqual(nearWhiteRgb);
    // …y las dos medias canaletas vecinas (8+8) dejan la separación visible: la
    // foto empieza recién a los 8px de la celda (y=10 ya es foto).
    expect((await rgbaAt(middle, 195 * 3, 10 * 3)).slice(0, 3)).toEqual(BLUE);
    expect((await rgbaAt(middle, 195 * 3, 390 * 3)).slice(0, 3)).toEqual(BLUE);
    // Lado izquierdo (dentro del margen lateral 12px) → color de la tarjeta.
    expect((await rgbaAt(middle, 4 * 3, 200 * 3)).slice(0, 3)).toEqual(nearWhiteRgb);
  });

  it("T5 primera y última celda: borde EXTERIOR de 12px + media canaleta hacia la vecina", async () => {
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: stripUnit,
      slots: stripSlots,
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: null,
      frameFullBleed: true,
    });
    const [first, , last] = bufs;
    // Primera: franja superior blanca (borde exterior); la foto empieza a los 12px.
    expect((await rgbaAt(first, 195 * 3, 4 * 3)).slice(0, 3)).toEqual(nearWhiteRgb);
    expect((await rgbaAt(first, 195 * 3, 20 * 3)).slice(0, 3)).toEqual(BLUE);
    // …y su borde inferior lleva la media canaleta hacia la siguiente celda.
    expect((await rgbaAt(first, 195 * 3, 398 * 3)).slice(0, 3)).toEqual(nearWhiteRgb);
    // Última: media canaleta arriba + franja inferior blanca (borde exterior).
    expect((await rgbaAt(last, 195 * 3, 1 * 3)).slice(0, 3)).toEqual(nearWhiteRgb);
    expect((await rgbaAt(last, 195 * 3, 10 * 3)).slice(0, 3)).toEqual(BLUE);
    expect((await rgbaAt(last, 195 * 3, 396 * 3)).slice(0, 3)).toEqual(nearWhiteRgb);
    expect((await rgbaAt(last, 195 * 3, 380 * 3)).slice(0, 3)).toEqual(BLUE);
  });

  it("T5 con color de borde: borde exterior, lados y canaletas toman el color elegido", async () => {
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: stripUnit,
      slots: stripSlots,
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: "#E85B9F",
      frameFullBleed: true,
    });
    const [first] = bufs;
    expect((await rgbaAt(first, 195 * 3, 4 * 3)).slice(0, 3)).toEqual(PINK);
    expect((await rgbaAt(first, 4 * 3, 200 * 3)).slice(0, 3)).toEqual(PINK);
    // La canaleta inferior de la primera celda también es del color elegido.
    expect((await rgbaAt(first, 195 * 3, 398 * 3)).slice(0, 3)).toEqual(PINK);
  });

  // T5b — Ola 23 (Lucy 2026-09-08): tira SIN BORDE (toggle "Sin borde" de la toolbar →
  // placeholder reescrito a sangre total de la celda). Sin marco exterior (las fotos
  // llegan a los bordes de la tira) pero las canaletas entre fotos se conservan.
  const stripUnitSinBorde = {
    ...stripUnit,
    layers: [
      { id: "bg", type: "background", color: "#FFFFFF" },
      { id: "card", type: "frame-card", fill: "#FFFFFF", cornerRadius: 0 },
      // Ventana reescrita por el toggle: sangre total de la celda (x=0, ancho=stage).
      { id: "ph", type: "image-placeholder", x: 0, y: 0, width: 390, height: 400 },
    ],
  };

  it("T5b tira SIN borde: foto a sangre en los bordes externos, canaletas intactas", async () => {
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: stripUnitSinBorde,
      slots: stripSlots,
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: null,
      frameFullBleed: true,
    });
    const [first, middle, last] = bufs;
    // Primera celda: la foto toca el borde SUPERIOR de la tira (antes quedaba el inset de 12px)…
    expect((await rgbaAt(first, 195 * 3, 1 * 3)).slice(0, 3)).toEqual(BLUE);
    // …pero la canaleta hacia la segunda foto se conserva.
    expect((await rgbaAt(first, 195 * 3, 398 * 3)).slice(0, 3)).toEqual(nearWhiteRgb);
    // Celda del medio: canaleta arriba y abajo (sin cambios vs. con borde)…
    expect((await rgbaAt(middle, 195 * 3, 1 * 3)).slice(0, 3)).toEqual(nearWhiteRgb);
    expect((await rgbaAt(middle, 195 * 3, 398 * 3)).slice(0, 3)).toEqual(nearWhiteRgb);
    // …y los LADOS van a sangre (x=1 ya es foto; con borde había margen de 12px).
    expect((await rgbaAt(middle, 1 * 3, 200 * 3)).slice(0, 3)).toEqual(BLUE);
    // Última celda: la foto toca el borde INFERIOR de la tira.
    expect((await rgbaAt(last, 195 * 3, 398 * 3)).slice(0, 3)).toEqual(BLUE);
    expect((await rgbaAt(last, 195 * 3, 1 * 3)).slice(0, 3)).toEqual(nearWhiteRgb);
  });

  it("T5b tira SIN borde CON color: canaletas del color elegido, bordes externos a sangre", async () => {
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: stripUnitSinBorde,
      slots: stripSlots,
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: "#E85B9F",
      frameFullBleed: true,
    });
    const [first] = bufs;
    // Borde superior externo: foto a sangre (NADA de marco rosa)…
    expect((await rgbaAt(first, 195 * 3, 1 * 3)).slice(0, 3)).toEqual(BLUE);
    // …y la canaleta entre fotos sí toma el color elegido.
    expect((await rgbaAt(first, 195 * 3, 398 * 3)).slice(0, 3)).toEqual(PINK);
  });

  // T6 — Ola 23 (Lucy 2026-09-08): el MARCO es de ancho CONSTANTE bajo zoom-out/pan.
  // Al alejar la foto (scale < 1) el hueco dentro de la ventana se rellena con el color
  // de la tarjeta SIN marco (background), no con el color del marco — antes el marco
  // "crecía" porque el fondo del stage era borderColor y asomaba dentro de la ventana.
  it("T6 tira CON borde + zoom-out: el marco no crece (hueco = blanco, marco/canal = color)", async () => {
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: stripUnit,
      slots: stripSlots.map((s) => ({
        ...s,
        photoTransform: { offsetX: 0, offsetY: 0, scale: 0.5 },
      })),
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: "#E85B9F",
      frameFullBleed: true,
    });
    const middle = bufs[1];
    // Ventana de la celda del medio: x 12..378, y 8..392. Con scale 0.5 la foto cubre
    // 192×192 centrada (x 99..291, y 104..296 en px de stage).
    // Hueco DENTRO de la ventana (x=30) → blanco de la tarjeta, NO rosa (antes: rosa).
    expect((await rgbaAt(middle, 30 * 3, 200 * 3)).slice(0, 3)).toEqual(nearWhiteRgb);
    // Marco lateral (x=4) y canaleta inferior (y=398) → el color elegido, ancho intacto.
    expect((await rgbaAt(middle, 4 * 3, 200 * 3)).slice(0, 3)).toEqual(PINK);
    expect((await rgbaAt(middle, 195 * 3, 398 * 3)).slice(0, 3)).toEqual(PINK);
    // Centro: la foto (achicada) sigue ahí.
    expect((await rgbaAt(middle, 195 * 3, 200 * 3)).slice(0, 3)).toEqual(BLUE);
  });

  it("T6 tarjeta simple CON borde + zoom-out: franja uniforme constante (hueco = blanco)", async () => {
    const unit = {
      version: 1 as const,
      stage: { width: 300, height: 300 },
      layers: [
        { id: "bg", type: "background", color: "#FFFFFF" },
        { id: "ph", type: "image-placeholder", x: 40, y: 40, width: 220, height: 180 },
      ],
    };
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: unit,
      slots: [{ ...slotOk3, photoTransform: { offsetX: 0, offsetY: 0, scale: 0.5 } }],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: "#E85B9F",
      frameFullBleed: true,
    });
    // Ventana (12..288): con scale 0.5 la foto cubre 138×138 centrada (81..219).
    // Hueco dentro de la ventana (x=20) → blanco; la franja (x=6) → rosa constante.
    expect((await rgbaAt(bufs[0], 20 * 3, 20 * 3)).slice(0, 3)).toEqual(nearWhiteRgb);
    expect((await rgbaAt(bufs[0], 6 * 3, 6 * 3)).slice(0, 3)).toEqual(PINK);
    expect((await rgbaAt(bufs[0], 150 * 3, 150 * 3)).slice(0, 3)).toEqual(BLUE);
  });

  it("T3 override SOLO de estilo (sin text) → el placeholder sigue sin imprimirse", async () => {
    // Ola 23 — si el cliente solo cambió el color/tamaño pero no escribió texto, el
    // default de la plantilla NO se imprime (en el editor se ve atenuado como guía).
    const pinkInk = (r: number, g: number, b: number, a: number) =>
      a > 200 && r > 200 && g < 140 && b > 120;
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: clasicaEditable,
      slots: [{ ...slotOk3, textOverrides: { msg: { fill: "#E85B9F" } } }],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: null,
    });
    expect(await hasPixel(bufs[0], msgBand, pinkInk)).toBe(false);
    expect(await hasPixel(bufs[0], msgBand, darkInk)).toBe(false);
  });
});

describe("renderProductionSlotsCanvas — Ola 24 (Lucy 2026-09-09)", () => {
  const slotOk4 = {
    slotIndex: 0,
    assetId: "a0",
    photoTransform: { offsetX: 0, offsetY: 0, scale: 1 },
  };
  const BLUE: [number, number, number] = [0x3a, 0xa0, 0xff]; // fakePhoto
  const PINK: [number, number, number] = [0xe8, 0x5b, 0x9f];
  const nearWhiteRgb = [255, 255, 255];

  // T7 — Tira SIN BORDE + zoom-out: las canaletas entre fotos conservan el color y
  // su ancho; el hueco que deja la foto alejada es NEUTRO (blanco de la tarjeta sin
  // teñir), NUNCA el color del marco (no hay inundación). Los bordes externos de la
  // tira siguen a sangre cuando la foto cubre la celda (T5b, scale 1).
  const stripUnitSinBorde = {
    version: 1 as const,
    stage: { width: 390, height: 400 },
    gridCols: 1,
    gridGap: 0,
    layers: [
      { id: "bg", type: "background", color: "#FFFFFF" },
      { id: "card", type: "frame-card", fill: "#FFFFFF", cornerRadius: 0 },
      // Ventana reescrita por el toggle "Sin borde": sangre total de la celda.
      { id: "ph", type: "image-placeholder", x: 0, y: 0, width: 390, height: 400 },
    ],
  };
  const stripSlotsOut = [0, 1, 2].map((i) => ({
    ...slotOk4,
    slotIndex: i,
    assetId: `a${i}`,
    photoTransform: { offsetX: 0, offsetY: 0, scale: 0.5 },
  }));

  it("T7 tira SIN borde + zoom-out: canaletas del color CONSTANTES, hueco neutro, sin inundación", async () => {
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: stripUnitSinBorde,
      slots: stripSlotsOut,
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: "#E85B9F",
      frameFullBleed: true,
    });
    const [first, middle] = bufs;
    // Celda del medio: ventana = (0,8)-(390,392). Con scale 0.5 la foto cubre
    // 195×195 centrada (x 97.5..292.5, y 102.5..297.5 en px de stage).
    // Hueco DENTRO de la ventana (x=30 y x=360) → blanco neutro, NO rosa.
    expect((await rgbaAt(middle, 30 * 3, 200 * 3)).slice(0, 3)).toEqual(nearWhiteRgb);
    expect((await rgbaAt(middle, 360 * 3, 200 * 3)).slice(0, 3)).toEqual(nearWhiteRgb);
    // Canaletas arriba/abajo → rosa del marco, ancho intacto (8px de stage).
    expect((await rgbaAt(middle, 195 * 3, 2 * 3)).slice(0, 3)).toEqual(PINK);
    expect((await rgbaAt(middle, 195 * 3, 396 * 3)).slice(0, 3)).toEqual(PINK);
    // Centro: la foto achicada sigue ahí.
    expect((await rgbaAt(middle, 195 * 3, 200 * 3)).slice(0, 3)).toEqual(BLUE);
    // Primera celda: el borde EXTERIOR superior (y=1) tampoco se inunda — hueco
    // neutro (la foto a sangre solo cuando cubre la celda, ver T5b con scale 1).
    expect((await rgbaAt(first, 195 * 3, 1 * 3)).slice(0, 3)).toEqual(nearWhiteRgb);
    expect((await rgbaAt(first, 195 * 3, 396 * 3)).slice(0, 3)).toEqual(PINK);
  });

  // T8 — Textos de la plantilla INSTAGRAM ("@tu_usuario", "Bogotá, Colombia",
  // "362 me gusta", "Tu título acá", "#mirecuerdo #lucamsshop"): todos son capas
  // EDITABLES → placeholder de pantalla que NUNCA se imprime sin override del
  // cliente (misma regla que la Clásica, T3). Sin capa asset acá: el chrome SVG
  // real siempre cae al cliente (fuentes horneadas) — lo que se congela es la
  // regla de TEXTO, que es la que imprime o no imprime.
  const igTextsUnit = {
    version: 1 as const,
    stage: { width: 450, height: 600 },
    layers: [
      { id: "bg", type: "background", color: "#FFFFFF" },
      { id: "ph", type: "image-placeholder", x: 29, y: 58, width: 392, height: 392 },
      {
        id: "user_name",
        type: "text",
        x: 68,
        y: 28,
        text: "@tu_usuario",
        fontFamily: "Inter",
        fontSize: 16,
        fill: "#262626",
        fontWeight: "bold",
        align: "left",
        editable: true,
      },
      {
        id: "likes_count",
        type: "text",
        x: 22,
        y: 510,
        text: "362 me gusta",
        fontFamily: "Inter",
        fontSize: 15,
        fill: "#262626",
        fontWeight: "bold",
        align: "left",
        editable: true,
      },
      {
        id: "caption",
        type: "text",
        x: 22,
        y: 526,
        text: "Tu título acá",
        fontFamily: "Inter",
        fontSize: 16,
        fill: "#262626",
        fontWeight: "bold",
        align: "left",
        editable: true,
      },
      {
        id: "hashtags",
        type: "text",
        x: 22,
        y: 542,
        text: "#mirecuerdo #lucamsshop",
        fontFamily: "Inter",
        fontSize: 13,
        fill: "#00376B",
        align: "left",
        editable: true,
      },
    ],
  };
  // Zonas en px de salida (stage × 3): header (username) y footer (likes/caption/hashtags).
  const igHeaderZone = { x: 60 * 3, y: 14 * 3, w: 240 * 3, h: 30 * 3 };
  const igFooterZone = { x: 15 * 3, y: 498 * 3, w: 420 * 3, h: 60 * 3 };
  const darkInk = (r: number, g: number, b: number, a: number) =>
    a > 200 && r < 120 && g < 120 && b < 160;
  const hashtagBlue = (r: number, g: number, b: number, a: number) =>
    a > 200 && b > 90 && r < 60 && g < 90;

  it("T8 Instagram SIN overrides → NINGÚN texto placeholder se imprime (header ni footer)", async () => {
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: igTextsUnit,
      slots: [slotOk4],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: null,
    });
    expect(await hasPixel(bufs[0], igHeaderZone, darkInk)).toBe(false);
    expect(await hasPixel(bufs[0], igFooterZone, darkInk)).toBe(false);
    expect(await hasPixel(bufs[0], igFooterZone, hashtagBlue)).toBe(false);
  });

  it("T8 Instagram con override SOLO de estilo (sin text) → tampoco se imprime", async () => {
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: igTextsUnit,
      slots: [{ ...slotOk4, textOverrides: { caption: { fill: "#E85B9F" } } }],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: null,
    });
    expect(await hasPixel(bufs[0], igFooterZone, darkInk)).toBe(false);
  });

  it("T8 Instagram CON texto del cliente → SÍ se imprime (control: la regla no borra texto real)", async () => {
    const bufs = await renderProductionSlotsCanvas({
      unitTemplate: igTextsUnit,
      slots: [
        {
          ...slotOk4,
          textOverrides: { user_name: { text: "@lucy" }, hashtags: { text: "#viaje" } },
        },
      ],
      shape: "rectangle",
      loadAsset: async () => fakePhoto(600, 600),
      borderColor: null,
    });
    expect(await hasPixel(bufs[0], igHeaderZone, darkInk)).toBe(true);
    expect(await hasPixel(bufs[0], igFooterZone, hashtagBlue)).toBe(true);
  });

  // T9 — Instagram con chrome SVG: la plantilla real SIEMPRE cae al cliente
  // (fuentes horneadas en el SVG) → lo que se imprime es el snapshot de Konva, que
  // incluye el Rect de respaldo neutro de la ventana (Ola 24, studio-slot). El
  // fillRect equivalente de este tier queda cubierto por photoBackingHexFor.
  it("T9 Instagram (chrome SVG) → NEEDS_KONVA: imprime el snapshot del cliente (que ya lleva el respaldo)", async () => {
    const igUnit = {
      ...igTextsUnit,
      layers: [
        ...igTextsUnit.layers,
        {
          id: "frame",
          type: "asset",
          src: "/templates/ig_post_3x4.svg",
          x: 0,
          y: 0,
          width: 450,
          height: 600,
        },
      ],
    };
    await expect(
      renderProductionSlotsCanvas({
        unitTemplate: igUnit,
        slots: [slotOk4],
        shape: "rectangle",
        loadAsset: async () => fakePhoto(600, 600),
        borderColor: "#221E25",
      }),
    ).rejects.toBeInstanceOf(RenderNeedsKonvaError);
  });
});

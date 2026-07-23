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

  it("T3 texto EDITABLE con override vacío (\"\") → NO se imprime; con override → se imprime", async () => {
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

  // T5 — Tira photobooth: UNA pieza continua. Las fotos de celdas vecinas se TOCAN
  // (gap 0 real); el borde exterior (color frame-card) solo en first/last + lados.
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

  it("T5 celda del MEDIO: la foto toca los bordes superior e inferior (gap 0 real)", async () => {
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
    // Borde superior de la celda del medio → foto (toca la foto de la celda anterior).
    expect((await rgbaAt(middle, 195 * 3, 1 * 3)).slice(0, 3)).toEqual(BLUE);
    // Borde inferior → foto (toca la siguiente).
    expect((await rgbaAt(middle, 195 * 3, 398 * 3)).slice(0, 3)).toEqual(BLUE);
    // Lado izquierdo (dentro del margen lateral 12px) → color de la tarjeta.
    expect((await rgbaAt(middle, 4 * 3, 200 * 3)).slice(0, 3)).toEqual(nearWhiteRgb);
  });

  it("T5 primera y última celda: borde EXTERIOR de 12px del color de la tarjeta", async () => {
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
    // …pero su borde inferior toca la siguiente celda → foto.
    expect((await rgbaAt(first, 195 * 3, 398 * 3)).slice(0, 3)).toEqual(BLUE);
    // Última: franja inferior blanca; su borde superior toca la anterior → foto.
    expect((await rgbaAt(last, 195 * 3, 1 * 3)).slice(0, 3)).toEqual(BLUE);
    expect((await rgbaAt(last, 195 * 3, 396 * 3)).slice(0, 3)).toEqual(nearWhiteRgb);
    expect((await rgbaAt(last, 195 * 3, 380 * 3)).slice(0, 3)).toEqual(BLUE);
  });

  it("T5 con color de borde: el borde exterior y los lados toman el color elegido", async () => {
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
  });
});

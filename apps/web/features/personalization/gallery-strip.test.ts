/*
 * Tests del corte de tiras de la galería (modo "una sola imagen, ambas caras"
 * de /admin/disenos): validación de proporción por tamaño de variante y la
 * normalización del formato doblez (cara A = mitad inferior tal cual; cara B =
 * mitad superior rotada 180°), incluido el intercambio de caras (swapFaces).
 */

import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));

import { GalleryStripError, splitGalleryStripImage, stripRatioOfFaceSize } from "./gallery-strip";

/** RGBA de un pixel (raw vía sharp — la salida del corte es WebP). */
async function rgbaAt(
  img: Buffer,
  x: number,
  y: number,
): Promise<[number, number, number, number]> {
  const { data, info } = await sharp(img).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i]!, data[i + 1]!, data[i + 2]!, info.channels > 3 ? data[i + 3]! : 255];
}

/** WebP q95 es con pérdida: los sólidos sobreviven con ±3 por canal. */
async function expectColor(
  img: Buffer,
  x: number,
  y: number,
  expected: [number, number, number],
): Promise<void> {
  const [r, g, b] = await rgbaAt(img, x, y);
  expect(Math.abs(r - expected[0])).toBeLessThanOrEqual(3);
  expect(Math.abs(g - expected[1])).toBeLessThanOrEqual(3);
  expect(Math.abs(b - expected[2])).toBeLessThanOrEqual(3);
}

/**
 * Tira de prueba w×(2h): mitad superior = izquierda verde/derecha azul (cara B
 * fuente, cabeza abajo), mitad inferior = roja sólida (cara A).
 */
async function fakeStrip(w: number, h: number): Promise<Buffer> {
  const half = Math.floor(w / 2);
  const mk = (width: number, height: number, bg: string) =>
    sharp({ create: { width, height, channels: 4, background: bg } })
      .png()
      .toBuffer();
  const topLeft = await mk(half, h, "#00FF00");
  const topRight = await mk(w - half, h, "#0000FF");
  const top = await sharp({
    create: { width: w, height: h, channels: 4, background: "#000000" },
  })
    .composite([
      { input: topLeft, left: 0, top: 0 },
      { input: topRight, left: half, top: 0 },
    ])
    .png()
    .toBuffer();
  const bottom = await mk(w, h, "#FF0000");
  return sharp({
    create: { width: w, height: h * 2, channels: 4, background: "#000000" },
  })
    .composite([
      { input: top, left: 0, top: 0 },
      { input: bottom, left: 0, top: h },
    ])
    .png()
    .toBuffer();
}

const EXPECTED_SEPARADORES = [
  { sizeCm: "2×6", ratio: 6 },
  { sizeCm: "4×4.2", ratio: 2.1 },
];

describe("stripRatioOfFaceSize", () => {
  it("2×6 por cara → tira 2×12 (ratio 6); 4×4.2 → 4×8.4 (ratio 2.1)", () => {
    expect(stripRatioOfFaceSize("2×6")).toBe(6);
    expect(stripRatioOfFaceSize("4×4.2")).toBeCloseTo(2.1, 5);
  });

  it("la orientación del sizeCm no importa (usa lado mayor/menor)", () => {
    expect(stripRatioOfFaceSize("6×2")).toBe(6);
  });

  it("devuelve null si no parsea", () => {
    expect(stripRatioOfFaceSize("grande")).toBeNull();
    expect(stripRatioOfFaceSize("0×6")).toBeNull();
  });
});

describe("splitGalleryStripImage", () => {
  it("parte la tira: cara A = mitad inferior tal cual, cara B = mitad superior rotada 180°", async () => {
    const strip = await fakeStrip(100, 105); // ratio 2.1 → cuadra con 4×4.2
    const out = await splitGalleryStripImage({ buffer: strip, expected: EXPECTED_SEPARADORES });

    expect(out.matchedSizeCm).toBe("4×4.2");
    expect(out.width).toBe(100);
    expect(out.faceHeight).toBe(105);

    // Cara A: toda roja (mitad inferior, sin rotar).
    await expectColor(out.faceA, 50, 50, [255, 0, 0]);

    // Cara B normalizada: la fuente tenía izquierda verde/derecha azul pero
    // cabeza abajo → tras rotar 180°, la izquierda muestra AZUL.
    const metaB = await sharp(out.faceB).metadata();
    expect(metaB.width).toBe(100);
    expect(metaB.height).toBe(105);
    await expectColor(out.faceB, 25, 50, [0, 0, 255]);
    await expectColor(out.faceB, 75, 50, [0, 255, 0]);
  });

  it("swapFaces: intercambia las mitades (diseño que venía al revés)", async () => {
    const strip = await fakeStrip(100, 105);
    const out = await splitGalleryStripImage({
      buffer: strip,
      expected: EXPECTED_SEPARADORES,
      swapFaces: true,
    });
    // Ahora la cara A es la mitad superior rotada (izquierda azul) y la B la inferior (roja).
    await expectColor(out.faceA, 25, 50, [0, 0, 255]);
    await expectColor(out.faceB, 50, 50, [255, 0, 0]);
  });

  it("acepta la proporción de la otra variante (2×6 → tira 6× más alta)", async () => {
    const strip = await fakeStrip(100, 300); // ratio 6
    const out = await splitGalleryStripImage({ buffer: strip, expected: EXPECTED_SEPARADORES });
    expect(out.matchedSizeCm).toBe("2×6");
  });

  it("rechaza imágenes horizontales o cuadradas con mensaje amable", async () => {
    const strip = await fakeStrip(200, 50); // total 200×100 → landscape
    await expect(
      splitGalleryStripImage({ buffer: strip, expected: EXPECTED_SEPARADORES }),
    ).rejects.toThrow(GalleryStripError);
    await expect(
      splitGalleryStripImage({ buffer: strip, expected: EXPECTED_SEPARADORES }),
    ).rejects.toThrow(/VERTICAL/);
  });

  it("rechaza una proporción que no cuadra con ninguna variante", async () => {
    const strip = await fakeStrip(100, 180); // ratio 3.6: ni 6 ni 2.1
    await expect(
      splitGalleryStripImage({ buffer: strip, expected: EXPECTED_SEPARADORES }),
    ).rejects.toThrow(/proporción/);
  });

  it("rechaza buffers que no son imagen", async () => {
    await expect(
      splitGalleryStripImage({
        buffer: Buffer.from("<html>no soy imagen</html>"),
        expected: EXPECTED_SEPARADORES,
      }),
    ).rejects.toThrow(GalleryStripError);
  });
});

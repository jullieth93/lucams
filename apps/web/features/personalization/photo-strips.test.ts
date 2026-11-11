/*
 * Test del compositor de tiras photobooth (owner 2026-11-10 — Tiras
 * Magnéticas): N × perStrip segmentos → N tiras COMPLETAS, fotos apiladas en
 * orden sin separación (gridGap=0), rectangulares a sangre (misma regla W3 de
 * los separadores: el corte lo hace el troquel).
 */

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { composePhotoStrips } from "./photo-strips";

/** Segmento fake de color sólido (PNG). */
async function fakeSegment(w: number, h: number, hex: string): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 4, background: hex },
  })
    .png()
    .toBuffer();
}

/** RGBA de un pixel del PNG (decodificado con @napi-rs/canvas, patrón del repo). */
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

describe("composePhotoStrips (tiras photobooth — tira completa)", () => {
  it("apila los segmentos EN ORDEN, sin separación, en un PNG por tira", async () => {
    const segs = await Promise.all([
      fakeSegment(100, 100, "#FF0000"),
      fakeSegment(100, 100, "#00FF00"),
      fakeSegment(100, 100, "#0000FF"),
    ]);
    const strips = await composePhotoStrips(segs, { perStrip: 3 });
    expect(strips).toHaveLength(1);
    const meta = await sharp(strips[0]!).metadata();
    // 3 celdas de 5×5 cm → tira 5×15 cm: mismo ancho, triple de alto.
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(300);
    expect(await rgbaAt(strips[0]!, 50, 50)).toEqual([255, 0, 0, 255]);
    expect(await rgbaAt(strips[0]!, 50, 150)).toEqual([0, 255, 0, 255]);
    expect(await rgbaAt(strips[0]!, 50, 250)).toEqual([0, 0, 255, 255]);
  });

  it("multi-unidad: 6 segmentos de a 3 → 2 tiras independientes, en orden", async () => {
    const tira1 = await Promise.all([
      fakeSegment(80, 80, "#FF0000"),
      fakeSegment(80, 80, "#00FF00"),
      fakeSegment(80, 80, "#0000FF"),
    ]);
    const tira2 = await Promise.all([
      fakeSegment(80, 80, "#FFFFFF"),
      fakeSegment(80, 80, "#000000"),
      fakeSegment(80, 80, "#FFFF00"),
    ]);
    const strips = await composePhotoStrips([...tira1, ...tira2], { perStrip: 3 });
    expect(strips).toHaveLength(2);
    expect(await rgbaAt(strips[1]!, 40, 40)).toEqual([255, 255, 255, 255]);
    expect(await rgbaAt(strips[1]!, 40, 120)).toEqual([0, 0, 0, 255]);
  });

  it("reescala un segmento con dimensiones distintas a la celda de la tira", async () => {
    const a = await fakeSegment(100, 100, "#FF0000");
    const b = await fakeSegment(50, 50, "#0000FF");
    const strips = await composePhotoStrips([a, b], { perStrip: 2 });
    const meta = await sharp(strips[0]!).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(200);
    expect(await rgbaAt(strips[0]!, 50, 150)).toEqual([0, 0, 255, 255]);
  });

  it("cantidad no múltiplo de perStrip → error (nunca una tira coja en silencio)", async () => {
    const segs = await Promise.all([
      fakeSegment(10, 10, "#FF0000"),
      fakeSegment(10, 10, "#00FF00"),
    ]);
    await expect(composePhotoStrips(segs, { perStrip: 3 })).rejects.toThrow(/múltiplo/);
  });

  it("perStrip 1 (defensivo) devuelve los segmentos tal cual", async () => {
    const segs = [await fakeSegment(10, 10, "#FF0000")];
    await expect(composePhotoStrips(segs, { perStrip: 1 })).resolves.toHaveLength(1);
  });
});

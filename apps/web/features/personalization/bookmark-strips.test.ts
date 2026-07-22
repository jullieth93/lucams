/*
 * Test del compositor de tiras desplegadas (Ola 3 — separadores 2 caras):
 * 2N caras → N tiras A|B lado a lado, con esquinas exteriores redondeadas (troquel)
 * y transparencia fuera de la silueta.
 */

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { composeFaceStrips } from "./bookmark-strips";

/** Cara fake de color sólido (PNG). */
async function fakeFace(w: number, h: number, hex: string): Promise<Buffer> {
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

describe("composeFaceStrips (Ola 3 — tira desplegada de separadores)", () => {
  it("compone la tira con cara A a la izquierda y cara B a la derecha", async () => {
    const a = await fakeFace(120, 126, "#FF0000"); // cara A roja
    const b = await fakeFace(120, 126, "#0000FF"); // cara B azul
    const strips = await composeFaceStrips([a, b]);
    expect(strips).toHaveLength(1);
    const meta = await sharp(strips[0]).metadata();
    // 4×4.2 cm por cara → la tira es el DOBLE de ancha (8×4.2), misma altura.
    expect(meta.width).toBe(240);
    expect(meta.height).toBe(126);
    // Mitad izquierda = cara A (roja), mitad derecha = cara B (azul).
    const [r1, g1, b1] = await rgbaAt(strips[0], 60, 63);
    expect([r1, g1, b1]).toEqual([255, 0, 0]);
    const [r2, g2, b2] = await rgbaAt(strips[0], 180, 63);
    expect([r2, g2, b2]).toEqual([0, 0, 255]);
  });

  it("2 unidades (4 caras) → 2 tiras independientes", async () => {
    const faces = await Promise.all([
      fakeFace(60, 60, "#FF0000"),
      fakeFace(60, 60, "#00FF00"),
      fakeFace(60, 60, "#0000FF"),
      fakeFace(60, 60, "#FFFFFF"),
    ]);
    const strips = await composeFaceStrips(faces);
    expect(strips).toHaveLength(2);
    // Unidad 2: cara A azul, cara B blanca.
    const [r] = await rgbaAt(strips[1], 30, 30);
    expect(r).toBe(0);
    const [, , b] = await rgbaAt(strips[1], 30, 30);
    expect(b).toBe(255);
    const [rw, gw, bw] = await rgbaAt(strips[1], 90, 30);
    expect([rw, gw, bw]).toEqual([255, 255, 255]);
  });

  it("esquinas exteriores redondeadas (troquel): transparente en la esquina, opaco al centro", async () => {
    const a = await fakeFace(100, 100, "#221E25");
    const b = await fakeFace(100, 100, "#221E25");
    const strips = await composeFaceStrips([a, b], { cornerRadiusPx: 30 });
    // Esquina superior-izquierda de la tira → fuera del troquel redondeado.
    const [, , , alphaCorner] = await rgbaAt(strips[0], 2, 2);
    expect(alphaCorner).toBe(0);
    // Centro de la cara A → dentro.
    const [, , , alphaCenter] = await rgbaAt(strips[0], 50, 50);
    expect(alphaCenter).toBe(255);
    // El pliegue central NO se redondea: el borde de la unión sigue opaco arriba.
    const [, , , alphaFold] = await rgbaAt(strips[0], 100, 1);
    expect(alphaFold).toBe(255);
  });

  it("sin radio → tira rectangular opaca hasta la esquina", async () => {
    const a = await fakeFace(50, 50, "#3D2E5C");
    const b = await fakeFace(50, 50, "#3D2E5C");
    const strips = await composeFaceStrips([a, b]);
    const [, , , alpha] = await rgbaAt(strips[0], 0, 0);
    expect(alpha).toBe(255);
  });

  it("cantidad impar de caras → error explícito (no produce una tira coja)", async () => {
    const a = await fakeFace(10, 10, "#000000");
    await expect(composeFaceStrips([a, a, a])).rejects.toThrow(/impar/);
  });

  it("cara B con dimensiones distintas (fallback de cliente) se reescala a la cara A", async () => {
    const a = await fakeFace(100, 80, "#FF0000");
    const b = await fakeFace(33, 21, "#0000FF");
    const strips = await composeFaceStrips([a, b]);
    const meta = await sharp(strips[0]).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(80);
    const [, , bRight] = await rgbaAt(strips[0], 150, 40);
    expect(bRight).toBe(255);
  });
});

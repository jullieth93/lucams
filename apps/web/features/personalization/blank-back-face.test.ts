/*
 * Test de la cara B EN BLANCO de producción (decisión owner 2026-10-07 —
 * revierte la regla espejo del Paquete D, 2026-10-02): una cara B sin diseñar
 * (backOptional) se imprime EN BLANCO — un PNG blanco puro con las dimensiones
 * y DPI EXACTAS de la cara A de su pareja, nunca una copia de la A.
 */

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  blankBackFacePng,
  blankOutEmptyBackFaces,
  expandMissingBackFaces,
} from "./blank-back-face";

/** Cara fake de color sólido (PNG) con densidad declarada. */
async function fakeFace(w: number, h: number, hex: string, density = 300): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 4, background: hex },
  })
    .withMetadata({ density })
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

describe("blankBackFacePng (cara B en blanco para imprenta, owner 2026-10-07)", () => {
  it("blanco PURO con las dimensiones y DPI EXACTAS de la cara A de referencia", async () => {
    const faceA = await fakeFace(600, 200, "#123456", 300);
    const blank = await blankBackFacePng(faceA);
    const meta = await sharp(blank).metadata();
    expect(meta.width).toBe(600);
    expect(meta.height).toBe(200);
    expect(meta.density).toBe(300);
    // Blanco puro en el centro y en una esquina (nada de la foto de A).
    expect(await rgbaAt(blank, 300, 100)).toEqual([255, 255, 255, 255]);
    expect(await rgbaAt(blank, 5, 5)).toEqual([255, 255, 255, 255]);
  });

  it("sin densidad en la referencia → 300 DPI de producción por defecto", async () => {
    const noDensity = await sharp({
      create: { width: 100, height: 80, channels: 3, background: "#000000" },
    })
      .png()
      .toBuffer();
    const blank = await blankBackFacePng(noDensity);
    const meta = await sharp(blank).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(80);
    expect(meta.density).toBe(300);
  });
});

describe("expandMissingBackFaces (buffers del cliente → un buffer por slot)", () => {
  it("cara B vacía → PNG BLANCO del tamaño de su cara A (NO copia de la A)", async () => {
    const a1 = await fakeFace(600, 200, "#FF0000");
    const a2 = await fakeFace(600, 200, "#00FF00");
    // Slots requeridos: 0 (1A) y 2 (2A) — las caras B (1 y 3) quedaron vacías.
    const out = await expandMissingBackFaces([a1, a2], [0, 2], 4);
    expect(out).toHaveLength(4);
    expect(out[0]).toBe(a1); // caras con snapshot: intactas (mismo buffer)
    expect(out[2]).toBe(a2);
    for (const i of [1, 3]) {
      const meta = await sharp(out[i]!).metadata();
      expect(meta.width).toBe(600);
      expect(meta.height).toBe(200);
      expect(await rgbaAt(out[i]!, 300, 100)).toEqual([255, 255, 255, 255]);
    }
  });

  it("sin caras B vacías es identidad (no toca los buffers)", async () => {
    const a1 = await fakeFace(600, 200, "#FF0000");
    const b1 = await fakeFace(600, 200, "#0000FF");
    const out = await expandMissingBackFaces([a1, b1], [0, 1], 2);
    expect(out).toEqual([a1, b1]);
  });

  it("cara B vacía SIN cara A de referencia → error claro (no debería: el guard exige las A)", async () => {
    const bSolo = await fakeFace(600, 200, "#0000FF");
    await expect(expandMissingBackFaces([bSolo], [1], 2)).rejects.toThrow(/INCOMPLETE_SLOTS/);
  });
});

describe("blankOutEmptyBackFaces (render server-side → descarta la copia de trabajo)", () => {
  it("reemplaza SOLO las caras B vacías por el blanco; el resto queda intacto", async () => {
    const a1 = await fakeFace(600, 200, "#FF0000");
    const copiaTrabajo = await fakeFace(600, 200, "#FF0000"); // la B duplicada por canvasForRender
    const a2 = await fakeFace(600, 200, "#00FF00");
    const b2 = await fakeFace(600, 200, "#0000FF"); // B diseñada: NO se toca
    const out = await blankOutEmptyBackFaces([a1, copiaTrabajo, a2, b2], new Set([1]));
    expect(out[0]).toBe(a1);
    expect(out[2]).toBe(a2);
    expect(out[3]).toBe(b2);
    expect(await rgbaAt(out[1]!, 300, 100)).toEqual([255, 255, 255, 255]);
  });

  it("sin caras B vacías → el mismo array (identidad)", async () => {
    const a1 = await fakeFace(600, 200, "#FF0000");
    const buffers = [a1];
    expect(await blankOutEmptyBackFaces(buffers, new Set())).toBe(buffers);
  });
});

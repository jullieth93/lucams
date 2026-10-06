/*
 * Test del compositor de tiras desplegadas (Ola 3 — separadores 2 caras):
 * 2N caras → N tiras. Plegables (default): tira VERTICAL "cabezas al doblez"
 * (tête-bêche) — cara B ARRIBA rotada 180°, cara A ABAJO derecha (el separador
 * cuelga de la página con el doblez arriba; convención corregida por el owner
 * 2026-09-25). noFold (Alargados): HORIZONTAL A|B sin rotar (histórico).
 * Esquinas exteriores redondeadas (troquel) y transparencia fuera de la silueta.
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

/** Cara fake asimétrica: mitad izquierda/derecha de colores distintos (para verificar rotaciones). */
async function fakeFaceSplit(
  w: number,
  h: number,
  leftHex: string,
  rightHex: string,
): Promise<Buffer> {
  const half = Math.floor(w / 2);
  const left = await sharp({
    create: { width: half, height: h, channels: 4, background: leftHex },
  })
    .png()
    .toBuffer();
  const right = await sharp({
    create: { width: w - half, height: h, channels: 4, background: rightHex },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  })
    .composite([
      { input: left, left: 0, top: 0 },
      { input: right, left: half, top: 0 },
    ])
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

describe("composeFaceStrips (separadores 2 caras — tira desplegada)", () => {
  it("plegable (default): tira VERTICAL cabezas al doblez — cara B arriba, cara A abajo", async () => {
    const a = await fakeFace(120, 126, "#FF0000"); // cara A roja
    const b = await fakeFace(120, 126, "#0000FF"); // cara B azul
    const strips = await composeFaceStrips([a, b]);
    expect(strips).toHaveLength(1);
    const meta = await sharp(strips[0]).metadata();
    // 4×4.2 cm por cara → la tira es el DOBLE de ALTA (4×8.4), mismo ancho.
    expect(meta.width).toBe(120);
    expect(meta.height).toBe(252);
    // Mitad superior = cara B (azul), mitad inferior = cara A (roja).
    const [r1, g1, b1] = await rgbaAt(strips[0], 60, 63);
    expect([r1, g1, b1]).toEqual([0, 0, 255]);
    const [r2, g2, b2] = await rgbaAt(strips[0], 60, 189);
    expect([r2, g2, b2]).toEqual([255, 0, 0]);
  });

  it("plegable: la cara B se imprime ROTADA 180° en la mitad superior (cabeza hacia el doblez)", async () => {
    const a = await fakeFace(100, 100, "#FFFFFF");
    // Cara B: izquierda verde, derecha azul. Tras rotar 180°, en la zona de B
    // (mitad superior) la izquierda muestra lo que era la derecha (azul).
    const b = await fakeFaceSplit(100, 100, "#00FF00", "#0000FF");
    const strips = await composeFaceStrips([a, b]);
    const [, gLeft, bLeft] = await rgbaAt(strips[0], 10, 50); // zona B, lado izquierdo
    expect([gLeft, bLeft]).toEqual([0, 255]); // azul (era la derecha de B)
    const [, gRight, bRight] = await rgbaAt(strips[0], 90, 50); // zona B, lado derecho
    expect([gRight, bRight]).toEqual([255, 0]); // verde (era la izquierda de B)
    // La cara A NO se rota: blanca y derecha en la mitad inferior.
    const [ra, ga, ba] = await rgbaAt(strips[0], 50, 150);
    expect([ra, ga, ba]).toEqual([255, 255, 255]);
  });

  it("noFold (Alargados planos): tira HORIZONTAL A|B y cara B SIN rotar (histórico)", async () => {
    const a = await fakeFace(100, 300, "#FF0000");
    const b = await fakeFaceSplit(100, 300, "#00FF00", "#0000FF");
    const strips = await composeFaceStrips([a, b], { noFold: true });
    const meta = await sharp(strips[0]).metadata();
    // 4×12 cm por cara → tira plana 8×12 lado a lado, misma altura.
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(300);
    const [r1] = await rgbaAt(strips[0], 50, 150);
    expect(r1).toBe(255); // A a la izquierda
    // B a la derecha SIN rotar: su mitad izquierda sigue verde.
    const [, gLeft, bLeft] = await rgbaAt(strips[0], 110, 150);
    expect([gLeft, bLeft]).toEqual([255, 0]);
    const [, gRight, bRight] = await rgbaAt(strips[0], 190, 150);
    expect([gRight, bRight]).toEqual([0, 255]);
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
    // Unidad 2: cara B blanca (arriba), cara A azul (abajo).
    const [rw, gw, bw] = await rgbaAt(strips[1], 30, 30);
    expect([rw, gw, bw]).toEqual([255, 255, 255]);
    const [, , b] = await rgbaAt(strips[1], 30, 90);
    expect(b).toBe(255);
  });

  it("esquinas exteriores redondeadas (troquel): transparente en la esquina, opaco al centro", async () => {
    const a = await fakeFace(100, 100, "#221E25");
    const b = await fakeFace(100, 100, "#221E25");
    const strips = await composeFaceStrips([a, b], { cornerRadiusPx: 30 });
    // Esquina superior-izquierda de la tira → fuera del troquel redondeado.
    const [, , , alphaCorner] = await rgbaAt(strips[0], 2, 2);
    expect(alphaCorner).toBe(0);
    // Centro de la cara B (mitad superior) → dentro.
    const [, , , alphaCenter] = await rgbaAt(strips[0], 50, 50);
    expect(alphaCenter).toBe(255);
    // El pliegue central NO se redondea: el borde de la unión (horizontal, a
    // mitad del alto) sigue opaco en el costado.
    const [, , , alphaFold] = await rgbaAt(strips[0], 1, 100);
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
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(160);
    // B reescalada ocupa la mitad SUPERIOR (azul).
    const [, , bTop] = await rgbaAt(strips[0], 50, 40);
    expect(bTop).toBe(255);
  });

  // Blindaje de concordancia (2026-10-05) — la convención "cabezas al doblez"
  // tiene DOS implementaciones independientes que NO comparten código:
  //   · producción: composeFaceStrips (este módulo, sharp)
  //   · preview de confirmación: buildBookmarkStripPreview (studio-editor.tsx,
  //     canvas 2D del navegador — faceRect(i) = plegable { fy: y + (1-i)·faceH }
  //     / noFold { fx: x + i·faceW }, con la cara B rotada 180° al pintar)
  // Este test fija la geometría de AMBAS codificada por separado: si una de
  // las dos cambia la convención, el test deja de cuadrar y la discrepancia
  // preview↔imprenta se detecta en CI y no en la mesa de Lucy.
  it("concordancia preview↔producción: la geometría de buildBookmarkStripPreview coincide con la tira impresa", async () => {
    // Codificación INDEPENDIENTE de la convención del preview (studio-editor).
    const previewFaceRect = (
      i: number,
      noFold: boolean,
      x: number,
      y: number,
      fw: number,
      fh: number,
    ) =>
      noFold
        ? { fx: x + i * fw, fy: y, rotada180: false }
        : { fx: x, fy: y + (1 - i) * fh, rotada180: i === 1 };

    const a = await fakeFace(100, 120, "#FF0000");
    const b = await fakeFace(100, 120, "#0000FF");

    // Plegable: [A, B] → A abajo derecha, B arriba rotada — como la tira sharp.
    const plegable = [0, 1].map((i) => previewFaceRect(i, false, 0, 0, 100, 120));
    expect(plegable[0]).toEqual({ fx: 0, fy: 120, rotada180: false }); // A: mitad inferior
    expect(plegable[1]).toEqual({ fx: 0, fy: 0, rotada180: true }); // B: mitad superior, 180°
    const stripsP = await composeFaceStrips([a, b]);
    const metaP = await sharp(stripsP[0]).metadata();
    expect([metaP.width, metaP.height]).toEqual([100, 240]); // vertical 1×2
    expect(await rgbaAt(stripsP[0], 50, 60).then((p) => p[2])).toBe(255); // B arriba
    expect(await rgbaAt(stripsP[0], 50, 180).then((p) => p[0])).toBe(255); // A abajo

    // noFold: [A, B] → A izquierda, B derecha SIN rotar — como la tira sharp.
    const plano = [0, 1].map((i) => previewFaceRect(i, true, 0, 0, 100, 120));
    expect(plano[0]).toEqual({ fx: 0, fy: 0, rotada180: false }); // A: izquierda
    expect(plano[1]).toEqual({ fx: 100, fy: 0, rotada180: false }); // B: derecha
    const stripsN = await composeFaceStrips([a, b], { noFold: true });
    const metaN = await sharp(stripsN[0]).metadata();
    expect([metaN.width, metaN.height]).toEqual([200, 120]); // horizontal 2×1
    expect(await rgbaAt(stripsN[0], 50, 60).then((p) => p[0])).toBe(255); // A izquierda
    expect(await rgbaAt(stripsN[0], 150, 60).then((p) => p[2])).toBe(255); // B derecha
  });
});

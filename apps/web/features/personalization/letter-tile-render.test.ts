/*
 * Test del render de PRODUCCIÓN por ficha (owner 2026-11-03): un PNG 300 DPI por
 * letra del set, a la medida de corte de la variante, rectangular a sangre (W3 —
 * el redondeo lo hace el troquel). El dibujo lo ejercita de verdad @napi-rs/canvas
 * con las fuentes de marca registradas (WYSIWYG píxel a píxel).
 */

import { describe, expect, it } from "vitest";
import path from "node:path";
import sharp from "sharp";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import {
  parseTileSizeCm,
  renderLetterTileProduction,
} from "./letter-tile-render";

GlobalFonts.registerFromPath(path.join(process.cwd(), "assets", "fonts", "Baloo2.ttf"), "Baloo 2");
GlobalFonts.registerFromPath(path.join(process.cwd(), "assets", "fonts", "Fredoka.ttf"), "Fredoka");

/** RGBA de un pixel del PNG. */
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

/** Dibujo del tema fake: cuadrado rojo sólido. */
function fakeTileArt(px = 200): Buffer {
  const c = createCanvas(px, px);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#FF0000";
  ctx.fillRect(0, 0, px, px);
  return c.toBuffer("image/png");
}

describe("parseTileSizeCm", () => {
  it("acepta × y x, con decimales; rechaza lo inválido", () => {
    expect(parseTileSizeCm("5×7")).toEqual({ wCm: 5, hCm: 7 });
    expect(parseTileSizeCm("4x4.2")).toEqual({ wCm: 4, hCm: 4.2 });
    expect(parseTileSizeCm(" 5×7 ")).toEqual({ wCm: 5, hCm: 7 });
    expect(parseTileSizeCm("grande")).toBeNull();
    expect(parseTileSizeCm(undefined)).toBeNull();
    expect(parseTileSizeCm(5)).toBeNull();
  });
});

describe("renderLetterTileProduction (un PNG por ficha, 300 DPI)", () => {
  it("medida de corte de la VARIANTE a 300 DPI: 5×7 cm → 591×827 px, densidad 300", async () => {
    const png = await renderLetterTileProduction({
      letter: "A",
      color: "#E85B9F",
      withBorder: true,
      tileImage: fakeTileArt(),
      sizeCm: { wCm: 5, hCm: 7 },
    });
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(591);
    expect(meta.height).toBe(827);
    expect(meta.density).toBe(300);
  });

  it("sin sizeCm → aspecto histórico de la ficha (5×6.5)", async () => {
    const png = await renderLetterTileProduction({
      letter: "A",
      color: "#E85B9F",
      withBorder: true,
      tileImage: null,
      sizeCm: null,
    });
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(591);
    expect(meta.height).toBe(768); // 6.5 cm × 118.11 px/cm
  });

  it("W3: esquinas BLANCAS OPACAS (rectangular a sangre — el troquel redondea en el corte)", async () => {
    const png = await renderLetterTileProduction({
      letter: "A",
      color: "#E85B9F",
      withBorder: true,
      tileImage: fakeTileArt(),
      sizeCm: { wCm: 5, hCm: 7 },
    });
    // Esquina superior-izquierda: antes transparente (silueta redondeada), ahora blanco puro.
    expect(await rgbaAt(png, 2, 2)).toEqual([255, 255, 255, 255]);
    // El borde de color sigue dibujado (diseño): trazo centrado en el contorno —
    // a 591 px de ancho el trazo es ~30 px y cubre x ∈ [0, 15] del costado.
    const [r, g, b] = await rgbaAt(png, 7, 413);
    expect(r).toBeGreaterThan(200); // #E85B9F ≈ (232, 91, 159)
    expect(g).toBeLessThan(140);
    expect(b).toBeGreaterThan(120);
    // El dibujo del tema (rojo) queda centrado dentro del marco.
    expect((await rgbaAt(png, 295, 413)).slice(0, 3)).toEqual([255, 0, 0]);
  });

  it("«Solo letra» (sin dibujo del tema): la letra va en el color de la ficha", async () => {
    const png = await renderLetterTileProduction({
      letter: "A",
      color: "#00FF00",
      withBorder: false,
      tileImage: null,
      sizeCm: { wCm: 5, hCm: 7 },
    });
    // Centro de la ficha: el glifo de la letra en verde (no blanco).
    const [, g] = await rgbaAt(png, 295, 400);
    expect(g).toBeGreaterThan(200);
  });

  it("imagen del tema ilegible → RenderNeedsKonvaError (el caller conserva la lámina del cliente)", async () => {
    await expect(
      renderLetterTileProduction({
        letter: "A",
        color: "#E85B9F",
        withBorder: true,
        tileImage: Buffer.from("no-es-una-imagen"),
        sizeCm: null,
      }),
    ).rejects.toMatchObject({ name: "RenderNeedsKonvaError" });
  });
});

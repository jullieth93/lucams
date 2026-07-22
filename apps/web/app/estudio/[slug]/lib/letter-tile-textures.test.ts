/*
 * Tests del helper de texturas de fichas de letras (ola 2B). El dibujo se ejercita de verdad con
 * @napi-rs/canvas (mismo motor que el render de producción) + la fuente de marca registrada,
 * así se valida el WYSIWYG píxel a píxel: silueta transparente afuera, borde de color, cuerpo
 * blanco y glifo de la letra en el color de la ficha.
 */

import { describe, expect, it } from "vitest";
import path from "node:path";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import {
  drawLetterTile,
  LETTER_TILE_RATIO,
  LETTER_TILE_TEX_H,
  LETTER_TILE_TEX_W,
  letterTileMetrics,
} from "./letter-tile-textures";

GlobalFonts.registerFromPath(path.join(process.cwd(), "assets", "fonts", "Fredoka.ttf"), "Fredoka");

type Ctx = CanvasRenderingContext2D;

function makeTile(ch: string, color: string) {
  const canvas = createCanvas(LETTER_TILE_TEX_W, LETTER_TILE_TEX_H);
  const ctx = canvas.getContext("2d") as unknown as Ctx;
  drawLetterTile(ctx, ch, color, null);
  return ctx;
}

function px(ctx: Ctx, x: number, y: number): number[] {
  const c = ctx as unknown as ReturnType<ReturnType<typeof createCanvas>["getContext"]>;
  return Array.from(c.getImageData(x, y, 1, 1).data);
}

describe("letterTileMetrics", () => {
  it("el lienzo respeta el aspecto físico 5:6.5 de la ficha", () => {
    expect(LETTER_TILE_RATIO.w / LETTER_TILE_RATIO.h).toBeCloseTo(5 / 6.5, 6);
    expect(LETTER_TILE_TEX_H).toBe(Math.round((LETTER_TILE_TEX_W * 6.5) / 5));
  });

  it("escala la geometría del tile 120×154 del compositor (radio 18, borde 6, inset 4)", () => {
    const m = letterTileMetrics(300, 390);
    expect(m.radius).toBeCloseTo(45, 6);
    expect(m.borderWidth).toBeCloseTo(15, 6);
    expect(m.inset).toBeCloseTo(10, 6);
    expect(m.fontPx).toBe(150);
  });
});

describe("drawLetterTile (con @napi-rs/canvas)", () => {
  const COLOR = "#E85B9F"; // (232, 91, 159)

  it("deja transparente fuera de la silueta redondeada (el troquel 3D la respeta)", () => {
    const ctx = makeTile("A", COLOR);
    const corner = px(ctx, 3, 3);
    expect(corner[3]).toBe(0);
  });

  it("pinta el borde del color de la ficha", () => {
    const ctx = makeTile("A", COLOR);
    const [r, g, b, a] = px(ctx, LETTER_TILE_TEX_W / 2, 4);
    expect(a).toBe(255);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(140);
    expect(b).toBeGreaterThan(120);
  });

  it("el cuerpo de la ficha es blanco", () => {
    const ctx = makeTile("A", COLOR);
    expect(px(ctx, 40, 60)).toEqual([255, 255, 255, 255]);
  });

  it("dibuja el glifo de la letra en el color de la ficha (zona central, sin contar el borde)", () => {
    const ctx = makeTile("A", COLOR);
    const c = ctx as unknown as ReturnType<ReturnType<typeof createCanvas>["getContext"]>;
    // Zona central de la ficha (fuera del alcance del borde): el glifo debe aportar muchos
    // píxeles del color de la ficha.
    let colored = 0;
    const data = c.getImageData(100, 140, 100, 120).data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i]! > 200 && data[i + 1]! < 140 && data[i + 2]! > 120 && data[i + 3]! > 200) {
        colored++;
      }
    }
    expect(colored).toBeGreaterThan(200);
  });
});

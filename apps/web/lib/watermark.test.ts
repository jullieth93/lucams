/*
 * lib/watermark (2026-10-13) — baldosa SVG del tiling "LUCAMS" y aplicación con
 * sharp. El mismo tiling lo usa la galería de prediseñados (generateGalleryThumb
 * en lib/storage.ts) y los artefactos watermark de previews de diseños.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import sharp from "sharp";
import { applyTiledWatermark, buildWatermarkTileSvg } from "./watermark";

async function tinyPng(w = 64, h = 64): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 30, b: 90 } } })
    .png()
    .toBuffer();
}

describe("buildWatermarkTileSvg", () => {
  it("baldosa con el texto LUCAMS rotado -24° y viewBox fijo 380×230", () => {
    const svg = buildWatermarkTileSvg(380, 230);
    expect(svg).toContain("LUCAMS");
    expect(svg).toContain('viewBox="0 0 380 230"');
    expect(svg).toContain("rotate(-24 190 115)");
    expect(svg).toContain('width="380"');
    expect(svg).toContain('height="230"');
  });
});

describe("applyTiledWatermark", () => {
  it("devuelve WebP del mismo tamaño cuando no hay maxEdgePx", async () => {
    const out = await applyTiledWatermark(await tinyPng(64, 48));
    expect(out.width).toBe(64);
    expect(out.height).toBe(48);
    const meta = await sharp(out.data).metadata();
    expect(meta.format).toBe("webp");
    // El tiling altera píxeles: la salida no puede ser idéntica al recodeo limpio.
    const clean = await sharp(await tinyPng(64, 48)).webp({ quality: 78 }).toBuffer();
    expect(out.data.equals(clean)).toBe(false);
  });

  it("con maxEdgePx capa el borde largo sin agrandar", async () => {
    const small = await applyTiledWatermark(await tinyPng(32, 32), { maxEdgePx: 800 });
    expect(small.width).toBe(32); // withoutEnlargement

    const big = await applyTiledWatermark(await tinyPng(1600, 800), { maxEdgePx: 800 });
    expect(big.width).toBe(800);
    expect(big.height).toBe(400);
  });

  it("rechaza buffers que no son imagen", async () => {
    await expect(applyTiledWatermark(Buffer.from("no-soy-imagen"))).rejects.toThrow();
  });
});

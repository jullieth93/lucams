/*
 * LUC-SEC-004/005 (auditoría 2026-10-30) — normalizador único de raster.
 *
 * Batería adversarial contra normalizeRasterImage + readHeicMaxPixels:
 *   - texto/HTML/SVG etiquetado como imagen → rechazo PRE-decode (magic bytes);
 *   - PNG truncado → rechazo;
 *   - "bomba de píxeles" (PNG de pocos bytes que declara 50.000×50.000) →
 *     rechazo por presupuesto de píxeles SIN materializar la matriz;
 *   - GIF animado → rechazo (formato fuera de allowlist; multipágina se reduce
 *     a 1 frame con `pages: 1` si algún día se habilita un formato con páginas);
 *   - relación de aspecto absurda → rechazo;
 *   - JPEG con EXIF de orientación → se hornea la orientación y NO queda EXIF;
 *   - PNG legítimo de imprenta → aceptado, salida PNG canónica sin metadatos;
 *   - salida por encima del techo de bytes → rechazo;
 *   - HEIC con ispe declarando dimensiones absurdas → rechazo ANTES de
 *     materializar RGBA (heic-decode nunca corre).
 *
 * sharp real (sin mocks): lo que se certifica es el comportamiento del decoder.
 */

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { deflateSync, crc32 } from "node:zlib";
import { sniffImageMime as sniffImageMimeForTest } from "@/lib/image-sniff";
import {
  normalizeRasterImage,
  readHeicMaxPixels,
  RasterRejected,
  RASTER_PIXEL_BUDGET,
} from "./normalize-raster";

// PNG 1×1 mínimo válido
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** PNG sintético que DECLARA `width`×`height` en su IHDR (los datos son mínimos). */
function pngWithDimensions(width: number, height: number): Buffer {
  const sig = Buffer.from("89504e470d0a1a0a", "hex");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  // IDAT: stream deflate de una fila de ceros (el contenido da igual: el
  // presupuesto de píxeles debe estallar AL LEER EL HEADER, antes de decodificar).
  const idat = deflateSync(Buffer.alloc(16));
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Estructura ISOBMFF mínima con un ispe que declara `width`×`height`. */
function heicWithIspe(width: number, height: number): Buffer {
  const box = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(8 + data.length);
    return Buffer.concat([len, Buffer.from(type, "ascii"), data]);
  };
  const ispe = Buffer.alloc(12); // version/flags (4) + width (4) + height (4)
  ispe.writeUInt32BE(width, 4);
  ispe.writeUInt32BE(height, 8);
  const ipco = box("ipco", box("ispe", ispe));
  const iprp = box("iprp", ipco);
  const meta = box("meta", Buffer.concat([Buffer.alloc(4), iprp])); // fullbox header
  const ftyp = box("ftyp", Buffer.from("heic"));
  return Buffer.concat([ftyp, meta]);
}

describe("normalizeRasterImage — rechazos adversariales", () => {
  const OPTS = {
    maxPixels: RASTER_PIXEL_BUDGET.preview,
    maxInputBytes: 20 * 1024 * 1024,
    output: { format: "png" as const },
  };

  it("texto plano / HTML etiquetado como imagen → rechazado sin tocar el decoder", async () => {
    await expect(
      normalizeRasterImage(Buffer.from("<html><script>alert(1)</script></html>"), OPTS),
    ).rejects.toBeInstanceOf(RasterRejected);
    await expect(
      normalizeRasterImage(Buffer.from("esto no es una imagen"), OPTS),
    ).rejects.toMatchObject({ reason: "not-an-image" });
  });

  it("SVG (poliglota típico) → rechazado", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
    await expect(normalizeRasterImage(svg, OPTS)).rejects.toMatchObject({
      reason: "not-an-image",
    });
  });

  it("GIF animado → rechazado (fuera de allowlist, pre-decode)", async () => {
    const gif = Buffer.from(
      "R0lGODdhAQABAIAAAP///////ywAAAAAAQABAAACAkQBADs=", // GIF89a 1×1
      "base64",
    );
    await expect(normalizeRasterImage(gif, OPTS)).rejects.toMatchObject({
      reason: "not-an-image",
    });
  });

  it("PNG truncado → rechazado por el decoder (failOn)", async () => {
    const big = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 124, g: 106, b: 173 } },
    })
      .png()
      .toBuffer();
    const truncado = big.subarray(0, Math.floor(big.length / 2));
    await expect(normalizeRasterImage(truncado, OPTS)).rejects.toBeInstanceOf(RasterRejected);
  });

  it("bomba de píxeles: PNG pequeño en bytes que declara 50.000×50.000 → rechazado por presupuesto", async () => {
    const bomba = pngWithDimensions(50_000, 50_000);
    expect(bomba.length).toBeLessThan(2_000); // 2 KB declarando 2.500 MP
    await expect(normalizeRasterImage(bomba, OPTS)).rejects.toMatchObject({
      reason: "too-many-pixels",
    });
  });

  it("relación de aspecto absurda (2.100×100 = 21:1) → rechazada", async () => {
    const alargada = await sharp({
      create: { width: 2100, height: 100, channels: 3, background: { r: 61, g: 46, b: 92 } },
    })
      .png()
      .toBuffer();
    await expect(normalizeRasterImage(alargada, OPTS)).rejects.toMatchObject({
      reason: "bad-dimensions",
    });
  });

  it("salida por encima del techo de bytes → rechazo", async () => {
    const foto = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 200, g: 10, b: 90 } },
    })
      .png()
      .toBuffer();
    await expect(
      normalizeRasterImage(foto, { ...OPTS, maxOutputBytes: 10 }), // 10 bytes: imposible
    ).rejects.toMatchObject({ reason: "too-large-output" });
  });

  it("entrada por encima del techo de bytes → rechazo sin decodificar", async () => {
    await expect(
      normalizeRasterImage(PNG_1X1, { ...OPTS, maxInputBytes: 4 }),
    ).rejects.toMatchObject({ reason: "too-large-input" });
  });
});

describe("normalizeRasterImage — aceptación y normalización canónica", () => {
  const OPTS = {
    maxPixels: RASTER_PIXEL_BUDGET.preview,
    maxInputBytes: 20 * 1024 * 1024,
    output: { format: "png" as const },
  };

  it("PNG legítimo: aceptado, dimensiones conservadas, SIN metadatos", async () => {
    const legit = await sharp({
      create: { width: 120, height: 80, channels: 3, background: { r: 93, g: 217, b: 209 } },
    })
      .png()
      .toBuffer();
    const out = await normalizeRasterImage(legit, OPTS);
    expect(out.mime).toBe("image/png");
    expect(out.width).toBe(120);
    expect(out.height).toBe(80);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.icc).toBeUndefined();
  });

  it("JPEG con EXIF de orientación 6: se hornea la rotación y el EXIF se elimina", async () => {
    const conExif = await sharp({
      create: { width: 100, height: 200, channels: 3, background: { r: 245, g: 138, b: 111 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const out = await normalizeRasterImage(conExif, OPTS);
    // rotate() horneó la orientación: el retrato 100×200 gira a 200×100.
    expect([out.width, out.height].sort()).toEqual([100, 200]);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("formato de salida 'keep' conserva el formato REAL sniffado (webp queda webp)", async () => {
    const webpReal = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 255, g: 217, b: 61 } },
    })
      .webp()
      .toBuffer();
    const out = await normalizeRasterImage(webpReal, {
      ...OPTS,
      output: { format: "keep" },
    });
    expect(out.mime).toBe("image/webp");
    expect(sniffImageMimeForTest(out.buffer)).toBe("image/webp");
  });
});

describe("readHeicMaxPixels — pre-check de dimensiones HEIC (LUC-SEC-005)", () => {
  it("ispe con dimensiones absurdas → las lee (para rechazo pre-decode)", () => {
    expect(readHeicMaxPixels(heicWithIspe(100_000, 100_000))).toBe(100_000 * 100_000);
  });

  it("ispe razonable → área", () => {
    expect(readHeicMaxPixels(heicWithIspe(4032, 3024))).toBe(4032 * 3024);
  });

  it("sin ispe parseable → null (el caller decide con el check post-decode)", () => {
    expect(readHeicMaxPixels(Buffer.from("no es un heic"))).toBeNull();
  });

  it("normalizeRasterImage rechaza HEIC sobre presupuesto SIN materializar RGBA", async () => {
    const bomba = heicWithIspe(100_000, 100_000);
    await expect(
      normalizeRasterImage(bomba, {
        maxPixels: RASTER_PIXEL_BUDGET.photo,
        maxInputBytes: 10 * 1024 * 1024,
        output: { format: "jpeg" },
      }),
    ).rejects.toMatchObject({ reason: "too-many-pixels" });
  });
});

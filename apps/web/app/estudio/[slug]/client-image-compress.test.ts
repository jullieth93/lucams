/*
 * Test de la lógica de decisión del compresor cliente del Estudio
 * (client-image-compress.ts). La compresión en sí usa canvas/createImageBitmap
 * (no disponible en jsdom) — acá se congela la decisión, que es la parte que
 * puede romperse por una condición mal escrita.
 */

import { describe, expect, it } from "vitest";
import { COMPRESS_THRESHOLD_BYTES, shouldCompress } from "./client-image-compress";

describe("shouldCompress — decisión del compresor del Estudio", () => {
  const MB = 1024 * 1024;

  it("comprime JPEG sobre el umbral (~4 MB)", () => {
    expect(shouldCompress({ type: "image/jpeg", size: COMPRESS_THRESHOLD_BYTES + 1 })).toBe(true);
    expect(shouldCompress({ type: "image/jpeg", size: 8 * MB })).toBe(true);
  });

  it("comprime PNG y WebP sobre el umbral", () => {
    expect(shouldCompress({ type: "image/png", size: 6 * MB })).toBe(true);
    expect(shouldCompress({ type: "image/webp", size: 5 * MB })).toBe(true);
  });

  it("NO comprime bajo el umbral (incluido el borde exacto)", () => {
    expect(shouldCompress({ type: "image/jpeg", size: COMPRESS_THRESHOLD_BYTES })).toBe(false);
    expect(shouldCompress({ type: "image/png", size: 900 * 1024 })).toBe(false);
  });

  it("HEIC/HEIF pasa intacto aunque pese más (lo decodifica el servidor)", () => {
    expect(shouldCompress({ type: "image/heic", size: 9 * MB })).toBe(false);
    expect(shouldCompress({ type: "image/heif", size: 9 * MB })).toBe(false);
  });

  it("cualquier otro tipo no se comprime", () => {
    expect(shouldCompress({ type: "image/gif", size: 9 * MB })).toBe(false);
    expect(shouldCompress({ type: "application/pdf", size: 9 * MB })).toBe(false);
  });
});

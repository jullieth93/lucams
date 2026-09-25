/*
 * Tests unitarios de smart-crop.ts — el wrapper analyzeSmartCrop (rama feliz,
 * sin topCrop, excepción tolerada) y checkPhotoQuality (sin tamaño, sin match,
 * ok/warn/error por ratio de resolución a 300 DPI).
 *
 * smartcrop.js se mockea (necesita canvas real); el resto es puro. Corre en CI
 * sin Supabase.
 */

import { describe, expect, it, vi } from "vitest";

const smartcrop = vi.hoisted(() => ({ crop: vi.fn() }));
vi.mock("smartcrop", () => ({ default: smartcrop }));

import { analyzeSmartCrop, checkPhotoQuality } from "./smart-crop";

const IMAGE = { naturalWidth: 1000, naturalHeight: 800 } as unknown as HTMLImageElement;

describe("analyzeSmartCrop", () => {
  it("centra el topCrop: offset = (centro imagen − centro crop) × finalScale", async () => {
    smartcrop.crop.mockResolvedValue({ topCrop: { x: 400, y: 300, width: 200, height: 200 } });
    // cropCenter = (500, 400); imageCenter = (500, 400) → dx=0, dy=0
    const centered = await analyzeSmartCrop(IMAGE, 200, 200, 2);
    expect(centered).toEqual({ offsetX: 0, offsetY: 0 });

    smartcrop.crop.mockResolvedValue({ topCrop: { x: 600, y: 300, width: 200, height: 200 } });
    // cropCenter = (700, 400); dx = 500 − 700 = −200; dy = 0; × scale 2
    const off = await analyzeSmartCrop(IMAGE, 200, 200, 2);
    expect(off).toEqual({ offsetX: -400, offsetY: 0 });
  });

  it("sin topCrop → null (no rompe, queda el cover centrado)", async () => {
    smartcrop.crop.mockResolvedValue({ topCrop: null });
    expect(await analyzeSmartCrop(IMAGE, 200, 200, 1)).toBeNull();
  });

  it("smartcrop lanza (imagen chica/CORS) → null tolerado", async () => {
    smartcrop.crop.mockRejectedValue(new Error("no se pudo muestrear"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await analyzeSmartCrop(IMAGE, 200, 200, 1)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("checkPhotoQuality — resolución mínima de imprenta (300 DPI)", () => {
  const img = (w: number, h: number) =>
    ({ naturalWidth: w, naturalHeight: h }) as unknown as HTMLImageElement;

  it("sin sizeCm → ok por default (no hay contra qué medir)", () => {
    expect(checkPhotoQuality(img(10, 10), undefined)).toEqual({ ok: true });
  });

  it("sizeCm no parseable → ok (no bloquea por dato corrupto)", () => {
    expect(checkPhotoQuality(img(10, 10), "grande")).toEqual({ ok: true });
  });

  it("resolución suficiente → ok", () => {
    // 6 cm × 118 px/cm = 708 px requeridos; 1000px sobra.
    expect(checkPhotoQuality(img(1000, 800), "6×6").ok).toBe(true);
  });

  it("50–100% del requerido → warn con los px requeridos/reales", () => {
    // 12 cm → 1416 px; 1000px ≈ 70% → warn.
    const r = checkPhotoQuality(img(1000, 800), "12×12");
    expect(r.ok).toBe(false);
    expect(r.severity).toBe("warn");
    expect(r.requiredPx).toEqual({ w: 1416, h: 1416 });
    expect(r.actualPx).toEqual({ w: 1000, h: 800 });
  });

  it("< 50% del requerido → error (pixelado al imprimir)", () => {
    // 30 cm → 3540 px; 1000px ≈ 28% → error.
    const r = checkPhotoQuality(img(1000, 800), "30×30");
    expect(r.ok).toBe(false);
    expect(r.severity).toBe("error");
  });

  it("mide por el lado MENOR de la foto", () => {
    // 10 cm → 1180 px requeridos; lado menor 700 → < 60% → warn.
    expect(checkPhotoQuality(img(4000, 700), "10×10").severity).toBe("warn");
  });

  // 2026-09-24 — auditoría honestidad (frente B): tras upscale local el archivo
  // subido tiene MÁS píxeles, pero el re-muestreo no crea detalle. El aviso se
  // calcula sobre la foto ORIGINAL (originalDims), no sobre el archivo mejorado.
  it("con originalDims (hubo upscale): mide la ORIGINAL, no el archivo re-muestreado", () => {
    // Foto original 400×300 subida a 6×6 cm (708px requeridos): tras upscale ×2
    // el archivo queda 800×600 (ratio ≥1, verde falso) — con originalDims la
    // advertencia persiste (ratio ~0.42 → error) y muestra los px originales.
    const r = checkPhotoQuality(img(800, 600), "6×6", { width: 400, height: 300 });
    expect(r.ok).toBe(false);
    expect(r.severity).toBe("error");
    expect(r.actualPx).toEqual({ w: 400, h: 300 });
  });

  it("con originalDims suficientes → ok (foto original buena, upscale no aplicó)", () => {
    expect(checkPhotoQuality(img(1000, 800), "6×6", { width: 1000, height: 800 }).ok).toBe(true);
  });
});

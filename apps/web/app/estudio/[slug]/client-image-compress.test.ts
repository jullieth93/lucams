/*
 * Test de la lógica de decisión del compresor cliente del Estudio
 * (client-image-compress.ts). La compresión en sí usa canvas/createImageBitmap
 * (no disponible en jsdom) — acá se congela la decisión, que es la parte que
 * puede romperse por una condición mal escrita.
 */

import { describe, expect, it } from "vitest";
import {
  COMPRESS_THRESHOLD_BYTES,
  computeShrinkAttempts,
  SHRINK_MIN_EDGE_FLOOR_PX,
  shouldCompress,
  UPLOAD_PAYLOAD_BUDGET_BYTES,
} from "./client-image-compress";

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

// ─────────────────────────────────────────────────────────────────────────────
// Reducción OBLIGATORIA al presupuesto del payload (robustez 2026-10-13).
// computeShrinkAttempts es PURA (testeable sin canvas); el ejecutor canvas
// (shrinkToFitUploadBudget) corre los intentos en orden hasta caber en
// UPLOAD_PAYLOAD_BUDGET_BYTES o devuelve null (fail-closed).
// ─────────────────────────────────────────────────────────────────────────────

describe("UPLOAD_PAYLOAD_BUDGET_BYTES — presupuesto del payload", () => {
  it("queda holgado bajo el techo de plataforma (~4.5 MB de Vercel)", () => {
    expect(UPLOAD_PAYLOAD_BUDGET_BYTES).toBe(4 * 1024 * 1024);
    expect(UPLOAD_PAYLOAD_BUDGET_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });
});

describe("computeShrinkAttempts — escalera progresiva con piso de impresión", () => {
  it("empieza por calidad a tamaño completo (2400px q0.85) y luego baja el borde", () => {
    const attempts = computeShrinkAttempts({ width: 6000, height: 4000 });
    expect(attempts[0]).toEqual({ maxEdgePx: 2400, quality: 0.85 });
    // Calidad descendente dentro del primer borde…
    expect(attempts[1]).toEqual({ maxEdgePx: 2400, quality: 0.75 });
    // …y los bordes largos también descienden (aspect conservado).
    const edges = [...new Set(attempts.map((a) => a.maxEdgePx))];
    expect(edges).toEqual([...edges].sort((a, b) => b - a));
    expect(edges[0]).toBe(2400);
    expect(edges.length).toBeGreaterThan(1);
  });

  it("sin contexto de producto, ningún intento baja el lado menor del piso default (1024px)", () => {
    // 6000×4000: borde 2400 → menor 1600 ✓; 1536 → menor 1024 ✓ (borde exacto);
    // 1200 → menor 800 ✗ (queda fuera de la escalera).
    const attempts = computeShrinkAttempts({ width: 6000, height: 4000 });
    expect(attempts.length).toBeGreaterThan(0);
    for (const a of attempts) {
      const resultMinEdge = Math.round(4000 * Math.min(1, a.maxEdgePx / 6000));
      expect(resultMinEdge).toBeGreaterThanOrEqual(SHRINK_MIN_EDGE_FLOOR_PX);
    }
    const edges = [...new Set(attempts.map((a) => a.maxEdgePx))];
    expect(edges).toEqual([2400, 1920, 1536]);
  });

  it("con sizeCm el piso son los px de 300 DPI: nunca baja el lado menor de ese mínimo", () => {
    // Producto 5×5 cm → requiredPx = ceil(5 × 118.11) = 591. Foto 3000×2000:
    // todos los bordes dejan el menor ≥ 591, así que la escalera es completa.
    const floorPx = 591;
    const attempts = computeShrinkAttempts({
      width: 3000,
      height: 2000,
      minEdgeFloorPx: floorPx,
    });
    expect(attempts.length).toBeGreaterThan(0);
    for (const a of attempts) {
      const resultMinEdge = Math.round(2000 * Math.min(1, a.maxEdgePx / 3000));
      expect(resultMinEdge).toBeGreaterThanOrEqual(floorPx);
    }
  });

  it("producto grande y foto chica: el piso se topea al lado menor ACTUAL (permite bajar calidad)", () => {
    // Producto 20×20 cm → requiredPx ≈ 2362, pero la foto ya viene 2400×1200
    // (minEdge 1200 < 2362): el piso se topea a 1200, así que quedan intentos
    // a 2400px con calidad descendente (bajar resolución sí queda prohibido).
    const attempts = computeShrinkAttempts({ width: 2400, height: 1200, minEdgeFloorPx: 2362 });
    expect(attempts.length).toBeGreaterThan(0);
    expect([...new Set(attempts.map((a) => a.maxEdgePx))]).toEqual([2400]);
    expect(attempts[0]!.quality).toBe(0.85);
    expect(attempts.at(-1)!.quality).toBe(0.55);
  });

  it("si NI el tamaño actual cumple el piso… no — el piso se topea, siempre hay intentos salvo degenerados", () => {
    // Caso degenerado real: imagen de 1×1 con piso enorme → floor = min(floor, 1) = 1,
    // intento a 1px. Nunca devuelve escalera vacía para dimensiones válidas.
    const attempts = computeShrinkAttempts({ width: 1, height: 1, minEdgeFloorPx: 9999 });
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts[0]!.maxEdgePx).toBe(1);
  });
});

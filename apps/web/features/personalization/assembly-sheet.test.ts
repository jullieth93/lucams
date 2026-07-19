/*
 * assembly-sheet — hoja de armado (armado.png del ZIP de producción). Salida FÍSICA sin cobertura
 * (audit v3 · #14). Unit test con @napi-rs/canvas (sin Storage/GoTrue → corre en el gate por-PR).
 *
 * Verifica la geometría de la grilla (dimensiones deterministas por nº de piezas) y el mapeo de
 * estado de moderación (STATUS_META), que es lo que evita imprimir un diseño SIN aprobar.
 */

import { describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { composeAssemblySheet, STATUS_META, type AssemblyPiece } from "./assembly-sheet";

/** PNG sintético de w×h (mismo helper que production-render-canvas.test.ts). */
function fakePhoto(w: number, h: number): Buffer {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#7C6AAD";
  ctx.fillRect(0, 0, w, h);
  return c.toBuffer("image/png");
}

function piece(over: Partial<AssemblyPiece> = {}): AssemblyPiece {
  return {
    label: over.label ?? "Pieza 1",
    moderationStatus: over.moderationStatus ?? "APPROVED",
    productName: over.productName ?? "Fotoimanes",
    png: over.png ?? fakePhoto(400, 400),
  };
}

// Geometría replicada del módulo (constantes internas): W=1240, grid 3 cols.
const W = 1240;
const PAD = 44;
const COLS = 3;
const GAP = 28;
const HEADER_H = 150;
const FOOTER_H = 96;
const LABEL_H = 64;
const cellW = Math.floor((W - PAD * 2 - GAP * (COLS - 1)) / COLS); // 365
const cellH = cellW + LABEL_H; // 429
const expectedH = (n: number) => {
  const rows = Math.max(1, Math.ceil(n / COLS));
  return HEADER_H + rows * cellH + (rows - 1) * GAP + FOOTER_H;
};

describe("composeAssemblySheet — geometría", () => {
  it("1 pieza: 1240×675 (1 fila)", async () => {
    const png = await composeAssemblySheet({
      orderNumber: "LCM-2026-0001",
      createdAtLabel: "1 ene 2026",
      pieces: [piece()],
    });
    const img = await loadImage(png);
    expect(img.width).toBe(W);
    expect(img.height).toBe(expectedH(1)); // 675
  });

  it("4 piezas: 2 filas (altura crece con ceil(n/3))", async () => {
    const png = await composeAssemblySheet({
      orderNumber: "LCM-2026-0002",
      createdAtLabel: "2 ene 2026",
      pieces: [piece(), piece(), piece(), piece()],
    });
    const img = await loadImage(png);
    expect(img.width).toBe(W);
    expect(img.height).toBe(expectedH(4)); // 1132
    expect(img.height).toBeGreaterThan(expectedH(1)); // más piezas → más alto
  });

  it("una pieza con PNG inválido no rompe la hoja (se dibuja el marco vacío)", async () => {
    const png = await composeAssemblySheet({
      orderNumber: "LCM-2026-0003",
      createdAtLabel: "3 ene 2026",
      pieces: [piece({ png: Buffer.from("no soy un png") })],
    });
    const img = await loadImage(png);
    expect(img.width).toBe(W);
    expect(img.height).toBe(expectedH(1));
  });
});

describe("STATUS_META — mapeo de estado de moderación (#14)", () => {
  it("APPROVED / PENDING / REJECTED tienen texto y color propios", () => {
    expect(STATUS_META.APPROVED.text).toBe("aprobado");
    expect(STATUS_META.PENDING.text).toMatch(/SIN APROBAR/);
    expect(STATUS_META.REJECTED.text).toMatch(/no imprimir/i);
    // Colores distintos por estado (verde/ámbar/rojo) — señal visual para no imprimir sin aprobar.
    const colors = new Set([
      STATUS_META.APPROVED.color,
      STATUS_META.PENDING.color,
      STATUS_META.REJECTED.color,
    ]);
    expect(colors.size).toBe(3);
  });
});

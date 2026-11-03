/*
 * Test del patrón de marca «Lucams» para la cara B por defecto de separadores
 * (decisión owner 2026-11-03): wordmark script tileado en diagonal sobre
 * blanco. Módulo PURO — se prueba con un ctx 2D de juguete que graba calls.
 */

import { describe, expect, it } from "vitest";
import {
  BRAND_BACK_FILL,
  BRAND_BACK_ROTATION_DEG,
  BRAND_BACK_TEXT,
  brandBackMetrics,
  drawBrandBackFace,
  type BrandPatternContext2D,
} from "./brand-back-pattern";

type Call =
  | { op: "fillRect"; x: number; y: number; w: number; h: number; fill: unknown }
  | { op: "fillText"; text: string; x: number; y: number; font: string; fill: unknown; rot: number };

function recordingCtx(): { ctx: BrandPatternContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const state = { fill: "#000000" as unknown, font: "", rot: 0, tx: 0, ty: 0 };
  const stack: { rot: number; tx: number; ty: number }[] = [];
  const ctx: BrandPatternContext2D = {
    get fillStyle() {
      return state.fill;
    },
    set fillStyle(v: unknown) {
      state.fill = v;
    },
    get font() {
      return state.font;
    },
    set font(v: string) {
      state.font = v;
    },
    textAlign: "start",
    textBaseline: "alphabetic",
    save() {
      stack.push({ rot: state.rot, tx: state.tx, ty: state.ty });
    },
    restore() {
      const prev = stack.pop();
      if (prev) Object.assign(state, prev);
    },
    translate(x: number, y: number) {
      state.tx += x;
      state.ty += y;
    },
    rotate(a: number) {
      state.rot = a;
    },
    fillRect(x, y, w, h) {
      calls.push({ op: "fillRect", x: state.tx + x, y: state.ty + y, w, h, fill: state.fill });
    },
    fillText(text, x, y) {
      calls.push({
        op: "fillText",
        text,
        x: state.tx + x,
        y: state.ty + y,
        font: state.font,
        fill: state.fill,
        rot: state.rot,
      });
    },
  };
  return { ctx, calls };
}

describe("drawBrandBackFace (patrón de marca de la cara B, owner 2026-11-03)", () => {
  it("pinta el fondo blanco a todo el lienzo y wordmarks «Lucams» en gris-lila", () => {
    const { ctx, calls } = recordingCtx();
    drawBrandBackFace(ctx, 600, 900, "Dancing Script");
    const bg = calls.find((c) => c.op === "fillRect");
    expect(bg).toEqual({ op: "fillRect", x: 0, y: 0, w: 600, h: 900, fill: "#FFFFFF" });
    const texts = calls.filter((c) => c.op === "fillText");
    expect(texts.length).toBeGreaterThan(8); // grilla con margen de cobertura
    for (const t of texts) {
      expect(t.op === "fillText" && t.text).toBe(BRAND_BACK_TEXT);
      expect(t.op === "fillText" && t.fill).toBe(BRAND_BACK_FILL);
      expect(t.op === "fillText" && t.rot).toBeCloseTo((BRAND_BACK_ROTATION_DEG * Math.PI) / 180);
      expect(t.op === "fillText" && t.font).toContain("Dancing Script");
    }
  });

  it("la grilla cubre los 4 bordes (margen anti-huecos por la rotación)", () => {
    const { ctx, calls } = recordingCtx();
    const W = 300;
    const H = 900;
    drawBrandBackFace(ctx, W, H);
    const texts = calls.filter((c): c is Extract<Call, { op: "fillText" }> => c.op === "fillText");
    expect(texts.some((t) => t.x < 0)).toBe(true);
    expect(texts.some((t) => t.x > W)).toBe(true);
    expect(texts.some((t) => t.y < 0)).toBe(true);
    expect(texts.some((t) => t.y > H)).toBe(true);
  });

  it("filas en ladrillo: filas alternas desplazadas medio paso horizontal", () => {
    const { ctx, calls } = recordingCtx();
    const W = 400;
    drawBrandBackFace(ctx, W, 800);
    const { dx } = brandBackMetrics(W);
    const texts = calls.filter((c): c is Extract<Call, { op: "fillText" }> => c.op === "fillText");
    const xsByRow = new Map<number, number[]>();
    for (const t of texts) {
      const list = xsByRow.get(t.y) ?? [];
      list.push(t.x);
      xsByRow.set(t.y, list);
    }
    const rows = [...xsByRow.values()];
    expect(rows.length).toBeGreaterThan(2);
    // Fila 0 arranca en -margin; fila 1 en -margin + dx/2.
    expect(Math.abs(rows[0]![0]! - (rows[1]![0]! - dx / 2))).toBeLessThan(0.001);
  });

  it("las métricas escalan con el ancho de la cara (WYSIWYG preview ↔ producción)", () => {
    const small = brandBackMetrics(236); // separador 2×6 a 300 DPI
    const big = brandBackMetrics(472); // 4 cm a 300 DPI
    expect(big.fontPx).toBeGreaterThan(small.fontPx);
    expect(big.dx).toBeGreaterThan(small.dx);
    expect(big.dy).toBeGreaterThan(small.dy);
    expect(small.fontPx).toBeGreaterThanOrEqual(10); // piso anti-alias en miniaturas
  });
});

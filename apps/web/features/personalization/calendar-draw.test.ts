/*
 * #2 (auditoría v3 · Tanda 4) — drawCalendarPage debe forzar el eje `wght` de las fuentes VARIABLES
 * de marca (Fredoka/Inter) vía fontVariationSettings, porque @napi-rs/canvas ignora el peso del
 * font-string en fuentes variables y usaría la instancia default (Fredoka=300, Inter=400) → el texto
 * impreso divergiría del bold que ve el cliente. Testeamos NUESTRA lógica (setBrandFont) con un ctx
 * de mock que registra las escrituras a fontVariationSettings; la fidelidad real se verifica visual.
 */

import { describe, it, expect } from "vitest";
import { drawCalendarPage, type CalendarDrawCtx } from "./calendar-draw";

/** ctx de mock que satisface CalendarDrawCtx y registra las escrituras a fontVariationSettings. */
function makeRecordingCtx(supportsVarSettings: boolean): {
  ctx: CalendarDrawCtx;
  fontVarWrites: string[];
} {
  const fontVarWrites: string[] = [];
  const base: CalendarDrawCtx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    fillRect() {},
    strokeRect() {},
    fillText() {},
    drawImage() {},
  };
  if (supportsVarSettings) {
    let v = "";
    Object.defineProperty(base, "fontVariationSettings", {
      get: () => v,
      set: (next: string) => {
        v = next;
        fontVarWrites.push(next);
      },
      enumerable: true,
      configurable: true,
    });
  }
  return { ctx: base, fontVarWrites };
}

const opts = { photo: null, year: 2027, monthIndex0: 0 } as const;

describe("drawCalendarPage — eje de peso de fuentes variables (#2)", () => {
  it("fija 'wght' 700 (título/encabezados) y 'wght' 400 (días) cuando hay fuentes de marca", () => {
    const { ctx, fontVarWrites } = makeRecordingCtx(true);
    drawCalendarPage(ctx, { ...opts, fontsOk: true });
    expect(fontVarWrites).toContain("'wght' 700");
    expect(fontVarWrites).toContain("'wght' 400");
  });

  it("NO fija el eje cuando fontsOk=false (fallback sans-serif, no variable)", () => {
    const { ctx, fontVarWrites } = makeRecordingCtx(true);
    drawCalendarPage(ctx, { ...opts, fontsOk: false });
    expect(fontVarWrites).toHaveLength(0);
  });

  it("no rompe si el ctx no soporta fontVariationSettings (navegador sin la propiedad)", () => {
    const { ctx } = makeRecordingCtx(false);
    expect(() => drawCalendarPage(ctx, { ...opts, fontsOk: true })).not.toThrow();
  });
});

// Ola 4 (Lucy 2026-07-23) — el preview del Estudio dibuja la tarjeta con las familias REALES
// de next/font (nombres hasheados resueltos via CSS vars), no con los literales "Fredoka"/"Inter"
// que en el navegador no existen (caían a una genérica). El parámetro `fonts` las inyecta.
describe("drawCalendarPage — familias inyectadas por el caller (Ola 4)", () => {
  it("usa las familias explícitas (title/body) en los font-strings", () => {
    const fontsSeen: string[] = [];
    const { ctx } = makeRecordingCtx(false);
    const origFill = ctx.fillText;
    ctx.fillText = (t, x, y) => {
      fontsSeen.push(ctx.font);
      origFill(t, x, y);
    };
    drawCalendarPage(ctx, {
      ...opts,
      fontsOk: true,
      fonts: { title: "__Fredoka_abc123", body: "__Inter_def456" },
    });
    expect(fontsSeen.some((f) => f.includes("__Fredoka_abc123"))).toBe(true);
    expect(fontsSeen.some((f) => f.includes("__Inter_def456"))).toBe(true);
    expect(fontsSeen.every((f) => !f.includes("sans-serif"))).toBe(true);
  });

  it("sin `fonts` conserva los literales Fredoka/Inter (server, TTF registrados)", () => {
    const fontsSeen: string[] = [];
    const { ctx } = makeRecordingCtx(false);
    const origFill = ctx.fillText;
    ctx.fillText = (t, x, y) => {
      fontsSeen.push(ctx.font);
      origFill(t, x, y);
    };
    drawCalendarPage(ctx, { ...opts, fontsOk: true });
    expect(fontsSeen.some((f) => f.includes("Fredoka"))).toBe(true);
    expect(fontsSeen.some((f) => f.includes("Inter"))).toBe(true);
  });

  it("fontsOk=false ignora `fonts` y usa sans-serif", () => {
    const fontsSeen: string[] = [];
    const { ctx } = makeRecordingCtx(false);
    const origFill = ctx.fillText;
    ctx.fillText = (t, x, y) => {
      fontsSeen.push(ctx.font);
      origFill(t, x, y);
    };
    drawCalendarPage(ctx, {
      ...opts,
      fontsOk: false,
      fonts: { title: "__Fredoka_abc123", body: "__Inter_def456" },
    });
    expect(fontsSeen.length).toBeGreaterThan(0);
    expect(fontsSeen.every((f) => f.includes("sans-serif"))).toBe(true);
  });
});

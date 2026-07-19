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

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
    moveTo() {},
    lineTo() {},
    arcTo() {},
    closePath() {},
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

// Layout SPLIT (2026-08) — composición lateral: foto redondeada con margen (clip con arcTo),
// banda inferior en 2 columnas, grilla SIN bordes ni leyenda, domingos y festivos en magenta.
// Enero 2027: domingos 3/10/17/24/31; festivos 1 (Año Nuevo) y 11 (Reyes, Emiliani → lunes).
describe("drawCalendarPage — layout split (lateral)", () => {
  function makeSplitCtx() {
    const { ctx } = makeRecordingCtx(false);
    const calls = {
      arcTo: 0,
      strokeRect: 0,
      texts: [] as Array<{ text: string; fill: string }>,
    };
    const origArcTo = ctx.arcTo;
    ctx.arcTo = (...a) => {
      calls.arcTo++;
      origArcTo(...a);
    };
    const origStroke = ctx.strokeRect;
    ctx.strokeRect = (...a) => {
      calls.strokeRect++;
      origStroke(...a);
    };
    const origFill = ctx.fillText;
    ctx.fillText = (t, x, y) => {
      calls.texts.push({ text: t, fill: String(ctx.fillStyle) });
      origFill(t, x, y);
    };
    return { ctx, calls };
  }

  it("dibuja la foto/placeholder con clip REDONDEADO (arcTo) y SIN bordes de celda (strokeRect)", () => {
    const { ctx, calls } = makeSplitCtx();
    drawCalendarPage(ctx, { ...opts, fontsOk: true, layout: "split" });
    expect(calls.arcTo).toBeGreaterThan(0); // esquinas del clip/redondeado de la foto
    expect(calls.strokeRect).toBe(0); // la grilla split no lleva bordes de celda
  });

  it("NO dibuja leyenda de festivos al pie", () => {
    const { ctx, calls } = makeSplitCtx();
    drawCalendarPage(ctx, { ...opts, fontsOk: true, layout: "split" });
    expect(calls.texts.some((t) => t.text.includes("Reyes"))).toBe(false);
    expect(calls.texts.some((t) => t.text.includes("·"))).toBe(false);
  });

  it("domingos y festivos en magenta #D81159; días normales en tinta #2A2140", () => {
    const { ctx, calls } = makeSplitCtx();
    drawCalendarPage(ctx, { ...opts, fontsOk: true, layout: "split" });
    const inkOf = (day: string) => calls.texts.find((t) => t.text === day)?.fill;
    expect(inkOf("3")).toBe("#D81159"); // domingo
    expect(inkOf("1")).toBe("#D81159"); // festivo (Año Nuevo)
    expect(inkOf("11")).toBe("#D81159"); // festivo (Reyes trasladado)
    expect(inkOf("4")).toBe("#2A2140"); // lunes normal
    expect(inkOf("15")).toBe("#2A2140"); // viernes normal
  });

  it("el mes gigante y el año salen en tinta oscura, alineados a la izquierda", () => {
    const { ctx, calls } = makeSplitCtx();
    drawCalendarPage(ctx, { ...opts, fontsOk: true, layout: "split" });
    expect(calls.texts.some((t) => t.text === "ENE" && t.fill === "#2A2140")).toBe(true);
    expect(calls.texts.some((t) => t.text === "2027" && t.fill === "#2A2140")).toBe(true);
    // La composición split NO usa el título centrado "ENE 2027" del clásico.
    expect(calls.texts.some((t) => t.text === "ENE 2027")).toBe(false);
  });
});

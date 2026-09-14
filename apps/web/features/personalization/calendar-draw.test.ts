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
    translate() {},
    rotate() {},
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

// Lucy 2026-09-08 — "Rotar 90°" no hacía nada en el calendario: la rotación del
// photoTransform (Ola 3c) no llegaba al compositor. Gate de regresión: con rotación
// la foto se dibuja con translate+rotate alrededor del centro y el cover usa las
// dimensiones INTERCAMBIADAS (misma matemática que renderSlotCanvas / Konva).
describe("drawCalendarPage — rotación de la foto del mes (Ola 3c en calendario)", () => {
  const PHOTO = { width: 800, height: 600 };

  function makePhotoCtx() {
    const { ctx } = makeRecordingCtx(false);
    const calls = {
      translate: [] as Array<[number, number]>,
      rotate: [] as number[],
      drawImage: [] as Array<[number, number, number, number]>,
    };
    const origTranslate = ctx.translate;
    ctx.translate = (x, y) => {
      calls.translate.push([x, y]);
      origTranslate(x, y);
    };
    const origRotate = ctx.rotate;
    ctx.rotate = (a) => {
      calls.rotate.push(a);
      origRotate(a);
    };
    const origDraw = ctx.drawImage;
    ctx.drawImage = (img, dx, dy, dw, dh) => {
      calls.drawImage.push([dx, dy, dw, dh]);
      origDraw(img, dx, dy, dw, dh);
    };
    return { ctx, calls };
  }

  it("sin rotación NO usa translate/rotate (salida idéntica a antes)", () => {
    const { ctx, calls } = makePhotoCtx();
    drawCalendarPage(ctx, {
      photo: PHOTO,
      photoTransform: { offsetX: 0, offsetY: 0, scale: 1 },
      year: 2027,
      monthIndex0: 0,
      fontsOk: false,
    });
    expect(calls.translate).toHaveLength(0);
    expect(calls.rotate).toHaveLength(0);
    // Cover sin swap: max(1080/800, 810/600) = 1.35 → 1080×810 exacto.
    expect(calls.drawImage[0]).toEqual([
      (-800 * 1.35) / 2 + 1080 / 2,
      (-600 * 1.35) / 2 + 810 / 2,
      800 * 1.35,
      600 * 1.35,
    ]);
  });

  it("rotación 90°: rota alrededor del centro y el cover usa dims intercambiadas (classic)", () => {
    const { ctx, calls } = makePhotoCtx();
    drawCalendarPage(ctx, {
      photo: PHOTO,
      photoTransform: { offsetX: 0, offsetY: 0, scale: 1, rotation: 90 },
      year: 2027,
      monthIndex0: 0,
      fontsOk: false,
    });
    expect(calls.rotate).toEqual([Math.PI / 2]);
    // Centro de la ventana de foto (CALENDAR_PHOTO es x=0, y=0, 1080×810).
    expect(calls.translate[0]).toEqual([1080 / 2, 810 / 2]);
    // Cover con dims intercambiadas: max(1080/600, 810/800) = 1.8.
    expect(calls.drawImage[0]).toEqual([(-800 * 1.8) / 2, (-600 * 1.8) / 2, 800 * 1.8, 600 * 1.8]);
  });

  it("rotación 90° también aplica en layout split (clip redondeado)", () => {
    const { ctx, calls } = makePhotoCtx();
    drawCalendarPage(ctx, {
      photo: PHOTO,
      photoTransform: { offsetX: 0, offsetY: 0, scale: 1, rotation: 90 },
      year: 2027,
      monthIndex0: 0,
      fontsOk: false,
      layout: "split",
    });
    expect(calls.rotate).toEqual([Math.PI / 2]);
    expect(calls.translate).toHaveLength(1);
  });
});

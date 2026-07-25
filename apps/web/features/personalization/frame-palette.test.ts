/*
 * Test de la paleta de marcos (Ola 2A): ids → hex de marca y preselección del marco del
 * Estudio según la variante que venía de la PDP (frameStyle/variantStyle).
 */

import { describe, expect, it } from "vitest";
import {
  FRAME_COLORS,
  DEFAULT_FRAME_OPTION_IDS,
  frameColorHex,
  isValidFrameHex,
  isDarkColor,
  initialFrameColorFromSchema,
  frameBleedMargin,
  insetToMinMargin,
} from "./frame-palette";

describe("frame-palette (Ola 2A)", () => {
  it("la paleta de marca es blanco/negro + pasteles con hex válidos", () => {
    expect(FRAME_COLORS.map((c) => c.id)).toEqual([
      "blanco",
      "negro",
      "aguamarina",
      "rosa",
      "lavanda",
      "amarillo",
    ]);
    for (const c of FRAME_COLORS) expect(isValidFrameHex(c.hex)).toBe(true);
    // Los ids por defecto del schema cubren toda la paleta.
    expect(DEFAULT_FRAME_OPTION_IDS).toEqual(FRAME_COLORS.map((c) => c.id));
  });

  it("frameColorHex resuelve ids y rechaza desconocidos", () => {
    expect(frameColorHex("blanco")).toBe("#FFFFFF");
    expect(frameColorHex("aguamarina")).toBe("#5DD9D1");
    expect(frameColorHex("inexistente")).toBeNull();
  });

  it("isValidFrameHex valida el formato #RRGGBB", () => {
    expect(isValidFrameHex("#5DD9D1")).toBe(true);
    expect(isValidFrameHex("#5dd9d1")).toBe(true);
    expect(isValidFrameHex("#FFF")).toBe(false);
    expect(isValidFrameHex("rojo")).toBe(false);
    expect(isValidFrameHex(null)).toBe(false);
    expect(isValidFrameHex(123)).toBe(false);
  });

  it("preselección desde frameStyle (Fotoimanes Cuadrados)", () => {
    expect(initialFrameColorFromSchema({ frameStyle: "blanco" })).toBe("#FFFFFF");
    expect(initialFrameColorFromSchema({ frameStyle: "negro" })).toBe("#221E25");
    expect(initialFrameColorFromSchema({ frameStyle: "otro" })).toBeNull();
  });

  it("preselección desde variantStyle (Polaroid): blanco-clasico y pasteles; instagram sin marco", () => {
    expect(initialFrameColorFromSchema({ variantStyle: "blanco-clasico" })).toBe("#FFFFFF");
    expect(initialFrameColorFromSchema({ variantStyle: "pasteles" })).toBe("#5DD9D1");
    expect(initialFrameColorFromSchema({ variantStyle: "instagram" })).toBeNull();
  });

  it("sin datos de estilo → sin marco preseleccionado", () => {
    expect(initialFrameColorFromSchema({})).toBeNull();
    expect(initialFrameColorFromSchema(null)).toBeNull();
    expect(initialFrameColorFromSchema("x")).toBeNull();
  });

  it("isDarkColor: negro/lavanda cuentan oscuros (texto claro), blanco/pasteles no", () => {
    // Ola 3 — el mensaje de la Polaroid Clásica sale claro si la tarjeta es oscura.
    expect(isDarkColor("#221E25")).toBe(true); // negro de marca
    expect(isDarkColor("#7C6AAD")).toBe(true); // lavanda
    expect(isDarkColor("#E85B9F")).toBe(false); // rosa (luminancia media-alta)
    expect(isDarkColor("#FFFFFF")).toBe(false); // blanco
    expect(isDarkColor("#5DD9D1")).toBe(false); // aguamarina
    expect(isDarkColor("#FFD93D")).toBe(false); // amarillo
    expect(isDarkColor("rojo")).toBe(false); // inválido → no oscuro
  });
});

describe("frame-palette — Ola 3b (marco full-bleed, 'fin del papel')", () => {
  it("frameBleedMargin: 4% del lado menor del stage, mínimo 6px (proporcional al tamaño)", () => {
    // La franja es RELATIVA al stage → el ancho proporcional se mantiene igual
    // en 6.5, 8 o 10 cm (el stage escala con la variante física).
    expect(frameBleedMargin({ width: 600, height: 600 })).toBe(24); // 4% de 600
    expect(frameBleedMargin({ width: 600, height: 800 })).toBe(24); // lado menor manda
    expect(frameBleedMargin({ width: 100, height: 400 })).toBe(6); // piso 6px
    expect(frameBleedMargin({ width: 390, height: 400 })).toBe(16); // celda de tira
  });

  it("insetToMinMargin: ventana a sangre se encoge hasta dejar la franja mínima", () => {
    const stage = { width: 600, height: 800 };
    const out = insetToMinMargin({ x: 0, y: 0, width: 600, height: 800 }, stage, 24);
    expect(out).toEqual({ x: 24, y: 24, width: 552, height: 752 });
  });

  it("insetToMinMargin: respeta márgenes MAYORES de la plantilla (no los achica)", () => {
    const stage = { width: 600, height: 600 };
    // libre-photo-pack: margen propio de 40 (> 24) → se conserva intacto.
    const out = insetToMinMargin({ x: 40, y: 40, width: 520, height: 520 }, stage, 24);
    expect(out).toEqual({ x: 40, y: 40, width: 520, height: 520 });
  });

  it("insetToMinMargin: margen parcial (izquierda a sangre, derecha amplia) → franja mínima por lado", () => {
    const stage = { width: 600, height: 600 };
    // Izquierda a sangre (0 → 24); derecha con margen propio 40 (> 24) → se respeta (borde en 560).
    const out = insetToMinMargin({ x: 0, y: 40, width: 560, height: 520 }, stage, 24);
    expect(out).toEqual({ x: 24, y: 40, width: 536, height: 520 });
  });

  it("insetToMinMargin: resultado degenerado → no toca la ventana", () => {
    const stage = { width: 50, height: 50 };
    const ph = { x: 0, y: 0, width: 50, height: 50 };
    expect(insetToMinMargin(ph, stage, 24)).toEqual(ph);
  });
});

describe("frame-palette — Ola 4 (cuadrados / tira / instagram)", () => {
  it("isSimpleCardTemplate: fondo+foto simple sí; frame-card, chrome asset o texto visible no", async () => {
    const { isSimpleCardTemplate } = await import("./frame-palette");
    const simple = [
      { type: "background" },
      { type: "image-placeholder" },
      { type: "text" }, // texto presente pero NO visible (allowText=false) → sigue simple
    ];
    expect(isSimpleCardTemplate(simple, { textIsVisible: false })).toBe(true);
    expect(isSimpleCardTemplate(simple, { textIsVisible: true })).toBe(false);
    expect(isSimpleCardTemplate([...simple, { type: "frame-card" }])).toBe(false);
    expect(isSimpleCardTemplate([...simple, { type: "asset" }])).toBe(false);
    expect(isSimpleCardTemplate([...simple, { type: "shape" }])).toBe(false);
  });

  it("simpleCardPhotoRect: sin borde → sangre total; con borde → franja uniforme", async () => {
    const { simpleCardPhotoRect } = await import("./frame-palette");
    const stage = { width: 600, height: 600 };
    expect(simpleCardPhotoRect(stage, null, 24)).toEqual({
      x: 0,
      y: 0,
      width: 600,
      height: 600,
    });
    expect(simpleCardPhotoRect(stage, "#E85B9F", 24)).toEqual({
      x: 24,
      y: 24,
      width: 552,
      height: 552,
    });
  });

  it("isStripTemplate: solo con gridCols=1 y gridGap=0", async () => {
    const { isStripTemplate } = await import("./frame-palette");
    expect(isStripTemplate({ gridCols: 1, gridGap: 0 })).toBe(true);
    expect(isStripTemplate({ gridCols: 1, gridGap: 8 })).toBe(false);
    expect(isStripTemplate({ gridCols: 3, gridGap: 0 })).toBe(false);
    expect(isStripTemplate({})).toBe(false);
  });

  it("stripPhotoRect: el borde exterior solo en first/last; middle se toca", async () => {
    const { stripPhotoRect, stripOuterInset } = await import("./frame-palette");
    const stage = { width: 390, height: 400 };
    const inset = stripOuterInset(stage); // 12
    expect(inset).toBe(12);
    const ph = { x: 12, y: 0, width: 366, height: 400 };
    expect(stripPhotoRect(ph, stage, "middle")).toEqual(ph);
    expect(stripPhotoRect(ph, stage, "first")).toEqual({ ...ph, y: 12, height: 388 });
    expect(stripPhotoRect(ph, stage, "last")).toEqual({ ...ph, y: 0, height: 388 });
    expect(stripPhotoRect(ph, stage, "single")).toEqual({ ...ph, y: 12, height: 376 });
  });

  it("isInstagramTemplate: detecta el chrome ig_post", async () => {
    const { isInstagramTemplate } = await import("./frame-palette");
    expect(
      isInstagramTemplate([
        { type: "background" },
        { type: "asset", src: "/templates/ig_post_3x4.svg" },
      ]),
    ).toBe(true);
    expect(isInstagramTemplate([{ type: "background" }, { type: "frame-card" }])).toBe(false);
  });

  it("instagramBackgroundHex: binario — negro oscuro pasa; cualquier otro cae al blanco base", async () => {
    const { instagramBackgroundHex } = await import("./frame-palette");
    expect(instagramBackgroundHex("#221E25", "#FFFFFF")).toBe("#221E25"); // negro marca
    expect(instagramBackgroundHex("#FFFFFF", "#FFFFFF")).toBe("#FFFFFF");
    expect(instagramBackgroundHex(null, "#FFFFFF")).toBe("#FFFFFF");
    // Un pastel residual (cambiaste de plantilla) NO pinta el fondo Instagram.
    expect(instagramBackgroundHex("#E85B9F", "#FFFFFF")).toBe("#FFFFFF");
  });

  it("darkChromeSrc: variante _dark del chrome solo con fondo oscuro", async () => {
    const { darkChromeSrc } = await import("./frame-palette");
    expect(darkChromeSrc("/templates/ig_post_3x4.svg", true)).toBe(
      "/templates/ig_post_3x4_dark.svg",
    );
    expect(darkChromeSrc("/templates/ig_post_3x4.svg", false)).toBe("/templates/ig_post_3x4.svg");
    expect(darkChromeSrc("/templates/ig_post_3x4_dark.svg", true)).toBe(
      "/templates/ig_post_3x4_dark.svg",
    );
  });

  it("noBorderChromeSrc: variante _noborder del chrome solo en modo sin borde", async () => {
    const { noBorderChromeSrc } = await import("./frame-palette");
    expect(noBorderChromeSrc("/templates/ig_post_3x4.svg", true)).toBe(
      "/templates/ig_post_3x4_noborder.svg",
    );
    expect(noBorderChromeSrc("/templates/ig_post_3x4.svg", true, true)).toBe(
      "/templates/ig_post_3x4_dark_noborder.svg",
    );
    expect(noBorderChromeSrc("/templates/ig_post_3x4.svg", false)).toBe("/templates/ig_post_3x4.svg");
    expect(noBorderChromeSrc("/templates/ig_post_3x4.svg", false, true)).toBe(
      "/templates/ig_post_3x4_dark.svg",
    );
  });

  it("isInstagramNoBorder: detecta el rect a sangre del modo sin borde", async () => {
    const { isInstagramNoBorder } = await import("./frame-palette");
    const stage = { width: 450, height: 600 };
    expect(
      isInstagramNoBorder({ x: 15, y: 58, width: 420, height: 400 }, stage),
    ).toBe(true);
    expect(
      isInstagramNoBorder({ x: 29, y: 58, width: 392, height: 392 }, stage),
    ).toBe(false);
    expect(isInstagramNoBorder(undefined, stage)).toBe(false);
  });
});

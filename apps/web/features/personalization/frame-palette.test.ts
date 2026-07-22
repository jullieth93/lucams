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
  initialFrameColorFromSchema,
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
});

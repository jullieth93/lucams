/*
 * Tests unitarios de lib/color.ts — las conversiones HEX↔RGB↔HSL son el motor
 * del <CustomColorPicker>: si fallan, el color elegido y el persistido divergen.
 * Valores conocidos (primarios, grises, brand) + round-trips con tolerancia de
 * ±1 por canal (el redondeo de enteros en HEX pierde precisión por diseño).
 */

import { describe, expect, it } from "vitest";
import {
  hexToHsl,
  hexToRgb,
  hslToHex,
  hslToRgb,
  isLightHex,
  normalizeHex,
  relativeLuminance,
  rgbToHex,
  rgbToHsl,
} from "./color";

describe("normalizeHex", () => {
  it("normaliza a #RRGGBB en mayúsculas", () => {
    expect(normalizeHex("#e85b9f")).toBe("#E85B9F");
    expect(normalizeHex("7c6aad")).toBe("#7C6AAD");
    expect(normalizeHex("#FFF")).toBe("#FFFFFF");
    expect(normalizeHex("abc")).toBe("#AABBCC");
    expect(normalizeHex("  #262626  ")).toBe("#262626");
  });

  it("rechaza entradas inválidas", () => {
    expect(normalizeHex("")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("#1234567")).toBeNull();
    expect(normalizeHex("red")).toBeNull();
    expect(normalizeHex("#GGGGGG")).toBeNull();
    expect(normalizeHex("rgb(1,2,3)")).toBeNull();
  });
});

describe("hexToRgb / rgbToHex", () => {
  it("convierte valores conocidos", () => {
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb("#FFFFFF")).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb("#7C6AAD")).toEqual({ r: 124, g: 106, b: 173 });
    expect(rgbToHex(124, 106, 173)).toBe("#7C6AAD");
    expect(rgbToHex(255, 255, 255)).toBe("#FFFFFF");
    expect(rgbToHex(0, 0, 0)).toBe("#000000");
  });

  it("hexToRgb devuelve null con hex inválido", () => {
    expect(hexToRgb("nope")).toBeNull();
  });

  it("rgbToHex clampea fuera de rango", () => {
    expect(rgbToHex(300, -5, 128)).toBe("#FF0080");
  });
});

describe("rgbToHsl / hslToRgb", () => {
  it("valores conocidos: primarios, negro, blanco, gris", () => {
    expect(rgbToHsl(255, 0, 0)).toEqual({ h: 0, s: 100, l: 50 });
    expect(rgbToHsl(0, 255, 0)).toEqual({ h: 120, s: 100, l: 50 });
    expect(rgbToHsl(0, 0, 255)).toEqual({ h: 240, s: 100, l: 50 });
    expect(rgbToHsl(0, 0, 0)).toEqual({ h: 0, s: 0, l: 0 });
    expect(rgbToHsl(255, 255, 255)).toEqual({ h: 0, s: 0, l: 100 });
    expect(rgbToHsl(128, 128, 128)).toEqual({ h: 0, s: 0, l: 50.2 });

    expect(hslToRgb(0, 100, 50)).toEqual({ r: 255, g: 0, b: 0 });
    expect(hslToRgb(120, 100, 50)).toEqual({ r: 0, g: 255, b: 0 });
    expect(hslToRgb(240, 100, 50)).toEqual({ r: 0, g: 0, b: 255 });
    expect(hslToRgb(0, 0, 100)).toEqual({ r: 255, g: 255, b: 255 });
    expect(hslToRgb(0, 0, 0)).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("round-trip HEX → HSL → HEX con tolerancia de ±1 por canal", () => {
    // HSL se guarda con 1 decimal: el round-trip cuantiza como mucho ±1 por
    // canal (y en la práctica la mayoría vuelve exacto).
    const hexes = ["#7C6AAD", "#E85B9F", "#F58A6F", "#D4AF37", "#5DD9D1", "#3D2E5C", "#262626"];
    for (const hex of hexes) {
      const { r, g, b } = hexToRgb(hex)!;
      const hsl = rgbToHsl(r, g, b);
      const back = hslToHex(hsl.h, hsl.s, hsl.l);
      const rgb2 = hexToRgb(back)!;
      expect(Math.abs(rgb2.r - r)).toBeLessThanOrEqual(1);
      expect(Math.abs(rgb2.g - g)).toBeLessThanOrEqual(1);
      expect(Math.abs(rgb2.b - b)).toBeLessThanOrEqual(1);
    }
  });

  it("hslToRgb normaliza tonos fuera de rango (h negativo / >360)", () => {
    expect(hslToHex(-120, 100, 50)).toBe(hslToHex(240, 100, 50));
    expect(hslToHex(480, 100, 50)).toBe(hslToHex(120, 100, 50));
  });
});

describe("hexToHsl / hslToHex", () => {
  it("hexToHsl con hex inválido cae al gris neutro (el picker siempre arranca)", () => {
    expect(hexToHsl("basura")).toEqual({ h: 0, s: 0, l: 50 });
  });

  it("hslToHex produce #RRGGBB en mayúsculas", () => {
    expect(hslToHex(0, 100, 50)).toBe("#FF0000");
    expect(hslToHex(0, 0, 50)).toBe("#808080");
  });
});

describe("relativeLuminance / isLightHex", () => {
  it("luminancia WCAG de extremos conocidos", () => {
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("inválido")).toBeNull();
  });

  it("isLightHex distingue claros de oscuros (para el check del swatch)", () => {
    expect(isLightHex("#FFFFFF")).toBe(true);
    expect(isLightHex("#FFD93D")).toBe(true);
    expect(isLightHex("#5DD9D1")).toBe(true);
    expect(isLightHex("#000000")).toBe(false);
    expect(isLightHex("#262626")).toBe(false);
    expect(isLightHex("#3D2E5C")).toBe(false);
    expect(isLightHex("nope")).toBe(false);
  });
});

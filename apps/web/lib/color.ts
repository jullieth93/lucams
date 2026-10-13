/*
 * Conversiones de color PURAS (HEX ↔ RGB ↔ HSL) + validación, sin dependencias.
 * Motor del <CustomColorPicker> (components/color-picker.tsx): el picker trabaja
 * en HSL (área saturación/luminosidad + slider de tono) pero el estado que
 * persiste en diseños/CMS siempre es HEX #RRGGBB (mayúsculas).
 *
 * Convenciones:
 *   - HEX normalizado: "#RRGGBB" en MAYÚSCULAS (normalizeHex acepta #rgb, rgb
 *     y minúsculas; devuelve null si la entrada no es un hex válido).
 *   - RGB: enteros 0-255. HSL: h 0-359, s/l 0-100 (enteros redondeados).
 */

export type Rgb = { r: number; g: number; b: number };
export type Hsl = { h: number; s: number; l: number };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
/** 1 decimal: suficiente para que HEX → HSL → HEX no derive visiblemente. */
const round1 = (v: number) => Math.round(v * 10) / 10;

/** "#fff" | "fff" | "#E85B9F" → "#FFFFFF" | "#E85B9F"; inválido → null. */
export function normalizeHex(input: string): string | null {
  const m = input.trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  return `#${h.toUpperCase()}`;
}

export function hexToRgb(hex: string): Rgb | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const part = (v: number) =>
    clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0").toUpperCase();
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = clamp(r, 0, 255) / 255;
  const gn = clamp(g, 0, 255) / 255;
  const bn = clamp(b, 0, 255) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: round1(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: round1(h * 60) % 360, s: round1(s * 100), l: round1(l * 100) };
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const hn = (((h % 360) + 360) % 360) / 360;
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  if (sn === 0) {
    const v = Math.round(ln * 255);
    return { r: v, g: v, b: v };
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  const hue = (t: number) => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };
  return {
    r: Math.round(hue(hn + 1 / 3) * 255),
    g: Math.round(hue(hn) * 255),
    b: Math.round(hue(hn - 1 / 3) * 255),
  };
}

/** HEX inválido → gris medio neutro (el picker necesita SIEMPRE un HSL usable). */
export function hexToHsl(hex: string): Hsl {
  const rgb = hexToRgb(hex);
  if (!rgb) return { h: 0, s: 0, l: 50 };
  return rgbToHsl(rgb.r, rgb.g, rgb.b);
}

export function hslToHex(h: number, s: number, l: number): string {
  const rgb = hslToRgb(h, s, l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

/**
 * Luminancia relativa WCAG 2.x (0 = negro, 1 = blanco). Devuelve null si el
 * hex es inválido. Sirve para elegir el color del check/icono sobre un swatch.
 */
export function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** true si el color es claro (un icono/check oscuro encima contrasta mejor). */
export function isLightHex(hex: string): boolean {
  const lum = relativeLuminance(hex);
  return lum !== null && lum > 0.35;
}

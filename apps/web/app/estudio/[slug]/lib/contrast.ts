/*
 * Contraste de color (WCAG 2.2 — luminancia relativa y ratio de contraste).
 * Misma fórmula que tests/a11y-contrast.test.ts; acá vive como helper de
 * RUNTIME (el editor lo usa para detectar texto casi invisible sobre la
 * tarjeta, Ola 28 2026-09-11: blanco sobre tarjeta blanca en «Editar»).
 */

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Luminancia relativa WCAG de un hex "#RRGGBB" (null si no parsea). */
export function relativeLuminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const r = channel((n >> 16) & 0xff);
  const g = channel((n >> 8) & 0xff);
  const b = channel(n & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG entre dos hex (1 = mismo color; 21 = negro/blanco). */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * ¿El texto `fill` queda casi invisible sobre la tarjeta `cardHex`? Umbral
 * deliberadamente BAJO (1.2): solo dispara con colores casi idénticos (blanco
 * sobre blanco = 1.0); combos suaves pero legítimos (turquesa de marca sobre
 * blanco ≈ 1.71) NO se marcan. null (color no parseable) → no se sabe → false.
 */
export function isLowContrastOnCard(fill: string, cardHex: string): boolean {
  const ratio = contrastRatio(fill, cardHex);
  return ratio !== null && ratio < 1.2;
}

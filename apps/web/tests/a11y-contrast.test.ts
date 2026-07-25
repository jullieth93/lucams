/*
 * Contraste WCAG 1.4.3 (texto) y 1.4.11 (gráficos) del storefront y el Estudio.
 *
 * Modo de fallo real (auditoría de accesibilidad 2026-07-24): el turquesa y el rosa de marca son
 * PASTELES pensados para fondos y decoración, pero varios chips/FABs los usaban con `text-white`.
 * Blanco sobre `--brand-turquoise` da 1.71:1 y sobre `--brand-pink` 3.27:1; el mínimo AA es 4.5:1
 * (texto normal) y 3:1 (texto grande o gráfico). En el celular, con brillo bajo y de día, el "12"
 * del carrito o el "150%" del zoom simplemente desaparecen.
 *
 * La paleta NO se puede tocar (requiere ADR): la corrección es oscurecer el TEXTO
 * (`brand-purple-dark`) o bajar el FONDO a un tono de tinta que ya existe (`brand-pink-ink`,
 * ADR-044). Este test congela ambas cosas:
 *   1. Los ratios se CALCULAN con la fórmula de WCAG 2.x sobre los hex reales de `globals.css`
 *      — si alguien aclara un token, el test lo dice con el número, no "a ojo".
 *   2. Ningún `className` de estos archivos vuelve a juntar un fondo pastel de marca con
 *      `text-white`.
 *
 * Es un test estático porque el defecto vive en las CLASES, no en el runtime: renderizar el
 * Estudio (Konva + WebGL + zustand) para leer un color computado costaría un orden de magnitud
 * más y jsdom ni siquiera resuelve las utilidades de Tailwind.
 *
 * Fórmula: WCAG 2.2, "Relative luminance" y "Contrast ratio"
 * (https://www.w3.org/TR/WCAG22/#dfn-relative-luminance · consultado 2026-07-24).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WEB_DIR = join(__dirname, "..");

/** Archivos del storefront + Estudio que pintan texto sobre fondos de marca. */
const AUDITED_FILES = [
  join("app", "estudio", "[slug]", "studio-editor.tsx"),
  join("app", "estudio", "[slug]", "studio-slot.tsx"),
  join("app", "estudio", "[slug]", "studio-sidebar.tsx"),
  join("app", "estudio", "[slug]", "studio-photo-adjust-modal.tsx"),
  join("components", "site-header.tsx"),
  join("components", "product-card.tsx"),
  join("components", "product-from-catalog-card.tsx"),
];

function read(relative: string): string {
  return readFileSync(join(WEB_DIR, relative), "utf8");
}

/** Hex de los tokens `--brand-*` tal como están declarados en `:root` de globals.css. */
function brandTokens(): Record<string, string> {
  const css = read(join("app", "globals.css"));
  const root = css.slice(css.indexOf(":root {"), css.indexOf(".dark {"));
  const out: Record<string, string> = {};
  for (const m of root.matchAll(/--(brand-[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]!] = m[2]!;
  return out;
}

/** Luminancia relativa WCAG de un `#rrggbb`. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG (1..21) entre dos colores opacos. */
function contrastRatio(a: string, b: string): number {
  const [la, lb] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Composición de `color` con alfa sobre `over` (para las utilidades `bg-x/90`). */
function blend(color: string, alpha: number, over: string): string {
  const ch = (i: number) => {
    const c =
      parseInt(color.slice(i, i + 2), 16) * alpha +
      parseInt(over.slice(i, i + 2), 16) * (1 - alpha);
    return Math.round(c).toString(16).padStart(2, "0");
  };
  return `#${ch(1)}${ch(3)}${ch(5)}`;
}

const WHITE = "#ffffff";
/** Redondeo a 2 decimales para que los números del test se puedan citar tal cual. */
const r2 = (n: number) => Math.round(n * 100) / 100;

describe("ratios de la paleta (calculados, no estimados)", () => {
  const t = brandTokens();

  it("la fórmula reproduce los extremos conocidos (blanco/negro = 21:1)", () => {
    expect(r2(contrastRatio(WHITE, "#000000"))).toBe(21);
    expect(r2(contrastRatio(WHITE, WHITE))).toBe(1);
  });

  it("blanco sobre brand-turquoise NO llega a AA → el texto va en brand-purple-dark", () => {
    expect(r2(contrastRatio(WHITE, t["brand-turquoise"]!))).toBe(1.71);
    expect(r2(contrastRatio(t["brand-purple-dark"]!, t["brand-turquoise"]!))).toBe(7.06);
    expect(contrastRatio(t["brand-purple-dark"]!, t["brand-turquoise"]!)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it("blanco sobre brand-pink NO llega a AA → el fondo baja a brand-pink-ink", () => {
    expect(r2(contrastRatio(WHITE, t["brand-pink"]!))).toBe(3.27);
    expect(r2(contrastRatio(WHITE, t["brand-pink-ink"]!))).toBe(5.31);
    expect(contrastRatio(WHITE, t["brand-pink-ink"]!)).toBeGreaterThanOrEqual(4.5);
  });

  it("el chip de zoom (bg-brand-turquoise/90 sobre foto clara) también cumple con el texto oscuro", () => {
    const chip = blend(t["brand-turquoise"]!, 0.9, WHITE);
    expect(r2(contrastRatio(WHITE, chip))).toBe(1.62);
    expect(r2(contrastRatio(t["brand-purple-dark"]!, chip))).toBe(7.43);
    expect(contrastRatio(t["brand-purple-dark"]!, chip)).toBeGreaterThanOrEqual(4.5);
  });
});

/** `bg-brand-turquoise[/nn]` o `bg-brand-pink[/nn]` — `bg-brand-pink-ink` NO cuenta. */
const PASTEL_BG = /\bbg-brand-(?:turquoise|pink)(?:\/\d+)?(?![\w-])/;
const WHITE_TEXT = /\btext-white\b/;

/** Literales entre comillas dobles o backticks (donde viven los `className` de este repo). */
function stringLiterals(source: string): string[] {
  return [...source.matchAll(/"([^"\n]{4,600})"|`([^`]{4,600})`/g)].map((m) => m[1] ?? m[2] ?? "");
}

describe("WCAG 1.4.3 — ningún className junta fondo pastel de marca con texto blanco", () => {
  it.each(AUDITED_FILES)("%s", (relative) => {
    const offenders = stringLiterals(read(relative)).filter(
      (s) => PASTEL_BG.test(s) && WHITE_TEXT.test(s),
    );
    expect(offenders).toEqual([]);
  });
});

describe("WCAG 1.4.11 — el ✓ de 'elegida' no va en blanco sobre el turquesa", () => {
  // El check es el ÚNICO indicador de selección; a 1.71:1 se pierde contra el turquesa. Se busca
  // el `text-white` cerca del contenedor turquesa porque fondo e ícono viven en elementos
  // distintos (padre con `bg-`, hijo `<Check>` con `text-`), fuera del alcance del test de arriba.
  it.each([
    join("app", "estudio", "[slug]", "studio-sidebar.tsx"),
    join("app", "estudio", "[slug]", "studio-photo-adjust-modal.tsx"),
  ])("%s", (relative) => {
    expect(read(relative)).not.toMatch(/bg-brand-turquoise[\s\S]{0,400}?<Check[^>]*text-white/);
  });
});

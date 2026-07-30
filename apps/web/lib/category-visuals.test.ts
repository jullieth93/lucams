/*
 * Tests unitarios de lib/category-visuals.ts (roadmap B3).
 *
 * El visual de una categoría (icono + gradiente) es dato de catálogo en BD
 * (Category.icon / .gradient, editables en /admin/categorias). Estos tests
 * fijan el orden de precedencia al pintar en el storefront:
 *   1. Valor de BD, si existe.
 *   2. Mapa fallback por slug (los defaults de marca que antes estaban
 *      quemados en category-grid.tsx / shop-mega-menu.tsx).
 *   3. Default genérico.
 * y la regla de seguridad: un nombre de icono fuera del subset curado NUNCA
 * rompe el render — cae al icono default (no hay import dinámico).
 */

import { describe, expect, it } from "vitest";
import {
  CATEGORY_GRADIENT_OPTIONS,
  CATEGORY_ICON_OPTIONS,
  CATEGORY_ICONS,
  DEFAULT_CATEGORY_GRADIENT,
  DEFAULT_CATEGORY_ICON,
  resolveCategoryGradient,
  resolveCategoryIcon,
} from "./category-visuals";

describe("resolveCategoryIcon", () => {
  it("usa el valor de BD cuando existe y está en el subset curado", () => {
    expect(resolveCategoryIcon("PartyPopper", "foto-imanes")).toBe(CATEGORY_ICONS.PartyPopper);
  });

  it("el valor de BD gana al fallback por slug (BD tiene precedencia)", () => {
    // foto-imanes tiene fallback Camera en el mapa; BD dice Heart → gana Heart.
    expect(resolveCategoryIcon("Heart", "foto-imanes")).toBe(CATEGORY_ICONS.Heart);
  });

  it("cae al mapa fallback por slug cuando BD es null", () => {
    expect(resolveCategoryIcon(null, "calendarios")).toBe(CATEGORY_ICONS.Calendar);
    expect(resolveCategoryIcon(null, "separadores")).toBe(CATEGORY_ICONS.Bookmark);
  });

  it("cae al default genérico cuando BD es null y el slug no está en el mapa", () => {
    expect(resolveCategoryIcon(null, "categoria-nueva")).toBe(
      CATEGORY_ICONS[DEFAULT_CATEGORY_ICON],
    );
    expect(resolveCategoryIcon(undefined, "otra")).toBe(CATEGORY_ICONS[DEFAULT_CATEGORY_ICON]);
  });

  it("un nombre de BD fuera del subset curado cae al default (nunca rompe ni importa dinámico)", () => {
    expect(resolveCategoryIcon("IconoInventado", "foto-imanes")).toBe(
      CATEGORY_ICONS[DEFAULT_CATEGORY_ICON],
    );
    expect(resolveCategoryIcon("script", "calendarios")).toBe(
      CATEGORY_ICONS[DEFAULT_CATEGORY_ICON],
    );
  });
});

describe("resolveCategoryGradient", () => {
  it("usa el valor de BD cuando existe", () => {
    expect(resolveCategoryGradient("from-brand-pink/30 to-brand-purple/15", "foto-imanes")).toBe(
      "from-brand-pink/30 to-brand-purple/15",
    );
  });

  it("cae al mapa fallback por slug cuando BD es null", () => {
    expect(resolveCategoryGradient(null, "foto-imanes")).toBe(
      "from-brand-purple/20 via-brand-pink/20 to-brand-coral/20",
    );
  });

  it("un slug del mapa que solo tenía icono (mega-menú) cae al gradiente default", () => {
    expect(resolveCategoryGradient(null, "separadores")).toBe(DEFAULT_CATEGORY_GRADIENT);
  });

  it("cae al default genérico cuando BD es null y el slug no está en el mapa", () => {
    expect(resolveCategoryGradient(null, "categoria-nueva")).toBe(DEFAULT_CATEGORY_GRADIENT);
    expect(resolveCategoryGradient(undefined, "otra")).toBe(DEFAULT_CATEGORY_GRADIENT);
  });
});

describe("opciones curadas del picker admin", () => {
  it("CATEGORY_ICON_OPTIONS cubre todos los iconos que usaban los mapas hardcodeados", () => {
    const historicos = [
      "Camera",
      "PartyPopper",
      "Calendar",
      "Briefcase",
      "ClipboardList",
      "Gift",
      "Snowflake",
      "Frame",
      "Bookmark",
      "Sparkles",
      "GraduationCap",
      "Baby",
      "Heart",
    ];
    for (const name of historicos) {
      expect(CATEGORY_ICON_OPTIONS).toContain(name);
      expect(CATEGORY_ICONS[name]).toBeDefined();
    }
  });

  it("CATEGORY_GRADIENT_OPTIONS incluye el default y todas las opciones tienen label", () => {
    expect(CATEGORY_GRADIENT_OPTIONS.map((g) => g.value)).toContain(DEFAULT_CATEGORY_GRADIENT);
    for (const g of CATEGORY_GRADIENT_OPTIONS) {
      expect(g.label.length).toBeGreaterThan(0);
    }
  });
});

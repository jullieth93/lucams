/*
 * Tests de design-gallery-filter (Fase 5, 2026-10-02) — matching puro del
 * variantFilter de los diseños prediseñados (subset de attributes de variante):
 * subset-match, normalización del Json de DB, validación admin contra las
 * variantes reales, opciones del selector "Aplica a" y labels de badge.
 * Módulo puro: sin DB ni mocks.
 */

import { describe, expect, it } from "vitest";
import {
  buildVariantFilterOptions,
  describeVariantFilter,
  matchesVariantFilter,
  normalizeVariantFilter,
  variantFilterMatchesAnyVariant,
} from "./design-gallery-filter";

describe("normalizeVariantFilter", () => {
  it("null/undefined/no-objeto/array → null (sin filtro)", () => {
    expect(normalizeVariantFilter(null)).toBeNull();
    expect(normalizeVariantFilter(undefined)).toBeNull();
    expect(normalizeVariantFilter("sizeCm")).toBeNull();
    expect(normalizeVariantFilter(42)).toBeNull();
    expect(normalizeVariantFilter(["sizeCm"])).toBeNull();
  });

  it("objeto vacío → null (equivale a 'todas las variantes')", () => {
    expect(normalizeVariantFilter({})).toBeNull();
  });

  it("conserva solo valores primitivos no vacíos", () => {
    expect(normalizeVariantFilter({ sizeCm: "2×6", photoSlots: 6, magnet: true })).toEqual({
      sizeCm: "2×6",
      photoSlots: 6,
      magnet: true,
    });
    // null/undefined/objetos/strings vacíos se descartan
    expect(normalizeVariantFilter({ sizeCm: "", color: null, extra: { a: 1 } })).toBeNull();
  });
});

describe("matchesVariantFilter — subset-match", () => {
  const attrs = { sizeCm: "2×6", photoSlots: 1, magnet: true };

  it("filtro null/vacío/inválido → true (aplica a todas las variantes)", () => {
    expect(matchesVariantFilter(null, attrs)).toBe(true);
    expect(matchesVariantFilter(undefined, attrs)).toBe(true);
    expect(matchesVariantFilter({}, attrs)).toBe(true);
    expect(matchesVariantFilter("junk", attrs)).toBe(true);
  });

  it("match exacto de una clave", () => {
    expect(matchesVariantFilter({ sizeCm: "2×6" }, attrs)).toBe(true);
  });

  it("mismatch de valor → false", () => {
    expect(matchesVariantFilter({ sizeCm: "4×4.2" }, attrs)).toBe(false);
  });

  it("subset parcial multi-clave: todas deben coincidir", () => {
    expect(matchesVariantFilter({ sizeCm: "2×6", magnet: true }, attrs)).toBe(true);
    expect(matchesVariantFilter({ sizeCm: "2×6", magnet: false }, attrs)).toBe(false);
  });

  it("claves EXTRA en attributes no afectan el match", () => {
    expect(matchesVariantFilter({ sizeCm: "2×6" }, { ...attrs, color: "rosa" })).toBe(true);
  });

  it("clave del filtro ausente en attributes → false (incluye attributes vacíos/null)", () => {
    expect(matchesVariantFilter({ color: "rosa" }, attrs)).toBe(false);
    expect(matchesVariantFilter({ sizeCm: "2×6" }, {})).toBe(false);
    expect(matchesVariantFilter({ sizeCm: "2×6" }, null)).toBe(false);
  });

  it("igualdad estricta de tipo (number ≠ string)", () => {
    expect(matchesVariantFilter({ photoSlots: 1 }, attrs)).toBe(true);
    expect(matchesVariantFilter({ photoSlots: "1" }, attrs)).toBe(false);
  });
});

describe("variantFilterMatchesAnyVariant — validación del admin", () => {
  const variants = [
    { sizeCm: "2×6", quantity: 10 },
    { sizeCm: "4×4.2", quantity: 10 },
  ];

  it("null → siempre válido", () => {
    expect(variantFilterMatchesAnyVariant(null, variants)).toBe(true);
    expect(variantFilterMatchesAnyVariant(null, [])).toBe(true);
  });

  it("el filtro existe en al menos una variante → válido", () => {
    expect(variantFilterMatchesAnyVariant({ sizeCm: "2×6" }, variants)).toBe(true);
    expect(variantFilterMatchesAnyVariant({ sizeCm: "4×4.2", quantity: 10 }, variants)).toBe(true);
  });

  it("el filtro no corresponde a ninguna variante real → inválido", () => {
    expect(variantFilterMatchesAnyVariant({ sizeCm: "9×9" }, variants)).toBe(false);
    expect(variantFilterMatchesAnyVariant({ sizeCm: "2×6", color: "rosa" }, variants)).toBe(false);
    expect(variantFilterMatchesAnyVariant({ sizeCm: "2×6" }, [])).toBe(false);
  });
});

describe("buildVariantFilterOptions — selector 'Aplica a' del admin", () => {
  it("prioriza sizeCm cuando varía", () => {
    const options = buildVariantFilterOptions([
      { sizeCm: "2×6", color: "rosa" },
      { sizeCm: "4×4.2", color: "azul" },
    ]);
    expect(options.map((o) => o.key)).toEqual(["sizeCm", "sizeCm"]);
    expect(options.map((o) => o.label)).toEqual(["2×6", "4×4.2"]);
    expect(options[0]!.filter).toEqual({ sizeCm: "2×6" });
  });

  it("cae al siguiente atributo con >1 valor si sizeCm no varía", () => {
    const options = buildVariantFilterOptions([
      { sizeCm: "2×6", color: "rosa" },
      { sizeCm: "2×6", color: "azul" },
    ]);
    expect(options.map((o) => o.key)).toEqual(["color", "color"]);
    expect(options.map((o) => o.label)).toEqual(["azul", "rosa"]);
  });

  it("[] cuando ningún atributo filtrable varía (solo 'Todas las variantes')", () => {
    expect(buildVariantFilterOptions([{ sizeCm: "2×6" }, { sizeCm: "2×6" }])).toEqual([]);
    expect(buildVariantFilterOptions([{}, {}])).toEqual([]);
    expect(buildVariantFilterOptions([])).toEqual([]);
  });

  it("magnet (booleano) tiene label traducido", () => {
    const options = buildVariantFilterOptions([{ magnet: true }, { magnet: false }]);
    expect(options.map((o) => o.label)).toEqual(["Sin imán", "Con imán"]);
  });
});

describe("describeVariantFilter — badge del admin", () => {
  it("null/vacío → 'Todas'", () => {
    expect(describeVariantFilter(null)).toBe("Todas");
    expect(describeVariantFilter({})).toBe("Todas");
  });

  it("una clave → su valor; multi-clave → join ' · '", () => {
    expect(describeVariantFilter({ sizeCm: "2×6" })).toBe("2×6");
    expect(describeVariantFilter({ sizeCm: "2×6", magnet: true })).toBe("2×6 · Con imán");
  });
});

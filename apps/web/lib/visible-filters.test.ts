/*
 * Unit tests — lib/visible-filters.
 *
 * Fija la semántica de Category.visibleFilters (PLAN_CATALOG_V2 7.6):
 * vacío/null = todos los filtros; no vacío = solo esos, en el orden de la
 * lista; keys desconocidas se ignoran y una lista sin NINGUNA key conocida
 * cae al default (nunca dejar /productos sin filtros por un typo en DB).
 */

import { describe, it, expect } from "vitest";
import { resolveVisibleFilters } from "./visible-filters";

describe("resolveVisibleFilters", () => {
  it("null / undefined / [] → null (todos los filtros, default 7.6)", () => {
    expect(resolveVisibleFilters(null)).toBeNull();
    expect(resolveVisibleFilters(undefined)).toBeNull();
    expect(resolveVisibleFilters([])).toBeNull();
  });

  it("lista válida → solo esas keys, conservando el orden de la lista", () => {
    // Formato real sembrado por seed-catalog-v2.mjs (categoría "separadores").
    expect(resolveVisibleFilters(["sub_categoria", "precio", "ocasion"])).toEqual([
      "sub_categoria",
      "precio",
      "ocasion",
    ]);
    // El orden lo define la lista, no el vocabulario canónico.
    expect(resolveVisibleFilters(["orden", "buscar"])).toEqual(["orden", "buscar"]);
  });

  it("ignora keys desconocidas y duplicados; normaliza case y espacios", () => {
    expect(resolveVisibleFilters([" Precio ", "PRECIO", "forma", "precio", "buscar"])).toEqual([
      "precio",
      "buscar",
    ]);
  });

  it("lista con SOLO keys desconocidas → null (fallback a todos)", () => {
    expect(resolveVisibleFilters(["forma", "tamano"])).toBeNull();
  });
});

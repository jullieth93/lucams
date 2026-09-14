/*
 * Tests unitarios de getFilterParams (photo-filters.ts) — las ramas de
 * null/undefined y del fallback `?? null` para presets desconocidos no tenían
 * cobertura. Puro, corre en CI sin Supabase.
 */

import { describe, expect, it } from "vitest";
import { FILTER_PRESETS, getFilterParams } from "./photo-filters";

describe("getFilterParams", () => {
  it("null/undefined → null (sin filtros Konva)", () => {
    expect(getFilterParams(null)).toBeNull();
    expect(getFilterParams(undefined)).toBeNull();
  });

  it("cada preset curado devuelve sus params", () => {
    for (const [preset, params] of Object.entries(FILTER_PRESETS)) {
      expect(getFilterParams(preset as keyof typeof FILTER_PRESETS)).toEqual(params);
    }
  });

  it("preset desconocido (tamper) → null, nunca rompe", () => {
    expect(getFilterParams("no-existe" as never)).toBeNull();
  });
});

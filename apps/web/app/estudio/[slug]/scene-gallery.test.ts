/*
 * Tests del mapa de escenas por tipo de producto (ola 2B): el calendario de pared queda
 * ARCHIVADO (ningún kind lo ofrece en la galería) y cada producto va a su escena natural.
 * Se mockea next/dynamic para importar el módulo en entorno node (sin cargar las vistas 3D).
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

import { scenesForKind } from "./scene-gallery";

describe("scenesForKind", () => {
  it("photo (default): la galería FOTO4 completa, nevera primero", () => {
    expect(scenesForKind("photo")).toEqual(["fridge", "polaroid", "board", "shelf", "gift"]);
    expect(scenesForKind()).toEqual(["fridge", "polaroid", "board", "shelf", "gift"]);
  });

  it("calendar: las tarjetas mes van a nevera/tablero — el calendario de pared NO se ofrece", () => {
    const scenes = scenesForKind("calendar");
    expect(scenes).toEqual(["fridge", "board"]);
    // "Archivado": no hay ninguna escena de calendario en el union type ni en la lista.
    expect(scenes).not.toContain("book");
    expect(scenes).not.toContain("polaroid");
  });

  it("letters (abecedario / pack vocales): tablero memo", () => {
    expect(scenesForKind("letters")).toEqual(["memo"]);
  });

  it("bookmark (separadores): libro", () => {
    expect(scenesForKind("bookmark")).toEqual(["book"]);
  });

  it("toda lista es no vacía y sin duplicados (fallback razonable)", () => {
    for (const kind of ["photo", "calendar", "letters", "bookmark"] as const) {
      const scenes = scenesForKind(kind);
      expect(scenes.length).toBeGreaterThan(0);
      expect(new Set(scenes).size).toBe(scenes.length);
    }
  });
});

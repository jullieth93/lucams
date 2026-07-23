/*
 * Tests del mapa de escenas por tipo de producto (ola 2B): el calendario de pared queda
 * ARCHIVADO (ningún kind lo ofrece en la galería) y cada producto va a su escena natural.
 * Se mockea next/dynamic para importar el módulo en entorno node (sin cargar las vistas 3D).
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

import { filterPhotoScenes, galleryEscapeAction, initialModalView, scenesForKind } from "./scene-gallery";

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

  it("photo no polaroid: oculta la escena polaroid de la galería FOTO4", () => {
    expect(filterPhotoScenes(scenesForKind("photo"), false)).toEqual([
      "fridge",
      "board",
      "shelf",
      "gift",
    ]);
  });

  it("photo polaroid: mantiene la galería FOTO4 completa con escena polaroid", () => {
    expect(filterPhotoScenes(scenesForKind("photo"), true)).toEqual([
      "fridge",
      "polaroid",
      "board",
      "shelf",
      "gift",
    ]);
  });

  it("toda lista es no vacía y sin duplicados (fallback razonable)", () => {
    for (const kind of ["photo", "calendar", "letters", "bookmark"] as const) {
      const scenes = scenesForKind(kind);
      expect(scenes.length).toBeGreaterThan(0);
      expect(new Set(scenes).size).toBe(scenes.length);
    }
  });
});

describe("flujo detalle-first del calendario (ola 3 — Lucy: detalle primero, espacio después)", () => {
  it("calendar CON tarjetas abre DE UNA en el detalle (no en la galería)", () => {
    expect(initialModalView("calendar", 12)).toBe("detail");
  });

  it("calendar SIN tarjetas no tiene detalle que mostrar → galería", () => {
    expect(initialModalView("calendar", 0)).toBe("gallery");
  });

  it("los demás productos abren en la galería, como siempre", () => {
    expect(initialModalView("photo", 6)).toBe("gallery");
    expect(initialModalView("letters", 27)).toBe("gallery");
    expect(initialModalView("bookmark", 4)).toBe("gallery");
  });

  it("Esc en la galería del calendario vuelve UN nivel: al detalle de donde vino", () => {
    expect(galleryEscapeAction("calendar", 12)).toBe("back-to-detail");
  });

  it("Esc en la galería de los demás productos cierra el modal", () => {
    expect(galleryEscapeAction("photo", 6)).toBe("close");
    expect(galleryEscapeAction("letters", 27)).toBe("close");
    expect(galleryEscapeAction("bookmark", 4)).toBe("close");
    expect(galleryEscapeAction("calendar", 0)).toBe("close");
  });
});

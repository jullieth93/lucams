// @vitest-environment jsdom
/*
 * Fase 2 · item 2.8 — tour de onboarding POR TIPO DE PRODUCTO: superficie,
 * clave de localStorage por superficie y features declarativas (textos CMS).
 */

import { describe, it, expect } from "vitest";
import { tourStorageKey, resolveTourSurface, tourFeaturesFor } from "./studio-tour";
import { DEFAULT_STUDIO_TEXTS } from "../studio-texts";

describe("tourStorageKey", () => {
  it("la clave del «ya lo vi» es POR SUPERFICIE", () => {
    expect(tourStorageKey("calendar")).toBe("lucams_studio_onboarded_calendar");
    expect(tourStorageKey("polaroid-ig")).toBe("lucams_studio_onboarded_polaroid-ig");
    expect(tourStorageKey("default")).toBe("lucams_studio_onboarded_default");
  });
});

describe("resolveTourSurface", () => {
  const base = {
    isInstagramTemplate: false,
    isCalendarMonth: false,
    isBookmark: false,
    isStrip: false,
    hasFrameOptions: false,
  };

  it("la plantilla Instagram manda sobre todo lo demás", () => {
    expect(resolveTourSurface({ ...base, isInstagramTemplate: true, hasFrameOptions: true })).toBe(
      "polaroid-ig",
    );
  });

  it("cada tipo de producto resuelve su superficie", () => {
    expect(resolveTourSurface({ ...base, isCalendarMonth: true })).toBe("calendar");
    expect(resolveTourSurface({ ...base, isBookmark: true })).toBe("bookmarks");
    expect(resolveTourSurface({ ...base, isStrip: true })).toBe("strips");
    expect(resolveTourSurface({ ...base, hasFrameOptions: true })).toBe("cards");
    expect(resolveTourSurface(base)).toBe("default");
  });

  it("un producto con marcos de color que NO es IG → cards", () => {
    expect(resolveTourSurface({ ...base, hasFrameOptions: true })).toBe("cards");
    expect(resolveTourSurface({ ...base, hasFrameOptions: true, isCalendarMonth: true })).toBe(
      "calendar",
    );
  });
});

describe("tourFeaturesFor", () => {
  it("Polaroid IG: foto de perfil (pista del item 2.7), textos del post y marco", () => {
    const features = tourFeaturesFor("polaroid-ig", DEFAULT_STUDIO_TEXTS);
    expect(features.map((f) => f.icon)).toEqual(["user", "type", "frame"]);
    expect(features[0]!.title).toBe("Tu foto de perfil");
    expect(features[0]!.body).toContain("avatar");
  });

  it("calendario: sets/unidades y año + letra", () => {
    const features = tourFeaturesFor("calendar", DEFAULT_STUDIO_TEXTS);
    expect(features).toHaveLength(2);
    expect(features[0]!.title).toBe("Un set por calendario");
    expect(features[1]!.title).toBe("Año y tipo de letra");
  });

  it("separadores: caras A/B y la regla NUEVA del respaldo en blanco", () => {
    const features = tourFeaturesFor("bookmarks", DEFAULT_STUDIO_TEXTS);
    expect(features).toHaveLength(2);
    expect(features[1]!.title).toBe("Respaldo en blanco");
    expect(features[1]!.body).toContain("se imprime en blanco");
  });

  it("tiras: tira continua y unidades; cuadrados: marco/color", () => {
    expect(tourFeaturesFor("strips", DEFAULT_STUDIO_TEXTS)).toHaveLength(2);
    const cards = tourFeaturesFor("cards", DEFAULT_STUDIO_TEXTS);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.icon).toBe("palette");
  });

  it("default (fotoimanes sueltos): sin features — solo los pasos genéricos", () => {
    expect(tourFeaturesFor("default", DEFAULT_STUDIO_TEXTS)).toEqual([]);
  });
});

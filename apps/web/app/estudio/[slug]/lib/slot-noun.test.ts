/*
 * Tests de resolveSlotNoun (Fase 1A, 2026-09-27) — el sustantivo de la pieza
 * usa el productKind REAL y una variante SIN IMÁN nunca dice "imán" (bug: el
 * chip del toolbar le decía "12 imanes" al Calendario Set 12 Tarjetas aun en
 * la variante sin imán).
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_STUDIO_TEXTS } from "../studio-texts";
import { resolveSlotNoun } from "./slot-noun";

const texts = DEFAULT_STUDIO_TEXTS;

describe("resolveSlotNoun", () => {
  it("calendar → tarjetas, con o sin imán (el set se vende como tarjetas mes)", () => {
    expect(resolveSlotNoun("calendar", true, texts)).toEqual({ one: "tarjeta", many: "tarjetas" });
    expect(resolveSlotNoun("calendar", false, texts)).toEqual({
      one: "tarjeta",
      many: "tarjetas",
    });
    expect(resolveSlotNoun("calendar", undefined, texts)).toEqual({
      one: "tarjeta",
      many: "tarjetas",
    });
  });

  it("bookmarks → separador/separadores (plural es-CO de palabra en consonante)", () => {
    expect(resolveSlotNoun("bookmarks", true, texts)).toEqual({
      one: "separador",
      many: "separadores",
    });
  });

  it("strips → foto/fotos (el conteo del chip es la composición, no unidades)", () => {
    expect(resolveSlotNoun("strips", true, texts)).toEqual({ one: "foto", many: "fotos" });
  });

  it("tiles → ficha/fichas (sets de letras: la pieza puede no llevar imán)", () => {
    expect(resolveSlotNoun("tiles", true, texts)).toEqual({ one: "ficha", many: "fichas" });
    expect(resolveSlotNoun("tiles", false, texts)).toEqual({ one: "ficha", many: "fichas" });
  });

  it("magnets CON imán (true/undefined) → imán/imanes", () => {
    expect(resolveSlotNoun("magnets", true, texts)).toEqual({ one: "imán", many: "imanes" });
    expect(resolveSlotNoun("magnets", undefined, texts)).toEqual({ one: "imán", many: "imanes" });
  });

  it("magnets SIN IMÁN (magnet === false) NUNCA dice imán → ficha/fichas", () => {
    const noun = resolveSlotNoun("magnets", false, texts);
    expect(noun).toEqual({ one: "ficha", many: "fichas" });
    expect(noun.one).not.toContain("imán");
    expect(noun.many).not.toContain("imanes");
  });
});

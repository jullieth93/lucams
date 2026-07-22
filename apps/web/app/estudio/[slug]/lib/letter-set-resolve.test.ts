/*
 * Test de la re-resolución de variante del Estudio de sets de letras (Ola 2A): al cambiar
 * tema/idioma en el Estudio se conserva tamaño/imantado y se busca la variante exacta.
 */

import { describe, expect, it } from "vitest";
import { resolveLetterSetVariant, type LetterSetVariant } from "./letter-set-resolve";

const v = (
  id: string,
  attrs: { sizeCm?: string; magnet?: boolean; theme?: string; language?: string },
): LetterSetVariant => ({ id, price: 100_000, ...attrs });

describe("resolveLetterSetVariant (Ola 2A)", () => {
  const vocales: LetterSetVariant[] = [
    v("mini-anim-es", { sizeCm: "5×7", magnet: true, theme: "animales", language: "es" }),
    v("mini-anim-en", { sizeCm: "5×7", magnet: true, theme: "animales", language: "en" }),
    v("mini-fru-es", { sizeCm: "5×7", magnet: true, theme: "frutas", language: "es" }),
    v("clasica-anim-es", { sizeCm: "7×10", magnet: true, theme: "animales", language: "es" }),
    v("clasica-anim-en", { sizeCm: "7×10", magnet: true, theme: "animales", language: "en" }),
  ];

  it("conserva tamaño/imán y matchea tema+idioma exacto", () => {
    expect(
      resolveLetterSetVariant(vocales, "mini-anim-es", { theme: "frutas", language: "es" }),
    ).toBe("mini-fru-es");
  });

  it("cambia solo idioma conservando el tema", () => {
    expect(
      resolveLetterSetVariant(vocales, "clasica-anim-es", { theme: "animales", language: "en" }),
    ).toBe("clasica-anim-en");
  });

  it("cae a tamaño+imán+idioma si el tema no existe en ese tamaño", () => {
    // frutas solo existe en mini: desde clásica + frutas no hay exacta → idioma.
    expect(
      resolveLetterSetVariant(vocales, "clasica-anim-es", { theme: "frutas", language: "en" }),
    ).toBe("clasica-anim-en");
  });

  it("cae a tamaño+imán si no hay idioma disponible", () => {
    const soloEs: LetterSetVariant[] = [
      v("a", { sizeCm: "5×7", magnet: true, language: "es" }),
      v("b", { sizeCm: "5×7", magnet: true, language: "es" }),
    ];
    expect(resolveLetterSetVariant(soloEs, "a", { theme: null, language: "en" })).toBe("a");
  });

  it("abecedario (sin tema en variantes): Solo-letra matchea por idioma", () => {
    const abecedario: LetterSetVariant[] = [
      v("abc-es", { sizeCm: "7×10", magnet: true, language: "es" }),
      v("abc-en", { sizeCm: "7×10", magnet: true, language: "en" }),
    ];
    expect(resolveLetterSetVariant(abecedario, "abc-es", { theme: null, language: "en" })).toBe(
      "abc-en",
    );
    // Con tema elegido (no hay variantes con tema) → cae a idioma.
    expect(
      resolveLetterSetVariant(abecedario, "abc-es", { theme: "animales", language: "en" }),
    ).toBe("abc-en");
  });

  it("variante actual desconocida → devuelve la misma (defensivo)", () => {
    expect(resolveLetterSetVariant(vocales, "no-existe", { theme: null, language: "es" })).toBe(
      "no-existe",
    );
  });
});

/*
 * name-input — normalización del nombre del abecedario (ADR-057). Encoda las decisiones
 * de Lucy: acentos→base con aviso, Ñ solo en español, sin números/símbolos, repetición
 * permitida, 3–10 letras. Lógica pura.
 */

import { describe, expect, it } from "vitest";
import { normalizeName } from "./name-input";

const ES = { language: "es", min: 3, max: 10 } as const;
const EN = { language: "en", min: 3, max: 10 } as const;

describe("normalizeName — casos base", () => {
  it("MIA (es) → 3 fichas, válido", () => {
    const r = normalizeName("MIA", ES);
    expect(r.letters).toEqual(["M", "I", "A"]);
    expect(r.display).toBe("MIA");
    expect(r.valid).toBe(true);
    expect(r.notices).toEqual([]);
  });

  it("minúsculas se normalizan a mayúscula", () => {
    expect(normalizeName("mia", ES).letters).toEqual(["M", "I", "A"]);
  });

  it("repetición de letra permitida: ANA → dos fichas A", () => {
    expect(normalizeName("ANA", ES).letters).toEqual(["A", "N", "A"]);
  });
});

describe("normalizeName — acentos (decisión: aceptar y convertir a base)", () => {
  it("José → JOSE con aviso de acentos", () => {
    const r = normalizeName("José", ES);
    expect(r.letters).toEqual(["J", "O", "S", "E"]);
    expect(r.hadAccents).toBe(true);
    expect(r.valid).toBe(true);
    expect(r.notices.some((n) => n.toLowerCase().includes("acento"))).toBe(true);
  });

  it("María → MARIA", () => {
    expect(normalizeName("María", ES).letters).toEqual(["M", "A", "R", "I", "A"]);
  });

  it("Argüello → ARGUELLO (diéresis a base)", () => {
    const r = normalizeName("Argüello", ES);
    expect(r.letters).toEqual(["A", "R", "G", "U", "E", "L", "L", "O"]);
    expect(r.hadAccents).toBe(true);
  });
});

describe("normalizeName — Ñ por idioma", () => {
  it("AÑO en español conserva la Ñ (ficha propia)", () => {
    const r = normalizeName("AÑO", ES);
    expect(r.letters).toEqual(["A", "Ñ", "O"]);
    expect(r.hadAccents).toBe(false);
  });

  it("AÑO en inglés convierte Ñ→N con aviso", () => {
    const r = normalizeName("AÑO", EN);
    expect(r.letters).toEqual(["A", "N", "O"]);
    expect(r.hadAccents).toBe(true);
  });
});

describe("normalizeName — descarte de no-letras", () => {
  it("A1B! → AB, con aviso de solo-letras", () => {
    const r = normalizeName("A1B!", ES);
    expect(r.letters).toEqual(["A", "B"]);
    expect(r.droppedNonLetters).toBe(true);
    expect(
      r.notices.some(
        (n) => n.toLowerCase().includes("números") || n.toLowerCase().includes("letras"),
      ),
    ).toBe(true);
  });

  it("espacios se descartan (un solo nombre): AN A → ANA", () => {
    const r = normalizeName("AN A", ES);
    expect(r.letters).toEqual(["A", "N", "A"]);
    expect(r.droppedNonLetters).toBe(true);
  });

  it("solo números → vacío, inválido (too short)", () => {
    const r = normalizeName("123", ES);
    expect(r.letters).toEqual([]);
    expect(r.valid).toBe(false);
    expect(r.tooShort).toBe(true);
  });
});

describe("normalizeName — longitud", () => {
  it("2 letras con min 3 → too short, inválido", () => {
    const r = normalizeName("AB", ES);
    expect(r.tooShort).toBe(true);
    expect(r.valid).toBe(false);
  });

  it("11 letras con max 10 → trunca a 10, too long, inválido", () => {
    const r = normalizeName("ABCDEFGHIJK", ES);
    expect(r.letters).toHaveLength(10);
    expect(r.tooLong).toBe(true);
    expect(r.valid).toBe(false);
    expect(r.notices.some((n) => n.includes("10"))).toBe(true);
  });

  it("exactamente 10 letras → válido", () => {
    const r = normalizeName("ABCDEFGHIJ", ES);
    expect(r.letters).toHaveLength(10);
    expect(r.valid).toBe(true);
    expect(r.tooLong).toBe(false);
  });

  it("vacío → inválido sin crashear", () => {
    const r = normalizeName("", ES);
    expect(r.letters).toEqual([]);
    expect(r.valid).toBe(false);
  });
});

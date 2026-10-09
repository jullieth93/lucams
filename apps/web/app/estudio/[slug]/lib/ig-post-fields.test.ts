/*
 * Test de los helpers puros de los campos asistidos "Datos de la publicación"
 * de la Polaroid Instagram (rediseño owner 2026-10-05 — lib/ig-post-fields.ts):
 * sanitización en input, prefijos/sufijos fijos del post real ("@", "me gusta",
 * "#") viajando EN el override guardado (se imprime verbatim), y los topes de
 * producto (usuario 30, caption 140, 3 hashtags).
 */

import { describe, expect, it } from "vitest";
import {
  IG_CAPTION_MAX,
  IG_HASHTAG_MAX_LENGTH,
  IG_HASHTAGS_MAX,
  IG_LIKES_SUFFIX,
  IG_LOCATION_SUGGESTIONS,
  IG_USERNAME_MAX,
  filterIgLocationSuggestions,
  igHashtagsFromStored,
  igHashtagsOverride,
  igLikesDisplay,
  igLikesOverride,
  igUsernameDisplay,
  igUsernameOverride,
  sanitizeIgHashtag,
  sanitizeIgLikesInput,
  sanitizeIgUsernameInput,
} from "./ig-post-fields";

describe("usuario IG — sanitización y «@» fija", () => {
  it("strip en input: sin espacios y solo letras, números, punto y guion bajo", () => {
    expect(sanitizeIgUsernameInput("lucy fotos")).toBe("lucyfotos");
    expect(sanitizeIgUsernameInput("lucy.fotos_2026!#@")).toBe("lucy.fotos_2026");
    expect(sanitizeIgUsernameInput("@@lucy")).toBe("lucy");
  });

  it("el override SIEMPRE guarda la «@» prefijada (se imprime tal cual); vacío → null", () => {
    expect(igUsernameOverride("lucy.fotos")).toBe("@lucy.fotos");
    expect(igUsernameOverride("@lucy")).toBe("@lucy");
    expect(igUsernameOverride("  ")).toBeNull();
    expect(igUsernameOverride("")).toBeNull();
  });

  it("display quita la «@» guardada (el prefijo es adorno fijo de la UI)", () => {
    expect(igUsernameDisplay("@lucy.fotos")).toBe("lucy.fotos");
  });

  it("tope de usuario IG (30 caracteres)", () => {
    expect(IG_USERNAME_MAX).toBe(30);
    expect(igUsernameOverride("a".repeat(40))).toBe(`@${"a".repeat(30)}`);
  });
});

describe("«me gusta» — solo numérico, miles es-CO y sufijo fijo", () => {
  it("strip en input: solo dígitos", () => {
    expect(sanitizeIgLikesInput("1.2a3")).toBe("123");
    expect(sanitizeIgLikesInput("abc")).toBe("");
  });

  it("el override guarda «número con miles es-CO + me gusta» (se imprime tal cual)", () => {
    expect(igLikesOverride("1234")).toBe("1.234 me gusta");
    expect(igLikesOverride("1.234")).toBe("1.234 me gusta");
    expect(igLikesOverride("0")).toBe("0 me gusta");
    expect(igLikesOverride("")).toBeNull();
  });

  it("display deja solo el número formateado (el sufijo es fijo fuera del input)", () => {
    expect(igLikesDisplay("1.234 me gusta")).toBe("1.234");
    expect(igLikesDisplay("362 me gusta")).toBe("362");
    expect(IG_LIKES_SUFFIX).toBe("me gusta");
  });
});

describe("título — límite razonable para la línea impresa", () => {
  it("el límite existe y es acotado (el footer es una línea a 16px)", () => {
    expect(IG_CAPTION_MAX).toBe(140);
  });
});

describe("hashtags — chips, «#» fija y máximo 3", () => {
  it("sanitiza UN tag: sin «#», sin espacios, con tildes/ñ y guion bajo", () => {
    expect(sanitizeIgHashtag("#mi recuerdo")).toBe("mirecuerdo");
    expect(sanitizeIgHashtag("cumpleaños2026")).toBe("cumpleaños2026");
    expect(sanitizeIgHashtag("#familiar!")).toBe("familiar");
  });

  it("parsea el texto guardado a tags (tope de producto aplicado)", () => {
    expect(igHashtagsFromStored("#playa #familia")).toEqual(["playa", "familia"]);
    expect(igHashtagsFromStored("#a #b #c #d")).toEqual(["a", "b", "c"]);
    expect(igHashtagsFromStored("")).toEqual([]);
  });

  it("el override guarda «#tag» separados por espacio (se imprime tal cual); vacío → null", () => {
    expect(igHashtagsOverride(["playa", "familia"])).toBe("#playa #familia");
    expect(igHashtagsOverride([])).toBeNull();
    expect(igHashtagsOverride(["", "  "])).toBeNull();
  });

  it("topes: 3 hashtags y 30 caracteres por tag", () => {
    expect(IG_HASHTAGS_MAX).toBe(3);
    expect(IG_HASHTAG_MAX_LENGTH).toBe(30);
    expect(sanitizeIgHashtag("a".repeat(40))).toHaveLength(30);
  });
});

describe("ubicación — filtro del combobox (Fase 2 · 2.7b; cobertura MUNDIAL QA ronda 2, 2026-10-07)", () => {
  it("query vacío devuelve TODAS las sugerencias", () => {
    expect(filterIgLocationSuggestions("")).toEqual([...IG_LOCATION_SUGGESTIONS]);
    expect(filterIgLocationSuggestions("   ")).toEqual([...IG_LOCATION_SUGGESTIONS]);
  });

  it("filtra por CIUDAD, insensible a tildes y mayúsculas", () => {
    expect(filterIgLocationSuggestions("medellin")).toEqual(["Medellín, Colombia"]);
    expect(filterIgLocationSuggestions("BOGOTA")).toEqual(["Bogotá, Colombia"]);
  });

  it("cobertura mundial: encuentra ciudades de Europa, Norteamérica y el resto de Latinoamérica", () => {
    // Madrid (Europa) y Miami (EE.UU.) — pedidos explícitos del owner.
    expect(filterIgLocationSuggestions("madrid")).toEqual(["Madrid, España"]);
    expect(filterIgLocationSuggestions("miami")).toEqual(["Miami, Estados Unidos"]);
    // Argentina: ciudades + el país solo como fallback.
    expect(filterIgLocationSuggestions("argentina")).toEqual([
      "Buenos Aires, Argentina",
      "Córdoba, Argentina",
      "Rosario, Argentina",
      "Mendoza, Argentina",
      "Argentina",
    ]);
  });

  it("filtra por PAÍS (substring sobre «Ciudad, País» completo)", () => {
    const españa = filterIgLocationSuggestions("españa");
    // Las 8 ciudades curadas de España + el país solo (fallback).
    expect(españa).toEqual([
      "Madrid, España",
      "Barcelona, España",
      "Valencia, España",
      "Sevilla, España",
      "Bilbao, España",
      "Málaga, España",
      "Alicante, España",
      "Palma de Mallorca, España",
      "España",
    ]);
    // Colombia es el mercado principal: la lista curada es mayoritariamente local.
    expect(filterIgLocationSuggestions("colombia").length).toBeGreaterThan(15);
  });

  it("orden: Colombia primero, luego por región, y los países solos al final", () => {
    expect(IG_LOCATION_SUGGESTIONS[0]).toBe("Bogotá, Colombia");
    const soloPaises = IG_LOCATION_SUGGESTIONS.filter((s) => !s.includes(","));
    // El bloque final son los países solos (fallback), en orden alfabético.
    expect(IG_LOCATION_SUGGESTIONS.slice(-soloPaises.length)).toEqual(soloPaises);
    expect(soloPaises).toEqual([...soloPaises].sort((a, b) => a.localeCompare(b, "es")));
  });

  it("sin coincidencias → lista vacía (el texto libre igual vale: no es validación)", () => {
    expect(filterIgLocationSuggestions("Mi vereda del campo")).toEqual([]);
  });
});

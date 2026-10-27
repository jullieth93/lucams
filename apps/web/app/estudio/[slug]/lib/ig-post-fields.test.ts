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
  IG_LOCATION_MAX_LENGTH,
  IG_LOCATION_MAX_SEGMENTS,
  IG_USERNAME_MAX,
  igHashtagsFromStored,
  igHashtagsOverride,
  igLikesDisplay,
  igLikesOverride,
  igLocationFormatIsValid,
  igLocationOverride,
  igUsernameDisplay,
  igUsernameOverride,
  sanitizeIgHashtag,
  sanitizeIgLikesInput,
  sanitizeIgLocationInput,
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

describe("ubicación — «Ciudad, País» multi-palabra (rediseño 2026-10-26, bug de espacios)", () => {
  it("con coma: 2 segmentos multi-palabra, inicial mayúscula por palabra", () => {
    expect(igLocationOverride("santa marta, colombia")).toBe("Santa Marta, Colombia");
    expect(igLocationOverride("Bogotá, Colombia")).toBe("Bogotá, Colombia");
    expect(igLocationOverride("villa de leyva, boyacá")).toBe("Villa De Leyva, Boyacá");
  });

  it("normaliza el resto de la palabra a minúscula (owner 2026-10-27)", () => {
    expect(igLocationOverride("BOGOTÁ,COLOMBIA")).toBe("Bogotá, Colombia");
    expect(igLocationOverride("sAnTa   mArTa,  cOlOmBiA")).toBe("Santa Marta, Colombia");
  });

  it("sin coma: 2 palabras exactas se leen como «Ciudad País» (compat con la convención vieja)", () => {
    expect(igLocationOverride("bogotá colombia")).toBe("Bogotá, Colombia");
    expect(igLocationOverride("bogotá,colombia")).toBe("Bogotá, Colombia");
    expect(igLocationOverride("medellín colombia")).toBe("Medellín, Colombia");
  });

  it("sin coma: 1 palabra o 3+ palabras son UN solo lugar (nunca se parte a la mitad ni se comen palabras)", () => {
    expect(igLocationOverride("colombia")).toBe("Colombia");
    expect(igLocationOverride("korea del sur")).toBe("Korea Del Sur");
    expect(igLocationOverride("santa marta colombia")).toBe("Santa Marta Colombia");
  });

  it("máximo 2 segmentos: lo que sigue a la coma se acumula en el país", () => {
    expect(IG_LOCATION_MAX_SEGMENTS).toBe(2);
    expect(igLocationOverride("bogotá, colombia, sur")).toBe("Bogotá, Colombia Sur");
  });

  it("vacío o solo espacios/coma → null (sin override; el guard de requeridos lo cobra)", () => {
    expect(igLocationOverride("")).toBeNull();
    expect(igLocationOverride("   ")).toBeNull();
    expect(igLocationOverride(",")).toBeNull();
  });

  it("sanitiza en vivo: caracteres inválidos fuera, espacios colapsados, sin espacio inicial", () => {
    expect(sanitizeIgLocationInput("bogotá!! colombia?")).toBe("bogotá colombia");
    expect(sanitizeIgLocationInput("  san   josé")).toBe("san josé");
  });

  it("NUNCA se come espacios ni palabras en vivo: ciudades multi-palabra entran completas", () => {
    // El bug: la 3ª palabra no entraba y el espacio final desaparecía.
    expect(sanitizeIgLocationInput("santa marta")).toBe("santa marta");
    expect(sanitizeIgLocationInput("santa marta, colombia")).toBe("santa marta, colombia");
    expect(sanitizeIgLocationInput("korea del sur")).toBe("korea del sur");
    // Separador final conservado para seguir escribiendo.
    expect(sanitizeIgLocationInput("bogotá ")).toBe("bogotá ");
    expect(sanitizeIgLocationInput("bogotá, ")).toBe("bogotá, ");
  });

  it("máximo UNA coma en vivo (las extra se vuelven espacio); conserva apóstrofe y guion", () => {
    expect(sanitizeIgLocationInput("bogotá, colombia, extra")).toBe("bogotá, colombia extra");
    expect(sanitizeIgLocationInput("villa de leyva's")).toBe("villa de leyva's");
  });

  it("largo acotado (una línea corta del post impreso)", () => {
    expect(IG_LOCATION_MAX_LENGTH).toBe(40);
    expect(sanitizeIgLocationInput("a".repeat(60))).toHaveLength(40);
  });
});

describe("igLocationFormatIsValid — regla «Ciudad, País» de la UI (owner 2026-10-27)", () => {
  it("válido: exactamente UNA coma con ambos segmentos (multi-palabra OK)", () => {
    expect(igLocationFormatIsValid("Santa Marta, Colombia")).toBe(true);
    expect(igLocationFormatIsValid("santa marta, colombia")).toBe(true);
    expect(igLocationFormatIsValid("bogotá,colombia")).toBe(true);
    expect(igLocationFormatIsValid("Villa de Leyva, Boyacá")).toBe(true);
  });

  it("vacío (o solo espacios) es VÁLIDO: el campo es opcional y nunca bloquea", () => {
    expect(igLocationFormatIsValid("")).toBe(true);
    expect(igLocationFormatIsValid("   ")).toBe(true);
  });

  it("inválido: sin coma, coma sin país, país sin ciudad, solo coma", () => {
    expect(igLocationFormatIsValid("Bogotá")).toBe(false);
    expect(igLocationFormatIsValid("Korea del Sur")).toBe(false);
    expect(igLocationFormatIsValid("Santa Marta,")).toBe(false);
    expect(igLocationFormatIsValid(", Colombia")).toBe(false);
    expect(igLocationFormatIsValid(",")).toBe(false);
  });

  it("legacy sin coma: el fallback del override sigue guardando algo sensato (no explota)", () => {
    // La regla de formato es de la UI; valores persistidos sin coma siguen
    // transformándose con el heuristic (nunca null ni basura).
    expect(igLocationFormatIsValid("Korea del Sur")).toBe(false); // la UI avisaría
    expect(igLocationOverride("Korea del Sur")).toBe("Korea Del Sur"); // pero se imprime bien
  });
});

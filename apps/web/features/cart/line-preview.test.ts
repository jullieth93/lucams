/*
 * Cómo se nombra la pieza física en las pantallas de confirmación.
 *
 * No es cosmética: decirle "imán" a una ficha SIN imán es una afirmación falsa sobre el producto que
 * el cliente está comprando, y prometer una medida que no se tiene es peor que no decirla.
 */

import { describe, expect, it } from "vitest";
import { describePieces, pieceKindFor } from "./line-preview";

describe("pieceKindFor — cómo se llama la pieza", () => {
  it("el calendario habla de páginas, no de imanes", () => {
    expect(pieceKindFor("CALENDAR_PHOTO_MONTH", "12 meses")).toBe("calendar");
  });

  it("los separadores hablan de separadores", () => {
    expect(pieceKindFor("BOOKMARK_PHOTO", "Pack 4")).toBe("bookmarks");
  });

  // Los sets de letras se venden "Con imán" y "Sin imán": la variante es lo único que lo distingue.
  it.each(["Español · 5×7 cm · Sin imán", "SIN IMAN", "sin imán"])(
    "la variante %s es una ficha, no un imán",
    (variante) => {
      expect(pieceKindFor("TEXT_ONLY", variante)).toBe("tiles");
    },
  );

  it("con imán sigue siendo imán", () => {
    expect(pieceKindFor("TEXT_ONLY", "Español · 5×7 cm · Con imán")).toBe("magnets");
  });

  it("sin datos, el default es imán (que es lo que vende la tienda)", () => {
    expect(pieceKindFor(null, null)).toBe("magnets");
  });
});

describe("describePieces — qué recibe el cliente", () => {
  it("plural y medida por unidad cuando hay varias piezas", () => {
    expect(describePieces({ kind: "magnets", pieces: 6, sizeCm: "6×6 cm" })).toBe(
      "6 imanes · 6×6 cm cada imán",
    );
  });

  it("con una sola pieza no dice «cada uno»", () => {
    expect(describePieces({ kind: "magnets", pieces: 1, sizeCm: "6×6 cm" })).toBe(
      "1 imán · 6×6 cm",
    );
  });

  it("concuerda el singular del calendario", () => {
    expect(describePieces({ kind: "calendar", pieces: 12, sizeCm: "7.5×10 cm" })).toBe(
      "12 páginas · 7.5×10 cm cada página",
    );
  });

  it("sin medida, solo cuenta las piezas", () => {
    expect(describePieces({ kind: "tiles", pieces: 27, sizeCm: null })).toBe("27 fichas");
  });

  // Callar es correcto; inventar una medida no lo es.
  it("sin nada verdadero que decir, no dice nada", () => {
    expect(describePieces({ kind: "magnets", pieces: null, sizeCm: null })).toBeNull();
    expect(describePieces({ kind: "magnets", pieces: 0, sizeCm: null })).toBeNull();
  });
});

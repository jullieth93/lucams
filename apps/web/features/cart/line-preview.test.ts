/*
 * Cómo se nombra la pieza física en las pantallas de confirmación.
 *
 * No es cosmética: decirle "imán" a una ficha SIN imán es una afirmación falsa sobre el producto que
 * el cliente está comprando, y prometer una medida que no se tiene es peor que no decirla.
 */

import { describe, expect, it } from "vitest";
import {
  dedupeCartLineDetail,
  describePieces,
  pieceKindFor,
  unitCountNounForLine,
} from "./line-preview";

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

describe("unitCountNounForLine — sustantivo del conteo por tipo de producto", () => {
  it("sets de letras (metadata.surface letterset) → set/sets", () => {
    expect(
      unitCountNounForLine({
        personalizationKind: "TEXT_ONLY",
        variantName: "Español · 5×7 cm · Con imán",
        designMetadata: { surface: "letterset", unitCount: 2 },
      }),
    ).toEqual({ singular: "set", plural: "sets" });
  });

  it("calendario mes-a-mes → calendario/calendarios", () => {
    expect(
      unitCountNounForLine({
        personalizationKind: "CALENDAR_PHOTO_MONTH",
        variantName: "12 meses",
      }),
    ).toEqual({ singular: "calendario", plural: "calendarios" });
  });

  it("tiras photobooth (variante «Tira de…») → tira/tiras — aunque el kind sea PHOTO_PACK", () => {
    expect(
      unitCountNounForLine({ personalizationKind: "PHOTO_PACK", variantName: "Tira de 3 fotos" }),
    ).toEqual({ singular: "tira", plural: "tiras" });
  });

  it("separadores (familia de slugs/tags separadores*) → separador/separadores", () => {
    expect(
      unitCountNounForLine({
        personalizationKind: "PHOTO_PACK",
        variantName: "2×6 cm",
        isBookmark: true,
      }),
    ).toEqual({ singular: "separador", plural: "separadores" });
  });

  it("packs de foto (polaroid, fotoimanes) → pack/packs", () => {
    expect(
      unitCountNounForLine({ personalizationKind: "PHOTO_PACK", variantName: "Pack de 10" }),
    ).toEqual({ singular: "pack", plural: "packs" });
  });

  it("sin señal de tipo → unidad/unidades (fallback de siempre)", () => {
    expect(
      unitCountNounForLine({ personalizationKind: "TEXT_ONLY", variantName: "Único" }),
    ).toEqual({ singular: "unidad", plural: "unidades" });
    expect(unitCountNounForLine({ personalizationKind: null, variantName: null })).toEqual({
      singular: "unidad",
      plural: "unidades",
    });
  });
});

describe("dedupeCartLineDetail — cada hecho se muestra UNA vez (owner 2026-10-29)", () => {
  it("el caso reportado: Set 12 tarjetas no repite cantidad ni tamaño", () => {
    const r = dedupeCartLineDetail({
      variantName: "Set 12 tarjetas · 7.5×10 cm",
      variantBreakdown: ["12 fotos", "7.5×10 cm", "Con imán"],
      pieceSummary: "12 páginas · 7.5×10 cada página",
    });
    expect(r.variantBreakdown).toEqual(["Con imán"]);
    expect(r.pieceSummary).toBeNull();
  });

  it("multi-unidad: el conteo de unidades SÍ es hecho nuevo y sobrevive", () => {
    const r = dedupeCartLineDetail({
      variantName: "Set 12 tarjetas · 7.5×10 cm",
      variantBreakdown: ["12 fotos", "7.5×10 cm", "Con imán"],
      pieceSummary: "2 calendarios de 12 páginas · 7.5×10 cada página",
    });
    expect(r.variantBreakdown).toEqual(["Con imán"]);
    expect(r.pieceSummary).toBe("2 calendarios de 12 páginas");
  });

  it("sin duplicación no se toca nada", () => {
    const r = dedupeCartLineDetail({
      variantName: "Con imán",
      variantBreakdown: ["6 fotos", "6×6 cm", "Con imán"],
      pieceSummary: "6 imanes · 6×6 cm cada imán",
    });
    // La variante no enuncia cantidad ni tamaño → breakdown intacto…
    expect(r.variantBreakdown).toEqual(["6 fotos", "6×6 cm", "Con imán"]);
    // …pero el resumen de pieza repite 6 y 6×6 del breakdown → fuera.
    expect(r.pieceSummary).toBeNull();
  });

  it("los tokens sin número («Con imán») siempre aportan", () => {
    const r = dedupeCartLineDetail({
      variantName: "12 fotos · 7.5×10 cm · Con imán",
      variantBreakdown: ["12 fotos", "7.5×10 cm", "Con imán"],
      pieceSummary: null,
    });
    expect(r.variantBreakdown).toEqual(["Con imán"]);
  });

  it("pieceSummary null/vacío → null", () => {
    expect(
      dedupeCartLineDetail({ variantName: "Único", variantBreakdown: [], pieceSummary: null })
        .pieceSummary,
    ).toBeNull();
  });
});

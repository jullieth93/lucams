/*
 * Cómo se describe una línea del carrito en las pantallas de confirmación.
 *
 * Lucy, 2026-07-25: «En cualquier estudio, siempre debería estar la previa "Así se verá tu pedido"»,
 * y en el checkout «sería de valor agregado el preview: Lo que estás cotizando».
 *
 * El Estudio ya lo hace bien —imagen grande, cuántas piezas son, cuánto mide cada una— pero eso vive
 * dentro de su modal. En el checkout, que es donde el cliente decide, la misma línea se reducía a una
 * miniatura de 56 px recortada con `object-cover`: el preview del Estudio es un MOSAICO de las N
 * piezas, así que recortarlo cuadrado se come justo lo que el cliente quiere revisar.
 *
 * Este módulo es puro (sin `server-only` ni imports de next/*) para poder usarlo tanto desde un
 * componente de servidor como desde el formulario cliente.
 */

/** Cómo se llama la pieza física. Mismo criterio que la modal del Estudio. */
export type PieceKind = "magnets" | "calendar" | "bookmarks" | "tiles";

const NOMBRES: Record<PieceKind, { singular: string; plural: string }> = {
  magnets: { singular: "imán", plural: "imanes" },
  calendar: { singular: "página", plural: "páginas" },
  bookmarks: { singular: "separador", plural: "separadores" },
  // Los sets de letras y el nombre tienen variantes "Con imán" y "Sin imán": llamarle "imán" a la
  // que no lo lleva sería una afirmación falsa sobre el producto que se está comprando.
  tiles: { singular: "ficha", plural: "fichas" },
};

export function pieceKindFor(
  personalizationKind: string | null | undefined,
  variantName: string | null | undefined,
): PieceKind {
  if (personalizationKind === "CALENDAR_PHOTO_MONTH") return "calendar";
  if (personalizationKind === "BOOKMARK_PHOTO") return "bookmarks";
  // La variante "Sin imán" es lo único que distingue una ficha de un imán en los sets de letras.
  if (variantName && /sin\s+im[áa]n/i.test(variantName)) return "tiles";
  return "magnets";
}

/**
 * Frase que resume la pieza física: cuántas son y cuánto mide cada una.
 * Devuelve `null` si no hay nada verdadero que decir — mejor callar que inventar una medida.
 */
export function describePieces(input: {
  kind: PieceKind;
  pieces: number | null;
  sizeCm?: string | null;
}): string | null {
  const { singular, plural } = NOMBRES[input.kind];
  const partes: string[] = [];
  if (input.pieces && input.pieces > 0) {
    partes.push(`${input.pieces} ${input.pieces === 1 ? singular : plural}`);
  }
  if (input.sizeCm) {
    // "c/u" solo tiene sentido cuando hay más de una pieza.
    partes.push(
      input.pieces && input.pieces > 1 ? `${input.sizeCm} cada ${singular}` : `${input.sizeCm}`,
    );
  }
  return partes.length > 0 ? partes.join(" · ") : null;
}

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
export type PieceKind = "magnets" | "calendar" | "bookmarks" | "tiles" | "strips";

const NOMBRES: Record<PieceKind, { singular: string; plural: string }> = {
  magnets: { singular: "imán", plural: "imanes" },
  calendar: { singular: "página", plural: "páginas" },
  bookmarks: { singular: "separador", plural: "separadores" },
  // Los sets de letras y el nombre tienen variantes "Con imán" y "Sin imán": llamarle "imán" a la
  // que no lo lleva sería una afirmación falsa sobre el producto que se está comprando.
  tiles: { singular: "ficha", plural: "fichas" },
  // Multi-unidad (2026-09-09) — tiras photobooth: la pieza es la TIRA continua;
  // las "piezas" dentro de ella son fotos (antes se leían como "imanes", incorrecto).
  strips: { singular: "foto", plural: "fotos" },
};

/** Sustantivo de la UNIDAD cuando el diseño trae varias (multi-unidad). */
export type UnitNoun = { singular: string; plural: string };

/**
 * Sustantivo de la unidad comercial de una línea personalizada para los
 * CONTEOS ("2 tiras", "3 packs", "1 set") — etiqueta de cantidad del carrito y
 * badge «N …» sobre la miniatura. Antes todo decía "unidad/unidades", que para
 * un cliente que pidió 2 tiras photobooth leía raro.
 *
 * Misma terminología que describePieces y el pager del Estudio
 * (estudio.unidades.nombre*). Precedencia:
 *   - sets de letras (metadata.surface "letterset") → set/sets;
 *   - calendario (CALENDAR_PHOTO_MONTH) → calendario/calendarios;
 *   - tiras photobooth (variante "Tira de…") → tira/tiras;
 *   - separadores (familia de slugs/tags "separadores*") → separador/separadores;
 *   - packs de foto (PHOTO_PACK: polaroid, fotoimanes) → pack/packs;
 *   - resto → unidad/unidades.
 */
export function unitCountNounForLine(input: {
  personalizationKind: string | null | undefined;
  variantName: string | null | undefined;
  /** Design.metadata de la línea (surface "letterset" → sets de letras). */
  designMetadata?: unknown;
  /** El producto es de la familia separadores (galleryTag/slug "separadores*"). */
  isBookmark?: boolean;
}): UnitNoun {
  const meta =
    input.designMetadata && typeof input.designMetadata === "object"
      ? (input.designMetadata as { surface?: unknown })
      : null;
  if (meta?.surface === "letterset") return { singular: "set", plural: "sets" };
  const kind = pieceKindFor(input.personalizationKind, input.variantName);
  if (kind === "calendar") return { singular: "calendario", plural: "calendarios" };
  if (kind === "strips") return { singular: "tira", plural: "tiras" };
  if (kind === "bookmarks" || input.isBookmark) {
    return { singular: "separador", plural: "separadores" };
  }
  if (input.personalizationKind === "PHOTO_PACK") {
    return { singular: "pack", plural: "packs" };
  }
  return { singular: "unidad", plural: "unidades" };
}

export function pieceKindFor(
  personalizationKind: string | null | undefined,
  variantName: string | null | undefined,
): PieceKind {
  if (personalizationKind === "CALENDAR_PHOTO_MONTH") return "calendar";
  if (personalizationKind === "BOOKMARK_PHOTO") return "bookmarks";
  // Tiras photobooth: la variante se llama "Tira de N fotos…" — la unidad es la tira.
  if (variantName && /^\s*tira\b/i.test(variantName)) return "strips";
  // La variante "Sin imán" es lo único que distingue una ficha de un imán en los sets de letras.
  if (variantName && /sin\s+im[áa]n/i.test(variantName)) return "tiles";
  return "magnets";
}

// ──────────────────────────────────────────────────────────────────
//  Dedupe del detalle de la línea (owner 2026-10-29)
// ──────────────────────────────────────────────────────────────────
//
// La línea del carrito mostraba el mismo dato 2-3 veces: el nombre libre de la
// variante («Set 12 tarjetas · 7.5×10 cm»), el desglose estructurado
// («12 fotos · 7.5×10 cm · Con imán») y el resumen de pieza («12 páginas ·
// 7.5×10 cada página») repetían cantidad y tamaño. Regla: cada HECHO (un número
// de cantidad o una medida A×B) se muestra UNA sola vez — el primer contenedor
// de arriba hacia abajo que lo enuncia gana (variantName → breakdown →
// pieceSummary). Un token sobrevive solo si aporta un hecho nuevo («Con imán»,
// «2 calendarios de …» — el 2 es nuevo).

const SIZE_RE = /(\d+(?:[.,]\d+)?)\s*[×x]\s*(\d+(?:[.,]\d+)?)/g;
const NUMBER_RE = /\d+(?:[.,]\d+)?/g;

/**
 * Hechos mencionados en un texto: cada medida «A×B» cuenta como UN hecho
 * compuesto (normalizada «7.5×10»), no como dos números sueltos — «6 fotos» y
 * «6×6 cm» son hechos DISTINTOS aunque compartan el 6.
 */
function mentionedFacts(text: string): Set<string> {
  const facts = new Set<string>();
  const withoutSizes = text.replace(SIZE_RE, (m) => {
    facts.add(m.replace(/\s+/g, "").replace(/x/gi, "×"));
    return " ";
  });
  for (const n of withoutSizes.match(NUMBER_RE) ?? []) facts.add(n);
  return facts;
}

/** ¿El token aporta al menos UN hecho no mencionado antes? Los tokens sin
 *  número («Con imán», «Blanco clásico») siempre aportan. */
function addsNewFact(token: string, seen: Set<string>): boolean {
  const facts = [...mentionedFacts(token)];
  if (facts.length === 0) return true;
  return facts.some((f) => !seen.has(f));
}

/**
 * Dedupe del detalle de una línea del carrito/checkout: filtra de
 * `variantBreakdown` y `pieceSummary` los tokens cuyos números ya enunció un
 * contenedor superior. `pieceSummary` queda null cuando ya no dice nada nuevo.
 */
export function dedupeCartLineDetail(input: {
  variantName: string;
  variantBreakdown: string[];
  pieceSummary: string | null;
}): { variantBreakdown: string[]; pieceSummary: string | null } {
  const seen = mentionedFacts(input.variantName);

  const variantBreakdown = input.variantBreakdown.filter((token) => {
    if (!addsNewFact(token, seen)) return false;
    for (const f of mentionedFacts(token)) seen.add(f);
    return true;
  });

  let pieceSummary: string | null = null;
  if (input.pieceSummary) {
    const kept = input.pieceSummary.split(" · ").filter((token) => {
      if (!addsNewFact(token, seen)) return false;
      for (const f of mentionedFacts(token)) seen.add(f);
      return true;
    });
    pieceSummary = kept.length > 0 ? kept.join(" · ") : null;
  }

  return { variantBreakdown, pieceSummary };
}

/**
 * Frase que resume la pieza física: cuántas son y cuánto mide cada una.
 * Devuelve `null` si no hay nada verdadero que decir — mejor callar que inventar una medida.
 *
 * Multi-unidad (2026-09-09): con `units > 1` + `unitNoun`, la frase describe las
 * unidades del DISEÑO ("2 tiras de 3 fotos", "2 calendarios de 12 páginas",
 * "2 sets de 27 fichas") — la línea del carrito es UNA y contiene las N unidades.
 */
export function describePieces(input: {
  kind: PieceKind;
  pieces: number | null;
  sizeCm?: string | null;
  /** Unidades que contiene el diseño (Design.metadata.unitCount). */
  units?: number | null;
  /** Sustantivo de la unidad ("tira", "calendario", "set") — requerido si units > 1. */
  unitNoun?: UnitNoun;
}): string | null {
  const { singular, plural } = NOMBRES[input.kind];

  // Tiras photobooth: la unidad es la tira; las piezas son las fotos que lleva.
  if (input.kind === "strips") {
    const fotos = input.pieces && input.pieces > 0 ? input.pieces : null;
    const units = input.units && input.units > 1 ? input.units : 1;
    const base = fotos
      ? units > 1
        ? `${units} tiras de ${fotos} fotos`
        : `tira de ${fotos} fotos`
      : units > 1
        ? `${units} tiras`
        : "tira";
    return input.sizeCm ? `${base} · ${input.sizeCm}${units > 1 ? " cada tira" : ""}` : base;
  }

  const partes: string[] = [];
  if (input.units && input.units > 1 && input.unitNoun) {
    // Multi-unidad: "2 calendarios de 12 páginas" / "2 sets de 27 fichas".
    const unitLabel = input.unitNoun.plural;
    const piecesLabel =
      input.pieces && input.pieces > 0
        ? ` de ${input.pieces} ${input.pieces === 1 ? singular : plural}`
        : "";
    partes.push(`${input.units} ${unitLabel}${piecesLabel}`);
  } else if (input.pieces && input.pieces > 0) {
    partes.push(`${input.pieces} ${input.pieces === 1 ? singular : plural}`);
  }
  if (input.sizeCm) {
    // "c/u" solo tiene sentido cuando hay más de una pieza.
    const manyPieces = (input.pieces ?? 0) > 1 || (input.units ?? 0) > 1;
    partes.push(manyPieces ? `${input.sizeCm} cada ${singular}` : `${input.sizeCm}`);
  }
  return partes.length > 0 ? partes.join(" · ") : null;
}

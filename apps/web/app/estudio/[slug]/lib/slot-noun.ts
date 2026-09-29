/*
 * resolveSlotNoun — sustantivo de la pieza/unidad del producto, compartido por
 * el chip resumen del toolbar ("📐 7.5×10 · 12 tarjetas") y cualquier superficie
 * que nombre las piezas del diseño (la modal de confirmación ya resolvía esto
 * por productKind; el toolbar solo distinguía separadores vs imanes y le decía
 * "12 imanes" a un calendario SIN IMÁN — bug Fase 1A).
 *
 * Reglas:
 *  (a) Se usa el productKind REAL (calendar/bookmarks/strips/tiles/magnets),
 *      no solo "es separador o no".
 *  (b) Una variante SIN IMÁN (magnet === false) NUNCA dice "imán": la pieza es
 *      una "ficha" (mismo criterio de la modal de confirmación — afirmar "imán"
 *      de una pieza sin imán es una afirmación falsa sobre el producto físico).
 *  (c) Plural es-CO correcto: imán→imanes, tarjeta→tarjetas, ficha→fichas…
 *
 * Conteos (el chip cuenta lo que diseña el cliente por unidad):
 *  - calendar → tarjetas mes (12). bookmarks → separadores (unidades físicas).
 *  - strips → el conteo del chip son las FOTOS por tira (la composición), no
 *    tiras → "foto"/"fotos".
 */

import type { StudioTexts } from "../studio-texts";

/** Mismo union que productKind de StudioPreviewModal. */
export type StudioSlotProductKind = "magnets" | "calendar" | "bookmarks" | "tiles" | "strips";

export type SlotNoun = {
  /** Singular ("imán", "tarjeta", "ficha", "separador", "foto"). */
  one: string;
  /** Plural ("imanes", "tarjetas", "fichas", "separadores", "fotos"). */
  many: string;
};

export function resolveSlotNoun(
  productKind: StudioSlotProductKind,
  magnet: boolean | undefined,
  texts: StudioTexts,
): SlotNoun {
  switch (productKind) {
    case "calendar":
      // Las tarjetas mes: con o sin imán son "tarjetas" (el set se vende como
      // "Set 12 Tarjetas"; el claim 3D de la galería usa el mismo sustantivo).
      return { one: "tarjeta", many: "tarjetas" };
    case "bookmarks": {
      const one = texts.lienzo.sustantivoSeparador;
      // Plural es-CO de la palabra terminada en consonante ("separador"→"separadores").
      return { one, many: `${one}es` };
    }
    case "strips":
      // El conteo del chip es la composición (fotos por tira), no unidades.
      return { one: "foto", many: "fotos" };
    case "tiles":
      return { one: texts.exportar.piezaFicha, many: texts.exportar.piezaFichas };
    case "magnets":
    default:
      // SIN IMÁN (magnet === false): nunca "imán" — la pieza es una ficha.
      if (magnet === false) {
        return { one: texts.exportar.piezaFicha, many: texts.exportar.piezaFichas };
      }
      return { one: texts.exportar.piezaIman, many: texts.exportar.piezaImanes };
  }
}

/*
 * Rótulos por página del "Ver" paginado (DesignPreviewDialog, 2026-10-22).
 *
 * Las páginas watermark del preview (wm/pages/NN.webp) se componen en orden
 * página 1 = primera unidad (saveDesignPreviewPages), así que el rótulo de la
 * página k describe la unidad k — alinear por ÍNDICE es seguro. Este helper
 * resuelve esos rótulos server-side para las 4 superficies que comparten el
 * diálogo (carrito, /checkout/gracias, /mi-cuenta/pedidos/[number],
 * /pedido/[token]):
 *
 *   - Sets de letras multi-set (ADR-157): "Set 2 · con borde" — cada set
 *     declara su withBorder en metadata.units[k] (las claves raíz solo
 *     representan al set 0). El estilo ilustrado (styleSetId) es un slug y los
 *     colores son hex por ficha: ninguno es legible para el cliente, así que
 *     el rótulo no los expone.
 *   - Resto multi-unidad (tiras, calendarios, separadores): "{Nombre} N" con
 *     el sustantivo de la unidad que ya usa el Estudio (texts.unidades.*).
 *
 * REGLA DE ALINEACIÓN: si el nº de unidades no cuadra con el nº EFECTIVO de
 * páginas (tope PREVIEW_PAGES_MAX de designPreviewWmPageUrls — diseños viejos
 * o de más de 24 unidades), se devuelve null: nunca rótulos desalineados.
 *
 * Módulo PURO (sin server-only ni Prisma): lo usan páginas server y tests.
 */

import { designDisplayUnits } from "./design-units";
import { PREVIEW_PAGES_MAX } from "./preview-artifacts";
import { pieceKindFor } from "@/features/cart/line-preview";

/** Subconjunto del Design que el cálculo de rótulos necesita. */
export type PreviewPageLabelsDesign = {
  canvasData?: unknown;
  metadata?: unknown;
  previewPagesCount?: number | null;
};

/**
 * Sustantivo de la unidad física para los rótulos ("Calendario", "Tira",
 * "Separador") — misma terminología que el pager del Estudio
 * (texts.unidades.nombreCalendario/nombreTira/nombreSeparador). Los packs de
 * imán suelto no declaran unidades (no llegan acá); el resto cae en "Unidad".
 */
export function unitNounForLine(
  personalizationKind: string | null | undefined,
  variantName: string | null | undefined,
): string {
  switch (pieceKindFor(personalizationKind, variantName)) {
    case "calendar":
      return "Calendario";
    case "strips":
      return "Tira";
    case "bookmarks":
      return "Separador";
    default:
      return "Unidad";
  }
}

type LetterSetUnitMeta = { withBorder?: unknown };

function letterSetUnitLabels(units: unknown[], pageCount: number): string[] | null {
  if (units.length !== pageCount) return null;
  return units.map((u, k) => {
    const withBorder =
      !u || typeof u !== "object" ? true : (u as LetterSetUnitMeta).withBorder !== false;
    return `Set ${k + 1} · ${withBorder ? "con borde" : "sin borde"}`;
  });
}

/**
 * Rótulos alineados por índice con las páginas del "Ver" paginado, o null
 * cuando no hay nada verdadero que rotular (diseño de 1 unidad, sin páginas,
 * o unidades que no cuadran con las páginas — diseños viejos).
 */
export function designPreviewPageLabels(
  design: PreviewPageLabelsDesign | null | undefined,
  unitNoun = "Unidad",
): string[] | null {
  if (!design) return null;
  // Mismo tope que designPreviewWmPageUrls: las páginas exhibidas nunca pasan
  // de PREVIEW_PAGES_MAX aunque el diseño declare más unidades.
  const pageCount = Math.min(PREVIEW_PAGES_MAX, Math.trunc(design.previewPagesCount ?? 0) || 0);
  if (pageCount < 2) return null;

  const meta =
    design.metadata && typeof design.metadata === "object"
      ? (design.metadata as { surface?: unknown; units?: unknown })
      : null;
  if (meta?.surface === "letterset" && Array.isArray(meta.units) && meta.units.length > 1) {
    return letterSetUnitLabels(meta.units, pageCount);
  }

  const noun = meta?.surface === "letterset" ? "Set" : unitNoun;
  const units = designDisplayUnits(design);
  if (units === null || units < 2 || units !== pageCount) return null;
  return Array.from({ length: pageCount }, (_, k) => `${noun} ${k + 1}`);
}

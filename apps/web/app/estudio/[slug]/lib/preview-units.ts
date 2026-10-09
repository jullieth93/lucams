/*
 * Fase 2 · item 2.2 (2026-10-07) — partición de la Vista Previa POR UNIDAD.
 *
 * Antes la Vista Previa montaba TODO el diseño en UNA imagen (buildCompositedPreview
 * / buildCalendarPreviewMontage): con 4 sets de calendario (48 páginas) o 5
 * separadores la composición quedaba diminuta e ilegible. Ahora la modal muestra
 * UNA página por unidad física (set / tira / separador / pack / pieza) a tamaño
 * legible con navegación (flechas + dots + swipe), mientras el preview que se
 * SUBE al servidor al confirmar sigue siendo el montaje único (contrato intacto).
 *
 * Reglas de partición (espejo del lienzo, studio-canvas-grid):
 *  1. Modelo multi-unidad declarado (unitCount > 1, unitSlots > 1): un rango por
 *     unidad — calendario (12/set), tiras (fotos/tira), separadores (2 caras:
 *     su unidad son los 2 slots de caras).
 *  2. Packs de unidades sueltas (fotoimanes packs de 6, ADR-101): un rango por
 *     PACK (packGroupSlots, solo si divide exacto — diseños legacy quedan en una
 *     sola página, igual que la grilla).
 *  3. Cualquier otro caso (1 unidad, packs de imán suelto sin delimitación):
 *     UNA página — la modal no muestra navegación.
 *
 * Módulo PURO → testeable sin canvas ni DOM.
 */

export type PreviewUnitRange = { start: number; end: number };

export function previewUnitRanges(opts: {
  slotCount: number;
  unitCount?: number;
  unitSlots?: number;
  /** Tamaño del pack en familias vendidas por packs de unidades sueltas (ADR-101). */
  packGroupSlots?: number | null;
}): PreviewUnitRange[] {
  const slotCount = Math.max(0, Math.trunc(opts.slotCount) || 0);
  if (slotCount <= 0) return [];
  const unitCount = Math.trunc(opts.unitCount ?? 1) || 1;
  const unitSlots = Math.trunc(opts.unitSlots ?? 1) || 1;

  // 1. Modelo multi-unidad declarado: un rango por unidad física.
  if (unitCount > 1 && unitSlots > 1 && unitCount * unitSlots <= slotCount) {
    return Array.from({ length: unitCount }, (_, u) => ({
      start: u * unitSlots,
      end: (u + 1) * unitSlots,
    }));
  }

  // 2. Packs de unidades sueltas (fotoimanes): un rango por pack completo.
  const pack = opts.packGroupSlots;
  if (typeof pack === "number" && pack > 1 && slotCount > pack && slotCount % pack === 0) {
    const packs = slotCount / pack;
    return Array.from({ length: packs }, (_, p) => ({ start: p * pack, end: (p + 1) * pack }));
  }

  // 3. Una sola página (sin navegación en la modal).
  return [{ start: 0, end: slotCount }];
}

/** ¿La Vista Previa necesita pager (más de una unidad)? */
export function previewNeedsPager(ranges: PreviewUnitRange[]): boolean {
  return ranges.length > 1;
}

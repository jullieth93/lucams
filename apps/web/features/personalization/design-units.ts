/*
 * Modelo MULTI-UNIDAD del Estudio (regla general del owner, 2026-09-09).
 *
 * "Unidades" = N unidades físicas del mismo producto, CADA UNA diseñable por
 * separado en el Estudio. El concepto viejo de "copias idénticas" desaparece de
 * las superficies personalizables: la PDP manda `?copies=N` y el Estudio abre
 * con N unidades a diseñar (2 tiras de 3 fotos = 2 × 3 slots; 2 calendarios =
 * 2 × 12 tarjetas; 3 separadores = 3 × 2 caras — el caso que ya existía vía
 * facesPerUnit).
 *
 * Modelo de datos (canvasData V2, aditivo — sin bump de versión):
 *
 *   unitCount?: number   — N unidades del diseño. Ausente = 1 (diseños legacy).
 *   unitSlots?: number   — slots de diseño por unidad (tira de 3 → 3;
 *                          calendario → 12; separador 2 caras → 2; imán suelto → 1).
 *   Invariante: slotCount = unitCount × unitSlots.
 *
 * Cuando unitCount > 1 y unitSlots > 1 (y el producto NO es de caras agrupadas),
 * `gridLayout` describe la grilla de UNA unidad (unitSlots slots); en el resto
 * de los casos sigue describiendo el diseño completo (retrocompatible).
 *
 * Precio (la ruta del dinero NO confía en el cliente): la variante cubre UNA
 * unidad (productos de composición fija: calendario, tira, set de letras) o el
 * pack declarado en la raíz del canvasData (packs de foto: photoSlots = unidades
 * del pack — imanes polaroid, separadores — o fotos por tira en las tiras). El
 * multiplicador se DERIVA de slotCount vs lo que cubre la variante — nunca del
 * unitCount crudo, que lo escribe el cliente. `facesPerUnit` viene del SCHEMA
 * DEL PRODUCTO (servidor), no del canvas:
 *
 *   multiplier = ceil(slotCount / (photoSlots_raíz × facesPerUnit))  [packs]
 *   multiplier = ceil(slotCount / unitSlots)                         [fija]
 *
 *   · polaroid 10 imanes: no declara unidades (unitSlots = 1) → 1 (la variante
 *     ya es el pack de 10).
 *   · tira 3 fotos × 2 unidades: slotCount 6, photoSlots raíz 3 × 1 cara → 2.
 *   · separadores × 3: slotCount 6, photoSlots raíz 3 (unidades) × 2 caras → 1
 *     (la variante ya es el pack de 3).
 *   · calendario × 2: slotCount 24, sin photoSlots raíz → ceil(24/12) = 2.
 *   · diseños legacy (sin unitSlots): 1 — comportamiento intacto de siempre.
 *
 * Invariante de ESCRITURA (editor): `unitCount`/`unitSlots` solo se persisten
 * cuando unitSlots > 1 — los packs de imán suelto (polaroid/cuadrados) NO los
 * declaran, así que su multiplicador queda en 1 para siempre (la variante ya
 * es el pack). Con cualquier tampering del cliente el resultado queda
 * económicamente consistente (se paga por pieza equivalente).
 *
 * Módulo PURO (sin server-only, sin Prisma): lo usan el editor (client), el
 * carrito y el spec de producción (server) — una sola fuente de verdad.
 */

/** Shape mínima que leen estos helpers (compatible con el Json de Prisma). */
export type DesignUnitsShape = {
  version?: unknown;
  slotCount?: unknown;
  unitCount?: unknown;
  unitSlots?: unknown;
  photoSlots?: unknown;
  slots?: unknown;
};

const intOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : null;

/** ¿El canvasData es V2 y declara el modelo multi-unidad? */
export function declaresUnits(canvasData: unknown): boolean {
  if (!canvasData || typeof canvasData !== "object") return false;
  const cd = canvasData as DesignUnitsShape;
  return cd.version === 2 && intOrNull(cd.unitSlots) !== null;
}

/**
 * Slots de diseño por unidad física. Si el diseño no los declara (legacy), se
 * deriva: con unitCount declarado, reparte slotCount; si no, toda la pila de
 * slots es UNA unidad (comportamiento pre-ola).
 */
export function unitSlotsOf(canvasData: unknown, slotCountFallback = 1): number {
  const cd = (canvasData ?? {}) as DesignUnitsShape;
  const declared = intOrNull(cd.unitSlots);
  if (declared !== null) return declared;
  const slotCount = intOrNull(cd.slotCount) ?? slotCountFallback;
  const unitCount = intOrNull(cd.unitCount);
  if (unitCount !== null && unitCount > 1) {
    return Math.max(1, Math.round(slotCount / unitCount));
  }
  return Math.max(1, slotCount);
}

/** Unidades físicas del diseño (≥ 1). Ausente = 1 (legacy). */
export function unitCountOf(canvasData: unknown): number {
  const cd = (canvasData ?? {}) as DesignUnitsShape;
  const declared = intOrNull(cd.unitCount);
  if (declared !== null) return declared;
  const slotCount = intOrNull(cd.slotCount) ?? 1;
  const unitSlots = intOrNull(cd.unitSlots);
  if (unitSlots !== null && unitSlots > 0 && unitSlots < slotCount) {
    return Math.ceil(slotCount / unitSlots);
  }
  return 1;
}

/** Índice de unidad (0-based) dueña de un slot. */
export function unitIndexOfSlot(slotIndex: number, unitSlots: number): number {
  return Math.floor(slotIndex / Math.max(1, unitSlots));
}

/** Rango [start, end) de slotIndex de una unidad dentro del array plano. */
export function unitSlotRange(
  unitIndex: number,
  unitSlots: number,
): { start: number; end: number } {
  const start = unitIndex * Math.max(1, unitSlots);
  return { start, end: start + Math.max(1, unitSlots) };
}

/**
 * Cuántos slots describe `gridLayout`: con el modelo multi-unidad activo
 * (unitCount > 1, unitSlots > 1) y FUERA del modo de caras agrupadas
 * (separadores, que ya apilan tarjetas-unidad), el layout describe la grilla
 * de UNA unidad (unitSlots); en cualquier otro caso, el diseño completo
 * (slotCount) — retrocompatible con diseños de una sola unidad.
 */
export function gridSlotCountForLayout(opts: {
  unitCount: number;
  unitSlots: number;
  slotCount: number;
  facesPerUnit?: number;
}): number {
  const multiUnit = opts.unitCount > 1 && opts.unitSlots > 1 && opts.facesPerUnit !== 2;
  return multiUnit ? opts.unitSlots : opts.slotCount;
}

/**
 * Fotos por unidad física según el producto/plantilla (para construir el
 * modelo en el editor):
 *   - calendario mes-a-mes → photoSlots (12 tarjetas por calendario).
 *   - separadores (facesPerUnit=2) → 1 foto por cara (las caras son los slots).
 *   - tira photobooth (plantilla gridCols=1/gridGap=0) → photoSlots por tira.
 *   - resto (polaroid, cuadrados…) → 1: cada imán ES su propia unidad.
 */
export function photosPerUnitForEditor(opts: {
  isCalendarMonth: boolean;
  facesPerUnit: number;
  photoSlots: number;
  unitTemplate: unknown;
}): number {
  if (opts.isCalendarMonth) return Math.max(1, opts.photoSlots);
  if (opts.facesPerUnit === 2) return 1;
  const tpl = opts.unitTemplate as { gridCols?: unknown; gridGap?: unknown } | null;
  const isStrip = tpl?.gridCols === 1 && tpl?.gridGap === 0;
  if (isStrip) return Math.max(1, opts.photoSlots);
  return 1;
}

/**
 * Tope de unidades diseñables por producto: el schema Zod capa slotCount en 50
 * (payload/abuso), así que unitCount × unitSlots ≤ 50.
 */
export const MAX_DESIGN_SLOTS = 50;
export function maxUnitsForProduct(unitSlots: number): number {
  return Math.max(1, Math.floor(MAX_DESIGN_SLOTS / Math.max(1, unitSlots)));
}

/** Tope de sets de letras por diseño (cada set = 1 lámina de producción). */
export const MAX_LETTER_SET_UNITS = 10;

/**
 * Multiplicador del precio de variante por las unidades del diseño (ver la
 * doc del módulo). Servidor-side en el carrito; puro para testear sin mocks.
 *
 * `facesPerUnit` sale del personalizationSchema del PRODUCTO (verdad del
 * servidor — separadores: 2), nunca del canvasData (lo escribe el cliente).
 */
export function designUnitPriceMultiplier(canvasData: unknown, facesPerUnit = 1): number {
  if (!declaresUnits(canvasData)) return 1;
  const cd = canvasData as DesignUnitsShape;
  const slotCount = intOrNull(cd.slotCount) ?? 1;
  const rootPhotoSlots = intOrNull(cd.photoSlots);
  const covered =
    rootPhotoSlots !== null
      ? rootPhotoSlots * Math.max(1, facesPerUnit)
      : (intOrNull(cd.unitSlots) ?? 1);
  return Math.max(1, Math.ceil(slotCount / Math.max(1, covered)));
}

/**
 * Unidades declaradas por un diseño de SET DE LETRAS (metadata, no canvasData:
 * el set se guarda como V1 stub + metadata). El servidor escribe
 * `metadata.unitCount` validado al crear; ausente/inválido → 1.
 *
 * El gate es `surface === "letterset"`: en diseños de canvas V2 (tiras,
 * calendarios, separadores) el finalize escribe `metadata.unitCount` como
 * ESPEJO del canvas (para que el carrito describa la línea sin deserializar)
 * — contarlo aquí duplicaría el multiplicador que ya deriva
 * `designUnitPriceMultiplier` del canvas (bug 2026-09-11: tira ×2 cobraba ×4).
 */
export function letterSetUnitCount(metadata: unknown): number {
  if (!metadata || typeof metadata !== "object") return 1;
  const m = metadata as { surface?: unknown; unitCount?: unknown };
  if (m.surface !== "letterset") return 1;
  const n = m.unitCount;
  return typeof n === "number" && Number.isInteger(n) && n >= 1
    ? Math.min(MAX_LETTER_SET_UNITS, n)
    : 1;
}

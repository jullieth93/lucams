/*
 * StudioCanvasGrid — cálculo puro de tamaño de stage y layout de columnas.
 *
 * Extraído de studio-canvas-grid.tsx (Lucy 2026-09-07) para poder testear
 * unitariamente las reglas de tamaño sin montar Konva ni React:
 *   - Marco máximo en alto (82% del viewport, acotado 440-1100px).
 *   - Caps de alto por cantidad de slots (few/medium/many).
 *   - Excepción "texto editable" (Polaroid Instagram y similares): SIN cap por
 *     conteo y con piso TEXT_MIN_SLOT_SIZE, para que los textos pequeños del
 *     lienzo tengan target de tap usable (bug: la IG se veía pequeña).
 *   - Columnas responsive: productos con texto editable van a 1 columna en
 *     móvil (< BP_MOBILE), igual que el calendario.
 */

// Ola 21 (Lucy 2026-07-27) — marco máximo TAMBIÉN EN ALTO: el tamaño de celda se deriva
// del ancho Y del alto disponible, así ningún estudio se desborda (calendario 4×3,
// polaroid 1-slot, tira 1-col se veían gigantes) ni queda diminuto. El marco es
// proporcional al viewport (82% del alto, acotado entre 440 y 1100px).
export const FRAME_HEIGHT_VH = 0.82;
export const FRAME_HEIGHT_MIN = 440;
export const FRAME_HEIGHT_MAX = 1100;

// Ola 21 (Lucy 2026-07-27) — límite de alto por slot según cantidad de slots,
// para que productos de pocos slots no ocupen toda la pantalla y los de muchos slots
// (calendario 12) no queden con recuadros tapados.
export const SLOT_HEIGHT_CAP_BY_COUNT = {
  few: { desktop: 460, tablet: 360, mobile: 300 }, // 1-2 slots
  medium: { desktop: 560, tablet: 440, mobile: 360 }, // 3-6 slots
  many: { desktop: 520, tablet: 400, mobile: 320 }, // 7-12 slots
};

// Ola 2A (Lucy 2026-07-22) — espacio RESERVADO bajo cada slot para su barra de acciones
// (Centrar / Ajustar filtros / Eliminar). Antes el wrapper medía solo el canvas → la barra
// se superponía a la fila de miniaturas de abajo y los botones "se perdían".
export const ACTION_BAR_RESERVE = 44;

// M.3.b.UX.7 — Responsive progresivo. 4 breakpoints en vez de 1.
export const BP_NARROW = 380; // <380px → 1 columna (slot fullwidth)
export const BP_MOBILE = 640; // 380-639 → 2 columnas
export const BP_TABLET = 1024; // 640-1023 → 3 columnas

// Min slot displaySize 120px (slot chico pero acciones tappeables ≥44px).
export const MIN_SLOT_SIZE = 120;
// Calendario (12 meses): las tarjetas deben leer la foto + la grilla del mes,
// así que el piso es mucho más alto que el genérico — una tarjeta de 120px era
// ilegible.
export const CALENDAR_MIN_SLOT_SIZE = 280;
// Plantillas con texto editable en el lienzo (Polaroid Instagram y similares):
// los textos del canvas (caption 16px, hashtags 13px…) escalan con el slot; con
// el cap por conteo (few=460) un stage 450×600 quedaba en ~345px desktop y los
// textos daban ~8px en pantalla, imposibles de tappear (target ≥44px). El piso
// garantiza un lienzo lo bastante grande para editar los textos con el dedo.
export const TEXT_MIN_SLOT_SIZE = 260;

/** Cap de alto por slot según cantidad de slots y ancho del contenedor (regla Ola 21). */
export function slotHeightCapByCount(
  slotCount: number,
  containerWidth: number,
  isCalendar: boolean,
): number {
  if (slotCount <= 2) {
    if (containerWidth < BP_NARROW) return SLOT_HEIGHT_CAP_BY_COUNT.few.mobile;
    if (containerWidth < BP_TABLET) return SLOT_HEIGHT_CAP_BY_COUNT.few.tablet;
    return SLOT_HEIGHT_CAP_BY_COUNT.few.desktop;
  }
  if (slotCount <= 6) {
    if (containerWidth < BP_NARROW) return SLOT_HEIGHT_CAP_BY_COUNT.medium.mobile;
    if (containerWidth < BP_TABLET) return SLOT_HEIGHT_CAP_BY_COUNT.medium.tablet;
    return SLOT_HEIGHT_CAP_BY_COUNT.medium.desktop;
  }
  if (isCalendar) {
    if (containerWidth < BP_MOBILE) return 560; // 1 col: tarjeta casi full-width
    if (containerWidth < BP_TABLET) return 640; // 2 cols
    return 920; // 3 cols: el ancho (≈333px) gobierna antes que este cap
  }
  if (containerWidth < BP_NARROW) return SLOT_HEIGHT_CAP_BY_COUNT.many.mobile;
  if (containerWidth < BP_TABLET) return SLOT_HEIGHT_CAP_BY_COUNT.many.tablet;
  return SLOT_HEIGHT_CAP_BY_COUNT.many.desktop;
}

/**
 * ¿El unitTemplate tiene capas de texto editables en el lienzo?
 * (Polaroid Instagram: user/location/likes/caption/hashtags.) Es la señal de que
 * el cliente tappea textos chicos directamente sobre el slot → merece stage grande.
 */
export function hasEditableTextLayers(
  layers: ReadonlyArray<{ type: string; editable?: boolean }>,
): boolean {
  return layers.some((l) => l.type === "text" && l.editable === true);
}

/**
 * Columnas máximas según viewport (regla progresiva M.3.b.UX.7 + calendario +
 * plantillas con texto editable). Productos con texto editable: 1 columna en
 * móvil, como el calendario — un stage chico partido en 2 columnas deja los
 * textos del lienzo imposibles de tappear.
 */
export function resolveMaxCols(opts: {
  containerWidth: number;
  isCalendar: boolean;
  hasEditableText: boolean;
  gridCols: number;
}): number {
  const { containerWidth, isCalendar, hasEditableText, gridCols } = opts;
  if (isCalendar) {
    // Calendario 12 meses: tarjetas GRANDES aunque el grid haga scroll
    // vertical. 1 col móvil / 2 tablet / 3 desktop (también capea drafts
    // viejos persistidos con gridLayout 4×3).
    if (containerWidth < BP_MOBILE) return 1;
    if (containerWidth < BP_TABLET) return 2;
    return 3;
  }
  if (containerWidth < BP_NARROW) return 1;
  if (hasEditableText && containerWidth < BP_MOBILE) return 1;
  if (containerWidth < BP_MOBILE) return 2;
  if (containerWidth < BP_TABLET) return 3;
  return gridCols; // sin cap en desktop
}

/**
 * Alto máximo del marco (Ola 21): 82% del viewport acotado a [440, 1100].
 * Calendario: el marco lo define el CONTENIDO (cap por slots), no el viewport.
 * Plantillas con texto editable: mismo marco que el resto pero SIN el cap por
 * conteo — el texto editable necesita un lienzo grande para ser tappeable.
 */
export function computeMaxFrameH(opts: {
  viewportH: number | null;
  isCalendar: boolean;
  hasEditableText: boolean;
  slotMaxHeight: number;
  rows: number;
  gap: number;
  reserve: number;
}): number | null {
  const { viewportH, isCalendar, hasEditableText, slotMaxHeight, rows, gap, reserve } = opts;
  if (viewportH === null) return null;
  const maxFrameHBySlots = slotMaxHeight * rows + gap * (rows - 1) + rows * reserve;
  if (isCalendar) return maxFrameHBySlots;
  const frame = Math.min(
    FRAME_HEIGHT_MAX,
    Math.max(FRAME_HEIGHT_MIN, Math.round(viewportH * FRAME_HEIGHT_VH)),
  );
  if (hasEditableText) return frame; // sin cap por conteo (texto tappeable)
  return Math.min(frame, maxFrameHBySlots);
}

/** Piso del displaySize del slot: calendario > texto editable > genérico. */
export function resolveMinSlotSize(opts: {
  isCalendar: boolean;
  hasEditableText: boolean;
}): number {
  if (opts.isCalendar) return CALENDAR_MIN_SLOT_SIZE;
  if (opts.hasEditableText) return TEXT_MIN_SLOT_SIZE;
  return MIN_SLOT_SIZE;
}

// ──────────────────────────────────────────────────────────────────
//  Zoom de LIENZO (Lucy 2026-09-08) — acercar TODA la plantilla, no la foto
// ──────────────────────────────────────────────────────────────────

// Zoom de stage (Ola 22, Lucy 2026-09-08): los botones +/− acercan el lienzo
// COMPLETO (la plantilla con sus textos y chrome) para ver/editar detalles
// finos. Es DISTINTO del zoom de FOTO (photoTransform.scale, gestos sobre la
// foto): este solo cambia el tamaño de PANTALLA de los slots, nunca el diseño.
// Por eso la exportación es inmune: el snapshot de producción calcula el
// pixelRatio RELATIVO al tamaño lógico (logicalW × 3 / stage.width()), así el
// PNG de imprenta sale siempre a resolución fija sin importar el zoom.
// Lucy 2026-09-09 — el zoom también ALEJA (min 0.5): con grids de muchos slots
// (calendario 12, packs grandes) el cliente pedía ver la plantilla entera de un
// vistazo. Alejar nunca desborda el ancho (el contenido se encoge), así que el
// piso es fijo; el zoom 1 (100%) siempre queda alcanzable porque el contenido
// a zoom 1 ya entra en el contenedor por construcción.
export const STAGE_ZOOM_MIN = 0.5;
export const STAGE_ZOOM_MAX = 2.5;
export const STAGE_ZOOM_STEP = 0.25;

/**
 * Tope de ACERCAR el lienzo para que el grid NUNCA se desborde en horizontal:
 * el ancho del grid ya calculado (a zoom 1) escalado no puede superar el
 * ancho del contenedor. Si el grid ya llena el ancho, el tope es 1 (sin zoom
 * in) — el detalle fino sigue resolviéndose con el zoom de FOTO por gestos.
 * El piso del tope es 1 (no STAGE_ZOOM_MIN): el 100% siempre es alcanzable,
 * aunque el contenido se pase un pelín del ancho medido. Para ALEJAR manda
 * STAGE_ZOOM_MIN (ver stepStageZoom).
 */
export function computeStageZoomCap(containerWidth: number, contentWidth: number): number {
  if (contentWidth <= 0 || containerWidth <= 0) return 1;
  return Math.min(STAGE_ZOOM_MAX, Math.max(1, containerWidth / contentWidth));
}

/** Acercar/alejar en pasos fijos, clampado al rango [min, cap]. */
export function stepStageZoom(current: number, direction: 1 | -1, cap: number): number {
  const next = Math.round((current + direction * STAGE_ZOOM_STEP) * 100) / 100;
  return Math.min(cap, Math.max(STAGE_ZOOM_MIN, next));
}

/**
 * Ancho de slot (grid plano, no agrupado): el menor entre el ancho disponible
 * por columna y el alto útil del marco / aspecto, con el piso que corresponda.
 */
export function computeFlatSlotDisplaySize(opts: {
  availableW: number;
  cols: number;
  slotAspect: number;
  rows: number;
  gap: number;
  reserve: number;
  maxFrameH: number | null;
  minSize: number;
}): number {
  const { availableW, cols, slotAspect, rows, gap, reserve, maxFrameH, minSize } = opts;
  const byWidth = Math.floor(availableW / cols);
  if (maxFrameH === null) return Math.max(minSize, byWidth);
  const usableH = maxFrameH - gap * (rows - 1) - rows * reserve;
  const byHeight = Math.floor(usableH / rows / slotAspect);
  return Math.max(minSize, Math.min(byWidth, byHeight));
}

/*
 * StudioCanvasGrid — cálculo puro de tamaño de stage y layout de columnas.
 *
 * Extraído de studio-canvas-grid.tsx (Lucy 2026-09-07) para poder testear
 * unitariamente las reglas de tamaño sin montar Konva ni React:
 *   - Marco máximo en alto (82% del viewport, acotado 440-1100px) — SOLO para
 *     productos de UNA fila; los grids multi-fila se dimensionan por ANCHO
 *     (cap por slots) y la página scrollea vertical (owner 2026-09-18).
 *   - Guarda de piso vs ancho (fitColsToFloor): los pisos de slot NUNCA
 *     desbordan el contenedor; si no caben, se reducen columnas.
 *   - Caps de alto por cantidad de slots (few/medium/many).
 *   - Excepción "texto editable" (Polaroid Instagram y similares): SIN cap por
 *     conteo y con piso TEXT_MIN_SLOT_SIZE, para que los textos pequeños del
 *     lienzo tengan target de tap usable (bug: la IG se veía pequeña).
 *   - Columnas (Ola 34): móvil (<BP_MOBILE) SIEMPRE 1 columna full-width;
 *     tablet/desktop por ANCHO OBJETIVO de slot (resolveMaxCols).
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
// Ola 34 (owner 2026-09-18) — caps SUBIDOS: con el dimensionado por ancho de
// Ola 31 y las columnas por ancho objetivo de Ola 34, el ANCHO gobierna casi
// siempre; los caps viejos anulaban el spec de tamaños (polaroid 2 cols × 460px
// × aspect 1.28 → alto 588 > cap 560 → el slot quedaba en ~437) y dejaban las
// caras de separadores y las tiras por debajo del ×1.5 pedido. Siguen siendo
// freno de desproporción en aspects altos (separador 1:3-1:4), no de tamaño.
export const SLOT_HEIGHT_CAP_BY_COUNT = {
  few: { desktop: 640, tablet: 600, mobile: 600 }, // 1-2 slots
  medium: { desktop: 700, tablet: 660, mobile: 600 }, // 3-6 slots
  many: { desktop: 640, tablet: 600, mobile: 560 }, // 7-12 slots
};

// Ola 2A (Lucy 2026-07-22) — espacio RESERVADO bajo cada slot para su barra de acciones
// (Centrar / Ajustar filtros / Eliminar). Antes el wrapper medía solo el canvas → la barra
// se superponía a la fila de miniaturas de abajo y los botones "se perdían".
export const ACTION_BAR_RESERVE = 44;

// M.3.b.UX.7 — Responsive progresivo. Ola 34 (owner 2026-09-18): queda UN solo
// breakpoint de columnas — <640px es SIEMPRE 1 columna full-width en todos los
// estudios foto (el owner rechazó explícitamente la regla de 2 columnas a
// 380-639: "cuadrados móvil al 250%" = el ancho útil completo del teléfono).
// BP_NARROW (380) desaparece de las reglas de columnas y de los caps: la franja
// "móvil" ahora es todo <BP_MOBILE.
export const BP_MOBILE = 640; // <640px → 1 columna (slot full-width)
export const BP_TABLET = 1024; // ≥1024px → layout con sidebar en el estudio foto

// Ola 34 (owner 2026-09-18) — ANCHO OBJETIVO de slot en desktop/tablet: las
// columnas se derivan del ancho disponible (cols = floor(availableW / objetivo))
// en vez de breakpoints fijos. Referencia del owner: tarjetas tipo Magnéticos /
// Calendario — 6-pack → 2 columnas a ~950-1100px de contenedor (slots ~430-470px);
// 3 columnas solo cuando caben 3×~450. Productos de muchos slots (12/20): más
// columnas está bien (el calendario con 3×~330 fue aprobado) → objetivo menor.
export const TARGET_SLOT_WIDTH = 450; // 1-6 slots
export const TARGET_SLOT_WIDTH_MANY = 300; // ≥7 slots

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
    if (containerWidth < BP_MOBILE) return SLOT_HEIGHT_CAP_BY_COUNT.few.mobile;
    if (containerWidth < BP_TABLET) return SLOT_HEIGHT_CAP_BY_COUNT.few.tablet;
    return SLOT_HEIGHT_CAP_BY_COUNT.few.desktop;
  }
  if (slotCount <= 6) {
    if (containerWidth < BP_MOBILE) return SLOT_HEIGHT_CAP_BY_COUNT.medium.mobile;
    if (containerWidth < BP_TABLET) return SLOT_HEIGHT_CAP_BY_COUNT.medium.tablet;
    return SLOT_HEIGHT_CAP_BY_COUNT.medium.desktop;
  }
  if (isCalendar) {
    if (containerWidth < BP_MOBILE) return 560; // 1 col: tarjeta casi full-width
    if (containerWidth < BP_TABLET) return 640; // 2 cols
    return 920; // 3 cols: el ancho (≈333px) gobierna antes que este cap
  }
  if (containerWidth < BP_MOBILE) return SLOT_HEIGHT_CAP_BY_COUNT.many.mobile;
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
 * Columnas máximas del grid (Ola 34, owner 2026-09-18 — spec de tamaños v2):
 *
 * - Calendario: regla propia APROBADA por el owner (1/2/3 cols) — INTOCABLE.
 * - Móvil (<BP_MOBILE): SIEMPRE 1 columna full-width en TODOS los estudios
 *   foto (packs, plano, tiras). Reemplaza la regla de 2 columnas a 380-639,
 *   rechazada explícitamente por el owner ("cuadrados móvil al 250%" ≈ 343px =
 *   el ancho útil de un teléfono de 390px). La excepción vieja de texto
 *   editable (1 col en móvil) queda absorbida: TODO es 1 col en móvil.
 * - Tablet/desktop: columnas por ANCHO OBJETIVO de slot en vez de breakpoints
 *   fijos — cols = clamp(floor(containerWidth / objetivo), 1, gridCols), con
 *   objetivo 450px (≤6 slots: 6-pack → 2 cols a ~950-1100px de contenedor;
 *   3 cols solo cuando caben 3×~450) y 300px (≥7 slots: 12 → 3-4 cols,
 *   20 → 4-5 cols en desktop ancho, calibrado al calendario aprobado 3×~330).
 *   Piso 2 columnas desde 640px: entre 640 y ~900 el objetivo daría 1 columna
 *   y un pack de 6 quedaría en fila única altísima; 2 columnas ya dan slots
 *   ≥ ~300px (tap target sobrado). El piso nunca desborda: `fitColsToFloor`
 *   corre DESPUÉS en el grid y reduce si los pisos de tap no caben.
 */
export function resolveMaxCols(opts: {
  containerWidth: number;
  isCalendar: boolean;
  gridCols: number;
  slotCount: number;
}): number {
  const { containerWidth, isCalendar, gridCols, slotCount } = opts;
  if (isCalendar) {
    // Calendario 12 meses: tarjetas GRANDES aunque el grid haga scroll
    // vertical. 1 col móvil / 2 tablet / 3 desktop (también capea drafts
    // viejos persistidos con gridLayout 4×3).
    if (containerWidth < BP_MOBILE) return 1;
    if (containerWidth < BP_TABLET) return 2;
    return 3;
  }
  if (containerWidth < BP_MOBILE) return 1;
  const target = slotCount >= 7 ? TARGET_SLOT_WIDTH_MANY : TARGET_SLOT_WIDTH;
  const byTarget = Math.floor(containerWidth / target);
  return Math.max(1, Math.min(gridCols, Math.max(byTarget, 2)));
}

// Ola 34 (owner 2026-09-18) — marco en alto FIJO para móvil (<BP_MOBILE) en
// productos de UNA fila: el marco de 82vh depende del alto del viewport, que
// CAMBIA al scrollear (la barra del navegador móvil se oculta/muestra) → el
// tamaño del slot saltaba solo al hacer scroll. En móvil el marco es una
// constante (~82% de un viewport móvil típico de 780px); en desktop/tablet
// sigue el 82vh acotado (allí el alto no cambia con el scroll).
export const MOBILE_FRAME_HEIGHT = 640;

/**
 * Alto máximo del marco:
 * - Calendario: el marco lo define el CONTENIDO (cap por slots), no el viewport.
 * - Grids MULTI-FILA (rows ≥ 2): igual — manda el contenido (cap por slots);
 *   el alto del viewport YA NO achica las celdas (owner 2026-09-18: en ventanas
 *   bajas el marco de 82vh forzaba los pisos y el grid quedaba diminuto y
 *   centrado con aire lateral; la página scrollea vertical, eso está bien).
 *   Bonus: sin depender del alto del viewport hay menos layout shift
 *   post-hidratación.
 * - UNA fila (rows ≤ 1): marco 82% del viewport acotado a [440, 1100] — es el
 *   fix original de stages gigantes (polaroid 1-slot, tira 1-col). En MÓVIL el
 *   marco es FIJO (MOBILE_FRAME_HEIGHT, ver arriba). Plantillas con texto
 *   editable: ese marco SIN el cap por conteo (texto tappeable).
 */
export function computeMaxFrameH(opts: {
  viewportH: number | null;
  containerWidth: number;
  isCalendar: boolean;
  hasEditableText: boolean;
  slotMaxHeight: number;
  rows: number;
  gap: number;
  reserve: number;
}): number | null {
  const {
    viewportH,
    containerWidth,
    isCalendar,
    hasEditableText,
    slotMaxHeight,
    rows,
    gap,
    reserve,
  } = opts;
  if (viewportH === null) return null;
  const maxFrameHBySlots = slotMaxHeight * rows + gap * (rows - 1) + rows * reserve;
  if (isCalendar || rows >= 2) return maxFrameHBySlots;
  const frame =
    containerWidth < BP_MOBILE
      ? MOBILE_FRAME_HEIGHT
      : Math.min(
          FRAME_HEIGHT_MAX,
          Math.max(FRAME_HEIGHT_MIN, Math.round(viewportH * FRAME_HEIGHT_VH)),
        );
  if (hasEditableText) return frame; // sin cap por conteo (texto tappeable)
  return Math.min(frame, maxFrameHBySlots);
}

/**
 * Guarda de PISO vs ANCHO (owner 2026-09-18): los pisos de displaySize
 * (MIN_SLOT_SIZE / TEXT_MIN_SLOT_SIZE / CALENDAR_MIN_SLOT_SIZE) NUNCA pueden
 * desbordar el contenedor — si `minSize * cols + gaps` supera el ancho
 * disponible, se REDUCEN las columnas antes de aceptar un grid más ancho que
 * el contenedor. Causa del overflow horizontal real @768-1024: sidebar lg
 * (288px) + piso de texto editable 260 × 3 cols > ancho útil restante.
 * Piso firme: 1 columna (mejor una columna angosta que desbordar).
 */
export function fitColsToFloor(opts: {
  cols: number;
  minSize: number;
  gap: number;
  availableW: number;
}): number {
  const { minSize, gap, availableW } = opts;
  let cols = Math.max(1, Math.floor(opts.cols));
  while (cols > 1 && minSize * cols + gap * (cols - 1) > availableW) cols -= 1;
  return cols;
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
 * Tope de ACERCAR el lienzo (Ola 33, owner 2026-09-18): SIEMPRE STAGE_ZOOM_MAX.
 * Antes el tope era `containerWidth / contentWidth` (acercar solo mientras el
 * grid escalado cupiera en el ancho). Con el dimensionado por ANCHO de Ola 31
 * el grid llena el contenedor a zoom 1 → el tope quedaba en 1 y el "+" no
 * hacía nada, matando la feature de Ola 22 (ver detalles finos de la
 * plantilla). Ahora el WRAPPER INTERNO del canvas scrollea horizontal cuando
 * el contenido zoomado excede su ancho (overflow-x en el grid, NUNCA en la
 * página: el gate `scrollWidth === clientWidth` sigue en 0), así que acercar
 * es seguro hasta el máximo en TODOS los estudios. Para ALEJAR manda
 * STAGE_ZOOM_MIN (ver stepStageZoom).
 */
export function computeStageZoomCap(): number {
  return STAGE_ZOOM_MAX;
}

/** Acercar/alejar en pasos fijos, clampado al rango [min, cap]. */
export function stepStageZoom(current: number, direction: 1 | -1, cap: number): number {
  const next = Math.round((current + direction * STAGE_ZOOM_STEP) * 100) / 100;
  return Math.min(cap, Math.max(STAGE_ZOOM_MIN, next));
}

/**
 * Tamaño BASE del lienzo configurable por producto (owner 2026-09-24, v2 tras
 * prueba en STG — admin → producto → Avanzado → `canvasBaseScale` del
 * personalizationSchema): multiplicador de escala del sizing del lienzo
 * (1 = estándar, 0.5 = mitad de grande). El zoom del CLIENTE es relativo a
 * esta base: su control siempre abre en 100% y su reset vuelve a 100%; la base
 * la aplica el grid como factor de escala display-only (la exportación de
 * producción es inmune). Clamp defensivo al rango del zoom de stage (el schema
 * Zod ya valida, pero el JSON del producto es libre). Default 1.
 */
export function resolveCanvasBaseScale(configValue: number | null | undefined): number {
  if (configValue == null || !Number.isFinite(configValue)) return 1;
  return Math.max(STAGE_ZOOM_MIN, Math.min(STAGE_ZOOM_MAX, configValue));
}

/**
 * Override de columnas de la grilla por producto (owner 2026-09-24, v2 tras
 * prueba en STG — admin → producto → Avanzado → `gridColsOverride`): FUERZA
 * las columnas (clamp [1..6]) SIN capear contra resolveMaxCols ni contra las
 * columnas del template; las filas se derivan (ceil slots/cols). Guardas en el
 * grid: móvil (<BP_MOBILE) sigue SIEMPRE en 1 columna (decisión del owner),
 * nunca más columnas que slots/unidades disponibles, y fitColsToFloor puede
 * reducir si los pisos no caben. En modo agrupado (separadores) cuenta
 * tarjetas de UNIDAD por fila. null = grilla automática del template.
 */
export function clampGridColsOverride(override: number | null | undefined): number | null {
  if (override == null || !Number.isFinite(override)) return null;
  return Math.max(1, Math.min(6, Math.round(override)));
}

/**
 * Ola 29 (owner 2026-09-11, 1.3.A mejora visual) — secciones de TIRA en filas:
 * con N unidades multi-slot tipo tira photobooth (angostas y altas), las
 * secciones ya no se apilan una por fila — van 2-3 por fila y el resto envuelve
 * abajo (4 unidades → 3 + 1 en desktop). Solo tiras: las secciones de
 * calendario son grillas anchas y siguen apiladas.
 * Ola 34 (owner 2026-09-18) — spec de tamaños v2:
 *   - MÓVIL (<BP_MOBILE): UNA tira por fila, full-width (antes 2 por fila a
 *     380-899px → tiras de ~215px, rechazado: la tira debe cubrir el ancho).
 *   - Desktop: la 3ª columna solo cuando cada sección queda ≥ ~440px
 *     (3×440 + 2 gaps de 40 = 1400px de contenedor) — tiras ~×1.5 más anchas
 *     que la grilla vieja (3/row desde 900px → secciones de ~280px).
 */
export function unitSectionsPerRowFor(opts: {
  isStripSections: boolean;
  unitCount: number;
  containerWidth: number;
}): number {
  if (!opts.isStripSections || opts.unitCount <= 1) return 1;
  if (opts.containerWidth < BP_MOBILE) return 1;
  const cap = opts.containerWidth >= 1400 ? 3 : 2;
  return Math.max(1, Math.min(opts.unitCount, cap));
}

/** Gap (px) entre secciones de unidad en la grilla horizontal de tiras. */
export const UNIT_SECTION_GAP = 40;

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

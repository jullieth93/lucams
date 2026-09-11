"use client";

/*
 * StudioCanvasGrid — grid responsive de N <StudioSlot> (M.3.b Capa 2).
 *
 * Renderea cada slot del canvasData en CSS grid según gridLayout (cols/rows/gap).
 * Cada slot tiene su propio Konva Stage independiente; el grid no es Konva.
 *
 * Responsive: se escala con un ResizeObserver del container para que cada slot
 * encaje en el viewport disponible. Aspect ratio del slot lo dicta unitTemplate.
 *
 * Layout responsive:
 *   - Desktop: usa gridLayout.cols × gridLayout.rows como están
 *   - Mobile (< 640px): si gridLayout.cols >= 4, reducir cols (Capa 5 lo refina)
 *
 * Manejo de drop a nivel grid: si Lucy arrastra un asset y suelta entre slots,
 * fallback al primer slot vacío. El handler de drop por slot tiene prioridad.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy, Minus, Plus, RotateCcw } from "lucide-react";
import type Konva from "konva";
import type { StoreApi } from "zustand";
import { useStore } from "zustand";
import { StudioSlot } from "./studio-slot";
import { StudioSlotEditModal } from "./studio-slot-edit-modal";
import type { CanvasDataV2, StudioAsset, TextLayer } from "./types";
import type { CalendarLayoutKey } from "@/features/personalization/calendar-layout";
import type { CalendarFontKey } from "@/features/personalization/schemas";
import { unitSlotRange } from "@/features/personalization/design-units";
import { cardBackgroundHex } from "@/features/personalization/frame-palette";
import {
  selectUnitFilledCount,
  selectUnitImagePlaceholder,
  type StudioStoreState,
} from "./lib/store";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { unitIndexOfSlot } from "./lib/faces";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText } from "./studio-texts";

const MAX_VIEWPORT_WIDTH = 1280; // px lógicos máximo del grid en desktop (Lucy 2026-09-08: 1024→1280 — la plantilla se veía chica con márgenes vacíos en pantallas anchas)

// Constantes y funciones puras de tamaño de stage extraídas a studio-canvas-grid-size.ts
// (Lucy 2026-09-07) para testear unitariamente el cálculo sin montar Konva/React.
// Ola 22 (Lucy 2026-09-08) — zoom de lienzo: helpers puros (tope por ancho + pasos).
import {
  ACTION_BAR_RESERVE,
  MIN_SLOT_SIZE,
  computeFlatSlotDisplaySize,
  computeMaxFrameH,
  computeStageZoomCap,
  hasEditableTextLayers,
  resolveMaxCols,
  resolveMinSlotSize,
  slotHeightCapByCount,
  BP_MOBILE,
  STAGE_ZOOM_MIN,
} from "./studio-canvas-grid-size";

// ADR-063 T5 — lazy-mount de stages Konva. Cada StudioSlot monta un Konva Stage (varios <canvas>
// + capas de realismo). Con muchos slots (calendario = 12) eso es pesado en móvil. Por encima de
// este umbral, montamos solo los slots cercanos al viewport (IntersectionObserver); el resto muestra
// un placeholder liviano hasta que se acerca. Nunca se desmonta un slot ya montado (no perder el
// stage registrado para el snapshot). Packs chicos (≤ umbral, incluye heart/circle) siguen eager.
const LAZY_MOUNT_THRESHOLD = 6;

// M.3.b.UX.7 — Responsive progresivo. 4 breakpoints (definidos en
// studio-canvas-grid-size.ts junto al resto de las reglas de tamaño).
// MIN_SLOT_SIZE / CALENDAR_MIN_SLOT_SIZE / TEXT_MIN_SLOT_SIZE: pisos de
// displaySize según tipo de producto.

type StudioCanvasGridProps = {
  store: StoreApi<StudioStoreState>;
  /** M.3.b.A2.5 — Tamaño físico del producto (ej "5×5 cm") para badge en slots. */
  sizeCm?: string;
  /** M.3.b.B.1 — forma física del imán para overlay realismo. */
  shape?: "rectangle" | "circle" | "heart" | "custom";
  /** M.3.b.B.1 — acabado físico para overlay glossy. */
  finish?: "matte" | "glossy" | "soft-touch";
  /** M.3.b.B.1 — cornerRadius en px del imán físico. */
  cornerRadiusPx?: number;
  /** M.3.b.B.1 — toggle global para bleed + safe guides. */
  showRealismGuides?: boolean;
  /** ADR-057 Fase D — etiquetas por slot (ej. meses del calendario). */
  slotLabels?: string[];
  /**
   * Ola 4 (Lucy 2026-07-23) — CALENDARIO: cada slot muestra la TARJETA COMPUESTA del mes
   * (foto + título + grilla) en vez de la foto suelta. `startMonth` = mes (0-11) del slot 0;
   * `year` = año elegido en el banner del Estudio (estado selectedYear del editor).
   */
  calendarPreview?: {
    year: number;
    startMonth: number;
    layout?: CalendarLayoutKey;
    /** Lucy 2026-09-07 — tipo de letra del título/mes elegido en el banner (default "fredoka"). */
    font?: CalendarFontKey;
  } | null;
  /** #14 — sustantivo del slot ("imán" | "separador") para el fallback y aria de cada StudioSlot. */
  slotNoun?: string;
  /** Ola 3 — ¿el producto admite texto editable? false oculta las capas de texto (Cuadrados). */
  allowText?: boolean;
  /**
   * Ola 3b (Lucy 2026-07-22) — el producto ofrece marcos de color (frameOptions):
   * con borderColor la tarjeta se pinta ENTERA del color y la foto va inserta
   * (full-bleed, "el fin del papel"). Producción usa la misma regla (WYSIWYG).
   */
  frameFullBleed?: boolean;
  /**
   * Ola 3 — caras de diseño por unidad física (separadores de libros: 2). Con 2, la
   * grilla AGRUPA los slots en tarjetas-unidad: "Separador N" con sus 2 caras lado a
   * lado (cara A | cara B), la tira desplegada que luego va a producción.
   */
  facesPerUnit?: number;
  /**
   * Modelo multi-unidad (owner 2026-09-09) — sustantivo de la unidad para los
   * headers de sección y el pager ("Tira", "Calendario", "Separador", "Pieza").
   * Lo deriva el editor del tipo de producto (textos CMS estudio.unidades.*).
   */
  unitNoun?: string;
  /**
   * FB4 — si false (táctil), los slots de la grilla NO capturan gestos (drag/pinch/wheel) → el dedo
   * scrollea la página; el pan/zoom se hace en el editor a pantalla completa (tocar = abrir). En
   * desktop (true) se conserva el inline drag/rueda.
   */
  interactiveSlots?: boolean;
  onSlotClick: (slotIndex: number) => void;
  /**
   * Ola 22 (Lucy 2026-09-09) — zoom de LIENZO controlado desde la fila de pills
   * superior (studio-editor): `stageZoomRaw` es el valor PEDIDO (se clampa al render
   * contra el tope por ancho); el grid reporta el estado efectivo vía
   * `onStageZoomState` para que el control (StudioStageZoomControl) pinte el % y
   * habilite/deshabilite −/+.
   */
  stageZoomRaw: number;
  onStageZoomState: (state: { zoom: number; cap: number }) => void;
  /** Ola 8 — Abre el modal unificado de edición para el slot indicado (desde clic en slot lleno). */
  openEditSlot?: { slotIndex: number; tab: "photo" | "text" } | null;
  /** Ola 8 — Callback cuando el modal unificado se cierra. */
  onEditClose?: () => void;
  /** Ola 10 — solicitud de cambiar la foto desde el editor unificado: el padre abre el picker. */
  onRequestChangePhoto?: (slotIndex: number) => void;
  /**
   * Ola 17 — solicitud de cambiar la FOTO DE PERFIL desde el editor unificado: el
   * padre abre el picker en modo profile (solo aplica cuando la plantilla trae la
   * capa `profile-photo`, ej. Polaroid Instagram).
   */
  onRequestChangeProfilePhoto?: (slotIndex: number) => void;
  registerSlotStages: (stages: Map<number, Konva.Stage | null>) => void;
  /** ADR-063 T5 — forzar el montaje de TODOS los slots (antes de snapshot/preview/3D). */
  forceMountAll?: boolean;
};

export function StudioCanvasGrid({
  store,
  sizeCm,
  shape,
  finish,
  cornerRadiusPx,
  showRealismGuides,
  slotLabels,
  calendarPreview = null,
  slotNoun,
  allowText = false,
  frameFullBleed = false,
  facesPerUnit = 1,
  unitNoun,
  interactiveSlots = true,
  onSlotClick,
  stageZoomRaw,
  onStageZoomState,
  openEditSlot,
  onEditClose,
  registerSlotStages,
  onRequestChangePhoto,
  onRequestChangeProfilePhoto,
  forceMountAll = false,
}: StudioCanvasGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(MAX_VIEWPORT_WIDTH);
  const stagesRef = useRef<Map<number, Konva.Stage | null>>(new Map());
  // #16 — respeta "reducir movimiento": las entradas escalonadas del grid se apagan.
  const reducedMotion = usePrefersReducedMotion();
  // ADR-063 T5 — slots ya montados (una vez montados, permanecen; el store es la fuente de verdad,
  // así que re-montar desde slotState no pierde nada).
  const [mountedSlots, setMountedSlots] = useState<Set<number>>(() => new Set());
  // Ola 6 — modal unificado de edición por slot (tabs Foto/Texto).
  const [editModal, setEditModal] = useState<{
    slotIndex: number;
    tab: "photo" | "text";
    focusTextLayerId?: string;
  } | null>(null);
  // Multi-unidad (2026-09-09) — tick para el feedback aria-live tras "Aplicar
  // este diseño a todas" (cada aplicación lo incrementa → se anuncia de nuevo).
  const [appliedTick, setAppliedTick] = useState(0);
  const announceApplied = useCallback(() => setAppliedTick((t) => t + 1), []);
  // Ola 22 (Lucy 2026-09-08) — zoom de LIENZO: acerca TODA la plantilla (display-only,
  // no toca el diseño ni la exportación). El valor crudo lo pide el padre (prop
  // `stageZoomRaw`, control en la fila de pills); el tope depende del ancho disponible,
  // así que se clampa al render (si el viewport se achica, el zoom efectivo baja solo).

  // Ola 8 — cuando el padre pide abrir el editor unificado (ej. clic en slot lleno),
  // reflejamos la petición en el estado local y limpiamos el callback del padre.
  const editRequestRef = useRef(openEditSlot);
  useEffect(() => {
    const prev = editRequestRef.current;
    editRequestRef.current = openEditSlot;
    if (
      openEditSlot &&
      (!prev || prev.slotIndex !== openEditSlot.slotIndex || prev.tab !== openEditSlot.tab)
    ) {
      setEditModal({
        slotIndex: openEditSlot.slotIndex,
        tab: openEditSlot.tab,
      });
      onEditClose?.();
    }
  }, [openEditSlot, onEditClose]);

  // Selectores zustand: solo re-render al cambiar slices específicos.
  const canvasData = useStore(store, (s) => s.canvasData);
  const selectedSlotIndex = useStore(store, (s) => s.selectedSlotIndex);
  const assignAssetToSlot = useStore(store, (s) => s.assignAssetToSlot);
  const clearSlot = useStore(store, (s) => s.clearSlot);
  const setSlotPhotoTransform = useStore(store, (s) => s.setSlotPhotoTransform);
  const selectSlot = useStore(store, (s) => s.selectSlot);
  const texts = useStudioTexts();

  // Responsive scale (ancho del contenedor, cap MAX_VIEWPORT_WIDTH)
  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      const w = containerRef.current?.clientWidth ?? MAX_VIEWPORT_WIDTH;
      setContainerWidth(Math.min(MAX_VIEWPORT_WIDTH, w));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Ola 4 — alto del viewport para el marco máximo en alto (null hasta hidratar:
  // el primer render usa solo el ancho, como antes; luego entra el cap de alto).
  const [viewportH, setViewportH] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setViewportH(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Calendario (tarjeta mes compuesta): layout propio con tarjetas grandes —
  // 1 col en móvil, 2 en tablet, 3 en desktop; el resto de productos sigue la
  // regla progresiva de abajo. Se declara antes del useMemo para capear cols.
  const isCalendar = calendarPreview !== null;

  // Lucy 2026-09-07 — plantillas con texto editable en el lienzo (Polaroid
  // Instagram y similares): les corresponde el mismo stage grande que al
  // calendario, porque el cliente tappea textos chicos sobre el slot. Requiere
  // allowText: si el producto oculta el texto (Cuadrados), no aplica.
  const hasEditableText = allowText && hasEditableTextLayers(canvasData?.unitTemplate.layers ?? []);

  // Modelo multi-unidad (owner 2026-09-09): N unidades físicas, cada una diseñable
  // por separado. Con unitCount > 1 y unitSlots > 1 (y fuera del modo agrupado de
  // separadores, que ya apila tarjetas-unidad) el lienzo se divide en SECCIONES
  // apiladas — una por unidad ("Tira 1 de 2", pager arriba) — y `gridLayout`
  // describe la grilla de UNA unidad. unitSlots = 1 (polaroid/cuadrados): grilla
  // plana intacta — cada imán es su unidad y se ve completa de una vez.
  const unitSlots = canvasData?.unitSlots ?? 1;
  const unitCount = canvasData?.unitCount ?? 1;
  const groupedForUnits = facesPerUnit === 2 && (canvasData?.slotCount ?? 0) % 2 === 0;
  const multiUnitSections = !groupedForUnits && unitCount > 1 && unitSlots > 1;
  // Slots que describe la grilla: una unidad en modo secciones; el diseño completo
  // en cualquier otro caso (retrocompatible).
  const layoutSlotCount = multiUnitSections ? unitSlots : (canvasData?.slotCount ?? 0);

  const layout = useMemo(() => {
    if (!canvasData) return null;
    // M.3.b.UX.7 — Responsive progresivo: cap de cols según viewport.
    //   <380px  → max 1 col (slot fullwidth)
    //   <640px  → max 2 cols (1 col si el template tiene texto editable)
    //   <1024px → max 3 cols
    //   ≥1024px → cols del gridLayout original (3-5 según slotCount)
    const maxCols = resolveMaxCols({
      containerWidth,
      isCalendar,
      hasEditableText,
      gridCols: canvasData.gridLayout.cols,
    });

    const cols = Math.min(maxCols, canvasData.gridLayout.cols);
    if (cols === canvasData.gridLayout.cols) return canvasData.gridLayout;
    // Multi-unidad: las filas se calculan sobre la UNIDAD (layoutSlotCount), no
    // sobre el diseño completo.
    const rows = Math.ceil(layoutSlotCount / cols);
    return { ...canvasData.gridLayout, cols, rows };
  }, [canvasData, containerWidth, isCalendar, hasEditableText, layoutSlotCount]);

  // A2.6 — Crossfade visual al cambiar plantilla. Detectamos cambio en
  // unitTemplate (referencia distinta = template aplicado nuevo) y disparamos
  // un overlay degradé que se desvanece. Los Konva Stages NO remontan.
  // Los hooks DEBEN ir antes del early return (rules-of-hooks).
  const [transitioning, setTransitioning] = useState(false);
  const prevTemplateRef = useRef<CanvasDataV2["unitTemplate"] | null>(null);
  useEffect(() => {
    if (!canvasData?.unitTemplate) return;
    if (prevTemplateRef.current === null) {
      prevTemplateRef.current = canvasData.unitTemplate;
      return;
    }
    if (prevTemplateRef.current !== canvasData.unitTemplate) {
      prevTemplateRef.current = canvasData.unitTemplate;
      setTransitioning(true);
      const t = window.setTimeout(() => setTransitioning(false), 500);
      return () => window.clearTimeout(t);
    }
  }, [canvasData?.unitTemplate]);

  // ADR-063 T5 — ¿virtualizar? Solo con muchos slots. Con pocos (o sin soporte de IO) → eager.
  const lazy =
    (canvasData?.slotCount ?? 0) > LAZY_MOUNT_THRESHOLD &&
    typeof IntersectionObserver !== "undefined";

  // IntersectionObserver: monta los slots que se acercan al viewport (prefetch 400px). Una vez
  // vistos, quedan en `mountedSlots` para siempre (no se re-observan ni se desmontan).
  useEffect(() => {
    if (!lazy || forceMountAll) return;
    const root = containerRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const seen: number[] = [];
        for (const e of entries) {
          if (e.isIntersecting) {
            seen.push(Number((e.target as HTMLElement).dataset.slotObserve));
            obs.unobserve(e.target);
          }
        }
        if (seen.length) {
          setMountedSlots((prev) => {
            const next = new Set(prev);
            seen.forEach((i) => next.add(i));
            return next;
          });
        }
      },
      { rootMargin: "400px 0px" },
    );
    root.querySelectorAll<HTMLElement>("[data-slot-observe]").forEach((el) => {
      if (!mountedSlots.has(Number(el.dataset.slotObserve))) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [lazy, forceMountAll, mountedSlots]);

  if (!canvasData || !layout) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-brand-muted text-sm">{texts.lienzo.loadingLienzo}</span>
      </div>
    );
  }

  // Calcular tamaño de cada slot para que el grid completo entre en
  // `containerWidth`. Mantenemos el aspect ratio del unitTemplate.
  const slotAspect = canvasData.unitTemplate.stage.height / canvasData.unitTemplate.stage.width;

  // Ola 3 (separadores 2 caras) — modo AGRUPADO: los slots se renderizan en
  // tarjetas-unidad ("Separador N") con las 2 caras lado a lado (la tira
  // desplegada física). unitCols: 1 en móvil; en desktop 2 unidades por fila,
  // salvo caras muy anchas (rectangular 6:2 → tira 6:1, 1 por fila).
  const grouped = groupedForUnits;
  // Ola 3c — modo TIRA (gridGap=0, tira photobooth): las celdas se tocan → la tira
  // se lee como UNA pieza continua de color. Sin reserva de barra de acciones entre
  // celdas (flota sobre la foto, ver StudioSlot overlayActions). Regla 2026-09-08:
  // la separación visible ENTRE fotos la dibuja stripPhotoRect DENTRO de cada celda
  // (media canaleta del color del marco) — el gap CSS entre celdas sigue en 0.
  const stripMode = !grouped && canvasData.gridLayout.gap === 0;
  // Unidades físicas que se RENDERIZAN como tarjeta/sección: en modo agrupado,
  // slotCount/2 (caras); en modo secciones multi-unidad, unitCount del modelo;
  // en plano, cada slot se muestra suelto.
  const physicalUnits = grouped ? canvasData.slotCount / 2 : unitCount;
  const stripAspect = grouped
    ? (canvasData.unitTemplate.stage.width * 2) / canvasData.unitTemplate.stage.height
    : 0;
  // Ola 19 — separadores: si solo hay UNA unidad física, no la obliguemos a compartir
  // el ancho con una columna fantasma. La tarjeta debe usar el alto disponible para
  // verse proporcional al producto real (vertical estrecho).
  const desiredUnitCols = containerWidth < BP_MOBILE || stripAspect >= 3 ? 1 : 2;
  const unitCols = grouped ? Math.min(physicalUnits, desiredUnitCols) : 0;
  // Columnas VISUALES de slots para la navegación por teclado (flechas).
  const navCols = grouped ? unitCols * 2 : layout.cols;

  const availableW = containerWidth - layout.gap * (layout.cols - 1);

  // Ola 6 — límite de alto del slot según cantidad de slots, para evitar que
  // productos de pocos slots (ej. Polaroid de 1 slot) ocupen toda la pantalla.
  // Calendario: caps altos — la tarjeta del mes (foto + grilla) necesita
  // ~340px de ancho para leerse; como el marco ya no se limita por el viewport
  // (ver maxFrameH abajo), estos caps solo evitan tarjetas desproporcionadas
  // y casi siempre manda el ancho disponible.
  // Plantillas con texto editable: el cap SIGUE calculándose pero computeMaxFrameH
  // lo ignora (Lucy 2026-09-07: la Polaroid Instagram se veía pequeña y sus
  // textos eran imposibles de tappear).
  // Multi-unidad: el cap se calcula sobre la UNIDAD (cada sección se dimensiona
  // como un estudio de una sola unidad y las secciones se apilan).
  const slotMaxHeight = slotHeightCapByCount(layoutSlotCount, containerWidth, isCalendar);

  // Ola 4 — marco máximo en ALTO (82% del viewport, acotado): las celdas se achican
  // si el grid completo no cabe en pantalla. Ola 6: se respeta también el cap por slot.
  // Calendario: el marco lo define el CONTENIDO (maxFrameHBySlots), no el viewport —
  // las 12 tarjetas se apilan a tamaño completo y el grid scrollea vertical.
  const reserve = stripMode ? 0 : ACTION_BAR_RESERVE;
  const maxFrameH = computeMaxFrameH({
    viewportH,
    isCalendar,
    hasEditableText,
    slotMaxHeight,
    rows: layout.rows,
    gap: layout.gap,
    reserve,
  });

  const slotDisplaySize = grouped
    ? // Ola 19 — separadores: el ancho de cara se limita también por el ALTO útil del
      // marco. Sin esto, un separador vertical 2×6 (aspect 3) ocupaba el ancho que le
      // dejaba la tarjeta (~350px) y terminaba altísimo, desbordando la pantalla.
      // Regla: byWidth = ancho disponible por cara; byHeight = alto útil / aspect.
      (() => {
        const byWidth = Math.floor(
          ((containerWidth - layout.gap * (unitCols - 1)) / unitCols - 16 - 8) / 2,
        );
        if (!maxFrameH) return Math.max(MIN_SLOT_SIZE, byWidth);
        const usableH = maxFrameH - layout.gap * (layout.rows - 1) - layout.rows * reserve;
        const byHeight = Math.floor(usableH / layout.rows / slotAspect);
        return Math.max(MIN_SLOT_SIZE, Math.min(byWidth, byHeight));
      })()
    : computeFlatSlotDisplaySize({
        availableW,
        cols: layout.cols,
        slotAspect,
        rows: layout.rows,
        gap: layout.gap,
        reserve,
        maxFrameH,
        // Calendario: piso propio (280px) — con el genérico (120px) la tarjeta
        // del mes quedaba ilegible cuando el cap de alto gobernaba. Texto
        // editable: piso 260px (TEXT_MIN_SLOT_SIZE) para que los textos del
        // lienzo tengan target de tap usable.
        minSize: resolveMinSlotSize({ isCalendar, hasEditableText }),
      });
  const slotHeight = slotDisplaySize * slotAspect;

  // Ola 22 — tope y valor efectivo del zoom de lienzo. El ancho del contenido a
  // zoom 1 es el que el grid ya ocuparía sin zoom; acercar nunca debe desbordar
  // el contenedor en horizontal (el scroll vertical de página absorbe el extra).
  // Lucy 2026-09-09 — el zoom también ALEJA (piso STAGE_ZOOM_MIN): el valor
  // efectivo se clampa por ambos lados (alejar jamás desborda el ancho).
  // Modo agrupado (separadores): ancho de tarjeta-unidad = 2 caras + paddings
  // (mismos 16+8 de la fórmula byWidth de arriba).
  const contentWidthBase = grouped
    ? unitCols * (slotDisplaySize * 2 + 16 + 8) + layout.gap * (unitCols - 1)
    : slotDisplaySize * layout.cols + layout.gap * (layout.cols - 1);
  const stageZoomCap = computeStageZoomCap(containerWidth, contentWidthBase);
  const stageZoom = Math.max(STAGE_ZOOM_MIN, Math.min(stageZoomRaw, stageZoomCap));
  const zoomedSlotW = Math.round(slotDisplaySize * stageZoom);
  const zoomedSlotH = Math.round(slotHeight * stageZoom);

  // Ola 4 — ancho EXPLÍCITO del grid (celdas + gaps): si el cap de alto achicó las
  // celdas, el grid no se estira a lo ancho — queda centrado en el marco (margin auto).
  // Ola 22 — a zoom de lienzo, el ancho explícito usa el tamaño zoomado.
  const gridContentW = grouped
    ? undefined
    : zoomedSlotW * layout.cols + layout.gap * (layout.cols - 1);

  // Keyboard navigation entre slots
  const handleKeyboardNav = (
    fromSlotIndex: number,
    direction: "up" | "down" | "left" | "right",
  ) => {
    const navRows = Math.ceil(canvasData.slotCount / navCols);
    const col = fromSlotIndex % navCols;
    const row = Math.floor(fromSlotIndex / navCols);
    let targetCol = col;
    let targetRow = row;
    if (direction === "up") targetRow = Math.max(0, row - 1);
    if (direction === "down") targetRow = Math.min(navRows - 1, row + 1);
    if (direction === "left") targetCol = Math.max(0, col - 1);
    if (direction === "right") targetCol = Math.min(navCols - 1, col + 1);
    const targetIndex = targetRow * navCols + targetCol;
    if (targetIndex >= 0 && targetIndex < canvasData.slotCount && targetIndex !== fromSlotIndex) {
      selectSlot(targetIndex);
      // Focus DOM next tick
      requestAnimationFrame(() => {
        const next = containerRef.current?.querySelector<HTMLElement>(
          `[data-slot-index="${targetIndex}"]`,
        );
        next?.focus();
      });
    }
  };

  // Registrar Konva stages en mapa para el finalize (snapshot por slot)
  const registerStage = (slotIndex: number) => (stage: Konva.Stage | null) => {
    stagesRef.current.set(slotIndex, stage);
    registerSlotStages(stagesRef.current);
  };

  // Celda de un slot (montaje perezoso + StudioSlot o placeholder). Compartida por el
  // grid plano y por las tarjetas-unidad del modo agrupado (separadores 2 caras).
  const renderSlotCell = (slot: CanvasDataV2["slots"][number]) => {
    const mounted = !lazy || forceMountAll || mountedSlots.has(slot.slotIndex);
    return (
      <motion.div
        key={slot.slotIndex}
        data-slot-observe={slot.slotIndex}
        className="flex items-start justify-center"
        // Ola 22 — la celda crece con el zoom de lienzo para que la barra de
        // acciones de la fila de abajo nunca se solape con el slot zoomado.
        style={{ height: zoomedSlotH + (stripMode ? 0 : ACTION_BAR_RESERVE) }}
        initial={reducedMotion ? false : { opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          duration: reducedMotion ? 0 : 0.25,
          ease: "easeOut",
          delay: mounted && !reducedMotion ? Math.min(slot.slotIndex, 8) * 0.04 : 0, // stagger acotado
        }}
      >
        {mounted ? (
          <StudioSlot
            slotState={slot}
            unitTemplate={canvasData.unitTemplate}
            // Ola 22 — displaySize zoomado: el Stage Konva crece y su scale sigue
            // siendo width/lógico, así la exportación (pixelRatio relativo al
            // tamaño lógico) sale idéntica con cualquier zoom.
            displaySize={zoomedSlotW}
            displayHeight={zoomedSlotH}
            isSelected={selectedSlotIndex === slot.slotIndex}
            totalSlots={canvasData.slotCount}
            slotLabel={slotLabels?.[slot.slotIndex]}
            calendarCard={
              calendarPreview
                ? {
                    year: calendarPreview.year,
                    // Misma matemática de mes que producción y el preview de confirmación:
                    // monthIndex0 = (startMonth + slotIndex) mod 12.
                    monthIndex0: (((calendarPreview.startMonth + slot.slotIndex) % 12) + 12) % 12,
                    layout: calendarPreview.layout,
                    font: calendarPreview.font,
                  }
                : null
            }
            slotNoun={slotNoun}
            sizeCm={sizeCm}
            shape={shape}
            finish={finish}
            cornerRadiusPx={cornerRadiusPx}
            showRealismGuides={showRealismGuides}
            borderColor={canvasData.borderColor ?? null}
            frameFullBleed={frameFullBleed}
            overlayActions={stripMode}
            allowText={allowText}
            onClick={() => {
              selectSlot(slot.slotIndex);
              onSlotClick(slot.slotIndex);
            }}
            onClear={() => clearSlot(slot.slotIndex)}
            onEdit={(tab) => setEditModal({ slotIndex: slot.slotIndex, tab })}
            onTextEdit={(textLayerId) =>
              setEditModal({
                slotIndex: slot.slotIndex,
                tab: "text",
                focusTextLayerId: textLayerId,
              })
            }
            // Ola 22 — tap sobre el avatar del header (plantillas con capa
            // `profile-photo`, ej. Polaroid Instagram): abre directo el picker
            // de foto de perfil (mismo flujo que el control del modal).
            onProfilePhotoEdit={
              onRequestChangeProfilePhoto
                ? () => onRequestChangeProfilePhoto(slot.slotIndex)
                : undefined
            }
            // Ola 6 — el callback de transform está siempre disponible para el
            // editor a pantalla completa; los gestos inline se habilitan/deshabilitan
            // vía interactiveSlots.
            onPhotoTransformChange={(transform) => setSlotPhotoTransform(slot.slotIndex, transform)}
            onCenterPhoto={() => setSlotPhotoTransform(slot.slotIndex, null)}
            interactiveSlots={interactiveSlots}
            onAssetDrop={(asset: StudioAsset) => assignAssetToSlot(slot.slotIndex, asset)}
            onKeyboardNav={(dir) => handleKeyboardNav(slot.slotIndex, dir)}
            onRegisterStage={registerStage(slot.slotIndex)}
          />
        ) : (
          <LazySlotPlaceholder
            assetUrl={slot.assetUrl}
            displaySize={zoomedSlotW}
            displayHeight={zoomedSlotH}
            shape={shape}
            label={slotLabels?.[slot.slotIndex]}
            onClick={() => {
              // Montar de inmediato + seleccionar + abrir el picker (igual que un slot real).
              setMountedSlots((prev) => new Set(prev).add(slot.slotIndex));
              selectSlot(slot.slotIndex);
              onSlotClick(slot.slotIndex);
            }}
          />
        )}
      </motion.div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full"
      style={{ maxWidth: MAX_VIEWPORT_WIDTH }}
      aria-label={texts.lienzo.lienzoAria}
    >
      {/* Modelo multi-unidad (2026-09-09) — pager de unidades: pastillas "Tira 1",
          "Tira 2"… con el progreso de cada una; saltan a su sección (scroll).
          Las secciones quedan TODAS montadas y visibles (apiladas): el cliente
          ve todo lo que va a recibir y los stages Konva viven en el DOM para el
          snapshot de producción/preview (WYSIWYG). */}
      {multiUnitSections && (
        <UnitPager
          store={store}
          unitCount={unitCount}
          unitSlots={unitSlots}
          noun={unitNoun ?? texts.unidades.nombrePieza}
        />
      )}

      {multiUnitSections ? (
        <div className="flex w-full flex-col items-center gap-10">
          {Array.from({ length: unitCount }, (_, u) => {
            const { start, end } = unitSlotRange(u, unitSlots);
            return (
              <section
                key={u}
                id={`studio-unit-${u}`}
                aria-label={fillStudioText(texts.unidades.unidadDe, {
                  nombre: unitNoun ?? texts.unidades.nombrePieza,
                  n: u + 1,
                  total: unitCount,
                })}
                className="w-full scroll-mt-32"
              >
                <UnitSectionHeader
                  store={store}
                  unitIndex={u}
                  unitSlots={unitSlots}
                  unitCount={unitCount}
                  noun={unitNoun ?? texts.unidades.nombrePieza}
                  onApplied={announceApplied}
                />
                <div
                  className={
                    stripMode
                      ? // Ola 4 — TIRA continua: UNA sombra alrededor de la pieza
                        // entera (las celdas no llevan sombra). Multi-unidad: una
                        // sombra por TIRA (cada sección es una pieza física).
                        "grid rounded-lg shadow-[0_10px_28px_rgba(0,0,0,0.20)]"
                      : "grid"
                  }
                  style={{
                    gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
                    gap: layout.gap,
                    ...(gridContentW ? { width: gridContentW, margin: "0 auto" } : {}),
                  }}
                >
                  <AnimatePresence>
                    {canvasData.slots.slice(start, end).map((slot) => renderSlotCell(slot))}
                  </AnimatePresence>
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <motion.div
          className={
            stripMode
              ? // Ola 4 — TIRA continua: UNA sombra alrededor de la pieza entera (las
                // celdas individuales no llevan sombra — separaban la tira visualmente).
                // Sin overflow-hidden: el anillo de selección del slot no debe cortarse.
                "grid rounded-lg shadow-[0_10px_28px_rgba(0,0,0,0.20)]"
              : "grid"
          }
          style={{
            gridTemplateColumns: `repeat(${grouped ? unitCols : layout.cols}, 1fr)`,
            gap: layout.gap,
            // Ola 4 — ancho explícito + margin auto: el grid siempre centrado en el marco,
            // sin estirarse cuando el cap de alto achica las celdas.
            ...(gridContentW ? { width: gridContentW, margin: "0 auto" } : {}),
          }}
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.3, ease: "easeOut" }}
        >
          <AnimatePresence>
            {grouped
              ? // Ola 3 — tarjeta por UNIDAD física: "Separador N" con cara A | cara B
                // lado a lado (la tira desplegada que se imprime). El filete central
                // punteado sugiere el doblez de la tira.
                Array.from({ length: physicalUnits }, (_, unitIndex) => (
                  <div
                    key={unitIndex}
                    role="group"
                    aria-label={fillStudioText(texts.lienzo.unidadAria, {
                      n: unitIndex + 1,
                      total: physicalUnits,
                    })}
                    className="border-brand-purple/15 flex flex-col items-center gap-1.5 rounded-2xl border bg-white/70 p-2 shadow-sm"
                  >
                    <span className="text-brand-purple-dark text-xs font-bold">
                      {fillStudioText(texts.lienzo.unitSeparador, { n: unitIndex + 1 })}
                    </span>
                    {/* Multi-unidad (2026-09-09) — progreso de la unidad + atajo
                        "Aplicar este diseño a todas" (copia las 2 caras de este
                        separador a los demás). */}
                    <UnitMiniActions
                      store={store}
                      unitIndex={unitIndex}
                      unitSlots={2}
                      unitCount={physicalUnits}
                      onApplied={announceApplied}
                    />
                    <div className="flex items-start justify-center gap-2">
                      {canvasData.slots
                        .filter((slot) => unitIndexOfSlot(slot.slotIndex, 2) === unitIndex)
                        .map((slot, i) => (
                          <div
                            key={slot.slotIndex}
                            className={
                              i === 0
                                ? "border-brand-purple/25 flex flex-col items-center gap-1 border-r border-dashed pr-2"
                                : "flex flex-col items-center gap-1"
                            }
                          >
                            <span className="text-brand-muted text-[10px] font-semibold tracking-wide uppercase">
                              {i === 0 ? texts.lienzo.unitCaraA : texts.lienzo.unitCaraB}
                            </span>
                            {renderSlotCell(slot)}
                          </div>
                        ))}
                    </div>
                  </div>
                ))
              : canvasData.slots.map((slot) => renderSlotCell(slot))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Feedback aria-live del atajo "Aplicar este diseño a todas". */}
      <span aria-live="polite" role="status" className="sr-only">
        {appliedTick > 0 ? texts.unidades.aplicadaFeedback : ""}
      </span>

      {/* Ola 22 (Lucy 2026-09-09) — el control del zoom de LIENZO vive en la fila de
        pills superior del editor (junto a «Ideas» / «Ver en tu espacio»), NUNCA flotando
        sobre el canvas. Acá solo se REPORTA el estado efectivo (zoom clampado + tope por
        ancho) para que aquel control pinte el % y habilite −/+. Display-only: la
        exportación usa el tamaño LÓGICO del stage (pixelRatio relativo), así el PNG de
        imprenta sale igual con cualquier zoom. */}
      <StageZoomReporter zoom={stageZoom} cap={stageZoomCap} onReport={onStageZoomState} />

      {/* Ola 6 — Modal unificado de edición por slot (tabs Foto/Texto). */}
      <StudioSlotEditModalWrapper
        store={store}
        editModal={editModal}
        onClose={() => {
          setEditModal(null);
          onEditClose?.();
        }}
        allowFilters={!calendarPreview}
        slotLabels={slotLabels}
        allowText={allowText}
        frameFullBleed={frameFullBleed}
        calendarPreview={calendarPreview}
        onChangePhoto={onRequestChangePhoto}
        onRequestChangeProfilePhoto={onRequestChangeProfilePhoto}
      />

      {/* A2.6 — Overlay de transición al cambiar plantilla */}
      <AnimatePresence>
        {transitioning && !reducedMotion && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.7, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, times: [0, 0.3, 1], ease: "easeOut" }}
            className="from-brand-turquoise/15 via-brand-cream/60 to-brand-purple/15 pointer-events-none absolute inset-0 bg-gradient-to-br backdrop-blur-[2px]"
            aria-hidden
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
//  Modelo MULTI-UNIDAD (owner 2026-09-09) — pager + headers de unidad
// ──────────────────────────────────────────────────────────────────

/**
 * Pager de unidades sobre el lienzo: una pastilla por unidad ("Tira 1",
 * "Tira 2"…) con su progreso (fotos listas / total). Salta a la sección de la
 * unidad con scroll suave (todas quedan montadas y visibles — el cliente ve
 * exactamente lo que va a recibir y los stages Konva viven en el DOM para el
 * snapshot). Sigue el lenguaje de los pills del Estudio (rounded-full, ring).
 */
function UnitPager({
  store,
  unitCount,
  unitSlots,
  noun,
}: {
  store: StoreApi<StudioStoreState>;
  unitCount: number;
  unitSlots: number;
  noun: string;
}) {
  const texts = useStudioTexts();
  return (
    <nav
      aria-label={texts.unidades.pagerAria}
      className="mb-6 flex flex-wrap items-center justify-center gap-2"
    >
      {Array.from({ length: unitCount }, (_, u) => (
        <UnitPagerPill
          key={u}
          store={store}
          unitIndex={u}
          unitSlots={unitSlots}
          unitCount={unitCount}
          noun={noun}
        />
      ))}
    </nav>
  );
}

function UnitPagerPill({
  store,
  unitIndex,
  unitSlots,
  unitCount,
  noun,
}: {
  store: StoreApi<StudioStoreState>;
  unitIndex: number;
  unitSlots: number;
  unitCount: number;
  noun: string;
}) {
  const texts = useStudioTexts();
  const filled = useStore(store, selectUnitFilledCount(unitIndex, unitSlots));
  const complete = filled === unitSlots;
  const label = fillStudioText(texts.unidades.unidadDe, {
    nombre: noun,
    n: unitIndex + 1,
    total: unitCount,
  });
  return (
    <button
      type="button"
      onClick={() => {
        document
          .getElementById(`studio-unit-${unitIndex}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      aria-label={fillStudioText(texts.unidades.progresoAria, {
        n: filled,
        total: unitSlots,
      })}
      title={label}
      className="ring-brand-purple/15 text-brand-purple-dark hover:ring-brand-purple/40 focus-visible:ring-brand-turquoise inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold shadow-md ring-2 transition-all hover:shadow-lg focus-visible:ring-2 focus-visible:outline-none active:scale-95"
    >
      <span
        aria-hidden
        className={
          complete
            ? "flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"
            : filled === 0
              ? "h-5 w-5 rounded-full bg-red-100 ring-1 ring-red-300"
              : "bg-brand-purple/15 ring-brand-purple/30 h-5 w-5 rounded-full ring-1"
        }
      >
        {complete && <Check className="h-3 w-3" aria-hidden />}
      </span>
      {label}
    </button>
  );
}

/**
 * Header de la sección de una unidad (modo secciones): título "Tira 1 de 2",
 * chip de progreso y el atajo "Aplicar este diseño a todas".
 */
function UnitSectionHeader({
  store,
  unitIndex,
  unitSlots,
  unitCount,
  noun,
  onApplied,
}: {
  store: StoreApi<StudioStoreState>;
  unitIndex: number;
  unitSlots: number;
  unitCount: number;
  noun: string;
  onApplied: () => void;
}) {
  const texts = useStudioTexts();
  const filled = useStore(store, selectUnitFilledCount(unitIndex, unitSlots));
  const applyUnitToAllUnits = useStore(store, (s) => s.applyUnitToAllUnits);
  const complete = filled === unitSlots;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
      <h2 className="text-brand-purple-dark font-display text-base font-bold">
        {fillStudioText(texts.unidades.unidadDe, {
          nombre: noun,
          n: unitIndex + 1,
          total: unitCount,
        })}
      </h2>
      <span
        role="status"
        aria-label={fillStudioText(texts.unidades.progresoAria, {
          n: filled,
          total: unitSlots,
        })}
        className={[
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums",
          complete
            ? "bg-emerald-100 text-emerald-700"
            : filled === 0
              ? "bg-red-50 text-red-700"
              : "bg-brand-purple/10 text-brand-purple-dark",
        ].join(" ")}
      >
        {complete && <Check className="h-3 w-3" aria-hidden />}
        {filled}/{unitSlots}
      </span>
      {unitCount > 1 && (
        <button
          type="button"
          onClick={() => {
            applyUnitToAllUnits(unitIndex);
            onApplied();
          }}
          aria-label={texts.unidades.aplicarATodasAria}
          title={texts.unidades.aplicarATodasTitle}
          className="border-brand-purple/30 text-brand-purple-dark hover:border-brand-purple/60 hover:bg-brand-purple/5 focus-visible:ring-brand-turquoise inline-flex items-center gap-1.5 rounded-full border-2 bg-white px-3.5 py-1.5 text-xs font-bold transition-all focus-visible:ring-2 focus-visible:outline-none active:scale-95"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          {texts.unidades.aplicarATodas}
        </button>
      )}
    </div>
  );
}

/**
 * Acciones compactas de una tarjeta-unidad del modo agrupado (separadores 2
 * caras): progreso + "Aplicar este diseño a todas". Mismo patrón que
 * UnitSectionHeader pero en formato mini para la tarjeta.
 */
function UnitMiniActions({
  store,
  unitIndex,
  unitSlots,
  unitCount,
  onApplied,
}: {
  store: StoreApi<StudioStoreState>;
  unitIndex: number;
  unitSlots: number;
  unitCount: number;
  onApplied: () => void;
}) {
  const texts = useStudioTexts();
  const filled = useStore(store, selectUnitFilledCount(unitIndex, unitSlots));
  const applyUnitToAllUnits = useStore(store, (s) => s.applyUnitToAllUnits);
  const complete = filled === unitSlots;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span
        role="status"
        aria-label={fillStudioText(texts.unidades.progresoAria, {
          n: filled,
          total: unitSlots,
        })}
        className={[
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums",
          complete
            ? "bg-emerald-100 text-emerald-700"
            : filled === 0
              ? "bg-red-50 text-red-700"
              : "bg-brand-purple/10 text-brand-purple-dark",
        ].join(" ")}
      >
        {complete && <Check className="h-2.5 w-2.5" aria-hidden />}
        {filled}/{unitSlots}
      </span>
      {unitCount > 1 && (
        <button
          type="button"
          onClick={() => {
            applyUnitToAllUnits(unitIndex);
            onApplied();
          }}
          aria-label={texts.unidades.aplicarATodasAria}
          title={texts.unidades.aplicarATodasTitle}
          className="text-brand-purple-dark/80 hover:text-brand-purple-dark hover:bg-brand-purple/10 focus-visible:ring-brand-turquoise inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold underline decoration-dotted underline-offset-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <Copy className="h-3 w-3" aria-hidden />
          {texts.unidades.aplicarATodas}
        </button>
      )}
    </div>
  );
}

// ADR-063 T5 — placeholder liviano mientras el slot no está montado (sin Konva). Muestra la foto ya
// elegida (si la hay) o un recuadro invitando a tocar. Al tocar/enfocar, el grid monta el StudioSlot
// real. Mantiene las dimensiones y la silueta (circle) para que el montaje no "salte".
function LazySlotPlaceholder({
  assetUrl,
  displaySize,
  displayHeight,
  shape,
  label,
  onClick,
}: {
  assetUrl?: string | null;
  displaySize: number;
  displayHeight: number;
  shape?: "rectangle" | "circle" | "heart" | "custom";
  label?: string;
  onClick: () => void;
}) {
  const texts = useStudioTexts();
  const isCircle = shape === "circle";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        label
          ? fillStudioText(texts.lienzo.editarAria, { etiqueta: label })
          : texts.lienzo.editarEspacioAria
      }
      className="group border-brand-purple/15 bg-brand-cream/40 focus-visible:ring-brand-turquoise relative cursor-pointer overflow-hidden border bg-white outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{
        width: displaySize,
        height: displayHeight,
        borderRadius: isCircle ? "9999px" : 8,
        clipPath: isCircle ? "circle(50% at 50% 50%)" : undefined,
      }}
    >
      {assetUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={assetUrl}
          alt={label ?? texts.lienzo.altTuFoto}
          className="h-full w-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <span className="text-brand-muted absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-xs font-semibold">
          {label ? <span className="text-brand-purple-dark">{label}</span> : null}
          <span>{texts.lienzo.slotTocaElegir}</span>
        </span>
      )}
    </button>
  );
}

// Re-export para que componentes consumidores tengan acceso directo
export { selectUnitImagePlaceholder };
export type { CanvasDataV2 };

// ──────────────────────────────────────────────────────────────────
//  Ola 22 — zoom de LIENZO: reporter de estado + control de la fila de pills
// ──────────────────────────────────────────────────────────────────

// Puente de estado del zoom: el valor efectivo y el tope se calculan DESPUÉS del
// early-return de carga del grid (necesitan el layout y el ancho medido del
// contenedor), así que el reporte al padre vive en este mini-componente con su
// propio effect (los hooks no pueden ir tras el early return).
function StageZoomReporter({
  zoom,
  cap,
  onReport,
}: {
  zoom: number;
  cap: number;
  onReport: (state: { zoom: number; cap: number }) => void;
}) {
  useEffect(() => {
    onReport({ zoom, cap });
  }, [zoom, cap, onReport]);
  return null;
}

/**
 * Control del zoom de LIENZO (− / % / + / reset) para la fila de pills superior del
 * Estudio (studio-editor, junto a «Ideas» / «Ver en tu espacio»). Lucy 2026-09-09:
 * antes flotaba sobre la esquina del lienzo e "invadía el canvas" — ahora es un pill
 * inline con el mismo lenguaje visual de la fila (rounded-full, h-12, shadow-xl,
 * ring-4) y jamás se superpone a la plantilla. Es presentacional puro: el valor crudo
 * lo guarda el padre y el grid lo clampa contra el tope de ancho (rango 0.5–2.5,
 * helpers en studio-canvas-grid-size.ts).
 */
export function StudioStageZoomControl({
  zoom,
  cap,
  onStep,
  onReset,
}: {
  /** Zoom efectivo ya clampado por el grid (lo que se ve en el %). */
  zoom: number;
  /** Tope de ACERCAR (ancho disponible / ancho del contenido, ≥ 1). */
  cap: number;
  onStep: (direction: 1 | -1) => void;
  onReset: () => void;
}) {
  const texts = useStudioTexts();
  const zoomButtonClass =
    "text-brand-purple hover:bg-brand-purple/10 focus-visible:ring-brand-turquoise flex h-9 w-9 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div
      role="group"
      aria-label={fillStudioText(texts.lienzo.stageZoomTitle, {
        pct: Math.round(zoom * 100),
      })}
      className="ring-brand-purple/15 inline-flex h-12 items-center gap-0.5 rounded-full bg-white px-1.5 shadow-xl ring-4"
    >
      <button
        type="button"
        onClick={() => onStep(-1)}
        disabled={zoom <= STAGE_ZOOM_MIN + 0.001}
        aria-label={texts.lienzo.stageZoomOutAria}
        title={texts.lienzo.stageZoomOutAria}
        className={zoomButtonClass}
      >
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <span
        className="text-brand-purple-dark w-11 text-center text-xs font-bold tabular-nums"
        aria-hidden
      >
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={() => onStep(1)}
        disabled={zoom >= cap - 0.001}
        aria-label={texts.lienzo.stageZoomInAria}
        title={texts.lienzo.stageZoomInAria}
        className={zoomButtonClass}
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
      {/* Reset disponible tanto alejado como acercado (≠ 100%). */}
      {Math.abs(zoom - 1) > 0.001 && (
        <button
          type="button"
          onClick={onReset}
          aria-label={texts.lienzo.stageZoomResetAria}
          title={texts.lienzo.stageZoomResetAria}
          className={zoomButtonClass}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

// Ola 6 — Wrapper para el modal unificado de edición por slot. Vive dentro del
// grid para tener acceso directo al store sin modificar StudioEditor.
function StudioSlotEditModalWrapper({
  store,
  editModal,
  onClose,
  allowFilters = true,
  slotLabels,
  allowText = false,
  frameFullBleed = false,
  calendarPreview = null,
  onChangePhoto,
  onRequestChangeProfilePhoto,
}: {
  store: StoreApi<StudioStoreState>;
  editModal: { slotIndex: number; tab: "photo" | "text"; focusTextLayerId?: string } | null;
  onClose: () => void;
  allowFilters?: boolean;
  slotLabels?: string[];
  allowText?: boolean;
  frameFullBleed?: boolean;
  calendarPreview?: {
    year: number;
    startMonth: number;
    layout?: CalendarLayoutKey;
    /** Lucy 2026-09-07 — tipo de letra del título/mes elegido en el banner (default "fredoka"). */
    font?: CalendarFontKey;
  } | null;
  /** Ola 10 — solicitud de cambiar la foto: el padre abre el picker. */
  onChangePhoto?: (slotIndex: number) => void;
  /** Ola 17 — solicitud de cambiar la foto de perfil: el padre abre el picker en modo profile. */
  onRequestChangeProfilePhoto?: (slotIndex: number) => void;
}) {
  const slotIndex = editModal?.slotIndex ?? null;
  const slotAssetUrl = useStore(store, (s) =>
    slotIndex !== null
      ? (s.canvasData?.slots?.find((sl) => sl.slotIndex === slotIndex)?.assetUrl ?? null)
      : null,
  );
  const slotFilter = useStore(store, (s) =>
    slotIndex !== null
      ? (s.canvasData?.slots?.find((sl) => sl.slotIndex === slotIndex)?.filter ?? null)
      : null,
  );
  const slotScale = useStore(store, (s) =>
    slotIndex !== null
      ? (s.canvasData?.slots?.find((sl) => sl.slotIndex === slotIndex)?.photoTransform?.scale ?? 1)
      : 1,
  );
  const slotOffsetX = useStore(store, (s) =>
    slotIndex !== null
      ? (s.canvasData?.slots?.find((sl) => sl.slotIndex === slotIndex)?.photoTransform?.offsetX ??
        0)
      : 0,
  );
  const slotOffsetY = useStore(store, (s) =>
    slotIndex !== null
      ? (s.canvasData?.slots?.find((sl) => sl.slotIndex === slotIndex)?.photoTransform?.offsetY ??
        0)
      : 0,
  );
  const slotRotation = useStore(store, (s) =>
    slotIndex !== null
      ? (s.canvasData?.slots?.find((sl) => sl.slotIndex === slotIndex)?.photoTransform?.rotation ??
        0)
      : 0,
  );
  const slotTextOverrides = useStore(store, (s) =>
    slotIndex !== null
      ? s.canvasData?.slots?.find((sl) => sl.slotIndex === slotIndex)?.textOverrides
      : undefined,
  );
  // Ola 17 — foto de perfil del slot (POR SLOT) + si la plantilla trae la capa.
  const slotProfileAssetUrl = useStore(store, (s) =>
    slotIndex !== null
      ? (s.canvasData?.slots?.find((sl) => sl.slotIndex === slotIndex)?.profileAssetUrl ?? null)
      : null,
  );
  const unitTemplate = useStore(store, (s) => s.canvasData?.unitTemplate);
  const slotCount = useStore(store, (s) => s.canvasData?.slotCount ?? 0);
  const borderColor = useStore(store, (s) => s.canvasData?.borderColor ?? null);
  // Ola 28 (1.2.1.A) — color EFECTIVO de la tarjeta para el preview de la pestaña
  // Texto: borderColor puede ser null (la Clásica nace blanca sin setear nada) —
  // la regla compartida resuelve el color real (frame-palette.cardBackgroundHex).
  const cardBgForTextPreview = useMemo(
    () =>
      unitTemplate ? cardBackgroundHex({ layers: unitTemplate.layers, borderColor, frameFullBleed }) : null,
    [unitTemplate, borderColor, frameFullBleed],
  );
  // Multi-unidad (2026-09-09) — con imán suelto (unitSlots = 1, polaroid/cuadrados)
  // cada slot ES su unidad: el atajo "Aplicar este diseño a todas" vive en la
  // ventana de edición del slot (con unidades multi-slot va en el header de su
  // sección). Copia foto + encuadre + filtro + textos a todos los demás.
  const unitSlots = useStore(store, (s) => s.canvasData?.unitSlots ?? 1);
  const applyUnitToAllUnits = useStore(store, (s) => s.applyUnitToAllUnits);
  // Lucy 2026-09-08 — letra del calendario VIVA del store (mismo mecanismo que el
  // banner): el selector de "Ajustar Foto" persiste en canvasData.calendarFont.
  const calendarFont = useStore(store, (s) => s.canvasData?.calendarFont ?? "fredoka");
  const setCalendarFont = useStore(store, (s) => s.setCalendarFont);
  const setSlotFilter = useStore(store, (s) => s.setSlotFilter);
  const setSlotPhotoTransform = useStore(store, (s) => s.setSlotPhotoTransform);
  const setSlotTextOverride = useStore(store, (s) => s.setSlotTextOverride);
  const setSlotProfilePhoto = useStore(store, (s) => s.setSlotProfilePhoto);
  const texts = useStudioTexts();

  // Ola 17 — la plantilla (unitTemplate) declara la capa `profile-photo` que
  // habilita el control "Foto de perfil" en la pestaña Foto del editor.
  const hasProfilePhoto = useMemo(
    () => !!unitTemplate?.layers.some((l) => l.type === "profile-photo"),
    [unitTemplate],
  );

  const textLayers = useMemo(() => {
    if (!unitTemplate) return [];
    const layers = unitTemplate.layers.filter(
      (l): l is TextLayer => l.type === "text" && (l as TextLayer).editable === true,
    );
    // Si se tocó un texto específico, ponerlo primero para preseleccionarlo.
    if (editModal?.focusTextLayerId) {
      const focused = layers.find((l) => l.id === editModal.focusTextLayerId);
      if (focused) {
        return [focused, ...layers.filter((l) => l.id !== editModal.focusTextLayerId)];
      }
    }
    return layers;
  }, [unitTemplate, editModal]);

  return (
    <StudioSlotEditModal
      isOpen={editModal !== null}
      slotIndex={slotIndex}
      slotLabel={
        slotIndex !== null
          ? (slotLabels?.[slotIndex] ??
            fillStudioText(texts.lienzo.slotLabelFallback, {
              n: slotIndex + 1,
              total: slotCount,
            }))
          : undefined
      }
      hasPhoto={!!slotAssetUrl}
      hasText={textLayers.length > 0}
      photoUrl={slotAssetUrl}
      currentFilter={slotFilter}
      currentTransform={{
        offsetX: slotOffsetX,
        offsetY: slotOffsetY,
        scale: slotScale,
        rotation: slotRotation,
      }}
      currentTextOverrides={slotTextOverrides}
      textLayers={textLayers}
      // Ola 28 (1.2.1.A) — la pestaña Texto previsualiza sobre el color EFECTIVO
      // de la tarjeta (resuelto con la regla compartida, no el borderColor crudo
      // que puede ser null) y avisa si la letra elegida casi no contrasta.
      cardColor={cardBgForTextPreview}
      allowFilters={allowFilters}
      onClose={onClose}
      onApplyFilter={(filter) => {
        if (slotIndex !== null) setSlotFilter(slotIndex, filter);
      }}
      onResetTransform={() => {
        if (slotIndex !== null) setSlotPhotoTransform(slotIndex, null);
      }}
      onRotate={() => {
        if (slotIndex !== null)
          setSlotPhotoTransform(slotIndex, { rotation: (slotRotation + 90) % 360 });
      }}
      onApplyTextOverride={(layerId, override) => {
        if (slotIndex !== null) setSlotTextOverride(slotIndex, layerId, override);
      }}
      onChangePhoto={() => {
        if (slotIndex === null) return;
        // Lucy 2026-09-08 — bug de z-index: el editor unificado (Radix Dialog, z-50)
        // quedaba ABIERTO y el picker (z-40) abría DEBAJO, inalcanzable. Root cause:
        // el `setOpenEditSlot(null)` del editor es un no-op una vez abierto el modal
        // (ese estado es solo la petición de apertura; el open real vive acá, en
        // `editModal`). El diseño original ya decía "cierra el editor y abre el
        // picker" — ahora sí: cerramos el modal ANTES de pedir el picker.
        onClose();
        onChangePhoto?.(slotIndex);
      }}
      hasProfilePhoto={hasProfilePhoto}
      profilePhotoUrl={slotProfileAssetUrl}
      onChangeProfilePhoto={() => {
        if (slotIndex === null) return;
        // Mismo bug de z-index que "Cambiar foto" (picker de perfil = mismo modal).
        onClose();
        onRequestChangeProfilePhoto?.(slotIndex);
      }}
      onClearProfilePhoto={() => {
        if (slotIndex !== null) setSlotProfilePhoto(slotIndex, null);
      }}
      // Multi-unidad (2026-09-09) — atajo "Aplicar este diseño a todas" para
      // productos de imán suelto (unitSlots = 1: el slot ES la unidad).
      applyToAll={
        unitSlots === 1 && slotCount > 1 && slotIndex !== null
          ? {
              label: texts.unidades.aplicarATodas,
              ariaLabel: texts.unidades.aplicarATodasAria,
              title: texts.unidades.aplicarATodasTitle,
              onApply: () => applyUnitToAllUnits(slotIndex),
            }
          : undefined
      }
      // Lucy 2026-09-08 — selector de letra del calendario dentro de "Ajustar Foto"
      // (solo productos calendario). Persiste vía store; el preview de esta misma
      // ventana reacciona porque calendarCard.font viene del editor (live).
      calendarFont={calendarFont}
      onCalendarFontChange={calendarPreview ? setCalendarFont : undefined}
      preview={
        unitTemplate
          ? {
              unitTemplate,
              totalSlots: slotCount,
              borderColor,
              allowText,
              frameFullBleed,
              calendarCard:
                calendarPreview && slotIndex !== null
                  ? {
                      year: calendarPreview.year,
                      // Misma matemática de mes que el slot de la grilla y producción.
                      monthIndex0: (((calendarPreview.startMonth + slotIndex) % 12) + 12) % 12,
                      layout: calendarPreview.layout,
                      font: calendarPreview.font,
                    }
                  : null,
              onTransformChange: (t) => {
                if (slotIndex !== null) setSlotPhotoTransform(slotIndex, t);
              },
            }
          : undefined
      }
    />
  );
}

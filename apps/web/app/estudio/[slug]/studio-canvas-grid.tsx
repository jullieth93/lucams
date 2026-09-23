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
import {
  cardBackgroundHex,
  defaultTextFillOnCard,
  isDarkColor,
  isInstagramTemplate,
} from "@/features/personalization/frame-palette";
import { igTextFill } from "@/features/personalization/instagram-template-spec";
import {
  selectUnitFilledCount,
  selectUnitImagePlaceholder,
  type StudioStoreState,
} from "./lib/store";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { unitIndexOfSlot, deployedSizeCm } from "./lib/faces";
import { generateGridLayout } from "./lib/grid-layout";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText } from "./studio-texts";

const MAX_VIEWPORT_WIDTH = 1600; // px lógicos máximo del grid en desktop (Lucy 2026-09-08: 1024→1280 — la plantilla se veía chica con márgenes vacíos; owner 2026-09-18: 1280→1600 — en pantallas anchas seguía habiendo aire lateral; el ancho útil real lo acotan sidebar + padding del layout)

// Constantes y funciones puras de tamaño de stage extraídas a studio-canvas-grid-size.ts
// (Lucy 2026-09-07) para testear unitariamente el cálculo sin montar Konva/React.
// Ola 22 (Lucy 2026-09-08) — zoom de lienzo: helpers puros (tope por ancho + pasos).
import {
  ACTION_BAR_RESERVE,
  MIN_SLOT_SIZE,
  UNIT_SECTION_GAP,
  computeFlatSlotDisplaySize,
  computeMaxFrameH,
  computeStageZoomCap,
  fitColsToFloor,
  hasEditableTextLayers,
  resolveMaxCols,
  resolveMinSlotSize,
  slotHeightCapByCount,
  unitSectionsPerRowFor,
  BP_MOBILE,
  STAGE_ZOOM_MIN,
} from "./studio-canvas-grid-size";

// ADR-063 T5 — lazy-mount de stages Konva. Cada StudioSlot monta un Konva Stage (varios <canvas>
// + capas de realismo). Con muchos slots (calendario = 12) eso es pesado en móvil. Por encima de
// este umbral, montamos solo los slots cercanos al viewport (IntersectionObserver); el resto muestra
// un placeholder liviano hasta que se acerca. Nunca se desmonta un slot ya montado (no perder el
// stage registrado para el snapshot). Packs chicos (≤ umbral, incluye heart/circle) siguen eager.
const LAZY_MOUNT_THRESHOLD = 6;

// PACKS (2026-09-15) — padding horizontal total de la tarjeta-unidad que agrupa
// un pack en la grilla plana (p-2 a cada lado, mismas clases de la tarjeta de
// separadores): la sub-grilla descuenta este marco al repartir el ancho.
const UNIT_CARD_PAD_X = 16;

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
   * Separadores PLANOS (noFold, Alargados): la pieza no se dobla → en el modo
   * agrupado NO hay línea de doblez ni indicación de tamaño desplegado (las 2
   * caras son frente/reverso de una pieza plana). Default false.
   */
  noFold?: boolean;
  /**
   * Modelo multi-unidad (owner 2026-09-09) — sustantivo de la unidad para los
   * headers de sección y el pager ("Tira", "Calendario", "Separador", "Pieza").
   * Lo deriva el editor del tipo de producto (textos CMS estudio.unidades.*).
   */
  unitNoun?: string;
  /**
   * Delimitación visual de PACKS (owner 2026-09-15, ADR-101): cuando el producto
   * se vende por packs de N unidades sueltas (fotoimanes: 6 por pack), el editor
   * pasa el tamaño del pack y la grilla plana se AGRUPA en tarjetas-unidad —
   * "Pack 1" (slots 1-6), "Pack 2" (slots 7-12) — con el MISMO patrón visual de
   * las tarjetas de separadores (borde sutil de marca + rótulo + progreso).
   * Solo aplica fuera del modo agrupado de separadores y de las secciones
   * multi-unidad (tiras/calendarios), que ya delimitan. null/undefined → plana.
   */
  unitGroupSlots?: number | null;
  /**
   * FB4 — si false (táctil), los slots de la grilla NO capturan gestos (drag/pinch/wheel) → el dedo
   * scrollea la página; el pan/zoom se hace en el editor a pantalla completa (tocar = abrir). En
   * desktop (true) se conserva el inline drag/rueda.
   */
  interactiveSlots?: boolean;
  onSlotClick: (slotIndex: number) => void;
  /**
   * Ola 22 (Lucy 2026-09-09) — zoom de LIENZO controlado desde la fila de pills
   * superior (studio-editor): `stageZoomRaw` es el valor PEDIDO (se clampa al
   * render contra el tope — Ola 33: siempre STAGE_ZOOM_MAX, el wrapper del grid
   * scrollea horizontal si el contenido zoomado excede el ancho); el grid
   * reporta el estado efectivo vía `onStageZoomState` para que el control
   * (StudioStageZoomControl) pinte el % y habilite/deshabilite −/+.
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
  noFold = false,
  unitNoun,
  unitGroupSlots = null,
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
  // `stageZoomRaw`, control en la fila de pills); el tope es STAGE_ZOOM_MAX (Ola 33)
  // y se clampa al render (si el viewport se achica, el zoom se mantiene y el
  // wrapper del grid scrollea horizontal).

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
  // PACKS de unidades sueltas (owner 2026-09-15, ADR-101): la grilla plana se
  // divide en tarjetas-unidad de `unitGroupSlots` slots ("Pack 1" / "Pack 2"…).
  // Exige división exacta — un diseño legacy (9/20 unidades) no calza en packs
  // de 6 y se queda plano, igual que el stepper de fotos (packMode).
  // Owner 2026-09-18: `>=` (antes `>`) — UN solo pack también va en tarjeta-unidad
  // (mismo fondo que recubre de separadores), solo se omiten el rótulo "Pack 1"
  // y el pager, que son ruido para una sola tarjeta.
  const slotCountNow = canvasData?.slotCount ?? 0;
  const packGroups =
    !groupedForUnits &&
    !multiUnitSections &&
    typeof unitGroupSlots === "number" &&
    unitGroupSlots > 1 &&
    slotCountNow >= unitGroupSlots &&
    slotCountNow % unitGroupSlots === 0;
  const packSlots = packGroups ? (unitGroupSlots as number) : 0;
  const packCount = packGroups ? slotCountNow / packSlots : 0;
  // Slots que describe la grilla: una unidad en modo secciones, un pack en modo
  // tarjetas-pack; el diseño completo en cualquier otro caso (retrocompatible).
  const layoutSlotCount = multiUnitSections
    ? unitSlots
    : packGroups
      ? packSlots
      : (canvasData?.slotCount ?? 0);

  // Ola 3 (separadores 2 caras) — modo AGRUPADO: los slots se renderizan en
  // tarjetas-unidad ("Separador N") con las 2 caras lado a lado (la tira
  // desplegada física).
  const grouped = groupedForUnits;
  // Ola 3c — modo TIRA (gridGap=0, tira photobooth): las celdas se tocan → la tira
  // se lee como UNA pieza continua de color. Sin reserva de barra de acciones entre
  // celdas (flota sobre la foto, ver StudioSlot overlayActions). Regla 2026-09-08:
  // la separación visible ENTRE fotos la dibuja stripPhotoRect DENTRO de cada celda
  // (media canaleta del color del marco) — el gap CSS entre celdas sigue en 0.
  const stripMode = !grouped && (canvasData?.gridLayout.gap ?? 1) === 0;

  // Ola 29 (owner 2026-09-11, 1.3.A mejora visual) — secciones de TIRA en filas
  // de 2-3 (wrap): cada sección se dimensiona con SU parte del ancho del
  // contenedor, no con el ancho completo (si no, cada tira se calcula como si
  // fuera dueña de la fila y desbordaría). Solo modo secciones multi-unidad de
  // tiras; calendarios (secciones anchas) y separadores (agrupados) intactos.
  // Se calcula ANTES del memo de layout: la guarda de piso vs ancho lo necesita.
  const sectionsPerRow = unitSectionsPerRowFor({
    isStripSections: multiUnitSections && stripMode,
    unitCount,
    containerWidth,
  });
  const sectionAvailableW =
    sectionsPerRow > 1
      ? Math.floor((containerWidth - UNIT_SECTION_GAP * (sectionsPerRow - 1)) / sectionsPerRow)
      : containerWidth;

  const layout = useMemo(() => {
    if (!canvasData) return null;
    // Ola 34 (owner 2026-09-18) — cap de cols: móvil (<640) SIEMPRE 1 columna
    // full-width; tablet/desktop por ANCHO OBJETIVO de slot (450px ≤6 slots /
    // 300px ≥7 slots, piso 2 cols). El conteo que manda es el de la grilla que
    // se dibuja: una unidad (secciones), un pack (tarjetas-pack) o el diseño
    // completo (plano) — ver layoutSlotCount.
    const maxCols = resolveMaxCols({
      containerWidth,
      isCalendar,
      gridCols: canvasData.gridLayout.cols,
      slotCount: layoutSlotCount,
    });

    let cols = Math.min(maxCols, canvasData.gridLayout.cols);
    // Guarda de PISO vs ANCHO (owner 2026-09-18): el piso de displaySize por
    // slot NUNCA puede desbordar el contenedor — si `minSize*cols + gaps` no
    // cabe en el ancho disponible, se reducen columnas. Causa del overflow
    // horizontal real @768-1024: sidebar lg (288px) + piso de texto editable
    // 260 × 3 cols > ancho útil restante. El ancho de la guarda descuenta el
    // marco de la tarjeta (packs y plano van en tarjeta p-2) o reparte la fila
    // entre secciones de tira. Modo agrupado (separadores): su tarjeta-unidad
    // tiene fórmula propia de ancho (byWidth con caras) — no aplica.
    const minSlot = resolveMinSlotSize({ isCalendar, hasEditableText });
    const floorW = multiUnitSections ? sectionAvailableW : containerWidth - UNIT_CARD_PAD_X;
    // PACKS — columnas de la SUB-grilla de cada tarjeta: el preset de la unidad
    // (pack de 6 → 3×2) capeado al viewport, siempre divisor del pack para que
    // las filas de cada tarjeta queden completas.
    if (packGroups) {
      const preset = generateGridLayout(packSlots, canvasData.unitTemplate.stage);
      cols = Math.max(1, Math.min(cols, preset.cols));
      cols = fitColsToFloor({
        cols,
        minSize: minSlot,
        gap: canvasData.gridLayout.gap,
        availableW: floorW,
      });
      while (cols > 1 && packSlots % cols !== 0) cols -= 1;
      return { ...canvasData.gridLayout, cols, rows: Math.ceil(packSlots / cols) };
    }
    if (!groupedForUnits) {
      cols = fitColsToFloor({
        cols,
        minSize: minSlot,
        gap: canvasData.gridLayout.gap,
        availableW: floorW,
      });
    }
    if (cols === canvasData.gridLayout.cols) return canvasData.gridLayout;
    // Multi-unidad: las filas se calculan sobre la UNIDAD (layoutSlotCount), no
    // sobre el diseño completo.
    const rows = Math.ceil(layoutSlotCount / cols);
    return { ...canvasData.gridLayout, cols, rows };
  }, [
    canvasData,
    containerWidth,
    isCalendar,
    hasEditableText,
    layoutSlotCount,
    packGroups,
    packSlots,
    groupedForUnits,
    multiUnitSections,
    sectionAvailableW,
  ]);

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
    // slotCount en deps (bug tiras multi-unidad, owner 2026-09-14): al AGREGAR
    // unidades/fotos las celdas nuevas no existían cuando se armó el observer y
    // ninguna otra dep cambiaba → quedaban atrapadas como LazySlotPlaceholder
    // ("Toca para elegir") para siempre. Re-correr re-registra las celdas nuevas.
  }, [lazy, forceMountAll, mountedSlots, canvasData?.slotCount]);

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

  // (modo AGRUPADO y modo TIRA se declaran junto al modelo multi-unidad, antes
  // del memo de layout: la guarda de piso vs ancho los necesita). unitCols:
  // 1 en móvil; en desktop 2 unidades por fila, salvo caras muy anchas
  // (rectangular 6:2 → tira 6:1, 1 por fila).
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

  const availableW =
    // PACKS y PLANO (owner 2026-09-18) — la grilla vive DENTRO de la
    // tarjeta-unidad: descuenta su padding horizontal (p-2 a cada lado) para
    // que las celdas no desborden el marco. Secciones multi-unidad (tiras /
    // calendarios): su parte de la fila (Ola 29), sin tarjeta envolvente.
    (multiUnitSections ? sectionAvailableW : containerWidth - UNIT_CARD_PAD_X) -
    layout.gap * (layout.cols - 1);

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

  // Ola 34 (owner 2026-09-18) — modo AGRUPADO (separadores): las filas del
  // marco se cuentan en UNIDADES físicas (tarjetas "Separador N"), no en slots.
  // Con filas-slot el presupuesto de alto se repartía entre las 2 caras y las
  // caras quedaban chicas (120-153px); con filas-unidad cada cara hereda el
  // cap completo y crece (~×1.25, pedido del owner) donde el ancho lo permite.
  const frameRows = grouped ? Math.max(1, Math.ceil(physicalUnits / unitCols)) : layout.rows;

  // Ola 4 — marco máximo en ALTO. Owner 2026-09-18: el marco de 82vh SOLO aplica
  // a productos de UNA fila (bug original de stages gigantes: polaroid 1-slot,
  // tira 1-col) y en MÓVIL es FIJO (MOBILE_FRAME_HEIGHT — el alto del viewport
  // cambia al ocultarse la barra del navegador al scrollear y el tamaño del slot
  // NO debe moverse). En grids multi-fila el tamaño se deriva del ANCHO y el
  // marco lo define el contenido (cap por slots): la página scrollea vertical y
  // las celdas ya no se achican al piso en ventanas bajas (grid diminuto
  // centrado). Calendario: marco por contenido desde siempre (maxFrameHBySlots).
  const reserve = stripMode ? 0 : ACTION_BAR_RESERVE;
  const maxFrameH = computeMaxFrameH({
    viewportH,
    containerWidth,
    isCalendar,
    hasEditableText,
    slotMaxHeight,
    rows: frameRows,
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
        // Ola 34 — filas en UNIDADES (frameRows), no en slots: cada cara hereda
        // el cap completo y crece donde el ancho lo permite.
        const usableH = maxFrameH - layout.gap * (frameRows - 1) - frameRows * reserve;
        const byHeight = Math.floor(usableH / frameRows / slotAspect);
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

  // Ola 22 — valor efectivo del zoom de lienzo (display-only: nunca toca el
  // diseño ni la exportación). Ola 33 (owner 2026-09-18) — el tope de ACERCAR
  // es SIEMPRE STAGE_ZOOM_MAX: con el dimensionado por ancho de Ola 31 el grid
  // llena el contenedor a zoom 1 y el tope viejo (containerWidth/contentWidth)
  // quedaba en 1 → el "+" no hacía nada y la feature de acercar (ver detalles
  // finos de la plantilla) moría. Ahora, si el contenido zoomado excede el
  // ancho, el WRAPPER INTERNO scrollea horizontal (overflow-x abajo) — nunca
  // la página. Lucy 2026-09-09 — el zoom también ALEJA (piso STAGE_ZOOM_MIN).
  // El ancho de contenido a zoom 1 sigue calculándose para decidir si el
  // wrapper necesita scroll-x. Modo agrupado (separadores): ancho de
  // tarjeta-unidad = 2 caras + paddings (mismos 16+8 de la fórmula byWidth).
  const contentWidthBase = grouped
    ? unitCols * (slotDisplaySize * 2 + 16 + 8) + layout.gap * (unitCols - 1)
    : packGroups
      ? // PACKS — una tarjeta por fila: sub-grilla + su padding de tarjeta.
        slotDisplaySize * layout.cols + layout.gap * (layout.cols - 1) + UNIT_CARD_PAD_X
      : // Ola 29 — con secciones de tira en fila, el contenido es la FILA completa
        // (N tiras + gaps de sección): el tope de zoom sigue sin desbordar.
        // Plano (owner 2026-09-18): suma el padding de la tarjeta que envuelve
        // la grilla para que el zoom nunca la saque del marco.
        sectionsPerRow * (slotDisplaySize * layout.cols + layout.gap * (layout.cols - 1)) +
        UNIT_SECTION_GAP * (sectionsPerRow - 1) +
        (multiUnitSections ? 0 : UNIT_CARD_PAD_X);
  const stageZoomCap = computeStageZoomCap();
  const stageZoom = Math.max(STAGE_ZOOM_MIN, Math.min(stageZoomRaw, stageZoomCap));
  const zoomedSlotW = Math.round(slotDisplaySize * stageZoom);
  const zoomedSlotH = Math.round(slotHeight * stageZoom);

  // Ola 33 (owner 2026-09-18) — con zoom > 100% el contenido puede superar el
  // ancho del marco: el WRAPPER del grid scrollea horizontal (overflow-x-auto
  // solo cuando hace falta, para no clipear anillos/sombras a zoom 1) y la
  // PÁGINA jamás desborda (gate scrollWidth === clientWidth sigue en 0).
  const needsStageHScroll = contentWidthBase * stageZoom > containerWidth + 1;

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
          snapshot de producción/preview (WYSIWYG).
          Owner 2026-09-18: con UN solo pack el pager es ruido (una pastilla
          sola que no salta a nada) — solo multi-unidad o multi-pack. */}
      {(multiUnitSections || (packGroups && packCount > 1)) && (
        <UnitPager
          store={store}
          unitCount={multiUnitSections ? unitCount : packCount}
          unitSlots={multiUnitSections ? unitSlots : packSlots}
          noun={unitNoun ?? texts.unidades.nombrePieza}
        />
      )}

      {/* Ola 33 (owner 2026-09-18) — wrapper del scroll HORIZONTAL del zoom de
          lienzo: cuando el contenido zoomado excede el ancho del marco, ESTE
          contenedor scrollea (overflow-x-auto), nunca la página. Solo se activa
          con overflow real (needsStageHScroll): a zoom ≤100% queda en visible y
          no clipea anillos de selección ni sombras. */}
      <div className={needsStageHScroll ? "w-full overflow-x-auto" : undefined}>
        {multiUnitSections ? (
          // Ola 29 (owner 2026-09-11) — las secciones de TIRA van en grilla
          // horizontal de 2-3 por fila (wrap): 4 unidades → 3 + 1. El resto de
          // productos multi-unidad (calendarios) sigue apilado una por fila.
          <div
            className={
              sectionsPerRow > 1
                ? "grid w-full justify-items-center"
                : "flex w-full flex-col items-center gap-10"
            }
            style={
              sectionsPerRow > 1
                ? {
                    gridTemplateColumns: `repeat(${sectionsPerRow}, minmax(0, 1fr))`,
                    gap: UNIT_SECTION_GAP,
                  }
                : undefined
            }
          >
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
        ) : packGroups ? (
          // PACKS (owner 2026-09-15, ADR-101) — tarjeta por pack con el MISMO
          // patrón visual de las tarjetas-unidad de separadores (borde sutil de
          // marca + rótulo + progreso): "Pack 1" slots 1-6, "Pack 2" slots 7-12.
          // Owner 2026-09-18: con UN solo pack la tarjeta se queda (el fondo que
          // recubre) pero SIN rótulo "Pack 1" — ruido para una sola tarjeta.
          <motion.div
            className="flex w-full flex-col items-center gap-6"
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.3, ease: "easeOut" }}
          >
            {Array.from({ length: packCount }, (_, p) => (
              <section
                key={p}
                id={`studio-unit-${p}`}
                role="group"
                aria-label={fillStudioText(texts.lienzo.unidadGrupoAria, {
                  nombre: unitNoun ?? texts.unidades.nombrePieza,
                  n: p + 1,
                  total: packCount,
                })}
                className="border-brand-purple/15 flex w-full scroll-mt-32 flex-col items-center gap-1.5 rounded-2xl border bg-white/70 p-2 shadow-sm"
              >
                {packCount > 1 && (
                  <span className="text-brand-purple-dark text-xs font-bold">
                    {fillStudioText(texts.lienzo.unitPack, { n: p + 1 })}
                  </span>
                )}
                {/* Sin «Aplicar este diseño a todas»: la acción del store opera con
                  canvasData.unitSlots y los packs de imán suelto NO lo declaran
                  (cada imán es su unidad) — copiar pack-a-pack requeriría soporte
                  nuevo en el store. Solo progreso, como pide la delimitación. */}
                <UnitMiniActions
                  store={store}
                  unitIndex={p}
                  unitSlots={packSlots}
                  unitCount={packCount}
                  onApplied={announceApplied}
                  allowApply={false}
                />
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
                    gap: layout.gap,
                    ...(gridContentW ? { width: gridContentW, margin: "0 auto" } : {}),
                  }}
                >
                  <AnimatePresence>
                    {canvasData.slots
                      .slice(p * packSlots, (p + 1) * packSlots)
                      .map((slot) => renderSlotCell(slot))}
                  </AnimatePresence>
                </div>
              </section>
            ))}
          </motion.div>
        ) : grouped ? (
          // Ola 3 — tarjeta por UNIDAD física: "Separador N" con cara A | cara B
          // lado a lado (la tira desplegada que se imprime). El filete central
          // punteado sugiere el doblez de la tira. (Referencia POSITIVA del owner:
          // este patrón de tarjeta-unidad es el estándar de todo el Estudio.)
          <motion.div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${unitCols}, 1fr)`,
              gap: layout.gap,
            }}
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.3, ease: "easeOut" }}
          >
            <AnimatePresence>
              {Array.from({ length: physicalUnits }, (_, unitIndex) => (
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
                              ? noFold
                                ? // Alargados planos: SIN línea de doblez (la pieza no
                                  // se pliega) — separación sutil entre frente y reverso.
                                  "border-brand-purple/10 flex flex-col items-center gap-1 border-r pr-2"
                                : // Línea de DOBLEZ explícita (2026-09-22): más visible
                                  // (2px, morado medio) — es el pliegue físico de la tira.
                                  "border-brand-purple/50 flex flex-col items-center gap-1 border-r-2 border-dashed pr-2"
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
                  {/* Indicación del tamaño total DESPLEGADO junto al doblez
                      (2026-09-22): "Doblez · Desplegado: 2×12 cm". Solo
                      plegables — los Alargados (noFold) no se despliegan. */}
                  {!noFold &&
                    (() => {
                      const deployed = deployedSizeCm(sizeCm);
                      if (!deployed) return null;
                      return (
                        <span className="text-brand-purple-dark/80 text-[10px] font-semibold">
                          {fillStudioText(texts.lienzo.doblezDesplegado, {
                            tamano: `${deployed} cm`,
                          })}
                        </span>
                      );
                    })()}
                </div>
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          // MODO PLANO con tarjeta (owner 2026-09-18) — la grilla suelta (cuadro
          // de 3 fotos, planner, fotoimán suelto sin pack completo, tira de 1
          // unidad) va envuelta en el MISMO visual de tarjeta-unidad de
          // separadores/packs: todo estudio foto tiene el fondo que recubre.
          <motion.div
            className="border-brand-purple/15 flex w-full flex-col items-center rounded-2xl border bg-white/70 p-2 shadow-sm"
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.3, ease: "easeOut" }}
          >
            <div
              className={
                stripMode
                  ? // Ola 4 — TIRA continua: UNA sombra alrededor de la pieza entera (las
                    // celdas individuales no llevan sombra — separaban la tira visualmente).
                    // Sin overflow-hidden: el anillo de selección del slot no debe cortarse.
                    "grid rounded-lg shadow-[0_10px_28px_rgba(0,0,0,0.20)]"
                  : "grid"
              }
              style={{
                gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
                gap: layout.gap,
                // Ola 4 — ancho explícito + margin auto: el grid siempre centrado en
                // el marco, sin estirarse cuando el cap de alto achica las celdas.
                ...(gridContentW ? { width: gridContentW, margin: "0 auto" } : {}),
              }}
            >
              <AnimatePresence>
                {canvasData.slots.map((slot) => renderSlotCell(slot))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </div>

      {/* Feedback aria-live del atajo "Aplicar este diseño a todas". */}
      <span aria-live="polite" role="status" className="sr-only">
        {appliedTick > 0 ? texts.unidades.aplicadaFeedback : ""}
      </span>

      {/* Ola 22 (Lucy 2026-09-09) — el control del zoom de LIENZO vive en la fila de
        pills superior del editor (junto a «Ideas» / «Ver en tu espacio»), NUNCA flotando
        sobre el canvas. Acá solo se REPORTA el estado efectivo (zoom clampado; Ola 33:
        tope fijo STAGE_ZOOM_MAX con scroll-x interno en el wrapper) para que aquel
        control pinte el % y habilite −/+. Display-only: la exportación usa el tamaño
        LÓGICO del stage (pixelRatio relativo), así el PNG de imprenta sale igual con
        cualquier zoom. */}
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
  allowApply = true,
}: {
  store: StoreApi<StudioStoreState>;
  unitIndex: number;
  unitSlots: number;
  unitCount: number;
  onApplied: () => void;
  /** PACKS: false — applyUnitToAllUnits opera con canvasData.unitSlots y los
   *  packs de imán suelto no lo declaran (copiaría slot-a-slot, no pack-a-pack). */
  allowApply?: boolean;
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
      {allowApply && unitCount > 1 && (
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
 * lo guarda el padre y el grid lo clampa contra el tope fijo STAGE_ZOOM_MAX (Ola 33:
 * si el contenido zoomado excede el ancho, el wrapper del grid scrollea horizontal;
 * rango 0.5–2.5, helpers en studio-canvas-grid-size.ts). Como el tope es fijo, el
 * "+" solo se deshabilita al llegar al 250% real — nunca miente.
 */
export function StudioStageZoomControl({
  zoom,
  cap,
  onStep,
  onReset,
}: {
  /** Zoom efectivo ya clampado por el grid (lo que se ve en el %). */
  zoom: number;
  /** Tope de ACERCAR (Ola 33: siempre STAGE_ZOOM_MAX — el exceso lo scrollea el wrapper). */
  cap: number;
  onStep: (direction: 1 | -1) => void;
  onReset: () => void;
}) {
  const texts = useStudioTexts();
  const zoomButtonClass =
    "text-brand-purple hover:bg-brand-purple/10 focus-visible:ring-brand-turquoise flex h-8 w-8 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40 disabled:hover:bg-transparent sm:h-9 sm:w-9";
  return (
    <div
      role="group"
      aria-label={fillStudioText(texts.lienzo.stageZoomTitle, {
        pct: Math.round(zoom * 100),
      })}
      className="ring-brand-purple/15 inline-flex h-11 items-center gap-0.5 rounded-full bg-white px-1 shadow-xl ring-2 sm:h-12 sm:px-1.5 sm:ring-4"
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
        className="text-brand-purple-dark w-9 text-center text-xs font-bold tabular-nums sm:w-11"
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
      unitTemplate
        ? cardBackgroundHex({ layers: unitTemplate.layers, borderColor, frameFullBleed })
        : null,
    [unitTemplate, borderColor, frameFullBleed],
  );
  // Ola 29 (owner 2026-09-11, ronda 5) — color de letra POR DEFECTO por capa sobre
  // la tarjeta actual, con la MISMA regla del lienzo (igTextFill en IG /
  // defaultTextFillOnCard en el resto): el editor de texto arranca con ese color
  // y el preview nunca diverge del lienzo.
  const textDefaultFills = useMemo(() => {
    if (!unitTemplate || !cardBgForTextPreview) return undefined;
    const cardBg = cardBgForTextPreview;
    const isIgTpl = isInstagramTemplate(unitTemplate.layers);
    const dark = isDarkColor(cardBg);
    const map: Record<string, string> = {};
    for (const l of unitTemplate.layers) {
      if (l.type === "text" && (l as TextLayer).editable === true) {
        map[l.id] = isIgTpl
          ? igTextFill(l.id, (l as TextLayer).fill, dark)
          : defaultTextFillOnCard(cardBg, (l as TextLayer).fill);
      }
    }
    return map;
  }, [unitTemplate, cardBgForTextPreview]);
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
      // Ola 29 (ronda 5) — el color inicial de cada capa en el editor es el MISMO
      // default que el lienzo usa sobre la tarjeta (blanco sobre rosada, etc.).
      textDefaultFills={textDefaultFills}
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

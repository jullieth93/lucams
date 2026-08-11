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

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type Konva from "konva";
import type { StoreApi } from "zustand";
import { useStore } from "zustand";
import { StudioSlot } from "./studio-slot";
import { StudioSlotEditModal } from "./studio-slot-edit-modal";
import type { CanvasDataV2, StudioAsset, TextLayer } from "./types";
import { selectUnitImagePlaceholder, type StudioStoreState } from "./lib/store";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { unitIndexOfSlot } from "./lib/faces";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText } from "./studio-texts";

const MAX_VIEWPORT_WIDTH = 1024; // px lógicos máximo del grid en desktop (aumentado: calendarios/separadores se veían diminutos)

// Ola 21 (Lucy 2026-07-27) — marco máximo TAMBIÉN EN ALTO: el tamaño de celda se deriva
// del ancho Y del alto disponible, así ningún estudio se desborda (calendario 4×3,
// polaroid 1-slot, tira 1-col se veían gigantes) ni queda diminuto. El marco es
// proporcional al viewport (82% del alto, acotado entre 440 y 1100px) y el grid queda
// centrado siempre (width fija = celdas + gaps, margin auto).
const FRAME_HEIGHT_VH = 0.82;
const FRAME_HEIGHT_MIN = 440;
const FRAME_HEIGHT_MAX = 1100;

// Ola 21 (Lucy 2026-07-27) — límite de alto por slot según cantidad de slots,
// para que productos de pocos slots no ocupen toda la pantalla y los de muchos slots
// (calendario 12) no queden con recuadros tapados.
const SLOT_HEIGHT_CAP_BY_COUNT = {
  few: { desktop: 460, tablet: 360, mobile: 300 }, // 1-2 slots
  medium: { desktop: 560, tablet: 440, mobile: 360 }, // 3-6 slots
  many: { desktop: 520, tablet: 400, mobile: 320 }, // 7-12 slots
};

// Ola 2A (Lucy 2026-07-22) — espacio RESERVADO bajo cada slot para su barra de acciones
// (Centrar / Ajustar filtros / Eliminar). Antes el wrapper medía solo el canvas → la barra
// se superponía a la fila de miniaturas de abajo y los botones "se perdían". Reservar el
// alto SIEMPRE (lleno o vacío) mantiene el ritmo del grid sin layout shift.
const ACTION_BAR_RESERVE = 44;

// ADR-063 T5 — lazy-mount de stages Konva. Cada StudioSlot monta un Konva Stage (varios <canvas>
// + capas de realismo). Con muchos slots (calendario = 12) eso es pesado en móvil. Por encima de
// este umbral, montamos solo los slots cercanos al viewport (IntersectionObserver); el resto muestra
// un placeholder liviano hasta que se acerca. Nunca se desmonta un slot ya montado (no perder el
// stage registrado para el snapshot). Packs chicos (≤ umbral, incluye heart/circle) siguen eager.
const LAZY_MOUNT_THRESHOLD = 6;

// M.3.b.UX.7 — Responsive progresivo. 4 breakpoints en vez de 1.
// Min slot displaySize 120px (slot chico pero acciones tappeables ≥44px).
const BP_NARROW = 380; // <380px → 1 columna (slot fullwidth)
const BP_MOBILE = 640; // 380-639 → 2 columnas
const BP_TABLET = 1024; // 640-1023 → 3 columnas
const MIN_SLOT_SIZE = 120; // garantía mínima para tappeables
// Calendario (12 meses): las tarjetas deben leer la foto + la grilla del mes,
// así que el piso es mucho más alto que el genérico — una tarjeta de 120px era
// ilegible. Con 1 col en móvil y 3 en desktop el ancho disponible ya supera
// este piso; queda como garantía para viewports angostos extremos.
const CALENDAR_MIN_SLOT_SIZE = 280;

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
  calendarPreview?: { year: number; startMonth: number } | null;
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
   * FB4 — si false (táctil), los slots de la grilla NO capturan gestos (drag/pinch/wheel) → el dedo
   * scrollea la página; el pan/zoom se hace en el editor a pantalla completa (tocar = abrir). En
   * desktop (true) se conserva el inline drag/rueda.
   */
  interactiveSlots?: boolean;
  onSlotClick: (slotIndex: number) => void;
  /** Ola 8 — Abre el modal unificado de edición para el slot indicado (desde clic en slot lleno). */
  openEditSlot?: { slotIndex: number; tab: "photo" | "text" } | null;
  /** Ola 8 — Callback cuando el modal unificado se cierra. */
  onEditClose?: () => void;
  /** Ola 10 — solicitud de cambiar la foto desde el editor unificado: el padre abre el picker. */
  onRequestChangePhoto?: (slotIndex: number) => void;
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
  interactiveSlots = true,
  onSlotClick,
  openEditSlot,
  onEditClose,
  registerSlotStages,
  onRequestChangePhoto,
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

  const layout = useMemo(() => {
    if (!canvasData) return null;
    // M.3.b.UX.7 — Responsive progresivo: cap de cols según viewport.
    //   <380px  → max 1 col (slot fullwidth)
    //   <640px  → max 2 cols
    //   <1024px → max 3 cols
    //   ≥1024px → cols del gridLayout original (3-5 según slotCount)
    let maxCols: number;
    if (isCalendar) {
      // Calendario 12 meses: tarjetas GRANDES aunque el grid haga scroll
      // vertical. 1 col móvil / 2 tablet / 3 desktop (también capea drafts
      // viejos persistidos con gridLayout 4×3).
      if (containerWidth < BP_MOBILE) maxCols = 1;
      else if (containerWidth < BP_TABLET) maxCols = 2;
      else maxCols = 3;
    } else if (containerWidth < BP_NARROW) maxCols = 1;
    else if (containerWidth < BP_MOBILE) maxCols = 2;
    else if (containerWidth < BP_TABLET) maxCols = 3;
    else maxCols = canvasData.gridLayout.cols; // sin cap en desktop

    const cols = Math.min(maxCols, canvasData.gridLayout.cols);
    if (cols === canvasData.gridLayout.cols) return canvasData.gridLayout;
    const rows = Math.ceil(canvasData.slotCount / cols);
    return { ...canvasData.gridLayout, cols, rows };
  }, [canvasData, containerWidth, isCalendar]);

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
  const grouped = facesPerUnit === 2 && canvasData.slotCount % 2 === 0;
  // Ola 3c — modo TIRA (gridGap=0, tira photobooth): las celdas se tocan → la tira
  // se lee como UNA pieza continua de color. Sin reserva de barra de acciones entre
  // celdas (flota sobre la foto, ver StudioSlot overlayActions).
  const stripMode = !grouped && canvasData.gridLayout.gap === 0;
  const unitCount = grouped ? canvasData.slotCount / 2 : canvasData.slotCount;
  const stripAspect = grouped
    ? (canvasData.unitTemplate.stage.width * 2) / canvasData.unitTemplate.stage.height
    : 0;
  // Ola 19 — separadores: si solo hay UNA unidad física, no la obliguemos a compartir
  // el ancho con una columna fantasma. La tarjeta debe usar el alto disponible para
  // verse proporcional al producto real (vertical estrecho).
  const desiredUnitCols = containerWidth < BP_MOBILE || stripAspect >= 3 ? 1 : 2;
  const unitCols = grouped ? Math.min(unitCount, desiredUnitCols) : 0;
  // Columnas VISUALES de slots para la navegación por teclado (flechas).
  const navCols = grouped ? unitCols * 2 : layout.cols;

  const availableW = containerWidth - layout.gap * (layout.cols - 1);

  // Ola 6 — límite de alto del slot según cantidad de slots, para evitar que
  // productos de pocos slots (ej. Polaroid de 1 slot) ocupen toda la pantalla.
  // Calendario: caps altos — la tarjeta del mes (foto + grilla) necesita
  // ~340px de ancho para leerse; como el marco ya no se limita por el viewport
  // (ver maxFrameH abajo), estos caps solo evitan tarjetas desproporcionadas
  // y casi siempre manda el ancho disponible.
  const slotMaxHeight = (() => {
    if (canvasData.slotCount <= 2) {
      if (containerWidth < BP_NARROW) return SLOT_HEIGHT_CAP_BY_COUNT.few.mobile;
      if (containerWidth < BP_TABLET) return SLOT_HEIGHT_CAP_BY_COUNT.few.tablet;
      return SLOT_HEIGHT_CAP_BY_COUNT.few.desktop;
    }
    if (canvasData.slotCount <= 6) {
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
  })();

  // Ola 4 — marco máximo en ALTO (82% del viewport, acotado): las celdas se achican
  // si el grid completo no cabe en pantalla. Ola 6: se respeta también el cap por slot.
  // Calendario: el marco lo define el CONTENIDO (maxFrameHBySlots), no el viewport —
  // las 12 tarjetas se apilan a tamaño completo y el grid scrollea vertical.
  const reserve = stripMode ? 0 : ACTION_BAR_RESERVE;
  const maxFrameHBySlots =
    slotMaxHeight * layout.rows + layout.gap * (layout.rows - 1) + layout.rows * reserve;
  const maxFrameH = viewportH
    ? isCalendar
      ? maxFrameHBySlots
      : Math.min(
          FRAME_HEIGHT_MAX,
          Math.max(FRAME_HEIGHT_MIN, Math.round(viewportH * FRAME_HEIGHT_VH)),
          maxFrameHBySlots,
        )
    : null;

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
    : (() => {
        // Calendario: piso propio (280px) — con el genérico (120px) la tarjeta
        // del mes quedaba ilegible cuando el cap de alto gobernaba.
        const minSize = isCalendar ? CALENDAR_MIN_SLOT_SIZE : MIN_SLOT_SIZE;
        const byWidth = Math.floor(availableW / layout.cols);
        if (!maxFrameH) return Math.max(minSize, byWidth);
        // Alto útil del marco: menos gaps entre filas y la reserva de la barra de
        // acciones por fila (en modo tira no hay reserva: la barra flota).
        const usableH = maxFrameH - layout.gap * (layout.rows - 1) - layout.rows * reserve;
        const byHeight = Math.floor(usableH / layout.rows / slotAspect);
        return Math.max(minSize, Math.min(byWidth, byHeight));
      })();
  const slotHeight = slotDisplaySize * slotAspect;
  // Ola 4 — ancho EXPLÍCITO del grid (celdas + gaps): si el cap de alto achicó las
  // celdas, el grid no se estira a lo ancho — queda centrado en el marco (margin auto).
  const gridContentW = grouped
    ? undefined
    : slotDisplaySize * layout.cols + layout.gap * (layout.cols - 1);

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
        style={{ height: slotHeight + (stripMode ? 0 : ACTION_BAR_RESERVE) }}
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
            displaySize={slotDisplaySize}
            displayHeight={slotHeight}
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
            displaySize={slotDisplaySize}
            displayHeight={slotHeight}
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
              Array.from({ length: unitCount }, (_, unitIndex) => (
                <div
                  key={unitIndex}
                  role="group"
                  aria-label={fillStudioText(texts.lienzo.unidadAria, {
                    n: unitIndex + 1,
                    total: unitCount,
                  })}
                  className="border-brand-purple/15 flex flex-col items-center gap-1.5 rounded-2xl border bg-white/70 p-2 shadow-sm"
                >
                  <span className="text-brand-purple-dark text-xs font-bold">
                    {fillStudioText(texts.lienzo.unitSeparador, { n: unitIndex + 1 })}
                  </span>
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
}: {
  store: StoreApi<StudioStoreState>;
  editModal: { slotIndex: number; tab: "photo" | "text"; focusTextLayerId?: string } | null;
  onClose: () => void;
  allowFilters?: boolean;
  slotLabels?: string[];
  allowText?: boolean;
  frameFullBleed?: boolean;
  calendarPreview?: { year: number; startMonth: number } | null;
  /** Ola 10 — solicitud de cambiar la foto: el padre abre el picker. */
  onChangePhoto?: (slotIndex: number) => void;
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
  const unitTemplate = useStore(store, (s) => s.canvasData?.unitTemplate);
  const slotCount = useStore(store, (s) => s.canvasData?.slotCount ?? 0);
  const borderColor = useStore(store, (s) => s.canvasData?.borderColor ?? null);
  const setSlotFilter = useStore(store, (s) => s.setSlotFilter);
  const setSlotPhotoTransform = useStore(store, (s) => s.setSlotPhotoTransform);
  const setSlotTextOverride = useStore(store, (s) => s.setSlotTextOverride);
  const texts = useStudioTexts();

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
      allowFilters={allowFilters}
      onClose={onClose}
      onApplyFilter={(filter) => {
        if (slotIndex !== null) setSlotFilter(slotIndex, filter);
      }}
      onResetTransform={() => {
        if (slotIndex !== null) setSlotPhotoTransform(slotIndex, null);
      }}
      onNudge={(dx, dy) => {
        if (slotIndex !== null)
          setSlotPhotoTransform(slotIndex, {
            offsetX: slotOffsetX + dx,
            offsetY: slotOffsetY + dy,
          });
      }}
      onRotate={() => {
        if (slotIndex !== null)
          setSlotPhotoTransform(slotIndex, { rotation: (slotRotation + 90) % 360 });
      }}
      onApplyTextOverride={(layerId, override) => {
        if (slotIndex !== null) setSlotTextOverride(slotIndex, layerId, override);
      }}
      onChangePhoto={() => {
        if (slotIndex !== null) onChangePhoto?.(slotIndex);
      }}
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

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
import type { CanvasDataV2, StudioAsset } from "./types";
import { selectUnitImagePlaceholder, type StudioStoreState } from "./lib/store";

const MAX_VIEWPORT_WIDTH = 720; // px lógicos máximo del grid en desktop

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
  /** #14 — sustantivo del slot ("imán" | "separador") para el fallback y aria de cada StudioSlot. */
  slotNoun?: string;
  onSlotClick: (slotIndex: number) => void;
  /** M.3.b.B.3 — abrir modal ajustar foto (filtros) para un slot lleno. */
  onSlotAdjust?: (slotIndex: number) => void;
  /** M.3.b.D — abrir editor de texto inline al click sobre text layer editable. */
  onTextEdit?: (slotIndex: number, textLayerId: string) => void;
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
  slotNoun,
  onSlotClick,
  onSlotAdjust,
  onTextEdit,
  registerSlotStages,
  forceMountAll = false,
}: StudioCanvasGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(MAX_VIEWPORT_WIDTH);
  const stagesRef = useRef<Map<number, Konva.Stage | null>>(new Map());
  // ADR-063 T5 — slots ya montados (una vez montados, permanecen; el store es la fuente de verdad,
  // así que re-montar desde slotState no pierde nada).
  const [mountedSlots, setMountedSlots] = useState<Set<number>>(() => new Set());

  // Selectores zustand: solo re-render al cambiar slices específicos.
  const canvasData = useStore(store, (s) => s.canvasData);
  const selectedSlotIndex = useStore(store, (s) => s.selectedSlotIndex);
  const assignAssetToSlot = useStore(store, (s) => s.assignAssetToSlot);
  const clearSlot = useStore(store, (s) => s.clearSlot);
  const setSlotPhotoTransform = useStore(store, (s) => s.setSlotPhotoTransform);
  const selectSlot = useStore(store, (s) => s.selectSlot);

  // Responsive scale
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

  const layout = useMemo(() => {
    if (!canvasData) return null;
    // M.3.b.UX.7 — Responsive progresivo: cap de cols según viewport.
    //   <380px  → max 1 col (slot fullwidth)
    //   <640px  → max 2 cols
    //   <1024px → max 3 cols
    //   ≥1024px → cols del gridLayout original (3-5 según slotCount)
    let maxCols: number;
    if (containerWidth < BP_NARROW) maxCols = 1;
    else if (containerWidth < BP_MOBILE) maxCols = 2;
    else if (containerWidth < BP_TABLET) maxCols = 3;
    else maxCols = canvasData.gridLayout.cols; // sin cap en desktop

    const cols = Math.min(maxCols, canvasData.gridLayout.cols);
    if (cols === canvasData.gridLayout.cols) return canvasData.gridLayout;
    const rows = Math.ceil(canvasData.slotCount / cols);
    return { ...canvasData.gridLayout, cols, rows };
  }, [canvasData, containerWidth]);

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
        <span className="text-brand-muted text-sm">Cargando lienzo...</span>
      </div>
    );
  }

  // Calcular tamaño de cada slot para que el grid completo entre en
  // `containerWidth`. Mantenemos el aspect ratio del unitTemplate.
  const slotAspect = canvasData.unitTemplate.stage.height / canvasData.unitTemplate.stage.width;
  const availableW = containerWidth - layout.gap * (layout.cols - 1);
  const slotDisplaySize = Math.max(MIN_SLOT_SIZE, Math.floor(availableW / layout.cols));
  const slotHeight = slotDisplaySize * slotAspect;

  // Keyboard navigation entre slots
  const handleKeyboardNav = (
    fromSlotIndex: number,
    direction: "up" | "down" | "left" | "right",
  ) => {
    const col = fromSlotIndex % layout.cols;
    const row = Math.floor(fromSlotIndex / layout.cols);
    let targetCol = col;
    let targetRow = row;
    if (direction === "up") targetRow = Math.max(0, row - 1);
    if (direction === "down") targetRow = Math.min(layout.rows - 1, row + 1);
    if (direction === "left") targetCol = Math.max(0, col - 1);
    if (direction === "right") targetCol = Math.min(layout.cols - 1, col + 1);
    const targetIndex = targetRow * layout.cols + targetCol;
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

  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full"
      style={{ maxWidth: MAX_VIEWPORT_WIDTH }}
      aria-label="Lienzo del Estudio de Personalización"
    >
      <motion.div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
          gap: layout.gap,
        }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <AnimatePresence>
          {canvasData.slots.map((slot) => {
            const mounted = !lazy || forceMountAll || mountedSlots.has(slot.slotIndex);
            return (
              <motion.div
                key={slot.slotIndex}
                data-slot-observe={slot.slotIndex}
                className="flex items-center justify-center"
                style={{ height: slotHeight }}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: 0.25,
                  ease: "easeOut",
                  delay: mounted ? Math.min(slot.slotIndex, 8) * 0.04 : 0, // stagger acotado
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
                    slotNoun={slotNoun}
                    sizeCm={sizeCm}
                    shape={shape}
                    finish={finish}
                    cornerRadiusPx={cornerRadiusPx}
                    showRealismGuides={showRealismGuides}
                    onClick={() => {
                      selectSlot(slot.slotIndex);
                      onSlotClick(slot.slotIndex);
                    }}
                    onClear={() => clearSlot(slot.slotIndex)}
                    onAdjust={onSlotAdjust ? () => onSlotAdjust(slot.slotIndex) : undefined}
                    onTextEdit={
                      onTextEdit
                        ? (textLayerId) => onTextEdit(slot.slotIndex, textLayerId)
                        : undefined
                    }
                    onPhotoTransformChange={(transform) =>
                      setSlotPhotoTransform(slot.slotIndex, transform)
                    }
                    onCenterPhoto={() => setSlotPhotoTransform(slot.slotIndex, null)}
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
          })}
        </AnimatePresence>
      </motion.div>

      {/* A2.6 — Overlay de transición al cambiar plantilla */}
      <AnimatePresence>
        {transitioning && (
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
  const isCircle = shape === "circle";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ? `Editar ${label}` : "Editar este espacio"}
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
          alt={label ?? "Tu foto"}
          className="h-full w-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <span className="text-brand-muted absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-xs font-semibold">
          {label ? <span className="text-brand-purple-dark">{label}</span> : null}
          <span>Toca para elegir</span>
        </span>
      )}
    </button>
  );
}

// Re-export para que componentes consumidores tengan acceso directo
export { selectUnitImagePlaceholder };
export type { CanvasDataV2 };

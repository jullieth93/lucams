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
const MOBILE_BREAKPOINT = 640;

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
  onSlotClick: (slotIndex: number) => void;
  /** M.3.b.B.3 — abrir modal ajustar foto (filtros) para un slot lleno. */
  onSlotAdjust?: (slotIndex: number) => void;
  /** M.3.b.D — abrir editor de texto inline al click sobre text layer editable. */
  onTextEdit?: (slotIndex: number, textLayerId: string) => void;
  registerSlotStages: (stages: Map<number, Konva.Stage | null>) => void;
};

export function StudioCanvasGrid({
  store,
  sizeCm,
  shape,
  finish,
  cornerRadiusPx,
  showRealismGuides,
  onSlotClick,
  onSlotAdjust,
  onTextEdit,
  registerSlotStages,
}: StudioCanvasGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(MAX_VIEWPORT_WIDTH);
  const stagesRef = useRef<Map<number, Konva.Stage | null>>(new Map());

  // Selectores zustand: solo re-render al cambiar slices específicos.
  const canvasData = useStore(store, (s) => s.canvasData);
  const selectedSlotIndex = useStore(store, (s) => s.selectedSlotIndex);
  const assignAssetToSlot = useStore(store, (s) => s.assignAssetToSlot);
  const clearSlot = useStore(store, (s) => s.clearSlot);
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
    // Adaptación mobile: si cols >= 4 y viewport mobile, bajar a max 3 cols
    if (containerWidth < MOBILE_BREAKPOINT && canvasData.gridLayout.cols >= 4) {
      const cols = Math.min(3, canvasData.gridLayout.cols);
      const rows = Math.ceil(canvasData.slotCount / cols);
      return { ...canvasData.gridLayout, cols, rows };
    }
    return canvasData.gridLayout;
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

  if (!canvasData || !layout) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-brand-purple/70 text-sm">Cargando lienzo...</span>
      </div>
    );
  }

  // Calcular tamaño de cada slot para que el grid completo entre en
  // `containerWidth`. Mantenemos el aspect ratio del unitTemplate.
  const slotAspect = canvasData.unitTemplate.stage.height / canvasData.unitTemplate.stage.width;
  const availableW = containerWidth - layout.gap * (layout.cols - 1);
  const slotDisplaySize = Math.max(80, Math.floor(availableW / layout.cols));
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
          {canvasData.slots.map((slot) => (
            <motion.div
              key={slot.slotIndex}
              className="flex items-center justify-center"
              style={{ height: slotHeight }}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                duration: 0.25,
                ease: "easeOut",
                delay: slot.slotIndex * 0.04, // stagger 40ms entre slots
              }}
            >
              <StudioSlot
                slotState={slot}
                unitTemplate={canvasData.unitTemplate}
                displaySize={slotDisplaySize}
                displayHeight={slotHeight}
                isSelected={selectedSlotIndex === slot.slotIndex}
                totalSlots={canvasData.slotCount}
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
                  onTextEdit ? (textLayerId) => onTextEdit(slot.slotIndex, textLayerId) : undefined
                }
                onAssetDrop={(asset: StudioAsset) => assignAssetToSlot(slot.slotIndex, asset)}
                onKeyboardNav={(dir) => handleKeyboardNav(slot.slotIndex, dir)}
                onRegisterStage={registerStage(slot.slotIndex)}
              />
            </motion.div>
          ))}
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

// Re-export para que componentes consumidores tengan acceso directo
export { selectUnitImagePlaceholder };
export type { CanvasDataV2 };

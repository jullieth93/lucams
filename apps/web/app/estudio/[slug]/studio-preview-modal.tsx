"use client";

/*
 * StudioPreviewModal — M.3.b.UX.bug v3 (Lucy 2026-05-15).
 *
 * Modal fullscreen "Vista previa final": muestra cómo se va a IMPRIMIR el
 * pedido sin chrome del editor (sin guías, sin badges, sin action buttons,
 * sin dashed borders, sin mascote empty state, sin sombras de hover).
 * Es el momento "WOW" pre-finalize que también tienen Casetify / Shutterfly.
 *
 * Patrón:
 *   1. Cliente diseña en el editor (con todo el chrome).
 *   2. Cliente quiere validar antes de finalizar.
 *   3. Click en "Vista previa" → modal fullscreen con grid de imanes limpios.
 *   4. Cliente confirma y puede pasar a finalizar desde acá mismo.
 *
 * Re-usa de studio-slot.tsx:
 *   - renderLayer (renderea background + foto + asset + texts)
 *   - makeShapeClipFunc (heart/circle silhouette clipping)
 *   - RealismShadowLayer + RealismOverlayLayer (sombra + acabado, sin guías)
 */

import { Stage, Layer, Group } from "react-konva";
import type { StoreApi } from "zustand";
import { useStore } from "zustand";
import { X, Sparkles, CheckCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  selectFilledSlotCount,
  selectIsComplete,
  selectTotalSlotCount,
  type StudioStoreState,
} from "./lib/store";
import { makeShapeClipFunc, renderLayer } from "./studio-slot";
import { RealismShadowLayer, RealismOverlayLayer } from "./studio-realism-overlay";

const MAX_PREVIEW_SLOT_PX = 320;
const MIN_PREVIEW_SLOT_PX = 180;

type Props = {
  open: boolean;
  onClose: () => void;
  store: StoreApi<StudioStoreState>;
  productName: string;
  productSizeCm?: string;
  shape?: "rectangle" | "circle" | "heart" | "custom";
  finish?: "matte" | "glossy" | "soft-touch";
  cornerRadiusPx?: number;
  onFinalize: () => void;
  isFinalizing: boolean;
};

export function StudioPreviewModal({
  open,
  onClose,
  store,
  productName,
  productSizeCm,
  shape,
  finish,
  cornerRadiusPx,
  onFinalize,
  isFinalizing,
}: Props) {
  const canvasData = useStore(store, (s) => s.canvasData);
  const filled = useStore(store, selectFilledSlotCount);
  const total = useStore(store, selectTotalSlotCount);
  const complete = useStore(store, selectIsComplete);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="bg-brand-cream/95 h-[100dvh] w-screen max-w-none gap-0 overflow-hidden rounded-none border-0 p-0 backdrop-blur-sm"
        // Tapa el bordeado redondo default
      >
        <DialogTitle className="sr-only">Vista previa final del pedido</DialogTitle>
        <DialogDescription className="sr-only">
          Así se verá tu pedido cuando lo imprimamos. Sin guías ni decoración del editor.
        </DialogDescription>

        {/* Header */}
        <header className="border-brand-purple/10 sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2.5">
            <Sparkles className="text-brand-purple h-5 w-5" />
            <div className="flex flex-col leading-tight">
              <h2 className="text-brand-purple-dark text-sm font-bold sm:text-base">
                Vista previa final
              </h2>
              <p className="text-brand-purple-dark/60 text-[11px]">
                Así se imprimirá tu pedido · {productName}
                {productSizeCm ? ` · ${productSizeCm} cm` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar vista previa"
            className="text-brand-purple-dark/60 hover:bg-brand-purple/10 hover:text-brand-purple-dark focus:ring-brand-purple inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors focus:ring-2 focus:outline-none"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Grid de previews */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-10">
          {canvasData ? (
            <PreviewGrid
              canvasData={canvasData}
              shape={shape}
              finish={finish}
              cornerRadiusPx={cornerRadiusPx}
            />
          ) : (
            <div className="text-brand-purple-dark/50 py-20 text-center text-sm">
              Cargando vista previa...
            </div>
          )}
        </div>

        {/* Footer con CTA finalizar */}
        <footer className="border-brand-purple/10 sticky bottom-0 z-10 border-t bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-brand-purple-dark/70 text-center text-xs sm:text-left">
              {complete ? (
                <>
                  <span className="font-bold text-green-600">
                    {filled}/{total}
                  </span>{" "}
                  imanes listos — ¿avanzamos a finalizar?
                </>
              ) : (
                <>
                  Faltan <span className="font-bold text-amber-600">{total - filled}</span> imanes
                  con foto. Volvé al editor para completarlos.
                </>
              )}
            </p>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/5 flex-1 sm:flex-initial"
              >
                Volver a editar
              </Button>
              {complete && (
                <AnimatePresence>
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Button
                      type="button"
                      onClick={onFinalize}
                      disabled={isFinalizing}
                      className="bg-brand-purple hover:bg-brand-purple-dark gap-2 text-white shadow-md"
                    >
                      <CheckCheck className="h-4 w-4" />
                      {isFinalizing ? "Finalizando..." : "¡Listo, finalizar!"}
                    </Button>
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────
//  PreviewGrid — itera slots y rendea Stages "puros" sin chrome
// ──────────────────────────────────────────────────────────────────

function PreviewGrid({
  canvasData,
  shape,
  finish,
  cornerRadiusPx,
}: {
  canvasData: NonNullable<StudioStoreState["canvasData"]>;
  shape?: "rectangle" | "circle" | "heart" | "custom";
  finish?: "matte" | "glossy" | "soft-touch";
  cornerRadiusPx?: number;
}) {
  const { unitTemplate, slots, gridLayout } = canvasData;
  const stage = unitTemplate.stage;
  const aspect = stage.width / stage.height;

  // Display size: cap a MAX_PREVIEW_SLOT_PX. El CSS grid-cols con minmax
  // adapta al viewport real.
  const cols = gridLayout?.cols ?? Math.ceil(Math.sqrt(slots.length));
  const displayWidth = MAX_PREVIEW_SLOT_PX;
  const displayHeight = displayWidth / aspect;
  const stageScale = displayWidth / stage.width;

  return (
    <div className="mx-auto max-w-6xl">
      <div
        className="grid place-items-center gap-6"
        style={{
          gridTemplateColumns: `repeat(${Math.min(cols, slots.length)}, minmax(${MIN_PREVIEW_SLOT_PX}px, ${MAX_PREVIEW_SLOT_PX}px))`,
        }}
      >
        {slots.map((slot) => {
          const isEmpty = !slot.assetUrl;
          return (
            <div
              key={slot.slotIndex}
              className="flex flex-col items-center gap-2"
              style={{ width: displayWidth }}
            >
              <div
                className={[
                  "rounded-xl transition-opacity",
                  isEmpty ? "bg-brand-purple/5 opacity-50" : "",
                ].join(" ")}
                style={{ width: displayWidth, height: displayHeight }}
              >
                {isEmpty ? (
                  <div className="text-brand-purple/40 flex h-full flex-col items-center justify-center gap-1 text-center text-xs">
                    <span className="text-2xl">📷</span>
                    <span>Imán #{slot.slotIndex + 1} · sin foto</span>
                  </div>
                ) : (
                  <Stage
                    width={displayWidth}
                    height={displayHeight}
                    scaleX={stageScale}
                    scaleY={stageScale}
                    listening={false}
                  >
                    <RealismShadowLayer
                      stage={stage}
                      shape={shape}
                      cornerRadiusPx={cornerRadiusPx}
                    />
                    <Layer>
                      {shape === "heart" || shape === "circle" ? (
                        <Group clipFunc={makeShapeClipFunc(shape, stage.width, stage.height)}>
                          {unitTemplate.layers.map((layer) =>
                            renderLayer(layer, slot, stage, undefined, shape),
                          )}
                        </Group>
                      ) : (
                        unitTemplate.layers.map((layer) =>
                          renderLayer(layer, slot, stage, undefined),
                        )
                      )}
                    </Layer>
                    {/* Overlay SIN guides (preview limpio) */}
                    <RealismOverlayLayer
                      stage={stage}
                      shape={shape}
                      finish={finish}
                      cornerRadiusPx={cornerRadiusPx}
                      showGuides={false}
                    />
                  </Stage>
                )}
              </div>
              <span className="text-brand-purple-dark/50 text-[10px] font-semibold tracking-wider uppercase">
                Imán #{slot.slotIndex + 1}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

/*
 * StudioPhotoAdjustModal — M.3.b.B.3 (2026-05-13).
 *
 * Modal cliente-side para aplicar filtros pre-armados a la foto de un slot.
 * 5 presets clicables (Vivid / Vintage / Polaroid / Pastel / B&N) + opción
 * "Sin filtro" para reset.
 *
 * Decisiones:
 *   - Solo presets, no sliders custom (90% de los casos cubiertos con menos
 *     fricción UX). Sliders quedan para M.3.b.D futuro si Lucy lo pide.
 *   - Cada preview es un mini-thumbnail con CSS filters CSS-equivalents al
 *     preset Konva (rough approximation). El render real con Konva.Filters
 *     se aplica al confirmar en el canvas.
 *   - Modal anclado al slot seleccionado vía Radix Dialog (accesible, esc cierra).
 */

import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Check, ZoomIn, RotateCcw } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { FILTER_LABELS, FILTER_DESCRIPTIONS, FILTER_ORDER } from "./lib/photo-filters";
import type { PhotoFilterPreset } from "./types";

type StudioPhotoAdjustModalProps = {
  isOpen: boolean;
  photoUrl: string | null;
  currentFilter: PhotoFilterPreset | null;
  slotIndex: number | null;
  /** M.3.b.UX.v6 (Lucy 2026-05-15) — zoom del cliente sobre el cover scale.
   *  1.0 = default (cover × overscan 1.15). 2.0 = zoom 2×. */
  currentScale: number;
  onClose: () => void;
  onApply: (filter: PhotoFilterPreset | null) => void;
  onScaleChange: (scale: number) => void;
  /** M.3.b.UX.v6 — reset transform: vuelve la foto al centro con scale=1. */
  onResetTransform: () => void;
};

// CSS filter equivalents para preview (no idéntico a Konva, suficiente para
// que el cliente vea el cambio aproximado antes de confirmar).
const CSS_FILTER_BY_PRESET: Record<PhotoFilterPreset, string> = {
  vivid: "contrast(1.15) saturate(1.3) brightness(1.05)",
  vintage: "sepia(0.3) contrast(0.95) saturate(0.7) brightness(1.05)",
  polaroid: "sepia(0.15) contrast(1.05) saturate(0.9) brightness(1.08)",
  pastel: "contrast(0.9) saturate(0.8) brightness(1.1)",
  bw: "grayscale(1) contrast(1.1)",
};

export function StudioPhotoAdjustModal({
  isOpen,
  photoUrl,
  currentFilter,
  slotIndex,
  currentScale,
  onClose,
  onApply,
  onScaleChange,
  onResetTransform,
}: StudioPhotoAdjustModalProps) {
  if (!photoUrl) return null;

  // M.3.b.UX.v6 — filter NO autocierra. Cliente puede ajustar zoom +
  // filter combinados, cierra con botón "Listo" o ESC. Más fluido.
  const handleSelectFilter = (filter: PhotoFilterPreset | null) => {
    onApply(filter);
  };

  // Slider value es porcentaje 100-200% del cover-overscan default.
  const zoomPct = Math.round(currentScale * 100);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle className="text-brand-purple-dark text-lg font-bold">
          Ajustar foto del imán {slotIndex !== null ? slotIndex + 1 : ""}
        </DialogTitle>
        <DialogDescription className="text-brand-purple-dark/60 text-sm">
          Aplicá zoom, reposicionalá la foto arrastrándola en el canvas, o elegí un filtro.
        </DialogDescription>

        {/* M.3.b.UX.v6 — Zoom slider. 100% = cover default (cliente puede
          arrastrar foto). 100-200% = zoom progresivo (más detalle de la
          foto visible, menos campo visible). */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="zoom-slider"
              className="text-brand-purple-dark flex items-center gap-1.5 text-sm font-semibold"
            >
              <ZoomIn className="h-4 w-4" />
              Zoom
            </label>
            <span className="text-brand-purple-dark/70 text-xs font-bold tabular-nums">
              {zoomPct}%
            </span>
          </div>
          <Slider
            id="zoom-slider"
            min={50}
            max={300}
            step={5}
            value={[zoomPct]}
            onValueChange={(values) => onScaleChange(values[0] / 100)}
            className="py-1"
            aria-label="Nivel de zoom de la foto"
          />
          <div className="text-brand-purple-dark/55 flex justify-between text-[10px]">
            <span>50% (ver toda la foto)</span>
            <span>100% (cover)</span>
            <span>300% (acercar)</span>
          </div>
          <p className="text-brand-purple-dark/55 text-[11px]">
            Arrastrá la foto libremente en el canvas para encuadrarla. Bajá el zoom (50-99%) si
            querés ver toda la foto con padding. Subí (101-300%) para acercar a un detalle.
          </p>
        </div>

        {/* Reset transform — vuelve scale=1 + offset=0 */}
        <div className="border-brand-purple/10 mt-4 flex border-t pt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onResetTransform}
            className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/5 gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Centrar y resetear zoom
          </Button>
        </div>

        <div className="mt-5">
          <h3 className="text-brand-purple-dark mb-2 text-sm font-semibold">Filtros</h3>
          {/* Grid de presets: 6 cards (sin filtro + 5 presets) */}
          <div
            role="radiogroup"
            aria-label="Filtros disponibles"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          >
            {/* Sin filtro */}
            <FilterCard
              isSelected={currentFilter === null}
              previewUrl={photoUrl}
              cssFilter="none"
              label="Sin filtro"
              description="Foto original sin ajustes"
              onClick={() => handleSelectFilter(null)}
            />

            {FILTER_ORDER.map((preset) => (
              <FilterCard
                key={preset}
                isSelected={currentFilter === preset}
                previewUrl={photoUrl}
                cssFilter={CSS_FILTER_BY_PRESET[preset]}
                label={FILTER_LABELS[preset]}
                description={FILTER_DESCRIPTIONS[preset]}
                onClick={() => handleSelectFilter(preset)}
              />
            ))}
          </div>
        </div>

        <div className="border-brand-purple/10 mt-5 flex justify-end border-t pt-4">
          <Button
            type="button"
            onClick={onClose}
            className="bg-brand-purple hover:bg-brand-purple-dark text-white"
          >
            Listo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────
//  Sub-component
// ──────────────────────────────────────────────────────────────────

function FilterCard({
  isSelected,
  previewUrl,
  cssFilter,
  label,
  description,
  onClick,
}: {
  isSelected: boolean;
  previewUrl: string;
  cssFilter: string;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      aria-label={`${label}. ${description}`}
      onClick={onClick}
      className={[
        "relative flex flex-col items-center gap-1.5 rounded-lg border-2 p-2 transition-all",
        isSelected
          ? "border-brand-turquoise bg-brand-turquoise/5 shadow-md"
          : "border-brand-purple/15 hover:border-brand-purple/40 hover:bg-brand-cream/50",
      ].join(" ")}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={`Preview con filtro ${label}`}
          style={{ filter: cssFilter }}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        {isSelected && (
          <div className="bg-brand-turquoise/95 absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full shadow">
            <Check className="h-3 w-3 text-white" />
          </div>
        )}
      </div>
      <div className="text-center">
        <p className="text-brand-purple-dark text-xs font-bold">{label}</p>
        <p className="text-brand-purple-dark/55 hidden text-[10px] sm:block">{description}</p>
      </div>
    </button>
  );
}

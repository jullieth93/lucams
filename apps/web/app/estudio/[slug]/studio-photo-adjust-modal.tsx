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
import { Check } from "lucide-react";
import {
  FILTER_LABELS,
  FILTER_DESCRIPTIONS,
  FILTER_ORDER,
} from "./lib/photo-filters";
import type { PhotoFilterPreset } from "./types";

type StudioPhotoAdjustModalProps = {
  isOpen: boolean;
  photoUrl: string | null;
  currentFilter: PhotoFilterPreset | null;
  slotIndex: number | null;
  onClose: () => void;
  onApply: (filter: PhotoFilterPreset | null) => void;
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
  onClose,
  onApply,
}: StudioPhotoAdjustModalProps) {
  if (!photoUrl) return null;

  const handleSelect = (filter: PhotoFilterPreset | null) => {
    onApply(filter);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle className="text-brand-purple-dark text-lg font-bold">
          Ajustar foto del imán {slotIndex !== null ? slotIndex + 1 : ""}
        </DialogTitle>
        <DialogDescription className="text-brand-purple-dark/60 text-sm">
          Elegí un filtro pre-armado. Los cambios se aplican al confirmar.
        </DialogDescription>

        <div className="mt-4">
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
              onClick={() => handleSelect(null)}
            />

            {FILTER_ORDER.map((preset) => (
              <FilterCard
                key={preset}
                isSelected={currentFilter === preset}
                previewUrl={photoUrl}
                cssFilter={CSS_FILTER_BY_PRESET[preset]}
                label={FILTER_LABELS[preset]}
                description={FILTER_DESCRIPTIONS[preset]}
                onClick={() => handleSelect(preset)}
              />
            ))}
          </div>
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

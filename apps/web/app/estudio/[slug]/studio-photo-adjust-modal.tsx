"use client";

/*
 * StudioPhotoAdjustModal — M.3.b.B.3 (2026-05-13).
 *
 * Panel auxiliar (NO modal-bloqueante) para aplicar filtros pre-armados
 * a la foto de un slot. 5 presets clicables (Vivid / Vintage / Polaroid /
 * Pastel / B&N) + opción "Sin filtro" para reset.
 *
 * Cambios 2026-05-21 (feedback Lucy):
 *   - Pasa a NON-MODAL (withOverlay=false): el canvas Konva detrás queda
 *     interactivo. El cliente puede seguir haciendo scroll-zoom, drag-pan
 *     y arrastrar la foto MIENTRAS ajusta filtros.
 *   - Posicionado bottom-center (no centered overlay) para no tapar el
 *     canvas donde está la foto que se está editando.
 *   - Removido el slider de Zoom redundante: el scroll del mouse + pinch
 *     ya cubren esa función. El reset button queda para volver a centrado.
 *
 * Decisiones:
 *   - Solo presets, no sliders custom (90% de los casos cubiertos con menos
 *     fricción UX). Sliders quedan para M.3.b.D futuro si Lucy lo pide.
 *   - Cada preview es un mini-thumbnail con CSS filters CSS-equivalents al
 *     preset Konva (rough approximation). El render real con Konva.Filters
 *     se aplica al confirmar en el canvas.
 */

import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FILTER_LABELS, FILTER_DESCRIPTIONS, FILTER_ORDER } from "./lib/photo-filters";
import type { PhotoFilterPreset } from "./types";

type StudioPhotoAdjustModalProps = {
  isOpen: boolean;
  photoUrl: string | null;
  currentFilter: PhotoFilterPreset | null;
  slotIndex: number | null;
  onClose: () => void;
  onApply: (filter: PhotoFilterPreset | null) => void;
  /** Reset transform: vuelve la foto al centro con scale=1. */
  onResetTransform: () => void;
  /**
   * Muestra la sección de filtros. Se desactiva para calendarios (auditoría v3 · H4): los filtros
   * Konva NO llegan al compositor del calendario ni al PNG de producción → se verían B&N en pantalla
   * pero imprimirían a color (rompe WYSIWYG). El encuadre (zoom/pan) SÍ se propaga, así que se
   * conserva. Volver a habilitar cuando el compositor del calendario replique los filtros.
   */
  allowFilters?: boolean;
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
  onResetTransform,
  allowFilters = true,
}: StudioPhotoAdjustModalProps) {
  if (!photoUrl) return null;

  const handleSelectFilter = (filter: PhotoFilterPreset | null) => {
    onApply(filter);
  };

  return (
    // modal={false} — el contenido detrás (canvas Konva) sigue recibiendo
    // eventos (scroll-zoom, drag-pan). Focus NO se atrapa dentro del panel.
    //
    // IMPORTANTE: NO ponemos preventDefault en onInteractOutside ni
    // onPointerDownOutside — esos handlers reciben eventos del exterior
    // y al preventDefault Radix interpreta "no propagar", lo que termina
    // bloqueando los eventos también al canvas. Para evitar autocierre,
    // dejamos esos handlers no-op (Radix solo cierra con explicit close
    // o ESC en modal=false con esos handlers vacíos).
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()} modal={false}>
      <DialogContent
        withOverlay={false}
        className="!top-auto bottom-4 left-1/2 max-w-2xl !translate-y-0 shadow-lg"
      >
        <DialogTitle className="text-brand-purple-dark text-lg font-bold">
          Ajustar foto del imán {slotIndex !== null ? slotIndex + 1 : ""}
        </DialogTitle>
        <DialogDescription className="text-brand-muted text-sm">
          Arrastra la foto en el canvas para encuadrar · Scroll del mouse (o pellizco) para zoom
          {allowFilters ? " · Elige un filtro abajo" : ""}
        </DialogDescription>

        {/* Reset transform — vuelve scale=1 + offset=0 */}
        <div className="mt-2 flex">
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

        {allowFilters && (
          <div className="mt-3">
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
        )}

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
        <p className="text-brand-muted hidden text-[10px] sm:block">{description}</p>
      </div>
    </button>
  );
}

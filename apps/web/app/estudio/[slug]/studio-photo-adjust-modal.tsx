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
 * Ola 6 (2026-07-23): se extrae `StudioPhotoAdjustForm` para reutilizar la
 * misma UI dentro del modal unificado de edición por slot (`StudioSlotEditModal`).
 */

import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  RotateCcw,
  RotateCw,
} from "lucide-react";
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
  /** #18 — encuadre por teclado/controles: estado actual del transform del slot (null = sin ajuste). */
  photoTransform: { offsetX: number; offsetY: number; scale: number; rotation?: number } | null;
  /** #18 — zoom por slider (porcentaje 50-300). */
  onZoomChange: (scalePercent: number) => void;
  /** #18 — desplazar la foto (dx/dy en px del stage). */
  onNudge: (dx: number, dy: number) => void;
  /** Ola 3c — rotar la foto en pasos de 90° (orientación vs ventana/cara). */
  onRotate?: () => void;
  /**
   * Muestra la sección de filtros. Se desactiva para calendarios (auditoría v3 · H4): los filtros
   * Konva NO llegan al compositor del calendario ni al PNG de producción → se verían B&N en pantalla
   * pero imprimirían a color (rompe WYSIWYG). El encuadre (zoom/pan) SÍ se propaga, así que se
   * conserva. Volver a habilitar cuando el compositor del calendario replique los filtros.
   */
  allowFilters?: boolean;
};

export type StudioPhotoAdjustFormProps = {
  photoUrl: string;
  currentFilter: PhotoFilterPreset | null;
  currentTransform: { offsetX: number; offsetY: number; scale: number; rotation?: number } | null;
  onApplyFilter: (filter: PhotoFilterPreset | null) => void;
  onResetTransform: () => void;
  onZoomChange: (scalePercent: number) => void;
  onNudge: (dx: number, dy: number) => void;
  onRotate?: () => void;
  allowFilters?: boolean;
  /** Ola 8 — false oculta el slider de zoom (desktop: scroll/pellizco; móvil: slider). Default true. */
  showZoomSlider?: boolean;
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
  photoTransform,
  onZoomChange,
  onNudge,
  onRotate,
  allowFilters = true,
}: StudioPhotoAdjustModalProps) {
  if (!photoUrl) return null;

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
          Arrastra la foto en el canvas para encuadrar · Scroll del mouse (o pellizco) para zoom · o
          usa el zoom y las flechas de abajo para encuadrar con el teclado
          {allowFilters ? " · Elige un filtro abajo" : ""}
        </DialogDescription>

        <StudioPhotoAdjustForm
          photoUrl={photoUrl}
          currentFilter={currentFilter}
          currentTransform={photoTransform}
          onApplyFilter={onApply}
          onResetTransform={onResetTransform}
          onZoomChange={onZoomChange}
          onNudge={onNudge}
          onRotate={onRotate}
          allowFilters={allowFilters}
        />

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

export function StudioPhotoAdjustForm({
  photoUrl,
  currentFilter,
  currentTransform,
  onApplyFilter,
  onResetTransform,
  onZoomChange,
  onNudge,
  onRotate,
  allowFilters = true,
  showZoomSlider = true,
}: StudioPhotoAdjustFormProps) {
  // #18 — paso de desplazamiento por pulsación (px del stage), y % de zoom actual.
  const NUDGE = 12;
  const zoomPct = Math.round((currentTransform?.scale ?? 1) * 100);

  return (
    <div className="space-y-3">
      {/* Reset transform — vuelve scale=1 + offset=0 (+ rotación) */}
      <div className="flex flex-wrap gap-2">
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
        {/* Ola 3c — Rotar 90°: endereza fotos cuya orientación no calza la
            ventana (foto apaisada en cara vertical, retrato en separador 6×2).
            El encuadre (pan/zoom) se mantiene; producción dibuja lo mismo. */}
        {onRotate && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRotate}
            aria-label="Rotar la foto 90 grados"
            className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/5 gap-1.5"
          >
            <RotateCw className="h-3.5 w-3.5" />
            Rotar 90°
            {currentTransform?.rotation ? (
              <span className="text-brand-muted tabular-nums">
                ({Math.round(currentTransform.rotation)}°)
              </span>
            ) : null}
          </Button>
        )}
      </div>

      {/* #18 — encuadre accesible: en desktop se usa scroll/pellizco sobre el slot; en móvil
        se ofrece el slider + cruceta de 4 flechas (equivalente de teclado a los gestos de pan/zoom).
        Aplica también a calendarios (el encuadre sí se propaga). */}
      <div className="border-brand-purple/10 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-lg border p-3">
        {showZoomSlider && (
          <div className="flex-1">
            <label
              htmlFor="pa-zoom"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              Zoom: {zoomPct}%
            </label>
            <input
              id="pa-zoom"
              type="range"
              min={50}
              max={300}
              step={5}
              value={zoomPct}
              onChange={(e) => onZoomChange(Number(e.target.value))}
              aria-label={`Zoom ${zoomPct} por ciento`}
              aria-valuetext={`${zoomPct}%`}
              className="accent-brand-purple w-full"
            />
          </div>
        )}

        <div className="flex flex-col items-center">
          <span className="text-brand-purple-dark mb-1 text-xs font-semibold">Mover</span>
          <div className="grid grid-cols-3 grid-rows-2 gap-1">
            <span />
            <NudgeButton label="Mover la foto hacia arriba" onClick={() => onNudge(0, -NUDGE)}>
              <ArrowUp className="h-4 w-4" />
            </NudgeButton>
            <span />
            <NudgeButton label="Mover la foto a la izquierda" onClick={() => onNudge(-NUDGE, 0)}>
              <ArrowLeft className="h-4 w-4" />
            </NudgeButton>
            <NudgeButton label="Mover la foto hacia abajo" onClick={() => onNudge(0, NUDGE)}>
              <ArrowDown className="h-4 w-4" />
            </NudgeButton>
            <NudgeButton label="Mover la foto a la derecha" onClick={() => onNudge(NUDGE, 0)}>
              <ArrowRight className="h-4 w-4" />
            </NudgeButton>
          </div>
        </div>
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
              onClick={() => onApplyFilter(null)}
            />

            {FILTER_ORDER.map((preset) => (
              <FilterCard
                key={preset}
                isSelected={currentFilter === preset}
                previewUrl={photoUrl}
                cssFilter={CSS_FILTER_BY_PRESET[preset]}
                label={FILTER_LABELS[preset]}
                description={FILTER_DESCRIPTIONS[preset]}
                onClick={() => onApplyFilter(preset)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
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

// #18 — botón de la cruceta de encuadre: ≥44px táctil con foco visible.
function NudgeButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/10 focus-visible:ring-brand-purple flex h-11 w-11 items-center justify-center rounded-md border bg-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

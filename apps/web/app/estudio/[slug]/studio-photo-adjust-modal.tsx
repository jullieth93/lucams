"use client";

/*
 * StudioPhotoAdjustForm — M.3.b.B.3 (2026-05-13), extraído en Ola 6 (2026-07-23).
 *
 * Controles de la pestaña Foto del modal unificado de edición por slot
 * (`StudioSlotEditModal`): filtros pre-armados (Vivid / Vintage / Polaroid /
 * Pastel / B&N) + "Sin filtro", rotar 90° y centrar/reset.
 *
 * Ola 9 (Lucy 2026-07-24) — slider de zoom ELIMINADO de TODA la UI:
 *   - Desktop: zoom con la RUEDA del mouse sobre la foto (slot o preview del modal).
 *   - Táctil: zoom con PELLIZCO sobre la foto (preview del modal; la grilla no
 *     captura gestos inline para no bloquear el scroll de la página).
 *   - Doble click/tap o el botón "Centrar" resetean el encuadre.
 *   El antiguo `StudioPhotoAdjustModal` standalone (huérfano desde Ola 6) se
 *   retiró con este cambio.
 *
 * Lucy 2026-09-08 — cruceta "Mover" ELIMINADA (pedido del owner): el encuadre
 * se hace con los gestos directos sobre la foto del preview (arrastre = pan);
 * la cruceta duplicaba esa función y recargaba el modal.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FILTER_ORDER } from "./lib/photo-filters";
import type { PhotoFilterPreset } from "./types";
import { useStudioTexts } from "./studio-texts-provider";

export type StudioPhotoAdjustFormProps = {
  photoUrl: string;
  currentFilter: PhotoFilterPreset | null;
  currentTransform: { offsetX: number; offsetY: number; scale: number; rotation?: number } | null;
  onApplyFilter: (filter: PhotoFilterPreset | null) => void;
  onResetTransform: () => void;
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

// CSS filter equivalents para preview (no idéntico a Konva, suficiente para
// que el cliente vea el cambio aproximado antes de confirmar).
const CSS_FILTER_BY_PRESET: Record<PhotoFilterPreset, string> = {
  vivid: "contrast(1.15) saturate(1.3) brightness(1.05)",
  vintage: "sepia(0.3) contrast(0.95) saturate(0.7) brightness(1.05)",
  polaroid: "sepia(0.15) contrast(1.05) saturate(0.9) brightness(1.08)",
  pastel: "contrast(0.9) saturate(0.8) brightness(1.1)",
  bw: "grayscale(1) contrast(1.1)",
};

export function StudioPhotoAdjustForm({
  photoUrl,
  currentFilter,
  currentTransform,
  onApplyFilter,
  onResetTransform,
  onRotate,
  allowFilters = true,
}: StudioPhotoAdjustFormProps) {
  const texts = useStudioTexts();
  // Lucy 2026-09-08 — estado de PROCESANDO al aplicar un filtro: el commit al store
  // dispara el re-cache Konva (síncrono, puede tardar un frame largo) y el click no
  // mostraba feedback. Mientras aplica: spinner sobre la card elegida + grupo
  // deshabilitado (mismo patrón Loader2 del picker de fotos). El commit va un frame
  // DESPUÉS para que el spinner pinte primero; mínimo visible de 450ms.
  const [applyingFilter, setApplyingFilter] = useState<PhotoFilterPreset | "none" | null>(null);
  const filterTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (filterTimerRef.current !== null) window.clearTimeout(filterTimerRef.current);
    },
    [],
  );
  const handleFilterClick = (filter: PhotoFilterPreset | null) => {
    if (applyingFilter !== null) return;
    setApplyingFilter(filter ?? "none");
    requestAnimationFrame(() => {
      onApplyFilter(filter);
      filterTimerRef.current = window.setTimeout(() => setApplyingFilter(null), 450);
    });
  };
  // Roadmap B1 — nombres y descripciones de filtros desde el CMS (estudio.texto.filtro-*);
  // FILTER_LABELS/DESCRIPTIONS de lib/photo-filters quedan como respaldo de datos del preset.
  const filterLabels: Record<PhotoFilterPreset, string> = {
    vivid: texts.texto.filtroVividLabel,
    vintage: texts.texto.filtroVintageLabel,
    polaroid: texts.texto.filtroPolaroidLabel,
    pastel: texts.texto.filtroPastelLabel,
    bw: texts.texto.filtroBwLabel,
  };
  const filterDescriptions: Record<PhotoFilterPreset, string> = {
    vivid: texts.texto.filtroVividDesc,
    vintage: texts.texto.filtroVintageDesc,
    polaroid: texts.texto.filtroPolaroidDesc,
    pastel: texts.texto.filtroPastelDesc,
    bw: texts.texto.filtroBwDesc,
  };

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
          {texts.texto.ajustarReset}
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
            aria-label={texts.texto.rotarAria}
            className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/5 gap-1.5"
          >
            <RotateCw className="h-3.5 w-3.5" />
            {texts.texto.ajustarRotar}
            {currentTransform?.rotation ? (
              <span className="text-brand-muted tabular-nums">
                ({Math.round(currentTransform.rotation)}°)
              </span>
            ) : null}
          </Button>
        )}
      </div>

      {/* Lucy 2026-09-08 — la cruceta "Mover" se eliminó (pedido del owner): el pan
          se hace arrastrando la foto directamente en el preview de arriba. */}

      {allowFilters && (
        <div className="mt-3">
          <h3 className="text-brand-purple-dark mb-2 text-sm font-semibold">
            {texts.texto.filtrosTitulo}
          </h3>
          {/* Grid de presets: 6 cards (sin filtro + 5 presets) */}
          <div
            role="radiogroup"
            aria-label={texts.texto.filtrosAria}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          >
            {/* Sin filtro */}
            <FilterCard
              isSelected={currentFilter === null}
              isApplying={applyingFilter === "none"}
              disabled={applyingFilter !== null}
              previewUrl={photoUrl}
              cssFilter="none"
              label={texts.texto.filtroSinLabel}
              description={texts.texto.filtroSinDesc}
              onClick={() => handleFilterClick(null)}
            />

            {FILTER_ORDER.map((preset) => (
              <FilterCard
                key={preset}
                isSelected={currentFilter === preset}
                isApplying={applyingFilter === preset}
                disabled={applyingFilter !== null}
                previewUrl={photoUrl}
                cssFilter={CSS_FILTER_BY_PRESET[preset]}
                label={filterLabels[preset]}
                description={filterDescriptions[preset]}
                onClick={() => handleFilterClick(preset)}
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
  isApplying,
  disabled,
  previewUrl,
  cssFilter,
  label,
  description,
  onClick,
}: {
  isSelected: boolean;
  /** Lucy 2026-09-08 — esta card es la que se está aplicando (spinner encima). */
  isApplying: boolean;
  /** Mientras se aplica un filtro, el grupo entero queda deshabilitado. */
  disabled: boolean;
  previewUrl: string;
  cssFilter: string;
  label: string;
  description: string;
  onClick: () => void;
}) {
  const texts = useStudioTexts();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      aria-busy={isApplying}
      aria-label={`${label}. ${description}`}
      onClick={onClick}
      disabled={disabled}
      className={[
        "relative flex flex-col items-center gap-1.5 rounded-lg border-2 p-2 transition-all",
        "disabled:cursor-wait disabled:opacity-70",
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
        {/* Lucy 2026-09-08 — feedback de procesamiento al aplicar el filtro
            (mismo overlay spinner del picker de fotos). */}
        {isApplying && (
          <div className="bg-brand-purple-dark/40 absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden />
            <span className="sr-only">{texts.texto.aplicando}</span>
          </div>
        )}
        {isSelected && !isApplying && (
          <div className="bg-brand-turquoise/95 absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full shadow">
            {/* A11Y — mismo caso que el ✓ de la sidebar: blanco sobre turquesa = 1.71:1, bajo el
              3:1 de WCAG 1.4.11. brand-purple-dark → 7.06:1 sin tocar la paleta. */}
            <Check className="text-brand-purple-dark h-3 w-3" />
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

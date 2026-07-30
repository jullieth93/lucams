"use client";

/*
 * StudioPhotoAdjustForm — M.3.b.B.3 (2026-05-13), extraído en Ola 6 (2026-07-23).
 *
 * Controles de la pestaña Foto del modal unificado de edición por slot
 * (`StudioSlotEditModal`): filtros pre-armados (Vivid / Vintage / Polaroid /
 * Pastel / B&N) + "Sin filtro", rotar 90°, centrar/reset y cruceta de
 * desplazamiento (equivalente de teclado a los gestos).
 *
 * Ola 9 (Lucy 2026-07-24) — slider de zoom ELIMINADO de TODA la UI:
 *   - Desktop: zoom con la RUEDA del mouse sobre la foto (slot o preview del modal).
 *   - Táctil: zoom con PELLIZCO sobre la foto (preview del modal; la grilla no
 *     captura gestos inline para no bloquear el scroll de la página).
 *   - Doble click/tap o el botón "Centrar" resetean el encuadre.
 *   El antiguo `StudioPhotoAdjustModal` standalone (huérfano desde Ola 6) se
 *   retiró con este cambio.
 */

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
import { FILTER_ORDER } from "./lib/photo-filters";
import type { PhotoFilterPreset } from "./types";
import { useStudioTexts } from "./studio-texts-provider";

export type StudioPhotoAdjustFormProps = {
  photoUrl: string;
  currentFilter: PhotoFilterPreset | null;
  currentTransform: { offsetX: number; offsetY: number; scale: number; rotation?: number } | null;
  onApplyFilter: (filter: PhotoFilterPreset | null) => void;
  onResetTransform: () => void;
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
  onNudge,
  onRotate,
  allowFilters = true,
}: StudioPhotoAdjustFormProps) {
  // #18 — paso de desplazamiento por pulsación (px del stage).
  const NUDGE = 12;
  const texts = useStudioTexts();
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

      {/* #18 — encuadre accesible: los gestos (rueda/pellizco/arrastre) actúan
        directamente sobre la foto; la cruceta es el equivalente de teclado para
        moverla con precisión. Aplica también a calendarios (el encuadre sí se propaga). */}
      <div className="border-brand-purple/10 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-lg border p-3">
        <div className="flex flex-col items-center">
          <span className="text-brand-purple-dark mb-1 text-xs font-semibold">
            {texts.texto.ajustarMover}
          </span>
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
              previewUrl={photoUrl}
              cssFilter="none"
              label={texts.texto.filtroSinLabel}
              description={texts.texto.filtroSinDesc}
              onClick={() => onApplyFilter(null)}
            />

            {FILTER_ORDER.map((preset) => (
              <FilterCard
                key={preset}
                isSelected={currentFilter === preset}
                previewUrl={photoUrl}
                cssFilter={CSS_FILTER_BY_PRESET[preset]}
                label={filterLabels[preset]}
                description={filterDescriptions[preset]}
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

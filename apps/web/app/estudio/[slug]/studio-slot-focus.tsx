"use client";

/*
 * StudioSlotFocus — FB4 (feedback Lucy): editor de foto a PANTALLA COMPLETA para móvil/táctil.
 *
 * Problema: en la grilla, el slot Konva hace preventDefault en touchmove (drag/pinch) → atrapa el
 * scroll vertical de la página (el dedo casi no puede desplazar). Decisión de Lucy: en táctil, la
 * grilla NO manipula la foto (tocar = abrir); el pan/zoom vive AQUÍ, en un editor a pantalla completa
 * con su propio slot interactivo. Así el dedo sobre la grilla vuelve a hacer scroll normal.
 *
 * Monta UN StudioSlot grande para el slot elegido, con onPhotoTransformChange conectado al store, +
 * los mismos controles de filtro/centrar del panel anterior. Solo se usa en táctil (en desktop el
 * inline drag/rueda de la grilla sigue igual).
 */

import { useStore } from "zustand";
import type { StoreApi } from "zustand";
import { RotateCcw, RotateCw, Check } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StudioSlot } from "./studio-slot";
import { FILTER_LABELS, FILTER_ORDER } from "./lib/photo-filters";
import type { StudioStoreState } from "./lib/store";
import type { CanvasDataV1 } from "./types";
import type { PhotoFilterPreset } from "./types";

const CSS_FILTER_BY_PRESET: Record<PhotoFilterPreset, string> = {
  vivid: "contrast(1.15) saturate(1.3) brightness(1.05)",
  vintage: "sepia(0.3) contrast(0.95) saturate(0.7) brightness(1.05)",
  polaroid: "sepia(0.15) contrast(1.05) saturate(0.9) brightness(1.08)",
  pastel: "contrast(0.9) saturate(0.8) brightness(1.1)",
  bw: "grayscale(1) contrast(1.1)",
};

export function StudioSlotFocus({
  store,
  slotIndex,
  shape,
  finish,
  cornerRadiusPx,
  sizeCm,
  allowFilters = true,
  allowRotate = true,
  allowText = false,
  frameFullBleed = false,
  onClose,
}: {
  store: StoreApi<StudioStoreState>;
  slotIndex: number | null;
  shape?: "rectangle" | "circle" | "heart" | "custom";
  finish?: "matte" | "glossy" | "soft-touch";
  cornerRadiusPx?: number;
  sizeCm?: string;
  allowFilters?: boolean;
  /** Ola 3c — muestra el botón Rotar 90° (enderezar foto vs cara/ventana). Se apaga
   *  en calendarios: el compositor de página no replica la rotación (WYSIWYG). */
  allowRotate?: boolean;
  /** Ola 3 — false oculta las capas de texto también en el editor a pantalla
   *  completa (WYSIWYG con la grilla y con producción). Default false. */
  allowText?: boolean;
  /** Ola 3b — tarjeta full-bleed del color del marco (WYSIWYG con la grilla). */
  frameFullBleed?: boolean;
  onClose: () => void;
}) {
  // Selector del slot: devuelve la referencia del objeto (estable salvo que cambie su transform) →
  // sin loop de re-render (memoria feedback_react_atomic_selectors).
  const slot = useStore(store, (s) =>
    slotIndex !== null
      ? (s.canvasData?.slots?.find((sl) => sl.slotIndex === slotIndex) ?? null)
      : null,
  );
  const unitTemplate = useStore(store, (s) => s.canvasData?.unitTemplate ?? null);
  const totalSlots = useStore(store, (s) => s.canvasData?.slotCount ?? 0);
  // Ola 2A — el marco elegido también se ve en el editor a pantalla completa (WYSIWYG).
  const borderColor = useStore(store, (s) => s.canvasData?.borderColor ?? null);
  const setSlotPhotoTransform = useStore(store, (s) => s.setSlotPhotoTransform);
  const setSlotFilter = useStore(store, (s) => s.setSlotFilter);

  const open = slotIndex !== null && !!slot?.assetUrl && !!unitTemplate;
  if (!open || !slot || !unitTemplate) return null;
  const currentFilter = slot.filter ?? null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex h-[100dvh] max-h-none w-screen max-w-none flex-col gap-0 rounded-none border-0 p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl"
        showCloseButton={false}
      >
        <div className="border-brand-purple/10 flex items-center justify-between border-b px-4 py-3">
          <div>
            <DialogTitle className="text-brand-purple-dark text-base font-bold">
              Ajustar foto {slotIndex !== null ? slotIndex + 1 : ""}
            </DialogTitle>
            <DialogDescription className="text-brand-muted text-xs">
              Arrastra para mover · pellizca con 2 dedos para acercar
            </DialogDescription>
          </div>
          <Button
            type="button"
            onClick={onClose}
            className="bg-brand-purple hover:bg-brand-purple-dark gap-1.5 rounded-full text-white"
            size="sm"
          >
            <Check className="h-4 w-4" />
            Listo
          </Button>
        </div>

        {/* El slot grande, interactivo (pan/zoom). Centrado y con margen para que el gesto no toque
            los bordes del diálogo. */}
        <div className="bg-brand-cream/40 flex flex-1 items-center justify-center overflow-hidden p-4">
          <StudioSlot
            slotState={slot}
            unitTemplate={unitTemplate as CanvasDataV1}
            displaySize={320}
            isSelected
            totalSlots={totalSlots}
            sizeCm={sizeCm}
            shape={shape}
            finish={finish}
            cornerRadiusPx={cornerRadiusPx}
            borderColor={borderColor}
            frameFullBleed={frameFullBleed}
            allowText={allowText}
            onClick={() => {}}
            onClear={() => {}}
            onPhotoTransformChange={(transform) =>
              slotIndex !== null && setSlotPhotoTransform(slotIndex, transform)
            }
            onCenterPhoto={() => slotIndex !== null && setSlotPhotoTransform(slotIndex, null)}
            onAssetDrop={() => {}}
            onKeyboardNav={() => {}}
          />
        </div>

        <div className="border-brand-purple/10 space-y-3 border-t px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => slotIndex !== null && setSlotPhotoTransform(slotIndex, null)}
              className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/5 gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Centrar y resetear zoom
            </Button>
            {/* Ola 3c — Rotar 90°: endereza fotos cuya orientación no calza la
                ventana (foto apaisada en cara vertical, retrato en separador 6×2). */}
            {allowRotate && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Rotar la foto 90 grados"
                onClick={() =>
                  slotIndex !== null &&
                  setSlotPhotoTransform(slotIndex, {
                    rotation: ((slot.photoTransform?.rotation ?? 0) + 90) % 360,
                  })
                }
                className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/5 gap-1.5"
              >
                <RotateCw className="h-3.5 w-3.5" />
                Rotar
              </Button>
            )}
          </div>

          {allowFilters && slot.assetUrl && (
            <div>
              <p className="text-brand-purple-dark mb-2 text-sm font-semibold">Filtros</p>
              <div className="grid grid-cols-3 gap-2">
                <FilterChip
                  active={currentFilter === null}
                  photoUrl={slot.assetUrl}
                  css="none"
                  label="Sin filtro"
                  onClick={() => slotIndex !== null && setSlotFilter(slotIndex, null)}
                />
                {FILTER_ORDER.map((preset) => (
                  <FilterChip
                    key={preset}
                    active={currentFilter === preset}
                    photoUrl={slot.assetUrl!}
                    css={CSS_FILTER_BY_PRESET[preset]}
                    label={FILTER_LABELS[preset]}
                    onClick={() => slotIndex !== null && setSlotFilter(slotIndex, preset)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FilterChip({
  active,
  photoUrl,
  css,
  label,
  onClick,
}: {
  active: boolean;
  photoUrl: string;
  css: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-center gap-1 rounded-xl border-2 p-1.5 transition ${
        active
          ? "border-brand-purple bg-brand-purple/5"
          : "border-brand-purple/15 hover:border-brand-purple/40"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- preview del filtro (dataURL/bucket) */}
      <img
        src={photoUrl}
        alt=""
        aria-hidden
        className="h-12 w-full rounded-lg object-cover"
        style={{ filter: css }}
      />
      <span className="text-brand-purple-dark text-[11px] font-semibold">{label}</span>
    </button>
  );
}

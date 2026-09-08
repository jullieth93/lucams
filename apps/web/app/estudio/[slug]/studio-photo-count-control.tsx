"use client";

/*
 * StudioPhotoCountControl — Lucy 2026-09-05: "las fotos se eligen en el Estudio".
 *
 * Stepper "¿Cuántas fotos lleva tu imán?" para packs de fotoimanes (PHOTO_PACK).
 * Vive junto a la toolbar del Estudio (StudioToolbar lo monta como fila propia
 * bajo el header). Al cambiar N reconstruye el canvas preservando las fotos ya
 * subidas por índice (store.setPhotoSlotsPerUnit) y persiste photoSlots/sizeCm
 * en el canvasData → el carrito resuelve la variante server-side desde ahí.
 *
 * max = mayor photoSlots del catálogo para el producto+tamaño elegidos (prop
 * del server). Cuando min === max (ej. tiras magnéticas: el tamaño fija las
 * fotos) el stepper queda fijo y el hint lo explica en vez de insinuar una
 * elección que no existe.
 */

import { Minus, Plus } from "lucide-react";
import type { StoreApi } from "zustand";
import { useStore } from "zustand";
import type { StudioStoreState } from "./lib/store";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText } from "./studio-texts";

export type StudioPhotoCountControlProps = {
  store: StoreApi<StudioStoreState>;
  /** Mínimo de fotos del tamaño elegido (1 en packs libres). */
  min: number;
  /** Máximo de fotos del tamaño elegido (mayor photoSlots del catálogo para ese tamaño). */
  max: number;
  /** Caras de diseño por unidad física (separadores: 2) — deriva N de slotCount en diseños legacy. */
  facesPerUnit: number;
  /** Tamaño físico elegido en la PDP — persiste en el canvasData para el carrito. */
  sizeCm?: string;
};

export function StudioPhotoCountControl({
  store,
  min,
  max,
  facesPerUnit,
  sizeCm,
}: StudioPhotoCountControlProps) {
  const texts = useStudioTexts();
  // N vivo del canvasData (primitivo → comparación Object.is sin re-render extra).
  // Fallback para diseños recuperados sin el campo (legacy): deriva de slotCount.
  const photoSlots = useStore(store, (s) => {
    const cd = s.canvasData;
    if (!cd) return min;
    return cd.photoSlots ?? Math.ceil(cd.slotCount / facesPerUnit);
  });

  const clampedMin = Math.max(1, min);
  const clampedMax = Math.max(clampedMin, max);
  const value = Math.min(clampedMax, Math.max(clampedMin, photoSlots));
  const canDecrease = value > clampedMin;
  const canIncrease = value < clampedMax;
  const fixed = clampedMin === clampedMax;

  const step = (dir: 1 | -1) => {
    const next = value + dir;
    if (next < clampedMin || next > clampedMax) return;
    store.getState().setPhotoSlotsPerUnit(next, { facesPerUnit, max: clampedMax, sizeCm });
  };

  return (
    <div className="border-brand-purple/10 bg-brand-cream/50 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t px-4 py-2">
      <span className="text-brand-purple-dark text-sm font-bold">
        {texts.lienzo.photoCountLabel}
      </span>
      <div
        role="group"
        aria-label={texts.lienzo.photoCountGroupAria}
        className="ring-brand-purple/15 inline-flex items-center rounded-lg bg-white ring-1"
      >
        <button
          type="button"
          aria-label={texts.lienzo.photoCountMinusAria}
          disabled={!canDecrease}
          onClick={() => step(-1)}
          className="text-brand-purple-dark hover:bg-brand-purple/5 focus:ring-brand-turquoise disabled:text-brand-muted flex h-9 w-9 cursor-pointer items-center justify-center rounded-l-lg transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <span
          aria-live="polite"
          className="text-brand-purple-dark min-w-14 text-center text-sm font-bold tabular-nums"
        >
          {value} {value === 1 ? texts.lienzo.photoCountOne : texts.lienzo.photoCountMany}
        </span>
        <button
          type="button"
          aria-label={texts.lienzo.photoCountPlusAria}
          disabled={!canIncrease}
          onClick={() => step(1)}
          className="text-brand-purple-dark hover:bg-brand-purple/5 focus:ring-brand-turquoise disabled:text-brand-muted flex h-9 w-9 cursor-pointer items-center justify-center rounded-r-lg transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <span className="text-brand-purple-dark/70 text-xs font-medium">
        {fixed
          ? fillStudioText(texts.lienzo.photoCountFixedHint, { n: value })
          : texts.lienzo.photoCountHint}
      </span>
    </div>
  );
}

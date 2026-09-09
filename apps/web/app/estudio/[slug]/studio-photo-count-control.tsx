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

import { Loader2, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
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
  /**
   * "¿Con imán?" (Lucy 2026-09-08): badge READ-ONLY con la elección de la PDP
   * (ya persistida en el canvasData). No es un control — cambiarla implica otra
   * variante (precio/producto físico distinto) y eso se hace en la PDP; acá solo
   * se muestra para que el cliente vea qué va a recibir. undefined = no mostrar.
   */
  magnet?: boolean;
};

export function StudioPhotoCountControl({
  store,
  min,
  max,
  facesPerUnit,
  sizeCm,
  magnet,
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

  // Feedback de procesamiento (Lucy 2026-09-09, mismo patrón del botón «Vista
  // previa» del toolbar): cambiar N reconstruye los slots y eso dispara un
  // re-render SÍNCRONO del lienzo Konva — sin aviso, el click parecía no hacer
  // nada mientras el stage se redibuja. Primero se pinta el estado ocupado
  // (spinner + stepper bloqueado) y recién en el próximo frame se aplica el
  // cambio en el store.
  const [pendingDir, setPendingDir] = useState<1 | -1 | null>(null);

  const step = (dir: 1 | -1) => {
    if (pendingDir !== null) return;
    const next = value + dir;
    if (next < clampedMin || next > clampedMax) return;
    setPendingDir(dir);
  };

  useEffect(() => {
    if (pendingDir === null) return;
    const raf = requestAnimationFrame(() => {
      store
        .getState()
        .setPhotoSlotsPerUnit(value + pendingDir, { facesPerUnit, max: clampedMax, sizeCm });
      setPendingDir(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingDir, store, value, facesPerUnit, clampedMax, sizeCm]);

  const busy = pendingDir !== null;

  return (
    <div className="border-brand-purple/10 bg-brand-cream/50 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t px-4 py-2">
      <span className="text-brand-purple-dark text-sm font-bold">
        {texts.lienzo.photoCountLabel}
      </span>
      <div
        role="group"
        aria-label={texts.lienzo.photoCountGroupAria}
        aria-busy={busy}
        className="ring-brand-purple/15 inline-flex items-center rounded-lg bg-white ring-1"
      >
        <button
          type="button"
          aria-label={texts.lienzo.photoCountMinusAria}
          disabled={!canDecrease || busy}
          onClick={() => step(-1)}
          className="text-brand-purple-dark hover:bg-brand-purple/5 focus:ring-brand-turquoise disabled:text-brand-muted flex h-9 w-9 cursor-pointer items-center justify-center rounded-l-lg transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <span
          aria-live="polite"
          className="text-brand-purple-dark flex min-w-14 items-center justify-center text-center text-sm font-bold tabular-nums"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            `${value} ${value === 1 ? texts.lienzo.photoCountOne : texts.lienzo.photoCountMany}`
          )}
        </span>
        <button
          type="button"
          aria-label={texts.lienzo.photoCountPlusAria}
          disabled={!canIncrease || busy}
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
      {/* "¿Con imán?" (2026-09-08) — badge read-only de la elección hecha en la
          PDP. No es control: cambiarla es cambiar de variante (otro precio y otro
          físico) y eso pasa en la ficha del producto, no en el lienzo. */}
      {typeof magnet === "boolean" && (
        <span className="ring-brand-purple/20 text-brand-purple-dark inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold ring-1">
          {magnet ? texts.lienzo.magnetCon : texts.lienzo.magnetSin}
          <span className="text-brand-muted font-medium">· {texts.lienzo.magnetHint}</span>
        </span>
      )}
    </div>
  );
}

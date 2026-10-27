"use client";

/*
 * StudioUnitCountControl — Ola 28 (owner 2026-09-11, 1.3.A).
 *
 * Stepper "Unidades" para productos de COMPOSICIÓN fija en el Estudio: la
 * composición (fotos por tira, meses del calendario) se elige en la PDP o la
 * fija el producto, y no se repite acá; lo que el cliente ajusta en el lienzo
 * es CUÁNTAS unidades diseñar. A3 (2026-09-15): el control es UNIVERSAL — la
 * toolbar lo monta para TODO producto que no usa el stepper de fotos
 * (StudioPhotoCountControl sigue para los packs de imán suelto, donde el N de
 * fotos ES el nº de unidades). Cuando el producto no tiene unidades multi-slot
 * que contar (unitSlots ≤ caras — imán suelto de 1 foto), el control se oculta
 * solo: no hay N que elegir (el store.setUnitCount sería no-op de todos modos).
 *
 * Al cambiar N se redeclara el modelo multi-unidad (store.setUnitCount):
 * slotCount = unitSlots × N, secciones "Tira 1 de N"… El precio ×N lo deriva
 * el SERVIDOR del canvas guardado — este control es solo vista/edición.
 */

import { Loader2, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import type { StoreApi } from "zustand";
import { useStore } from "zustand";
import { maxUnitsForProduct } from "@/features/personalization/design-units";
import type { StudioStoreState } from "./lib/store";
import { useStudioTexts } from "./studio-texts-provider";

export type StudioUnitCountControlProps = {
  store: StoreApi<StudioStoreState>;
  /** Caras de diseño por unidad física (tiras/calendario: 1). Default 1. */
  facesPerUnit?: number;
  /** "¿Con imán?" — badge READ-ONLY de la elección de la PDP (mismo criterio
   *  que StudioPhotoCountControl: no es un control, se muestra para que el
   *  cliente vea qué va a recibir). undefined = no mostrar. */
  magnet?: boolean;
  /** Hint junto al stepper. Default: el texto CMS (pensado para tiras). La
   *  toolbar pasa uno genérico para el resto de productos (A3). */
  hint?: string;
  /**
   * Ola 2 (2026-10-26) — desglose de la variante como chip EN LA FILA (solo
   *  <md; en desktop va en el hero). Cuando llega, reemplaza al badge
   *  «Con/Sin imán» (mismo dato, sin duplicar renglones).
   */
  variantLabel?: string;
  /**
   * Ola 2 (2026-10-26) — chrome móvil extra de la fila (progreso X/N +
   *  auto-save compacto) inyectado por la toolbar; solo <md.
   */
  mobileExtras?: React.ReactNode;
};

export function StudioUnitCountControl({
  store,
  facesPerUnit = 1,
  magnet,
  hint,
  variantLabel,
  mobileExtras,
}: StudioUnitCountControlProps) {
  const texts = useStudioTexts();
  // N vivo de unidades + slots por unidad del canvasData. Selectores ATÓMICOS
  // (primitivos → Object.is): un selector de objeto re-renderiza en bucle.
  const unitCount = useStore(store, (s) => s.canvasData?.unitCount ?? 1);
  const unitSlots = useStore(store, (s) => s.canvasData?.unitSlots ?? facesPerUnit);

  // El tope lo da el cap de 50 slots del schema (tira de 4 → 12, de 3 → 16;
  // calendario de 12 → 4).
  const clampedMax = Math.max(1, maxUnitsForProduct(unitSlots));
  const value = Math.min(clampedMax, Math.max(1, unitCount));
  const canDecrease = value > 1;
  const canIncrease = value < clampedMax;

  // Feedback de procesamiento (mismo patrón que StudioPhotoCountControl): el
  // cambio reconstruye los slots y dispara un re-render SÍNCRONO del Konva —
  // primero se pinta el estado ocupado y en el próximo frame se aplica.
  const [pendingDir, setPendingDir] = useState<1 | -1 | null>(null);

  const step = (dir: 1 | -1) => {
    if (pendingDir !== null) return;
    const next = value + dir;
    if (next < 1 || next > clampedMax) return;
    setPendingDir(dir);
  };

  useEffect(() => {
    if (pendingDir === null) return;
    const raf = requestAnimationFrame(() => {
      store.getState().setUnitCount(value + pendingDir, { facesPerUnit, max: clampedMax });
      setPendingDir(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingDir, store, value, facesPerUnit, clampedMax]);

  const busy = pendingDir !== null;

  // A3 — sin unidades multi-slot que contar (unitSlots ≤ caras: imán suelto de
  // 1 foto, o boot aún sin canvasData) el stepper no aplica: setUnitCount sería
  // no-op y mostrarlo prometería una elección que no existe.
  if (unitSlots <= facesPerUnit) return null;

  return (
    <div className="border-brand-purple/10 bg-brand-cream/50 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t px-4 py-2">
      <span className="text-brand-purple-dark text-sm font-bold">
        {texts.lienzo.unitsCountLabel}
      </span>
      <div
        role="group"
        aria-label={texts.lienzo.unitsCountGroupAria}
        aria-busy={busy}
        className="ring-brand-purple/15 inline-flex items-center rounded-lg bg-white ring-1"
      >
        <button
          type="button"
          aria-label={texts.lienzo.unitsCountMinusAria}
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
            `${value} ${value === 1 ? texts.lienzo.unitsCountOne : texts.lienzo.unitsCountMany}`
          )}
        </span>
        <button
          type="button"
          aria-label={texts.lienzo.unitsCountPlusAria}
          disabled={!canIncrease || busy}
          onClick={() => step(1)}
          className="text-brand-purple-dark hover:bg-brand-purple/5 focus:ring-brand-turquoise disabled:text-brand-muted flex h-9 w-9 cursor-pointer items-center justify-center rounded-r-lg transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {/* Ola 2 (2026-10-26) — el hint descriptivo se oculta en <sm (misma regla
          que el stepper de fotos, Ola 32): en 375px sumaba una línea de chrome
          antes del lienzo; el stepper conserva sus aria-labels. */}
      <span className="text-brand-purple-dark/70 hidden text-xs font-medium sm:inline">
        {hint ?? texts.lienzo.unitsCountHint}
      </span>
      {variantLabel ? (
        <span className="ring-brand-purple/20 text-brand-purple-dark inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-white px-3 py-1.5 text-xs font-bold ring-1 md:hidden">
          {variantLabel}
          <span className="text-brand-muted hidden font-medium sm:inline">
            · {texts.lienzo.magnetHint}
          </span>
        </span>
      ) : (
        typeof magnet === "boolean" && (
          <span className="ring-brand-purple/20 text-brand-purple-dark inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold ring-1">
            {magnet ? texts.lienzo.magnetCon : texts.lienzo.magnetSin}
            <span className="text-brand-muted hidden font-medium sm:inline">
              · {texts.lienzo.magnetHint}
            </span>
          </span>
        )
      )}
      {/* Ola 2 (2026-10-26) — progreso + auto-save compacto en la MISMA fila
          (solo <md). */}
      {mobileExtras && <div className="contents md:hidden">{mobileExtras}</div>}
    </div>
  );
}

"use client";

/*
 * StudioPhotoCountControl — Lucy 2026-09-05: "las fotos se eligen en el Estudio".
 *
 * Stepper "¿Cuántos separadores quieres?" (antes "¿Cuántas fotos lleva tu
 * imán?") para packs de fotoimanes y separadores (PHOTO_PACK sin composición
 * fija). El N que elige el cliente son UNIDADES del producto, no fotos/caras:
 * el sustantivo llega por prop `unitNoun` (el editor lo resuelve por producto
 * vía resolveSlotNoun — "separador/es", "imán/imanes", "ficha/s"…) y los textos
 * CMS son plantillas fillStudioText con {one}/{many}/{cuantos}/{uno}.
 *
 * Vive junto a la toolbar del Estudio (StudioToolbar lo monta como fila propia
 * bajo el header). Al cambiar N reconstruye el canvas preservando las fotos ya
 * subidas por índice (store.setPhotoSlotsPerUnit) y persiste photoSlots/sizeCm
 * en el canvasData → el carrito resuelve la variante server-side desde ahí.
 *
 * max = mayor photoSlots del catálogo para el producto+tamaño elegidos (prop
 * del server). Cuando min === max (ej. tiras magnéticas: el tamaño fija las
 * fotos) el stepper queda fijo y el hint lo explica en vez de insinuar una
 * elección que no existe.
 *
 * B3 (2026-09-15) — modo PACKS (fotoimanes unificados por formato): cuando el
 * catálogo del tamaño elegido son packs de 6 (min/max y el valor actual todos
 * múltiplos de 6 — fotoSlots 6/12/18/24), el stepper cuenta PACKS y salta de a
 * 6 lienzos (±1 pack = ±6 unidades), coherente con la PDP ("1 pack = 6
 * unidades"). Un diseño legacy recuperado (photoSlots 9/20) cae al conteo de
 * unidades de siempre — sus cantidades ya no existen como variante y el salto
 * de a 6 las dejaría inalcanzables.
 */

import { Loader2, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import type { StoreApi } from "zustand";
import { useStore } from "zustand";
import type { StudioStoreState } from "./lib/store";
import type { SlotNoun } from "./lib/slot-noun";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText } from "./studio-texts";

export type StudioPhotoCountControlProps = {
  store: StoreApi<StudioStoreState>;
  /** Mínimo de unidades del tamaño elegido (1 en packs libres). */
  min: number;
  /** Máximo de unidades del tamaño elegido (mayor photoSlots del catálogo para ese tamaño). */
  max: number;
  /** Caras de diseño por unidad física (separadores: 2) — deriva N de slotCount en diseños legacy. */
  facesPerUnit: number;
  /** Tamaño físico elegido en la PDP — persiste en el canvasData para el carrito. */
  sizeCm?: string;
  /**
   * Sustantivo de la UNIDAD que cuenta el stepper (2026-10-12 — el N son
   * unidades del producto, no fotos): lo resuelve el editor por productKind
   * (resolveSlotNoun) y lo pasa la toolbar — "¿Cuántos separadores quieres?",
   * "¿Cuántos imanes quieres?", "¿Cuántas fichas quieres?" (sin imán).
   * undefined = fallback a los sustantivos CMS (photoCountOne/Many, "foto/s",
   * femenino — comportamiento histórico).
   */
  unitNoun?: SlotNoun;
  /**
   * "¿Con imán?" (Lucy 2026-09-08): badge READ-ONLY con la elección de la PDP
   * (ya persistida en el canvasData). No es un control — cambiarla implica otra
   * variante (precio/producto físico distinto) y eso se hace en la PDP; acá solo
   * se muestra para que el cliente vea qué va a recibir. undefined = no mostrar.
   */
  magnet?: boolean;
  /**
   * Ola 2 (2026-10-26) — desglose de la variante efectiva ("Con imán · Español"…)
   * como chip EN LA FILA del stepper (solo <md; en desktop ya va en el hero del
   * header). Cuando llega, REEMPLAZA al badge «Con/Sin imán»: mismo dato, una
   * sola vez (antes se repetía en la fila móvil del header, ya eliminada).
   */
  variantLabel?: string;
  /**
   * Ola 2 (2026-10-26) — chrome móvil extra de la fila (progreso X/N + auto-save
   * compacto): la inyecta la toolbar para compartir UNA fila con wrap. Se
   * renderiza solo <md (el wrapper lo oculta en ≥md).
   */
  mobileExtras?: React.ReactNode;
};

export function StudioPhotoCountControl({
  store,
  min,
  max,
  facesPerUnit,
  sizeCm,
  unitNoun,
  magnet,
  variantLabel,
  mobileExtras,
}: StudioPhotoCountControlProps) {
  const texts = useStudioTexts();
  // Sustantivo de la unidad + concordancia de género para las plantillas CMS:
  // {cuantos} = Cuántos/Cuántas, {uno} = un/una, {one}/{many} = el sustantivo.
  // Sin prop (fallback CMS "foto/fotos", femenino) conserva el copy histórico;
  // con prop, `feminine` ausente = masculino (separador, imán, pack…).
  const nounFeminine = unitNoun ? (unitNoun.feminine ?? false) : true;
  const nounVars = {
    cuantos: nounFeminine ? "Cuántas" : "Cuántos",
    uno: nounFeminine ? "una" : "un",
    one: unitNoun?.one ?? texts.lienzo.photoCountOne,
    many: unitNoun?.many ?? texts.lienzo.photoCountMany,
  };
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
  // B3 — modo PACKS de 6: todo el rango y el valor actual son múltiplos de 6 →
  // el stepper cuenta packs y salta de a 6 lienzos. Diseños legacy (9/20) caen
  // al conteo de fotos (sus cantidades ya no son variantes alcanzables).
  const PACK_UNITS = 6;
  const packMode =
    clampedMin >= PACK_UNITS &&
    clampedMin % PACK_UNITS === 0 &&
    clampedMax % PACK_UNITS === 0 &&
    value % PACK_UNITS === 0;
  const stepSize = packMode ? PACK_UNITS : 1;
  const packCount = packMode ? value / PACK_UNITS : null;
  // Con todos los valores múltiplos de 6, value > min ⟺ value−6 ≥ min (ídem +):
  // las mismas comparaciones de siempre sirven en ambos modos.
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
    const next = value + dir * stepSize;
    if (next < clampedMin || next > clampedMax) return;
    setPendingDir(dir);
  };

  useEffect(() => {
    if (pendingDir === null) return;
    const raf = requestAnimationFrame(() => {
      store.getState().setPhotoSlotsPerUnit(value + pendingDir * stepSize, {
        facesPerUnit,
        max: clampedMax,
        sizeCm,
      });
      setPendingDir(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingDir, store, value, stepSize, facesPerUnit, clampedMax, sizeCm]);

  const busy = pendingDir !== null;

  return (
    <div className="border-brand-purple/10 bg-brand-cream/50 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t px-4 py-2">
      <span className="text-brand-purple-dark text-sm font-bold">
        {/* B3 — en modo packs el grupo es "Packs" (mismo lenguaje de la PDP). */}
        {packMode ? "Packs" : fillStudioText(texts.lienzo.photoCountLabel, nounVars)}
      </span>
      <div
        role="group"
        aria-label={
          packMode
            ? "Packs de 6 unidades"
            : fillStudioText(texts.lienzo.photoCountGroupAria, nounVars)
        }
        aria-busy={busy}
        className="ring-brand-purple/15 inline-flex items-center rounded-lg bg-white ring-1"
      >
        <button
          type="button"
          aria-label={
            packMode ? "Quitar un pack" : fillStudioText(texts.lienzo.photoCountMinusAria, nounVars)
          }
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
          ) : packCount != null ? (
            `${packCount} ${packCount === 1 ? "pack" : "packs"}`
          ) : (
            `${value} ${value === 1 ? nounVars.one : nounVars.many}`
          )}
        </span>
        <button
          type="button"
          aria-label={
            packMode ? "Agregar un pack" : fillStudioText(texts.lienzo.photoCountPlusAria, nounVars)
          }
          disabled={!canIncrease || busy}
          onClick={() => step(1)}
          className="text-brand-purple-dark hover:bg-brand-purple/5 focus:ring-brand-turquoise disabled:text-brand-muted flex h-9 w-9 cursor-pointer items-center justify-center rounded-r-lg transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {/* Ola 32 — el hint descriptivo se oculta en <sm: a 375px sumaba ~2 líneas
          de chrome antes del lienzo (la info sigue disponible ≥sm y el stepper
          conserva sus aria-labels). */}
      <span className="text-brand-purple-dark/70 hidden text-xs font-medium sm:inline">
        {packCount != null
          ? // B3 — desglose coherente con la PDP + el hint de conservación (CMS).
            `${packCount} ${packCount === 1 ? "pack" : "packs"} = ${value} unidades · ${texts.lienzo.photoCountHint}`
          : fixed
            ? fillStudioText(texts.lienzo.photoCountFixedHint, { n: value, ...nounVars })
            : texts.lienzo.photoCountHint}
      </span>
      {/* "¿Con imán?" (2026-09-08) — badge read-only de la elección hecha en la
          PDP. No es control: cambiarla es cambiar de variante (otro precio y otro
          físico) y eso pasa en la ficha del producto, no en el lienzo.
          Ola 2 (2026-10-26) — si la toolbar manda el desglose COMPLETO de la
          variante, el chip lo reemplaza (mismo dato, sin duplicar renglones) y
          solo se muestra en <md (en desktop ya va en el hero del header). */}
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
          (solo <md; el wrapper contents lo oculta en ≥md). */}
      {mobileExtras && <div className="contents md:hidden">{mobileExtras}</div>}
    </div>
  );
}

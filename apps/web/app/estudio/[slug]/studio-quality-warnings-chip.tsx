"use client";

/*
 * StudioQualityWarningsChip — Paquete C (2026-10-02).
 *
 * Resumen de avisos de calidad junto al botón «Vista previa»: un chip visible
 * ("N por revisar", ámbar o rojo según la peor severidad) que abre un popover
 * con la lista de fotos del diseño que tienen aviso (thumbnail + mensaje
 * específico). Solo cuenta fotos ASIGNADAS a slots (collectQualityWarnings) —
 * una foto con aviso que el cliente subió pero no usó no se anuncia.
 *
 * No se renderiza cuando no hay avisos (el header queda idéntico al actual).
 * La aceptación explícita vive en la Vista Previa (checkbox obligatorio);
 * este chip es solo el recordatorio visible para el cliente poco curioso.
 */

import { useMemo, useState } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import type { StoreApi } from "zustand";
import { useStore } from "zustand";
import { AlertTriangle, X } from "lucide-react";
import { collectQualityWarnings, qualityWarningsKey } from "./lib/quality-warnings";
import type { StudioStoreState } from "./lib/store";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText } from "./studio-texts";

export function StudioQualityWarningsChip({
  store,
  popoverSide = "bottom",
}: {
  store: StoreApi<StudioStoreState>;
  /** El chip del header abre hacia abajo; el de la fila móvil también. */
  popoverSide?: "top" | "bottom";
}) {
  const texts = useStudioTexts();
  const [open, setOpen] = useState(false);
  // Suscripción ATÓMICA (string primitivo, patrón del popover de faltantes de
  // «Vista previa»): sin re-renders en cascada por referencias nuevas.
  const key = useStore(store, (s) => qualityWarningsKey(s.assets, s.canvasData));
  const warnings = useMemo(
    () => collectQualityWarnings(store.getState().assets, store.getState().canvasData),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` resume el contenido
    [store, key],
  );

  if (warnings.length === 0) return null;

  const hasStrong = warnings.some((w) => w.level === "warning-strong" || w.level === "error");
  const chipClasses = hasStrong
    ? "bg-red-50 text-red-700 ring-red-300 hover:bg-red-100"
    : "bg-amber-50 text-amber-800 ring-amber-300 hover:bg-amber-100";

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={fillStudioText(texts.lienzo.calidadChipAria, { n: warnings.length })}
          className={[
            "focus:ring-brand-purple inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-bold ring-1 transition-colors focus:ring-2 focus:ring-offset-1 focus:outline-none",
            chipClasses,
          ].join(" ")}
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          <span>{fillStudioText(texts.lienzo.calidadChipTexto, { n: warnings.length })}</span>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={popoverSide}
          align="end"
          sideOffset={8}
          collisionPadding={12}
          aria-label={texts.lienzo.calidadPopoverTitulo}
          className="ring-brand-purple/15 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-3 shadow-xl ring-1"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-brand-purple-dark text-xs font-bold">
              {texts.lienzo.calidadPopoverTitulo}
            </p>
            <PopoverPrimitive.Close
              aria-label={texts.comun.cerrar}
              className="text-brand-muted hover:text-brand-purple-dark focus:ring-brand-purple inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors focus:ring-2 focus:outline-none"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </PopoverPrimitive.Close>
          </div>
          <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto">
            {warnings.map((w) => (
              <li key={w.assetId} className="flex items-start gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed URL temporal del cliente */}
                <img
                  src={w.signedUrl}
                  alt=""
                  className={[
                    "h-10 w-10 shrink-0 rounded-md object-cover ring-1",
                    w.level === "warning-soft" ? "ring-amber-300" : "ring-red-300",
                  ].join(" ")}
                />
                <div className="min-w-0 flex-1">
                  <span
                    className={[
                      "mb-0.5 inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-bold",
                      w.level === "warning-soft"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-100 text-red-700",
                    ].join(" ")}
                  >
                    ⚠️ {texts.fotos.badgeRevisar}
                  </span>
                  <p className="text-brand-purple-dark text-[11px] leading-snug">{w.message}</p>
                  {w.recommendation && (
                    <p className="text-brand-muted mt-0.5 text-[11px] leading-snug">
                      {w.recommendation}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <PopoverPrimitive.Arrow className="fill-white" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

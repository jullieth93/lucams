"use client";

/*
 * PredesignedViewDialog (2026-10-26) — preview en GRANDE de un diseño
 * prediseñado, la ÚNICA vía de verlo antes de aplicar en táctil (el HoverCard
 * del sidebar es hover-only y en puntero coarse ni siquiera se monta — ver
 * predesigned-hover-preview.tsx). En desktop coexiste con el hover.
 *
 * Lo abre el botón «Ver» (ojo) de cada tarjeta de prediseñado — mismo
 * componente en la grilla del sidebar y en la del picker modal
 * (studio-asset-picker-modal): imagen a alta resolución (imageUrl) + nombre +
 * CTA «Usar este diseño» (misma acción que el click de la tarjeta) + cerrar.
 *
 * Radix Dialog (@/components/ui/dialog): portal a body, overlay, Esc y foco
 * manejados por radix — no reusa useDialogA11y porque radix ya lo cubre.
 */

import { Eye } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { PredesignedItem } from "./studio-asset-picker-modal";
import { useStudioTexts } from "./studio-texts-provider";

export function PredesignedViewDialog({
  item,
  onUse,
  onClose,
}: {
  /** Diseño en preview; null = dialog cerrado. */
  item: PredesignedItem | null;
  /** «Usar este diseño»: misma acción que el click de la tarjeta. */
  onUse: (item: PredesignedItem) => void;
  onClose: () => void;
}) {
  const texts = useStudioTexts();
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90vh] w-[92vw] max-w-sm overflow-y-auto"
        aria-describedby={item ? "predesigned-view-desc" : undefined}
      >
        <DialogTitle className="text-brand-purple-dark font-display text-base">
          {item?.name}
        </DialogTitle>
        <DialogDescription id="predesigned-view-desc" className="sr-only">
          {item?.name}
        </DialogDescription>
        {item && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={item.imageUrl}
            alt={item.name}
            // object-contain + fondo crema: el diseño se ve COMPLETO (misma
            // regla del hover preview — los marcapáginas alargados con
            // object-cover quedan ilegibles).
            className="bg-brand-cream/40 max-h-[55vh] w-full rounded-md object-contain"
            // 3.10 — disuasión anti-copia, igual que la miniatura de la tarjeta.
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
          />
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              if (item) onUse(item);
            }}
            // h-11: target táctil ≥44px (misma regla de los CTAs del estudio).
            className="bg-brand-purple hover:bg-brand-purple-dark focus:ring-brand-turquoise flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-white transition-colors focus:ring-2 focus:ring-offset-1 focus:outline-none"
          >
            <Eye className="h-4 w-4" aria-hidden />
            {texts.plantillas.verDisenoUsar}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="border-brand-purple/40 text-brand-purple-dark hover:bg-brand-purple/10 focus:ring-brand-turquoise flex h-11 w-full items-center justify-center rounded-md border text-sm font-semibold transition-colors focus:ring-2 focus:outline-none"
          >
            {texts.comun.cerrar}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

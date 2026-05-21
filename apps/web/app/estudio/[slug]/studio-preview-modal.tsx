"use client";

/*
 * StudioPreviewModal — Vista previa final pre-carrito (Lucy 2026-05-21).
 *
 * Después de click "¡Listo!" en el Estudio, mostramos al cliente cómo va
 * a verse su pedido (grid de los N imanes compositado) ANTES de subir a
 * Storage + agregar al carrito.
 *
 * Beneficio UX:
 *   - Cliente confirma visualmente sin commit.
 *   - Si quiere ajustar, "Volver a editar" cierra modal y el editor queda
 *     intacto (cero pérdida de estado).
 *   - Si está conforme, "Sí, agregar al carrito" dispara el upload real.
 *
 * NO bloquea con backdrop modal — el editor sigue visible debajo para
 * que el cliente compare lo que está viendo arriba con lo que queda
 * por debajo.
 */

import Image from "next/image";
import { Loader2, Pencil, Sparkles, ShoppingCart } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCOP } from "@/lib/format";

type StudioPreviewModalProps = {
  isOpen: boolean;
  previewUrl: string | null; // dataURL del grid compositado (client-side)
  productName: string;
  slotCount: number;
  unitPrice: number | null; // precio en centavos COP de la variant elegida
  isFinalizing: boolean;
  errorMessage: string | null;
  onEdit: () => void;
  onConfirm: () => void;
};

export function StudioPreviewModal({
  isOpen,
  previewUrl,
  productName,
  slotCount,
  unitPrice,
  isFinalizing,
  errorMessage,
  onEdit,
  onConfirm,
}: StudioPreviewModalProps) {
  if (!previewUrl) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isFinalizing && onEdit()}>
      <DialogContent
        className="max-w-2xl"
        // Si está finalizando, no permitimos cerrar (race condition con upload)
        onInteractOutside={(e) => {
          if (isFinalizing) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isFinalizing) e.preventDefault();
        }}
        showCloseButton={!isFinalizing}
      >
        <DialogTitle className="text-brand-purple-dark font-display flex items-center gap-2 text-xl font-bold">
          <Sparkles className="text-brand-pink h-5 w-5" />
          Así se verá tu pedido
        </DialogTitle>
        <DialogDescription className="text-brand-purple-dark/70 text-sm">
          Esta es la vista previa de los {slotCount} imanes que vas a recibir. Revisalos antes de
          continuar.
        </DialogDescription>

        {/* Preview compositado del grid */}
        <div className="border-brand-purple/15 from-brand-cream relative mt-3 overflow-hidden rounded-xl border bg-gradient-to-br to-white p-4">
          <div className="relative mx-auto aspect-square max-w-md">
            <Image
              src={previewUrl}
              alt={`Vista previa de ${slotCount} imanes`}
              fill
              sizes="(max-width: 640px) 90vw, 480px"
              className="object-contain drop-shadow-lg"
              unoptimized
            />
          </div>
        </div>

        {/* Resumen */}
        <div className="border-brand-purple/10 bg-brand-purple/[0.03] rounded-lg border p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-brand-purple-dark font-semibold">{productName}</p>
              <p className="text-brand-purple-dark/65 text-xs">
                {slotCount} {slotCount === 1 ? "imán personalizado" : "imanes personalizados"}
              </p>
            </div>
            {unitPrice !== null && (
              <div className="text-right">
                <p className="text-brand-purple-dark font-display text-lg font-bold tabular-nums">
                  {formatCOP(unitPrice)}
                </p>
              </div>
            )}
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Acciones */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onEdit}
            disabled={isFinalizing}
            className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/5"
          >
            <Pencil className="mr-1.5 h-4 w-4" />
            Volver a editar
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={onConfirm}
            disabled={isFinalizing}
            className="bg-gradient-brand text-white hover:brightness-110"
          >
            {isFinalizing ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : (
              <>
                <ShoppingCart className="mr-1.5 h-4 w-4" />
                Sí, agregar al carrito
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

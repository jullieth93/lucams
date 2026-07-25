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
  /** Tamaño físico de cada imán (ej. "5×5 cm"). Lucy 2026-05-21 — mostrarlo
   *  para que el cliente sepa qué tamaño real va a recibir. */
  sizeCm?: string;
  unitPrice: number | null; // precio en centavos COP de la variant elegida
  isFinalizing: boolean;
  errorMessage: string | null;
  /** #3 — tipo de producto: el calendario se describe en "páginas", no "imanes".
   *  Ola 3 — "bookmarks": separadores de libros (tiras 2 caras), concordancia propia.
   *  "tiles": fichas SIN imán. Los sets de letras y el nombre tienen variantes "Con imán" y
   *  "Sin imán"; llamarle "imán" a la que no lo lleva es una afirmación falsa sobre el producto
   *  físico, hecha justo en la pantalla de confirmación (revisión 2026-07-25, Ley 1480 art. 23). */
  productKind?: "magnets" | "calendar" | "bookmarks" | "tiles";
  /** Año del calendario (solo cuando productKind==="calendar"). */
  calendarYear?: number;
  onEdit: () => void;
  onConfirm: () => void;
};

export function StudioPreviewModal({
  isOpen,
  previewUrl,
  productName,
  slotCount,
  sizeCm,
  unitPrice,
  isFinalizing,
  errorMessage,
  productKind = "magnets",
  calendarYear,
  onEdit,
  onConfirm,
}: StudioPreviewModalProps) {
  if (!previewUrl) return null;

  // #3 — el calendario habla de "páginas" (concordancia femenina: "las"/"Revísalas"); los imanes,
  // de "imanes". Ola 3 — los separadores hablan de "separadores" (cada uno con sus 2 caras).
  const isCalendar = productKind === "calendar";
  const isBookmarks = productKind === "bookmarks";
  // Cómo nombrar la pieza: con imán es un "imán"; sin él, una "ficha".
  const pieza = productKind === "tiles" ? "ficha" : "imán";
  const piezas = productKind === "tiles" ? "fichas" : "imanes";

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
          {isCalendar
            ? "Así se verá tu calendario"
            : isBookmarks
              ? "Así se verán tus separadores"
              : "Así se verá tu pedido"}
        </DialogTitle>
        <DialogDescription className="text-brand-purple-dark/70 text-sm">
          {isCalendar ? (
            <>
              Esta es la vista previa de las {slotCount} páginas de tu calendario
              {calendarYear ? ` ${calendarYear}` : ""}.
              {sizeCm && (
                <>
                  {" "}
                  Cada página mide <strong>{sizeCm}</strong>.
                </>
              )}{" "}
              Revísalas antes de continuar.
            </>
          ) : isBookmarks ? (
            <>
              Esta es la vista previa de los {slotCount} separadores que vas a recibir — cada uno
              desplegado con sus 2 caras (así se imprime la tira).
              {sizeCm && (
                <>
                  {" "}
                  Cada separador mide <strong>{sizeCm}</strong> doblado.
                </>
              )}{" "}
              Revísalos antes de continuar.
            </>
          ) : (
            <>
              {slotCount === 1
                ? `Esta es la vista previa del ${pieza} que vas a recibir.`
                : `Esta es la vista previa de los ${slotCount} ${piezas} que vas a recibir.`}
              {sizeCm && (
                <>
                  {" "}
                  Cada {pieza} mide <strong>{sizeCm}</strong>.
                </>
              )}{" "}
              {slotCount === 1 ? "Revísalo" : "Revísalos"} antes de continuar.
            </>
          )}
        </DialogDescription>

        {/* Preview compositado del grid */}
        <div className="border-brand-purple/15 from-brand-cream relative mt-3 overflow-hidden rounded-xl border bg-gradient-to-br to-white p-4">
          <div className="relative mx-auto aspect-square max-w-md">
            <Image
              src={previewUrl}
              alt={
                isCalendar
                  ? `Vista previa de las ${slotCount} páginas de tu calendario${calendarYear ? ` ${calendarYear}` : ""}`
                  : isBookmarks
                    ? `Vista previa de ${slotCount} separadores desplegados con sus 2 caras`
                    : `Vista previa de ${slotCount} imanes`
              }
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
              <p className="text-brand-muted text-xs">
                {isCalendar
                  ? `Calendario personalizado · ${slotCount} páginas`
                  : isBookmarks
                    ? `${slotCount} ${slotCount === 1 ? "separador personalizado" : "separadores personalizados"} (2 caras c/u)`
                    : `${slotCount} ${slotCount === 1 ? `${pieza} personalizad${pieza === "ficha" ? "a" : "o"}` : `${piezas} personalizad${piezas === "fichas" ? "as" : "os"}`}`}
                {sizeCm && (
                  <>
                    {" · "}
                    <span className="text-brand-purple font-semibold">
                      📐 {sizeCm}
                      {isCalendar ? "" : " c/u"}
                    </span>
                  </>
                )}
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

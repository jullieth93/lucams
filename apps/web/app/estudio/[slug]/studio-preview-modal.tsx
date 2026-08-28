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
import { useState } from "react";
import { Loader2, Minus, Pencil, Plus, Sparkles, ShoppingCart } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCOP } from "@/lib/format";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText, splitStudioText } from "./studio-texts";

/**
 * Intercala un valor dinámico en <strong> dentro de un texto CMS (ej. la medida
 * física en las descripciones de confirmación). Si el texto editado ya no trae
 * el placeholder, se interpola plano (degradación segura, sin strong).
 */
function StrongVar({
  template,
  varName,
  value,
}: {
  template: string;
  varName: string;
  value: string;
}) {
  const parts = splitStudioText(template, varName);
  if (!parts) return <>{fillStudioText(template, { [varName]: value })}</>;
  return (
    <>
      {parts[0]}
      <strong>{value}</strong>
      {parts[1]}
    </>
  );
}

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
  /** Recibe las COPIAS elegidas en el stepper (CartItem.qty 1..99). */
  onConfirm: (copies: number) => void;
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
  const texts = useStudioTexts();

  // Copias del diseño (CartItem.qty 1..99): cuántas unidades IDÉNTICAS del
  // diseño aprobado se imprimen — distinto del tamaño del pack, que ya va
  // horneado en el diseño/variante elegida. El carrito +/−, el checkout y el
  // ZIP de producción ("IMPRIMIR N COPIAS") ya soportan qty; acá se elige.
  // Los hooks van ANTES del early-return de previewUrl (regla de orden de hooks).
  const [copies, setCopies] = useState(1);
  // La decisión es de ESTA agregada al carrito: cada apertura arranca en 1.
  // Patrón "ajustar estado durante el render" (react.dev — You Might Not Need
  // an Effect): el reset en useEffect está vetado por react-hooks/set-state-in-effect.
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) setCopies(1);
  }

  if (!previewUrl) return null;

  // #3 — el calendario habla de "páginas" (concordancia femenina: "las"/"Revísalas"); los imanes,
  // de "imanes". Ola 3 — los separadores hablan de "separadores" (cada uno con sus 2 caras).
  const isCalendar = productKind === "calendar";
  const isBookmarks = productKind === "bookmarks";
  // Cómo nombrar la pieza: con imán es un "imán"; sin él, una "ficha".
  const pieza = productKind === "tiles" ? texts.exportar.piezaFicha : texts.exportar.piezaIman;
  const piezas = productKind === "tiles" ? texts.exportar.piezaFichas : texts.exportar.piezaImanes;
  // Roadmap B1 — textos CMS (estudio.exportar.*): la concordancia de género/número se
  // resuelve acá (pieza/piezas/o/os) y los textos llevan placeholders documentados.
  const descCalendar = fillStudioText(texts.exportar.descCalendario, {
    n: slotCount,
    año: calendarYear ? ` ${calendarYear}` : "",
  });
  const descMagnets =
    slotCount === 1
      ? fillStudioText(texts.exportar.descImanUno, { pieza })
      : fillStudioText(texts.exportar.descImanes, { n: slotCount, piezas });
  const summaryLine = isCalendar
    ? fillStudioText(texts.exportar.resumenCalendario, { n: slotCount })
    : isBookmarks
      ? slotCount === 1
        ? fillStudioText(texts.exportar.resumenSeparadorUno, { n: slotCount })
        : fillStudioText(texts.exportar.resumenSeparadores, { n: slotCount })
      : slotCount === 1
        ? fillStudioText(texts.exportar.resumenUno, {
            n: slotCount,
            pieza,
            o: pieza === texts.exportar.piezaFicha ? "a" : "o",
          })
        : fillStudioText(texts.exportar.resumenMuchos, {
            n: slotCount,
            piezas,
            os: piezas === texts.exportar.piezaFichas ? "as" : "os",
          });
  const summarySize = sizeCm
    ? isCalendar
      ? fillStudioText(texts.exportar.resumenTamano, { tamano: sizeCm })
      : fillStudioText(texts.exportar.resumenTamanoCada, { tamano: sizeCm })
    : null;

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
            ? texts.exportar.tituloCalendario
            : isBookmarks
              ? texts.exportar.tituloSeparadores
              : texts.exportar.tituloPedido}
        </DialogTitle>
        <DialogDescription className="text-brand-purple-dark/70 text-sm">
          {isCalendar ? (
            <>
              {descCalendar}
              {sizeCm && (
                <>
                  {" "}
                  <StrongVar
                    template={texts.exportar.descCalendarioTamano}
                    varName="tamano"
                    value={sizeCm}
                  />
                </>
              )}{" "}
              {texts.exportar.descCalendarioRevisa}
            </>
          ) : isBookmarks ? (
            <>
              {fillStudioText(texts.exportar.descSeparadores, { n: slotCount })}
              {sizeCm && (
                <>
                  {" "}
                  <StrongVar
                    template={texts.exportar.descSeparadoresTamano}
                    varName="tamano"
                    value={sizeCm}
                  />
                </>
              )}{" "}
              {texts.exportar.descRevisaMuchos}
            </>
          ) : (
            <>
              {descMagnets}
              {sizeCm && (
                <>
                  {" "}
                  <StrongVar
                    template={texts.exportar.descImanTamano}
                    varName="tamano"
                    value={sizeCm}
                  />
                </>
              )}{" "}
              {slotCount === 1 ? texts.exportar.descRevisaUno : texts.exportar.descRevisaMuchos}
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
                {summaryLine}
                {summarySize && (
                  <>
                    {" · "}
                    <span className="text-brand-purple font-semibold">{summarySize}</span>
                  </>
                )}
              </p>
            </div>
            {unitPrice !== null && (
              <div className="text-right">
                {/* Total de la línea: unitario × copias (mismo cálculo del carrito). */}
                <p className="text-brand-purple-dark font-display text-lg font-bold tabular-nums">
                  {formatCOP(unitPrice * copies)}
                </p>
                {copies > 1 && (
                  <p className="text-brand-muted text-xs tabular-nums">
                    {formatCOP(unitPrice)} c/u
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Copias (qty del carrito) — stepper − / +, min 1 / max 99 como el
            carrito. Mismo look del stepper de cantidad del VariantSelector. */}
          <div className="border-brand-purple/10 mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t pt-3">
            <div className="min-w-0">
              <p className="text-brand-purple-dark font-semibold">Copias</p>
              <p className="text-brand-muted text-xs">
                Imprimimos {copies} {copies === 1 ? "copia idéntica" : "copias idénticas"} de tu
                diseño
              </p>
            </div>
            <div
              role="group"
              aria-label="Copias"
              className="ring-brand-purple/15 inline-flex items-center rounded-lg bg-white ring-1"
            >
              <button
                type="button"
                aria-label="Disminuir copias"
                disabled={copies <= 1 || isFinalizing}
                onClick={() => setCopies((c) => Math.max(1, c - 1))}
                className="text-brand-purple-dark hover:bg-brand-purple/5 focus:ring-brand-turquoise disabled:text-brand-muted flex h-10 w-10 cursor-pointer items-center justify-center rounded-l-lg transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <span
                aria-live="polite"
                className="text-brand-purple-dark min-w-12 text-center text-sm font-bold tabular-nums"
              >
                {copies}
              </span>
              <button
                type="button"
                aria-label="Aumentar copias"
                disabled={copies >= 99 || isFinalizing}
                onClick={() => setCopies((c) => Math.min(99, c + 1))}
                className="text-brand-purple-dark hover:bg-brand-purple/5 focus:ring-brand-turquoise disabled:text-brand-muted flex h-10 w-10 cursor-pointer items-center justify-center rounded-r-lg transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
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
            {texts.exportar.volverEditar}
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={() => onConfirm(copies)}
            disabled={isFinalizing}
            className="bg-gradient-brand text-white hover:brightness-110"
          >
            {isFinalizing ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                {texts.exportar.confirmarGuardando}
              </>
            ) : (
              <>
                <ShoppingCart className="mr-1.5 h-4 w-4" />
                {texts.exportar.confirmarCta}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

/*
 * StudioPreviewModal — Vista previa final pre-carrito (Lucy 2026-05-21).
 *
 * Después de click «Vista previa» en el Estudio (botón renombrado desde
 * «¡Listo!» — Lucy 2026-09-09), mostramos al cliente cómo va a verse su
 * pedido (grid de los N imanes compositado) ANTES de subir a Storage +
 * agregar al carrito.
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
  /** Piezas por unidad (tiras: fotos por tira; calendario: páginas por set).
   *  Solo cuando productKind es "strips" o "calendar" multi-unidad. */
  slotsPerUnit?: number;
  /** Tamaño físico de cada imán (ej. "5×5 cm"). Lucy 2026-05-21 — mostrarlo
   *  para que el cliente sepa qué tamaño real va a recibir. */
  sizeCm?: string;
  unitPrice: number | null; // precio en centavos COP de la variant elegida
  /**
   * Modelo MULTI-UNIDAD (owner 2026-09-09): unidades que contiene el DISEÑO
   * (cada una diseñada por separado en el Estudio). El total = unitario ×
   * unidades y el carrito recibe UNA línea con qty=1 (onConfirm recibe 1).
   * undefined → 1 (diseño de una unidad: total = unitario).
   */
  unitCount?: number;
  /**
   * LEGACY (superficie "nombre", editor hermano): copias IDÉNTICAS de la PDP
   * vía `?copies=N` — la modal las confirma como qty del carrito. Solo se usa
   * cuando `unitCount` no viene; el modelo nuevo prefiere `unitCount`.
   */
  initialCopies?: number;
  isFinalizing: boolean;
  errorMessage: string | null;
  /** #3 — tipo de producto: el calendario se describe en "páginas", no "imanes".
   *  Ola 3 — "bookmarks": separadores de libros (tiras 2 caras), concordancia propia.
   *  Multi-unidad (2026-09-09) — "strips": tiras photobooth (cada unidad es una
   *  tira continua de N fotos — antes se describían como "N imanes", incorrecto).
   *  "tiles": fichas SIN imán. Los sets de letras y el nombre tienen variantes "Con imán" y
   *  "Sin imán"; llamarle "imán" a la que no lo lleva es una afirmación falsa sobre el producto
   *  físico, hecha justo en la pantalla de confirmación (revisión 2026-07-25, Ley 1480 art. 23). */
  productKind?: "magnets" | "calendar" | "bookmarks" | "tiles" | "strips";
  /** Año del calendario (solo cuando productKind==="calendar"). */
  calendarYear?: number;
  onEdit: () => void;
  /** Recibe el qty para el carrito: 1 en el modelo multi-unidad (el diseño ya
   *  contiene las unidades); las copias de la PDP en el path legacy (nombre). */
  onConfirm: (copies: number) => void;
};

export function StudioPreviewModal({
  isOpen,
  previewUrl,
  productName,
  slotCount,
  slotsPerUnit,
  sizeCm,
  unitPrice,
  unitCount,
  initialCopies,
  isFinalizing,
  errorMessage,
  productKind = "magnets",
  calendarYear,
  onEdit,
  onConfirm,
}: StudioPreviewModalProps) {
  const texts = useStudioTexts();

  // Modelo multi-unidad (2026-09-09): las unidades van DENTRO del diseño → el
  // carrito recibe qty=1. Path legacy (nombre): copias idénticas (qty 1..99).
  const units = Math.min(99, Math.max(1, Math.trunc(unitCount ?? 1) || 1));
  const isMultiUnit = units > 1;
  const copies = Math.min(99, Math.max(1, Math.trunc(initialCopies ?? 1) || 1));
  // Qty al confirmar: multi-unidad → 1; legacy → las copias de la PDP.
  const confirmQty = unitCount !== undefined ? 1 : copies;
  // Multiplicador del total mostrado: unidades del diseño (nuevo) o copias (legacy).
  const totalMultiplier = unitCount !== undefined ? units : copies;

  if (!previewUrl) return null;

  // #3 — el calendario habla de "páginas" (concordancia femenina: "las"/"Revísalas"); los imanes,
  // de "imanes". Ola 3 — los separadores hablan de "separadores" (cada uno con sus 2 caras).
  const isCalendar = productKind === "calendar";
  const isBookmarks = productKind === "bookmarks";
  const isStrips = productKind === "strips";
  // Cómo nombrar la pieza: con imán es un "imán"; sin él, una "ficha".
  const pieza = productKind === "tiles" ? texts.exportar.piezaFicha : texts.exportar.piezaIman;
  const piezas = productKind === "tiles" ? texts.exportar.piezaFichas : texts.exportar.piezaImanes;
  // Roadmap B1 — textos CMS (estudio.exportar.* / estudio.unidades.*): la concordancia de
  // género/número se resuelve acá y los textos llevan placeholders documentados.
  const perUnit = slotsPerUnit ?? slotCount;
  const descCalendar = isMultiUnit
    ? fillStudioText(texts.unidades.descCalendarios, {
        n: slotCount,
        m: perUnit,
        año: calendarYear ? ` ${calendarYear}` : "",
      })
    : fillStudioText(texts.exportar.descCalendario, {
        n: slotCount,
        año: calendarYear ? ` ${calendarYear}` : "",
      });
  const descMagnets =
    slotCount === 1
      ? fillStudioText(texts.exportar.descImanUno, { pieza })
      : fillStudioText(texts.exportar.descImanes, { n: slotCount, piezas });
  const descStrips =
    slotCount === 1
      ? fillStudioText(texts.unidades.descTiraUna, { m: perUnit })
      : fillStudioText(texts.unidades.descTiras, { n: slotCount, m: perUnit });
  const summaryLine = isCalendar
    ? isMultiUnit
      ? fillStudioText(texts.unidades.resumenCalendarios, { n: slotCount, m: perUnit })
      : fillStudioText(texts.exportar.resumenCalendario, { n: slotCount })
    : isBookmarks
      ? slotCount === 1
        ? fillStudioText(texts.exportar.resumenSeparadorUno, { n: slotCount })
        : fillStudioText(texts.exportar.resumenSeparadores, { n: slotCount })
      : isStrips
        ? slotCount === 1
          ? fillStudioText(texts.unidades.resumenTiraUna, { n: slotCount, m: perUnit })
          : fillStudioText(texts.unidades.resumenTiras, { n: slotCount, m: perUnit })
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
        // Lucy 2026-09-03 — la modal desbordaba el viewport: imagen (hasta 448px) +
        // textos + resumen + stepper + CTAs superaban el alto en desktop de poca
        // altura y en móvil, y el contenido quedaba cortado SIN scroll. Ahora:
        //   - alto capado por dvh con scroll interno (overflow-y-auto) en todas las
        //     resoluciones — toda la solución queda deslizable;
        //   - en móvil (<sm) comportamiento tipo sheet: anclado abajo, ancho completo,
        //     max 92dvh, sin borde redondeado inferior;
        //   - en sm+ centrada como siempre, con el mismo tope de alto.
        // OJO: el ancho se sobreescribe con la variante prefijada `sm:max-w-2xl` —
        // la base del Dialog trae `sm:max-w-sm`, que por orden de cascada le ganaría
        // a un `max-w-2xl` sin prefijo (el dialog nunca llegaba a 2xl en desktop).
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto max-sm:top-auto max-sm:right-0 max-sm:bottom-0 max-sm:left-0 max-sm:max-h-[92dvh] max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-2xl"
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
          ) : isStrips ? (
            <>
              {descStrips}
              {sizeCm && (
                <>
                  {" "}
                  <StrongVar
                    template={fillStudioText(texts.exportar.descImanTamano, { pieza: "tira" })}
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
                  {/* El texto trae DOS placeholders ({pieza} y {tamano}): se rellena
                      pieza plano primero y StrongVar interpola tamano con <strong>. */}
                  <StrongVar
                    template={fillStudioText(texts.exportar.descImanTamano, { pieza })}
                    varName="tamano"
                    value={sizeCm}
                  />
                </>
              )}{" "}
              {slotCount === 1 ? texts.exportar.descRevisaUno : texts.exportar.descRevisaMuchos}
            </>
          )}
        </DialogDescription>

        {/* Preview compositado del grid. La imagen se capa por ALTO de viewport
            además de por ancho (min(28rem, 42dvh)): con aspect-square el alto sigue
            al ancho, así que limitar el ancho en dvh garantiza que la imagen nunca
            se coma el viewport en pantallas bajas (el resto del contenido sigue
            accesible con el scroll del diálogo). */}
        <div className="border-brand-purple/15 from-brand-cream relative mt-3 overflow-hidden rounded-xl border bg-gradient-to-br to-white p-4">
          <div className="relative mx-auto aspect-square w-full max-w-[min(28rem,42dvh)]">
            <Image
              src={previewUrl}
              alt={
                isCalendar
                  ? `Vista previa de las ${slotCount} páginas de tu calendario${calendarYear ? ` ${calendarYear}` : ""}`
                  : isBookmarks
                    ? `Vista previa de ${slotCount} separadores desplegados con sus 2 caras`
                    : isStrips
                      ? `Vista previa de ${slotCount === 1 ? "tu tira" : `tus ${slotCount} tiras`} — cada una con ${perUnit} fotos`
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
                {/* Total de la línea: unitario × unidades del diseño (modelo
                    multi-unidad; en el path legacy, × copias de la PDP) — el
                    MISMO cálculo que el servidor aplica en el carrito. */}
                <p className="text-brand-purple-dark font-display text-lg font-bold tabular-nums">
                  {formatCOP(unitPrice * totalMultiplier)}
                </p>
                {totalMultiplier > 1 && (
                  <p className="text-brand-muted text-xs tabular-nums">
                    {formatCOP(unitPrice)} c/u
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Unidades del DISEÑO (modelo multi-unidad 2026-09-09): el cliente ya
            las diseñó una a una — la línea del carrito es UNA (qty 1) y producción
            recibe TODAS las unidades. Path legacy (nombre): copias idénticas de la
            PDP como dato. */}
          {unitCount !== undefined && isMultiUnit ? (
            <div className="border-brand-purple/10 mt-3 border-t pt-3">
              <p className="text-brand-purple-dark text-sm font-semibold">
                {fillStudioText(texts.unidades.modalUnidades, { n: units })}
              </p>
              <p className="text-brand-muted text-xs">{texts.exportar.copiasAjusteCarrito}</p>
            </div>
          ) : unitCount === undefined && copies > 1 ? (
            <div className="border-brand-purple/10 mt-3 border-t pt-3">
              <p className="text-brand-purple-dark text-sm font-semibold">
                {fillStudioText(texts.exportar.copiasIdenticas, { n: copies })}
              </p>
              <p className="text-brand-muted text-xs">{texts.exportar.copiasAjusteCarrito}</p>
            </div>
          ) : null}
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Acciones */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          {/* Lucy 2026-09-09 — "Volver a editar" se vuelve BOTÓN SÓLIDO morado de
              marca (mismo lenguaje del botón «Salir» del toolbar): el outline suave
              se leía como texto secundario y el cliente no encontraba la salida de
              la modal. Animación sutil del design system: transition-all + sombra
              que crece en hover + leve compresión al presionar (active:scale). */}
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onEdit}
            disabled={isFinalizing}
            className="bg-brand-purple hover:bg-brand-purple-dark shadow-brand-purple/20 hover:shadow-brand-purple/30 border-transparent text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
          >
            <Pencil className="mr-1.5 h-4 w-4" />
            {texts.exportar.volverEditar}
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={() => onConfirm(confirmQty)}
            disabled={isFinalizing}
            aria-busy={isFinalizing}
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

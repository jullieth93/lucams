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

import { Loader2, Pencil, Sparkles, ShoppingCart, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCOP } from "@/lib/format";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText, splitStudioText } from "./studio-texts";
import type { StudioQualityWarning } from "./types";

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
   * Multiplicador de precio del SERVIDOR (designUnitPriceMultiplier, mismo
   * cálculo del carrito: ceil(slotCount / cubierto-por-variante)). Es lo que
   * multiplica al unitPrice en el total mostrado. CRÍTICO para packs donde la
   * variante YA es el pack (separadores: variante = 5 unidades → multiplicador
   * 1 aunque el diseño tenga 5 unidades; antes se multiplicaba por unitCount y
   * la modal mostraba 5× el precio real — bug 2026-09-22). undefined → cae al
   * comportamiento legacy (unitCount ?? copies).
   */
  priceMultiplier?: number;
  /**
   * Separadores PLANOS (noFold, Alargados): la pieza no se dobla → los textos
   * no hablan de "doblado". Solo tiene sentido con productKind="bookmarks".
   */
  noFold?: boolean;
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
  /**
   * Paquete F (2026-10-02) — desglose de la variante/opciones vigentes
   * ("5×7 cm · Sin imán (adhesivo) · Español", describeVariantAttributes).
   * Cada editor lo construye con su verdad EN VIVO (la variante re-resuelta,
   * el magnet del canvas) — nunca con el deep-link de la PDP, que puede haber
   * quedado viejo si el cliente cambió opciones en el Estudio.
   */
  variantLabel?: string;
  /**
   * Paquete C (2026-10-02) — fotos CON aviso de calidad que el diseño USA
   * (collectQualityWarnings: solo las asignadas a slots). Si la lista llega
   * con elementos, se muestra la sección "Calidad de tus fotos" y el cliente
   * DEBE marcar la aceptación para habilitar el confirmar (la aceptación viaja
   * en onConfirm y la persiste el servidor en Design.qualityAcknowledgedAt).
   * undefined/vacía → flujo idéntico al histórico (sin sección ni checkbox).
   */
  qualityWarnings?: StudioQualityWarning[];
  onEdit: () => void;
  /** Recibe el qty para el carrito: 1 en el modelo multi-unidad (el diseño ya
   *  contiene las unidades); las copias de la PDP en el path legacy (nombre).
   *  `opts.qualityAcknowledged` = el cliente marcó la aceptación de calidad. */
  onConfirm: (copies: number, opts?: { qualityAcknowledged?: boolean }) => void;
};

export function StudioPreviewModal({
  isOpen,
  previewUrl,
  productName,
  slotCount,
  slotsPerUnit,
  sizeCm,
  unitPrice,
  priceMultiplier,
  noFold = false,
  unitCount,
  initialCopies,
  isFinalizing,
  errorMessage,
  productKind = "magnets",
  calendarYear,
  variantLabel,
  qualityWarnings,
  onEdit,
  onConfirm,
}: StudioPreviewModalProps) {
  const texts = useStudioTexts();

  // Paquete C (2026-10-02) — aceptación explícita de calidad: checkbox obligatorio
  // cuando el diseño usa fotos con aviso. La aceptación queda ligada al CONJUNTO
  // de avisos vigente (su clave): si el cliente vuelve a editar y cambian las fotos
  // con aviso, la aceptación anterior ya no aplica y tiene que marcarla de nuevo.
  const hasQualityWarnings = !!qualityWarnings && qualityWarnings.length > 0;
  const qualityWarningsKey = (qualityWarnings ?? [])
    .map((w) => `${w.assetId}:${w.level}`)
    .join(",");
  const [acceptedWarningsKey, setAcceptedWarningsKey] = useState<string | null>(null);
  const qualityAccepted = hasQualityWarnings && acceptedWarningsKey === qualityWarningsKey;

  // Modelo multi-unidad (2026-09-09): las unidades van DENTRO del diseño → el
  // carrito recibe qty=1. Path legacy (nombre): copias idénticas (qty 1..99).
  const units = Math.min(99, Math.max(1, Math.trunc(unitCount ?? 1) || 1));
  const isMultiUnit = units > 1;
  const copies = Math.min(99, Math.max(1, Math.trunc(initialCopies ?? 1) || 1));
  // Qty al confirmar: multi-unidad → 1; legacy → las copias de la PDP.
  const confirmQty = unitCount !== undefined ? 1 : copies;
  // Multiplicador del total mostrado: el del SERVIDOR cuando llega
  // (priceMultiplier — la variante puede YA ser el pack, p.ej. separadores:
  // 5 unidades a $12.500 el pack → ×1, no ×5); si no, unidades del diseño
  // (modelo nuevo) o copias (legacy).
  const serverMultiplier = Math.min(99, Math.max(1, Math.trunc(priceMultiplier ?? 1) || 1));
  const totalMultiplier =
    priceMultiplier !== undefined ? serverMultiplier : unitCount !== undefined ? units : copies;

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
                  {/* noFold (Alargados): la pieza es PLANA — sin "doblado". */}
                  <StrongVar
                    template={
                      noFold
                        ? texts.exportar.descSeparadoresTamanoPlano
                        : texts.exportar.descSeparadoresTamano
                    }
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

        {/* Preview compositado del grid. La imagen usa su ASPECTO NATURAL
            (2026-09-22 — antes un contenedor aspect-square fijo letterboxeaba
            mal las tiras altas de separadores, que quedaban diminutas con
            aire lateral): se capa por ALTO de viewport (max-h en dvh) y por
            ancho del diálogo, así la imagen nunca se come el viewport en
            pantallas bajas y el resto del contenido sigue accesible con el
            scroll del diálogo. */}
        <div className="border-brand-purple/15 from-brand-cream relative mt-3 overflow-hidden rounded-xl border bg-gradient-to-br to-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- dataURL local del compositor; next/image no aporta optimización acá (ya iba unoptimized) */}
          <img
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
            className="mx-auto max-h-[min(28rem,42dvh)] w-auto max-w-full object-contain drop-shadow-lg"
          />
        </div>

        {/* Resumen */}
        <div className="border-brand-purple/10 bg-brand-purple/[0.03] rounded-lg border p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-brand-purple-dark font-semibold">{productName}</p>
              {variantLabel && <p className="text-brand-muted text-xs">{variantLabel}</p>}
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
            PDP como dato.
            QA owner 2026-09-25 — el carrito ya NO tiene stepper para líneas
            personalizadas: en la rama multi-unidad se eliminó la nota "Puedes
            ajustar la cantidad en el carrito" (falsa ahí; las unidades se cambian
            en el editor — el CTA «Volver a editar» está justo abajo). En la rama
            legacy la nota sigue, con texto actualizado (la cantidad se eligió en
            la PDP). */}
          {unitCount !== undefined && isMultiUnit ? (
            <div className="border-brand-purple/10 mt-3 border-t pt-3">
              <p className="text-brand-purple-dark text-sm font-semibold">
                {fillStudioText(texts.unidades.modalUnidades, { n: units })}
              </p>
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

        {/* Paquete C (2026-10-02) — sección "Calidad de tus fotos": solo cuando el
            diseño USA fotos con avisos de calidad. Lista cada foto con su mensaje
            y la recomendación específica del servidor, y exige la aceptación
            explícita (checkbox) antes de habilitar el confirmar. */}
        {hasQualityWarnings && (
          <section
            aria-labelledby="quality-ack-title"
            className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3"
          >
            <p
              id="quality-ack-title"
              className="flex items-center gap-1.5 text-sm font-bold text-amber-900"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              {texts.exportar.calidadSeccionTitulo}
            </p>
            <p className="mt-1 text-xs text-amber-900/80">{texts.exportar.calidadSeccionIntro}</p>
            <ul className="mt-2 space-y-2">
              {qualityWarnings.map((w) => (
                <li
                  key={w.assetId}
                  className="flex items-start gap-2 rounded-md bg-white/70 p-2 ring-1 ring-amber-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed URL temporal del cliente */}
                  <img
                    src={w.signedUrl}
                    alt=""
                    className={[
                      "h-12 w-12 shrink-0 rounded-md object-cover ring-1",
                      w.level === "warning-soft" ? "ring-amber-300" : "ring-red-300",
                    ].join(" ")}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-brand-purple-dark text-xs leading-snug font-semibold">
                      {w.message}
                    </p>
                    {w.recommendation && (
                      <p className="text-brand-muted mt-0.5 text-xs leading-snug">
                        {w.recommendation}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs font-semibold text-amber-950">
              <input
                type="checkbox"
                checked={qualityAccepted}
                onChange={(e) =>
                  setAcceptedWarningsKey(e.target.checked ? qualityWarningsKey : null)
                }
                disabled={isFinalizing}
                className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
              />
              <span>{texts.exportar.calidadAcepto}</span>
            </label>
          </section>
        )}

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
              que crece en hover + leve compresión al presionar (active:scale).
              2026-10-02 — sin variant="outline": esa variante arrastra clases
              dark: (dark:bg-input/30, casi blanco) que twMerge no puede limpiar
              con el override morado; el botón ya define todo su estilo en
              className, así que usa la variante default. */}
          <Button
            type="button"
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
            onClick={() =>
              onConfirm(confirmQty, {
                qualityAcknowledged: hasQualityWarnings && qualityAccepted,
              })
            }
            disabled={isFinalizing || (hasQualityWarnings && !qualityAccepted)}
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

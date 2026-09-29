"use client";

/*
 * StudioToolbar — header sticky del Estudio v2 (M.3.b Capa 2).
 *
 * Muestra:
 *   - Back link al PDP (ARIA labeled)
 *   - Producto + indicador "X/N fotos" mini
 *   - Auto-save indicator (Editando · Guardando · Auto-guardado hace Xs · Error)
 *   - Botón «Vista previa» (renombrado desde «¡Listo!» — Lucy 2026-09-09: abre
 *     la modal de confirmación pre-carrito, no agrega directo) con canFinalize
 *     fix (solo habilitado si TODOS los slots tienen assetUrl — el bug crítico
 *     de M.3 corregido)
 *
 * El botón «Vista previa» tiene 4 estados visuales:
 *   - Deshabilitado (morado atenuado + tooltip explicando qué falta)
 *   - Habilitado (morado solid + sombra on hover)
 *   - Preparando la vista previa (loader + "Preparando…", aria-busy)
 *   - Saving (loader + texto "Guardando diseño...")
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, Loader2, AlertCircle, Sparkles, HelpCircle, X } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import type { StoreApi } from "zustand";
import { useStore } from "zustand";
import { compareSizeToObject } from "./lib/size-comparator";
import { LucamsLogo } from "@/components/lucams-logo";
import { StudioPhotoCountControl } from "./studio-photo-count-control";
import { StudioUnitCountControl } from "./studio-unit-count-control";
import {
  selectFilledSlotCount,
  selectIsComplete,
  selectMissingSlotIndexesKey,
  selectTotalSlotCount,
  type StudioStoreState,
} from "./lib/store";
import { missingFaceACount } from "./lib/faces";
import type { SlotNoun } from "./lib/slot-noun";
import { igMissingRequiredTextLayersPerSlot } from "@/features/personalization/instagram-template-spec";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText, splitStudioText, type StudioTexts } from "./studio-texts";

type StudioToolbarProps = {
  store: StoreApi<StudioStoreState>;
  productName: string;
  productSlug: string;
  /** A1.1 — URL de la imagen del producto (mini avatar en el header). */
  productImageUrl?: string;
  /** A1.1 — Tamaño físico del imán, ej "5×5 cm". */
  productSizeCm?: string;
  /** A1.1 — Cantidad total de unidades del pack (ej 6, 12). En separadores 2 caras
   *  es la cantidad de UNIDADES físicas (cada una con 2 caras de diseño). */
  productSlotCount?: number;
  /** Ola 3 — sustantivo de la unidad. Fase 1A (2026-09-27): par { one, many }
   *  resuelto por resolveSlotNoun (productKind real + magnet — un calendario o
   *  una variante SIN IMÁN nunca dicen "imanes"). */
  slotNoun?: SlotNoun;
  /** Fase 1A — etiquetas por slot ("Ene", "1A"…) para el popover de faltantes
   *  de «Vista previa» (mismas labels de la grilla). undefined → números. */
  slotLabels?: string[];
  /** M.3.b.B.1 — toggle bleed + safe area overlay guides. */
  showRealismGuides?: boolean;
  /** M.3.b.B.1 — callback al cambiar el toggle. */
  onToggleRealismGuides?: () => void;
  /** M.3.b.UX.bug v3 — abre el modal de Vista previa final. */
  /** M.3.b.UX.v12 (Lucy 2026-05-15) — Abrir banner de gestos manualmente
   *  (drag/zoom/dblclick). El cliente puede re-leer las instrucciones cuando
   *  quiera. */
  onOpenGesturesHint?: () => void;
  /** Lucy 2026-09-09 — true mientras se compone la vista previa (handleFinalize):
   *  el botón muestra spinner + disabled (feedback de procesamiento, patrón
   *  Loader2 del Estudio). */
  isPreviewBuilding?: boolean;
  /**
   * Lucy 2026-09-05 — packs de fotoimanes: config del stepper "¿Cuántas fotos
   * lleva tu imán?" (fila propia bajo el header). undefined = producto no pack:
   * el control no se renderiza.
   */
  photoCount?: {
    min: number;
    max: number;
    facesPerUnit: number;
    sizeCm?: string;
    /** "¿Con imán?" (Lucy 2026-09-08): badge read-only junto al stepper — lo fija
     *  la PDP, el Estudio solo lo muestra. undefined = catálogo sin la dimensión. */
    magnet?: boolean;
    /**
     * Ola 28 (owner 2026-09-11, 1.3.A) — producto de COMPOSICIÓN fija (tiras):
     * la composición (fotos por tira) se elige en la PDP y no se repite acá;
     * en su lugar va el stepper "Unidades" (cuántas tiras diseñar).
     */
    composition?: boolean;
  };
  onFinalize: () => void;
  /**
   * Ola 26 (owner 2026-09-09) — bloqueo EXTRA de «Vista previa» con las fotos ya
   * completas (hoy: textos requeridos de la Polaroid Instagram sin llenar). Lo
   * calcula el editor (guard de finalización); acá sigue el mismo patrón del
   * bloqueo por fotos: botón deshabilitado + tooltip/aria con el motivo.
   */
  finalizeBlockReason?: string | null;
  /**
   * Cara B OPCIONAL (2026-09-22, separadores magnéticos 2×6 / 4×4.2 y
   * Alargados): el guard de finalización exige solo las CARAS A (slots pares);
   * las caras B pueden quedar vacías (el reverso sale negro). Solo llega true
   * cuando el producto es de 2 caras y su schema declara backOptional.
   */
  backOptional?: boolean;
};

export function StudioToolbar({
  store,
  productName,
  productSlug,
  productImageUrl,
  productSizeCm,
  productSlotCount,
  slotNoun = { one: "imán", many: "imanes" },
  slotLabels,
  showRealismGuides,
  onToggleRealismGuides: _onToggleRealismGuides,
  onOpenGesturesHint,
  photoCount,
  isPreviewBuilding = false,
  finalizeBlockReason = null,
  backOptional = false,
  onFinalize,
}: StudioToolbarProps) {
  const autoSaveStatus = useStore(store, (s) => s.autoSaveStatus);
  const isFinalizing = useStore(store, (s) => s.isFinalizing);
  // Suscripciones atómicas (primitivos) — evitan re-render infinito que daba
  // un selector compuesto. Ver lib/store.ts comment "Selectores ATÓMICOS".
  const filled = useStore(store, selectFilledSlotCount);
  const total = useStore(store, selectTotalSlotCount);
  const completeAll = useStore(store, selectIsComplete);
  // Cara B opcional (separadores): solo las caras A (slots pares) son
  // obligatorias. Selectores primitivos (número) → sin re-render en cascada.
  const missingFaceA = useStore(store, (s) =>
    backOptional ? missingFaceACount(s.canvasData?.slots ?? []) : 0,
  );
  const texts = useStudioTexts();

  const complete = backOptional ? total > 0 && missingFaceA === 0 : completeAll;
  const canFinalize = complete && !finalizeBlockReason && !isFinalizing && !isPreviewBuilding;
  // Fase 1A — detalle de faltantes para el popover de «Vista previa» (fotos por
  // slot con su label + textos IG por unidad). null cuando no falta nada.
  const missing = useFinalizeMissing(store, backOptional, slotLabels);

  const disabledTooltip = !complete
    ? fillStudioText(texts.lienzo.finalizeTooltip, {
        n: backOptional ? missingFaceA : total - filled,
      })
    : (finalizeBlockReason ?? undefined);

  return (
    <header
      role="banner"
      className="border-brand-purple/10 sticky top-0 z-10 border-b bg-white backdrop-blur"
    >
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        {/* FB2 (feedback Lucy) — la salida del estudio no se veía en móvil (solo el ícono, sepultado
          bajo el header del sitio). Ahora es un botón con etiqueta "Salir" siempre visible, con
          fondo suave para que se lea como control tocable. Vuelve a la ficha del producto (el
          borrador se autoguarda, no se pierde nada).
          Lucy 2026-09-08 — se vuelve BOTÓN SÓLIDO morado de marca (mismo lenguaje visual del
          botón «Vista previa»): el pill con fondo suave seguía leyéndose como texto, no como acción. */}
        <Link
          href={`/producto/${productSlug}`}
          aria-label={fillStudioText(texts.lienzo.salirAria, { producto: productName })}
          className="bg-brand-purple hover:bg-brand-purple-dark shadow-brand-purple/20 hover:shadow-brand-purple/30 focus:ring-brand-purple inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md px-4 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg focus:ring-2 focus:ring-offset-2 focus:outline-none"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{texts.lienzo.headerExit}</span>
        </Link>

        {/* A1.1 — Hero del estudio: avatar producto + nombre + medidas físicas grandes */}
        <div className="hidden flex-1 items-center justify-center gap-3 md:flex">
          <ProductAvatar productImageUrl={productImageUrl} productName={productName} />
          <div className="flex flex-col items-start leading-tight">
            <p className="text-brand-purple-dark text-sm font-semibold">
              {fillStudioText(texts.lienzo.headerTitle, { producto: productName })}
            </p>
            {(productSizeCm || productSlotCount) && (
              <p className="text-brand-muted mt-0.5 flex items-center gap-1.5 text-[11px] font-medium">
                {productSizeCm && <SizeChipWithComparator sizeCm={productSizeCm} />}
                {productSlotCount && (
                  <span className="text-brand-muted">
                    · {productSlotCount} {productSlotCount === 1 ? slotNoun.one : slotNoun.many}
                  </span>
                )}
              </p>
            )}
          </div>
          <span aria-hidden className="text-brand-purple/20">
            ·
          </span>
          <ProgressBadge filled={filled} total={total} />
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Lucy 2026-05-21 round 4: toggle eliminado. La línea punteada
              de "zona segura" no matcheaba visualmente la silueta del
              corazón/círculo y confundía al cliente sin aportar valor real
              (la silueta del producto YA define el borde de impresión).
              Mantenemos prop onToggleRealismGuides en la API para futuras
              expansiones, pero NO renderea botón. */}
          {/* M.3.b.UX.v12 (Lucy 2026-05-15) — Botón "?" para re-ver gestos.
            Icon-only para no ocupar espacio. Visible en mobile y desktop. */}
          {onOpenGesturesHint && (
            <button
              type="button"
              onClick={onOpenGesturesHint}
              aria-label={texts.lienzo.gestosAria}
              title={texts.lienzo.gesturesButtonTitle}
              className="text-brand-purple-dark/70 hover:bg-brand-purple/10 hover:text-brand-purple-dark focus:ring-brand-purple inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors focus:ring-2 focus:ring-offset-1 focus:outline-none"
            >
              <HelpCircle className="h-4 w-4" aria-hidden />
            </button>
          )}
          <AutoSaveIndicator status={autoSaveStatus} isFinalizing={isFinalizing} />
          {/* M.3.b.UX.1 — Finalize button INLINE solo desktop (sm+).
              En mobile el FAB es la única forma de finalizar (montado por
              StudioEditor afuera del toolbar para que flote sobre el canvas). */}
          <div className="hidden sm:block">
            <FinalizeButton
              isFinalizing={isFinalizing}
              isPreparing={isPreviewBuilding}
              canFinalize={canFinalize}
              disabledTooltip={disabledTooltip}
              missing={missing}
              onFinalize={onFinalize}
              variant="inline"
            />
          </div>
        </div>
      </div>

      {/* Lucy 2026-09-05 — packs de fotoimanes: el N de fotos por imán se elige ACÁ
          (en el Estudio), no en la PDP. Fila propia visible en mobile y desktop.
          Ola 28 (owner 2026-09-11) — composición fija (tiras): el stepper de fotos
          sobra ("ya se eligió en la PDP"); en su lugar va el de UNIDADES a diseñar.
          A3 (2026-09-15) — el stepper de UNIDADES es UNIVERSAL: todo producto sin
          stepper de fotos lo muestra (calendario incluido — antes no salía). El
          control mismo se oculta cuando el producto no tiene unidades multi-slot
          que contar (unitSlots ≤ caras — imán suelto de 1 foto). */}
      {photoCount && !photoCount.composition ? (
        <StudioPhotoCountControl
          store={store}
          min={photoCount.min}
          max={photoCount.max}
          facesPerUnit={photoCount.facesPerUnit}
          sizeCm={photoCount.sizeCm}
          magnet={photoCount.magnet}
        />
      ) : (
        <StudioUnitCountControl
          store={store}
          facesPerUnit={photoCount?.facesPerUnit ?? 1}
          magnet={photoCount?.magnet}
          hint={photoCount?.composition ? undefined : "Cada unidad se diseña por separado"}
        />
      )}

      {/* Progress badge mobile (visible solo < md).
          Ola 34 (owner 2026-09-18) — nombre del producto EN MÓVIL: el hero
          avatar+nombre es md+ y el cliente no veía qué producto estaba
          trabajando ("en el estudio en versión móvil no aparece qué producto
          estoy trabajando"). Va EN ESTA MISMA FILA (ya existía) truncado a una
          línea → cero altura extra de chrome: la tarjeta del canvas sigue
          iniciando dentro del primer viewport de 375×812. */}
      <div className="border-brand-purple/10 bg-brand-cream/50 flex items-center justify-center gap-2 border-t py-2 md:hidden">
        <span
          className="text-brand-purple-dark max-w-[38%] truncate text-xs font-semibold"
          title={productName}
        >
          {productName}
        </span>
        <span aria-hidden className="text-brand-purple/25">
          ·
        </span>
        <ProgressBadge filled={filled} total={total} />
        {/* AutoSave indicator mobile abajo del progress */}
        <AutoSaveIndicator status={autoSaveStatus} isFinalizing={isFinalizing} />
      </div>

      {/* M.3.b.UX.v4 Lucy 2026-05-15 — leyenda simplificada y contextualizada.
        Una sola guide ahora (la silueta del producto YA es el borde físico).
        Anclamos al tamaño real del imán para que el cliente entienda la
        proporción concreta (no solo "una línea adentro"). */}
      {showRealismGuides && (
        <div className="border-brand-purple/15 bg-brand-purple/5 text-brand-purple-dark flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t px-3 py-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-0.5 w-4 rounded-sm"
              style={{ borderTop: "2.5px dashed rgb(124 106 173 / 0.85)" }}
            />
            <strong>{texts.lienzo.guiaLinea}</strong> {texts.lienzo.guiaDescripcion}
          </span>
          {productSizeCm && (
            <span className="text-brand-muted">
              {(() => {
                // {size} conserva el <strong> de la medida (roadmap B1).
                const parts = splitStudioText(texts.lienzo.guiaTamano, "size");
                if (!parts) {
                  return fillStudioText(texts.lienzo.guiaTamano, { size: productSizeCm });
                }
                return (
                  <>
                    {parts[0]}
                    <strong>
                      {productSizeCm}
                      {parts[1]}
                    </strong>
                  </>
                );
              })()}
            </span>
          )}
        </div>
      )}
    </header>
  );
}

// ──────────────────────────────────────────────────────────────────
//  M.3.b.UX.1 — FinalizeButton (extraído para reusar como FAB mobile)
// ──────────────────────────────────────────────────────────────────
//
// Botón «Vista previa» (antes «¡Listo!») con 2 variantes:
//  - "inline": versión del toolbar desktop (h-10 px-4)
//  - "fab":    versión floating mobile bottom-right (h-14, sombra deep,
//              pulse animation cuando canFinalize)
//
// Procesamiento (Lucy 2026-09-09): `isPreparing` cubre la composición de la
// vista previa (loader + disabled + aria-busy, patrón del resto del Estudio);
// `isFinalizing` cubre el guardado/subida tras confirmar en la modal.

// ──────────────────────────────────────────────────────────────────
//  Fase 1A (2026-09-27) — Popover "qué falta" de «Vista previa»
// ──────────────────────────────────────────────────────────────────
//
// Antes el botón bloqueado solo exponía un tooltip NATIVO (title) que en móvil
// no existe y nunca decía QUÉ faltaba exactamente. Ahora, cuando «Vista
// previa» está bloqueado por faltantes, un popover (radix-ui, mismo paquete
// del Dialog/Sheet del proyecto) lista explícitamente:
//   - Fotos por cargar, con la label de cada slot ("Ene", "1A", "3"…).
//   - Textos requeridos IG faltantes, agrupados por unidad ("En 2: usuario").
// Accesible: hover (desktop), tap/click (móvil), foco + Enter/Espacio
// (teclado), Esc cierra (radix), trigger con nombre audible propio.

/** Detalle de faltantes del diseño para el popover de «Vista previa». */
export type FinalizeMissing = {
  /** Labels de los slots sin foto ("Ene", "Feb", "1A", "3"…). */
  photos: string[];
  /** Textos requeridos IG faltantes, agrupados por unidad (slot). */
  igTexts: Array<{ slot: string; fields: string[] }>;
};

/** Etiquetas CMS de los campos de texto requeridos de la Polaroid Instagram. */
function igFieldLabels(texts: StudioTexts): Record<string, string> {
  return {
    user_name: texts.texto.campoIgUsuario,
    location: texts.texto.campoIgUbicacion,
    caption: texts.texto.campoIgTitulo,
    hashtags: texts.texto.campoIgHashtags,
  };
}

/**
 * Hook compartido toolbar/FAB: arma el detalle de faltantes del diseño.
 * Suscripciones ATÓMICAS (strings primitivos, patrón selectFilledSlotCount) →
 * sin re-render en cascada; la expansión a labels se memoiza por clave.
 * null = no falta nada (el botón se habilita normal, sin popover).
 */
function useFinalizeMissing(
  store: StoreApi<StudioStoreState>,
  backOptional: boolean,
  slotLabels: string[] | undefined,
): FinalizeMissing | null {
  const texts = useStudioTexts();
  const missingSlotKey = useStore(store, (s) => selectMissingSlotIndexesKey(s, backOptional));
  const igPerSlotKey = useStore(store, (s) =>
    s.canvasData
      ? igMissingRequiredTextLayersPerSlot(s.canvasData)
          .map((e) => `${e.slotIndex}:${e.layerIds.join("+")}`)
          .join("|")
      : "",
  );
  return useMemo(() => {
    const labelOf = (slotIndex: number) => slotLabels?.[slotIndex] ?? String(slotIndex + 1);
    const photos =
      missingSlotKey === "" ? [] : missingSlotKey.split(",").map((k) => labelOf(Number(k)));
    const fieldLabel = igFieldLabels(texts);
    const igTexts =
      igPerSlotKey === ""
        ? []
        : igPerSlotKey.split("|").map((entry) => {
            const [slot, fields] = entry.split(":");
            return {
              slot: labelOf(Number(slot)),
              fields: (fields ?? "")
                .split("+")
                .filter(Boolean)
                .map((id) => fieldLabel[id] ?? id),
            };
          });
    if (photos.length === 0 && igTexts.length === 0) return null;
    return { photos, igTexts };
  }, [missingSlotKey, igPerSlotKey, slotLabels, texts]);
}

function FinalizeMissingPopover({
  missing,
  side,
  align = "end",
  triggerClassName,
  children,
}: {
  missing: FinalizeMissing;
  side: "top" | "bottom";
  align?: "start" | "center" | "end";
  /** Clases del wrapper-trigger (el FAB le pasa su posicionamiento fixed). */
  triggerClassName?: string;
  children: React.ReactNode;
}) {
  const texts = useStudioTexts();
  const [open, setOpen] = useState(false);
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-label={texts.lienzo.finalizePopoverAria}
          className={[
            "focus:ring-brand-purple cursor-help focus:ring-2 focus:ring-offset-2 focus:outline-none",
            triggerClassName ?? "inline-flex rounded-md",
          ].join(" ")}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((v) => !v);
            }
          }}
        >
          {children}
        </span>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          aria-label={texts.lienzo.finalizePopoverAria}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="ring-brand-purple/15 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-3 shadow-xl ring-1"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-brand-purple-dark text-xs font-bold">
              {texts.lienzo.finalizePopoverTitulo}
            </p>
            <PopoverPrimitive.Close
              aria-label={texts.comun.cerrar}
              className="text-brand-muted hover:text-brand-purple-dark focus:ring-brand-purple inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors focus:ring-2 focus:outline-none"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </PopoverPrimitive.Close>
          </div>
          {missing.photos.length > 0 && (
            <div className="mt-2">
              <p className="text-brand-muted text-[11px] font-semibold">
                {texts.lienzo.finalizePopoverFotos}
              </p>
              <ul className="mt-1 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                {missing.photos.map((label) => (
                  <li
                    key={label}
                    className="bg-brand-pink/10 text-brand-pink inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold"
                  >
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {missing.igTexts.length > 0 && (
            <div className="mt-2">
              <p className="text-brand-muted text-[11px] font-semibold">
                {texts.lienzo.finalizePopoverTextos}
              </p>
              <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto">
                {missing.igTexts.map((entry) => (
                  <li key={entry.slot} className="text-brand-purple-dark text-[11px] leading-snug">
                    <span className="bg-brand-purple/10 text-brand-purple-dark mr-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold">
                      {entry.slot}
                    </span>
                    {entry.fields.join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <PopoverPrimitive.Arrow className="fill-white" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export function FinalizeButton({
  isFinalizing,
  isPreparing = false,
  canFinalize,
  disabledTooltip,
  missing = null,
  onFinalize,
  variant,
}: {
  isFinalizing: boolean;
  isPreparing?: boolean;
  canFinalize: boolean;
  disabledTooltip?: string;
  /** Fase 1A — detalle de faltantes para el popover (null/undefined = sin popover). */
  missing?: FinalizeMissing | null;
  onFinalize: () => void;
  variant: "inline" | "fab";
}) {
  const texts = useStudioTexts();
  const busy = isFinalizing || isPreparing;
  // Mientras procesa, el nombre audible se mantiene en la acción real (no en
  // el de "bloqueado"): el botón está OCUPADO, no inhabilitado por faltantes.
  const ariaLabel =
    canFinalize || busy
      ? texts.lienzo.finalizeAria
      : (disabledTooltip ?? texts.lienzo.finalizeAriaBloqueado);
  // Texto del estado ocupado: preparando la vista previa o guardando tras
  // confirmar (inline lleva el texto largo; el FAB, el corto compartido).
  const busyText = isPreparing
    ? texts.comun.preparando
    : variant === "fab"
      ? texts.comun.guardando
      : texts.lienzo.finalizeGuardando;
  const label = busy ? (
    <>
      <Loader2
        className={variant === "fab" ? "h-5 w-5 animate-spin" : "h-4 w-4 animate-spin"}
        aria-hidden
      />
      <span>{busyText}</span>
    </>
  ) : (
    <>
      <Sparkles className={variant === "fab" ? "h-5 w-5" : "h-4 w-4"} aria-hidden />
      <span>{texts.lienzo.finalizeBtn}</span>
    </>
  );
  // Fase 1A — el popover solo aparece bloqueado POR FALTANTES (no ocupado) y
  // con detalle disponible. El botón conserva disabled (el popover se abre
  // desde el wrapper: el botón queda pointer-events-none para que el tap/clic
  // caiga en el trigger — un botón disabled no despacha eventos de puntero).
  const showMissing =
    !canFinalize &&
    !busy &&
    missing != null &&
    (missing.photos.length > 0 || missing.igTexts.length > 0);
  const stateClasses = canFinalize
    ? "bg-brand-purple hover:bg-brand-purple-dark text-white"
    : variant === "fab"
      ? "bg-brand-purple/40 cursor-not-allowed text-white shadow-md"
      : "bg-brand-purple/30 cursor-not-allowed text-white";

  if (variant === "fab") {
    const fabBase = [
      "focus:ring-brand-purple inline-flex h-14 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold transition-all focus:ring-2 focus:ring-offset-2 focus:outline-none",
      canFinalize
        ? "bg-brand-purple hover:bg-brand-purple-dark shadow-brand-purple/30 ring-brand-purple/20 text-white shadow-2xl ring-4 hover:scale-105 active:scale-95"
        : stateClasses,
    ].join(" ");
    if (showMissing) {
      // El posicionamiento fixed pasa al WRAPPER (trigger del popover): el
      // ancla de radix necesita la caja posicionada; el botón queda estático
      // dentro y sin eventos de puntero (el tap lo recibe el wrapper).
      return (
        <FinalizeMissingPopover
          missing={missing}
          side="top"
          align="end"
          triggerClassName="fixed right-4 bottom-4 z-30 inline-flex rounded-full sm:hidden"
        >
          <button
            type="button"
            disabled
            title={disabledTooltip}
            aria-label={ariaLabel}
            aria-disabled
            aria-busy={busy}
            tabIndex={-1}
            className={`${fabBase} pointer-events-none w-full`}
          >
            {label}
          </button>
        </FinalizeMissingPopover>
      );
    }
    return (
      <button
        type="button"
        disabled={!canFinalize}
        onClick={onFinalize}
        title={disabledTooltip}
        aria-label={ariaLabel}
        aria-disabled={!canFinalize}
        aria-busy={busy}
        className={`${fabBase} fixed right-4 bottom-4 z-30 sm:hidden`}
      >
        {label}
      </button>
    );
  }

  // Inline (desktop toolbar)
  const inlineBase = [
    "focus:ring-brand-purple inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-all focus:ring-2 focus:ring-offset-2 focus:outline-none",
    canFinalize
      ? "bg-brand-purple hover:bg-brand-purple-dark shadow-brand-purple/20 hover:shadow-brand-purple/30 text-white shadow-md hover:shadow-lg"
      : stateClasses,
  ].join(" ");
  if (showMissing) {
    return (
      <FinalizeMissingPopover missing={missing} side="bottom" align="end">
        <button
          type="button"
          disabled
          title={disabledTooltip}
          aria-label={ariaLabel}
          aria-disabled
          aria-busy={busy}
          tabIndex={-1}
          className={`${inlineBase} pointer-events-none`}
        >
          {label}
        </button>
      </FinalizeMissingPopover>
    );
  }
  return (
    <button
      type="button"
      disabled={!canFinalize}
      onClick={onFinalize}
      title={disabledTooltip}
      aria-label={ariaLabel}
      aria-disabled={!canFinalize}
      aria-busy={busy}
      className={inlineBase}
    >
      {label}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────
//  StudioFinalizeFab — FAB «Vista previa» mobile (montado desde editor)
// ──────────────────────────────────────────────────────────────────
//
// Hijo del editor (no del toolbar) porque debe flotar fuera del header
// sticky. Lee del store los mismos selectores que el toolbar.

export function StudioFinalizeFab({
  store,
  isPreviewBuilding = false,
  finalizeBlockReason = null,
  backOptional = false,
  slotLabels,
  onFinalize,
}: {
  store: StoreApi<StudioStoreState>;
  isPreviewBuilding?: boolean;
  /** Ola 26 — mismo bloqueo extra que el toolbar inline (textos requeridos IG). */
  finalizeBlockReason?: string | null;
  /**
   * Cara B OPCIONAL (2026-09-22, separadores magnéticos 2×6 / 4×4.2 y
   * Alargados): el guard de finalización exige solo las CARAS A (slots pares);
   * las caras B pueden quedar vacías (el reverso sale negro). Solo llega true
   * cuando el producto es de 2 caras y su schema declara backOptional.
   */
  backOptional?: boolean;
  /** Fase 1A — labels por slot para el popover de faltantes (mismas de la grilla). */
  slotLabels?: string[];
  onFinalize: () => void;
}) {
  const isFinalizing = useStore(store, (s) => s.isFinalizing);
  const filled = useStore(store, selectFilledSlotCount);
  const total = useStore(store, selectTotalSlotCount);
  const completeAll = useStore(store, selectIsComplete);
  const missingFaceA = useStore(store, (s) =>
    backOptional ? missingFaceACount(s.canvasData?.slots ?? []) : 0,
  );
  const texts = useStudioTexts();
  const complete = backOptional ? total > 0 && missingFaceA === 0 : completeAll;
  const canFinalize = complete && !finalizeBlockReason && !isFinalizing && !isPreviewBuilding;
  // Fase 1A — mismo detalle de faltantes del toolbar, para la variante móvil.
  const missing = useFinalizeMissing(store, backOptional, slotLabels);
  const disabledTooltip = !complete
    ? fillStudioText(texts.lienzo.finalizeTooltip, {
        n: backOptional ? missingFaceA : total - filled,
      })
    : (finalizeBlockReason ?? undefined);
  return (
    <FinalizeButton
      isFinalizing={isFinalizing}
      isPreparing={isPreviewBuilding}
      canFinalize={canFinalize}
      disabledTooltip={disabledTooltip}
      missing={missing}
      onFinalize={onFinalize}
      variant="fab"
    />
  );
}

// ──────────── Sub-components ────────────

function ProgressBadge({ filled, total }: { filled: number; total: number }) {
  const texts = useStudioTexts();
  const complete = filled === total && total > 0;
  return (
    <span
      role="status"
      aria-live="polite"
      className={[
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums",
        complete
          ? "bg-emerald-100 text-emerald-700"
          : filled === 0
            ? "bg-red-50 text-red-700"
            : "bg-brand-purple/10 text-brand-purple-dark",
      ].join(" ")}
    >
      {complete && <Check className="h-3 w-3" aria-hidden />}
      <span>{fillStudioText(texts.lienzo.progressBadge, { n: filled, total })}</span>
    </span>
  );
}

function AutoSaveIndicator({
  status,
  isFinalizing,
}: {
  status: StudioStoreState["autoSaveStatus"];
  isFinalizing: boolean;
}) {
  const texts = useStudioTexts();
  if (isFinalizing) return null;
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={status.kind}
        initial={{ opacity: 0, y: -2 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -2 }}
        transition={{ duration: 0.15 }}
        className="hidden items-center gap-1 text-xs sm:flex"
      >
        {status.kind === "idle" && (
          <span className="text-brand-muted">{texts.lienzo.autosaveEditando}</span>
        )}
        {status.kind === "saving" && (
          <>
            <Loader2 className="text-brand-muted h-3 w-3 animate-spin" />
            <span className="text-brand-muted">{texts.comun.guardando}</span>
          </>
        )}
        {status.kind === "saved" && (
          <>
            <Check className="h-3 w-3 text-emerald-600" />
            <span className="text-brand-muted">{formatRelative(status.at, texts)}</span>
          </>
        )}
        {status.kind === "error" && (
          <span
            title={status.message}
            className="flex max-w-[300px] items-center gap-1 truncate text-red-600 sm:max-w-[480px]"
            role="alert"
          >
            <AlertCircle className="h-3 w-3 flex-shrink-0" />
            <span className="truncate" title={status.message}>
              {status.message || texts.lienzo.autosaveError}
            </span>
          </span>
        )}
      </motion.span>
    </AnimatePresence>
  );
}

function formatRelative(timestamp: number, texts: ReturnType<typeof useStudioTexts>): string {
  const diffMs = Date.now() - timestamp;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 5) return texts.lienzo.autosaveGuardado;
  if (sec < 60) return fillStudioText(texts.lienzo.autosaveGuardadoS, { n: sec });
  const min = Math.floor(sec / 60);
  return fillStudioText(texts.lienzo.autosaveGuardadoM, { n: min });
}

// ──────────────────────────────────────────────────────────────────
//  FIX-3 — ProductAvatar con fallback al mascote
// ──────────────────────────────────────────────────────────────────
//
// Si el productImageUrl no carga (Unsplash tarda, CSP, red caída) el
// avatar quedaba como cuadrado blanco vacío. Fallback con mascote Lucams.

function ProductAvatar({
  productImageUrl,
  productName,
}: {
  productImageUrl?: string;
  productName: string;
}) {
  const [errored, setErrored] = useState(false);

  // Sin URL → directo al fallback con mascote
  if (!productImageUrl || errored) {
    return (
      <div
        className="ring-brand-purple/15 from-brand-cream to-brand-pink/15 flex h-10 w-10 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br shadow-sm ring-1"
        aria-label={productName}
      >
        <LucamsLogo variant="mascot" size={28} />
      </div>
    );
  }

  return (
    <div className="ring-brand-purple/15 relative h-10 w-10 overflow-hidden rounded-md shadow-sm ring-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={productImageUrl}
        alt={productName}
        className="h-full w-full object-cover"
        onError={() => setErrored(true)}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
//  P0.5 — Chip de tamaño con comparador a objeto cotidiano
// ──────────────────────────────────────────────────────────────────
//
// Click sobre el chip → toggle popover con visual "🍪 como una galleta Oreo".
// Diferenciador "tienda que envidiar": ningún competidor del rubro magnetos lo
// hace, reduce devoluciones por "llegó más chico de lo esperado".

function SizeChipWithComparator({ sizeCm }: { sizeCm: string }) {
  const [open, setOpen] = useState(false);
  const texts = useStudioTexts();
  const comparison = compareSizeToObject(sizeCm);

  if (!comparison) {
    // Sin match — render chip plano sin clickable.
    return (
      <span className="bg-brand-cream text-brand-purple-dark ring-brand-purple/10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1">
        📐 {sizeCm} cm
      </span>
    );
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={fillStudioText(texts.lienzo.tamanoChipAria, { size: sizeCm })}
        className="bg-brand-cream text-brand-purple-dark ring-brand-purple/15 hover:bg-brand-yellow/20 hover:ring-brand-purple/40 focus:ring-brand-turquoise inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 transition-colors focus:ring-2 focus:ring-offset-1 focus:outline-none"
      >
        📐 {sizeCm} cm
        <span className="text-brand-muted text-[9px]">{open ? "▴" : "▾"}</span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop click-to-close */}
            <button
              type="button"
              aria-label={texts.comun.cerrarComparador}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-30 cursor-default"
              tabIndex={-1}
            />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              role="tooltip"
              className="ring-brand-purple/15 absolute top-full left-1/2 z-40 mt-2 w-64 -translate-x-1/2 rounded-xl bg-white p-3 shadow-xl ring-1"
            >
              <div className="flex items-center gap-2">
                <span className="text-3xl leading-none" aria-hidden>
                  {comparison.emoji}
                </span>
                <div className="flex flex-col">
                  <p className="text-brand-purple-dark text-xs leading-tight font-bold">
                    {fillStudioText(texts.lienzo.sizePrefix, { frase: comparison.phrase })}
                  </p>
                  <p className="text-brand-muted mt-0.5 text-[10px]">{comparison.name}</p>
                </div>
              </div>
              {/* FIX-5 — Dimensión explícita ancho × alto para evitar la
                  ambigüedad "7×9 o 9×7". Convención del catálogo: primero
                  ancho, después alto. */}
              <p className="text-brand-muted border-brand-purple/10 mt-2 border-t pt-1.5 text-[10px]">
                <span className="font-bold">{texts.lienzo.sizeMedida}</span> {comparison.humanLabel}
              </p>
              {/* Pico apuntando al chip */}
              <span
                aria-hidden
                className="ring-brand-purple/15 absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-white ring-1"
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </span>
  );
}

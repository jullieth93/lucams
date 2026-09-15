"use client";

/*
 * CopiesQtyInput — stepper "Unidades" en la PDP (regla 2026-09-08b + modelo
 * MULTI-UNIDAD del owner 2026-09-09, regla general).
 *
 * Qué significa "Unidades" según el producto:
 *   - Personalizable (calendario, tiras, sets de letras, nombre): N UNIDADES A
 *     DISEÑAR — cada una se personaliza por separado en el Estudio. Viaja como
 *     ?copies=N (nombre del parámetro conservado por compat) y el Estudio abre
 *     con N unidades; la Vista previa las muestra TODAS; el carrito recibe UNA
 *     línea con el diseño completo (qty 1, precio = variante × N server-side).
 *     Las "copias idénticas" ya no existen en estas superficies.
 *   - Compra directa (sin personalización): N unidades idénticas del producto
 *     — viaja como qty del form (CartItem.qty clásico 1..99).
 *   - HÍBRIDO tiras (PDP_PACK_PLUS_COPIES_SLUGS): convive con la dimensión de
 *     composición "Fotos por tira" del VariantSelector (relabelada para no
 *     chocar) — este stepper son las TIRAS a diseñar.
 *
 * El estado vive en el SelectedVariantProvider (única fuente de verdad del
 * buy-box) para que llegue a AMBAS ramas:
 *   - Compra directa: lo expone como <input type="hidden" name="qty"> dentro
 *     del form de addToCartAction.
 *   - Personalizable: el EstudioCtaLink / NamePricePicker lo llevan al Estudio
 *     como ?copies=N.
 *
 * `max` (default 99, mismo tope de AddToCartSchema): las superficies con tope
 * propio lo pasan desde la página — el Estudio capa slotCount en 50 slots
 * (calendario: 4 sets de 12; tira de 4 fotos: 12 tiras) y los sets de letras
 * en 10 láminas, así que su stepper no promete unidades que el Estudio no
 * puede diseñar.
 *
 * Look & feel copiado del stepper de pack size del VariantSelector
 * (Lucy 2026-07-22): botones redondeados con Minus/Plus y conteo centrado.
 */

import { Minus, Plus } from "lucide-react";
import { formatCOP } from "@/lib/format";
import { useSelectedVariant } from "./variant-actions";

// Mismo rango que AddToCartSchema (min 1, max 99 "Máximo 99 por agregada").
const MIN_COPIES = 1;
const MAX_COPIES = 99;

/**
 * B2 (2026-09-15) — presentación del stepper como PACKS (sets de letras:
 * Abecedario/Vocales). El conteo es "pack/packs" y a la izquierda va el
 * desglose de piezas: "1 pack = abecedario completo (27 fichas)" /
 * "1 pack = 5 vocales". El dato de compra NO cambia (qty/?copies=N).
 */
export type CopiesPackLabel = {
  /** Etiqueta del grupo (hoy siempre "Packs"). */
  label: string;
  /** Piezas que trae 1 pack (vocales: 5; abecedario ES: 27). */
  perPack: number;
  /** Piezas por pack SEGÚN la variante elegida (abecedario: EN 26 / ES 27). */
  perPackByVariantId?: Record<string, number>;
  pieceOne: string;
  pieceMany: string;
  /** Contenido del pack ("abecedario completo") — cuando el pack ES un set. */
  contentOne?: string;
  contentMany?: string;
};

export function CopiesQtyInput({
  max = MAX_COPIES,
  hint = "Cada unidad se diseña por separado en el Estudio",
  unitPriceByVariantId,
  fallbackUnitPrice,
  packLabel,
}: {
  /** Tope del stepper (productos con tope de diseño propio; default 99). */
  max?: number;
  /** Nota bajo el stepper. La compra directa pasa su propio texto
   *  ("Copias idénticas del mismo producto"). */
  hint?: string;
  /**
   * A2 (2026-09-15) — precio unitario VIVO por variante: el total ×N junto al
   * stepper sigue al chip elegido (antes el ×N solo se veía en la modal de
   * vista previa y en el carrito). Llave = variantId.
   */
  unitPriceByVariantId?: Record<string, number>;
  /** Unitario cuando no hay variante elegida (precio del header de la ficha). */
  fallbackUnitPrice?: number;
  /** B2 — modo PACKS (sets de letras). undefined = stepper "Unidades" clásico. */
  packLabel?: CopiesPackLabel;
}) {
  // Estado compartido del buy-box (H12): la compra directa lo lee vía el hidden
  // input de abajo; la rama personalizable lo lee el EstudioCtaLink (?copies=N).
  const { copies, setCopies, selectedId } = useSelectedVariant();
  const clampedMax = Math.max(MIN_COPIES, Math.trunc(max) || MAX_COPIES);
  const canDecrease = copies > MIN_COPIES;
  const canIncrease = copies < clampedMax;

  // A2 — unitario vivo: la variante elegida en el selector manda; sin selección
  // cae al precio visible del header (coherente con lo que ya ve el cliente).
  const unitPrice =
    (selectedId ? unitPriceByVariantId?.[selectedId] : undefined) ?? fallbackUnitPrice ?? null;

  // B2 — desglose del pack: piezas por pack según la variante (idioma) o fijo.
  const perPack = packLabel
    ? ((selectedId ? packLabel.perPackByVariantId?.[selectedId] : undefined) ?? packLabel.perPack)
    : 0;
  const packPieces = copies * perPack;
  const packBreakdown = packLabel
    ? packLabel.contentOne
      ? `${copies} ${copies === 1 ? "pack" : "packs"} = ${
          copies === 1 ? packLabel.contentOne : `${copies} ${packLabel.contentMany}`
        } (${packPieces} ${packPieces === 1 ? packLabel.pieceOne : packLabel.pieceMany})`
      : `${copies} ${copies === 1 ? "pack" : "packs"} = ${packPieces} ${
          packPieces === 1 ? packLabel.pieceOne : packLabel.pieceMany
        }`
    : null;

  const groupLabel = packLabel?.label ?? "Unidades";

  return (
    <div className="mb-3">
      {/* "Unidades" — label unificado 2026-09-08b: en esta ficha no hay otra
        dimensión llamada "Unidades" (la composición del set es fija o, en el
        híbrido tiras, se relabela "Fotos por tira"), así que no hay ambigüedad
        con el pack size de los packs variables. B2 (2026-09-15): los sets de
        letras la etiquetan "Packs" (1 pack = el set completo). */}
      <p className="text-brand-purple-dark/70 mb-2 text-xs font-bold tracking-wider uppercase">
        {groupLabel}
      </p>
      <div
        role="group"
        aria-label={groupLabel}
        className="flex flex-wrap items-center gap-x-3 gap-y-2"
      >
        {/* B2 — desglose a la izquierda del stepper (mismo patrón del stepper
            de packs del VariantSelector). */}
        {packBreakdown && <span className="text-brand-muted text-xs">{packBreakdown}</span>}
        <div className="ring-brand-purple/15 inline-flex items-center rounded-lg bg-white ring-1">
          <button
            type="button"
            aria-label={packLabel ? "Disminuir packs" : "Disminuir unidades"}
            disabled={!canDecrease}
            onClick={() => setCopies(copies - 1)}
            className="text-brand-purple-dark hover:bg-brand-purple/5 focus:ring-brand-turquoise disabled:text-brand-muted flex h-10 w-10 cursor-pointer items-center justify-center rounded-l-lg transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <span
            aria-live="polite"
            className="text-brand-purple-dark min-w-12 text-center text-sm font-bold tabular-nums"
          >
            {packLabel ? `${copies} ${copies === 1 ? "pack" : "packs"}` : copies}
          </span>
          <button
            type="button"
            aria-label={packLabel ? "Aumentar packs" : "Aumentar unidades"}
            disabled={!canIncrease}
            onClick={() => setCopies(Math.min(clampedMax, copies + 1))}
            className="text-brand-purple-dark hover:bg-brand-purple/5 focus:ring-brand-turquoise disabled:text-brand-muted flex h-10 w-10 cursor-pointer items-center justify-center rounded-r-lg transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {/* A2 — total VIVO: unitario × N (mismo formato que la modal de vista
            previa: total grande + "c/u" cuando N > 1). */}
        {unitPrice != null && (
          <span className="flex items-baseline gap-2">
            <span className="text-brand-purple-dark text-lg font-bold tabular-nums">
              {formatCOP(unitPrice * copies)}
            </span>
            {copies > 1 && (
              <span className="text-brand-muted text-xs tabular-nums">
                {formatCOP(unitPrice)} c/u
              </span>
            )}
          </span>
        )}
      </div>
      <p className="text-brand-muted mt-1.5 text-xs">{hint}</p>
      {/* El conteo viaja en el form de addToCartAction como qty (mismo patrón
        del CartVariantIdInput: input oculto controlado por estado compartido).
        En la rama personalizable (sin form) el input es inerte: el valor sale
        por el EstudioCtaLink como ?copies=N. */}
      <input type="hidden" name="qty" value={copies} />
    </div>
  );
}

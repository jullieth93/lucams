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
import { useSelectedVariant } from "./variant-actions";

// Mismo rango que AddToCartSchema (min 1, max 99 "Máximo 99 por agregada").
const MIN_COPIES = 1;
const MAX_COPIES = 99;

export function CopiesQtyInput({
  max = MAX_COPIES,
  hint = "Cada unidad se diseña por separado en el Estudio",
}: {
  /** Tope del stepper (productos con tope de diseño propio; default 99). */
  max?: number;
  /** Nota bajo el stepper. La compra directa pasa su propio texto
   *  ("Copias idénticas del mismo producto"). */
  hint?: string;
}) {
  // Estado compartido del buy-box (H12): la compra directa lo lee vía el hidden
  // input de abajo; la rama personalizable lo lee el EstudioCtaLink (?copies=N).
  const { copies, setCopies } = useSelectedVariant();
  const clampedMax = Math.max(MIN_COPIES, Math.trunc(max) || MAX_COPIES);
  const canDecrease = copies > MIN_COPIES;
  const canIncrease = copies < clampedMax;

  return (
    <div className="mb-3">
      {/* "Unidades" — label unificado 2026-09-08b: en esta ficha no hay otra
        dimensión llamada "Unidades" (la composición del set es fija o, en el
        híbrido tiras, se relabela "Fotos por tira"), así que no hay ambigüedad
        con el pack size de los packs variables. */}
      <p className="text-brand-purple-dark/70 mb-2 text-xs font-bold tracking-wider uppercase">
        Unidades
      </p>
      <div
        role="group"
        aria-label="Unidades"
        className="flex flex-wrap items-center gap-x-3 gap-y-2"
      >
        <div className="ring-brand-purple/15 inline-flex items-center rounded-lg bg-white ring-1">
          <button
            type="button"
            aria-label="Disminuir unidades"
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
            {copies}
          </span>
          <button
            type="button"
            aria-label="Aumentar unidades"
            disabled={!canIncrease}
            onClick={() => setCopies(Math.min(clampedMax, copies + 1))}
            className="text-brand-purple-dark hover:bg-brand-purple/5 focus:ring-brand-turquoise disabled:text-brand-muted flex h-10 w-10 cursor-pointer items-center justify-center rounded-r-lg transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
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

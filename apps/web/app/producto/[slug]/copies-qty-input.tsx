"use client";

/*
 * CopiesQtyInput — stepper "Unidades" (COPIAS de compra) en la PDP, SOLO en
 * productos de composición FIJA (regla 2026-09-08b, Lucy: calendario set 12,
 * abecedario completo, pack vocales, nombre personalizado y toda compra
 * directa).
 *
 * Un producto puede tener dos "cantidades" distintas que NO se deben confundir:
 *   - Pack size: dimensión de variante (quantity/photoSlots — cuántas piezas
 *     trae CADA set; se elige en el VariantSelector, cuyo grupo también se
 *     llama "Unidades"). Es composición del producto, no copias. Los packs de
 *     tamaño variable (fotoimanes/separadores/tiras) llevan SOLO esa.
 *   - Copias: CartItem.qty — cuántas unidades IDÉNTICAS agregar al carrito
 *     (el checkout multiplica y producción imprime "IMPRIMIR N COPIAS").
 *
 * Este stepper cubre lo segundo y NUNCA convive con la primera en la misma
 * ficha (un concepto de cantidad por producto — la página decide cuál).
 * El estado vive en el SelectedVariantProvider (única fuente de verdad del
 * buy-box) para que llegue a AMBAS ramas:
 *   - Compra directa: lo expone como <input type="hidden" name="qty"> dentro
 *     del form de addToCartAction.
 *   - Personalizable: el EstudioCtaLink / NamePricePicker lo llevan al Estudio
 *     como ?copies=N y la modal de confirmación lo confirma tal cual (ya sin
 *     stepper propio — la PDP es la fuente).
 * El tope 1..99 es el mismo de AddToCartSchema y del +/− del carrito.
 *
 * Look & feel copiado del stepper de pack size del VariantSelector
 * (Lucy 2026-07-22): botones redondeados con Minus/Plus y conteo centrado.
 */

import { Minus, Plus } from "lucide-react";
import { useSelectedVariant } from "./variant-actions";

// Mismo rango que AddToCartSchema (min 1, max 99 "Máximo 99 por agregada").
const MIN_COPIES = 1;
const MAX_COPIES = 99;

export function CopiesQtyInput() {
  // Estado compartido del buy-box (H12): la compra directa lo lee vía el hidden
  // input de abajo; la rama personalizable lo lee el EstudioCtaLink (?copies=N).
  const { copies, setCopies } = useSelectedVariant();
  const canDecrease = copies > MIN_COPIES;
  const canIncrease = copies < MAX_COPIES;

  return (
    <div className="mb-3">
      {/* "Unidades" — label unificado 2026-09-08b: en esta ficha no hay otra
        dimensión de cantidad (la composición del set es fija), así que no hay
        ambigüedad con el pack size de los packs variables. */}
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
            onClick={() => setCopies(copies + 1)}
            className="text-brand-purple-dark hover:bg-brand-purple/5 focus:ring-brand-turquoise disabled:text-brand-muted flex h-10 w-10 cursor-pointer items-center justify-center rounded-r-lg transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <p className="text-brand-muted mt-1.5 text-xs">Copias idénticas del mismo producto</p>
      {/* El conteo viaja en el form de addToCartAction como qty (mismo patrón
        del CartVariantIdInput: input oculto controlado por estado compartido).
        En la rama personalizable (sin form) el input es inerte: el valor sale
        por el EstudioCtaLink como ?copies=N. */}
      <input type="hidden" name="qty" value={copies} />
    </div>
  );
}

"use client";

/*
 * CopiesQtyInput — selector de COPIAS (unidades) en la PDP de compra directa.
 *
 * Un producto puede tener dos "cantidades" distintas que NO se deben confundir:
 *   - Tamaño del pack: dimensión de variante (quantity/photoSlots — cuántas
 *     piezas trae CADA unidad; se elige en VariantSelector como chips/stepper
 *     de "Cantidad"). Es composición del producto, no copias.
 *   - Copias: CartItem.qty — cuántas unidades IDÉNTICAS agregar al carrito
 *     (el checkout multiplica y producción imprime "IMPRIMIR N COPIAS").
 *
 * Este stepper cubre lo segundo para la rama de compra directa (productos sin
 * personalización): mantiene el conteo en estado local y lo expone como
 * <input type="hidden" name="qty"> dentro del form de addToCartAction. El
 * tope 1..99 es el mismo de AddToCartSchema y del +/− del carrito.
 *
 * Look & feel copiado del stepper de cantidad del VariantSelector
 * (Lucy 2026-07-22): botones redondeados con Minus/Plus y conteo centrado.
 */

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

// Mismo rango que AddToCartSchema (min 1, max 99 "Máximo 99 por agregada").
const MIN_COPIES = 1;
const MAX_COPIES = 99;

export function CopiesQtyInput() {
  const [copies, setCopies] = useState(MIN_COPIES);
  const canDecrease = copies > MIN_COPIES;
  const canIncrease = copies < MAX_COPIES;

  return (
    <div className="mb-3">
      {/* "Unidades" y NO "Cantidad": esa palabra ya la usan los chips de
        dimensión de pack (ej. abecedario 26/27 letras) y significa
        composición, no copias. */}
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
            onClick={() => setCopies((c) => Math.max(MIN_COPIES, c - 1))}
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
            onClick={() => setCopies((c) => Math.min(MAX_COPIES, c + 1))}
            className="text-brand-purple-dark hover:bg-brand-purple/5 focus:ring-brand-turquoise disabled:text-brand-muted flex h-10 w-10 cursor-pointer items-center justify-center rounded-r-lg transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <p className="text-brand-muted mt-1.5 text-xs">Copias idénticas del mismo producto</p>
      {/* El conteo viaja en el form de addToCartAction como qty (mismo patrón
        del CartVariantIdInput: input oculto controlado por estado local). */}
      <input type="hidden" name="qty" value={copies} />
    </div>
  );
}

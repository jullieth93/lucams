/*
 * Fase 7b — costeo por materiales: roll-up del costo sugerido de fabricación.
 *
 * Función PURA (sin Prisma ni Next) para poder testearla unitario y reusarla
 * en las dos pantallas que la consumen:
 *   - /admin/productos/[id]?section=materiales (panel de receta)
 *   - /admin/costos (columna "Sugerido por materiales" vs Product.cost manual)
 *
 * Regla de negocio: el costo sugerido de UN producto es
 *   Σ (cantidad del insumo por unidad × costo por unidad del insumo)
 * en CENTAVOS COP (mandato CLAUDE.md: dinero siempre Int centavos en DB).
 *
 * Si ALGÚN insumo de la receta no tiene costPerUnit cargado, el total sería
 * una mentira optimista (sumaría menos del costo real) → devolvemos null y la
 * UI muestra "falta costo de insumo" en vez de un número engañoso.
 */

export type RecipeCostItem = {
  /** Unidades del insumo por unidad de producto (Float: metros, ml…). */
  quantity: number;
  /** Centavos COP por unidad del insumo; null = costo no cargado. */
  costPerUnit: number | null;
};

/** Subtotal de UNA fila de receta en centavos; null si el insumo no tiene costo. */
export function computeRecipeLineCost(quantity: number, costPerUnit: number | null): number | null {
  if (costPerUnit === null) return null;
  return Math.round(quantity * costPerUnit);
}

/**
 * Costo sugerido del producto (centavos COP), redondeado al centavo entero.
 * null cuando la receta está vacía o algún insumo no tiene costo cargado.
 */
export function computeRecipeCost(items: readonly RecipeCostItem[]): number | null {
  if (items.length === 0) return null;
  let total = 0;
  for (const item of items) {
    if (item.costPerUnit === null) return null;
    total += item.quantity * item.costPerUnit;
  }
  return Math.round(total);
}

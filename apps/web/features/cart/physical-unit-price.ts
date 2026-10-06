/*
 * Precio por unidad FÍSICA para mostrar en líneas personalizadas multi-unidad
 * (bug STG 2026-10): en ese modelo la línea tiene qty=1 y unitPrice = precio
 * variante × multiplicador de unidades (cart/service.ts ~695-703), o sea el
 * precio del PACK completo. Mostrarlo como "c/u" junto al rótulo "2 unidades"
 * leía "2 × $5.000 = $10.000" cuando el total real de la línea era $5.000.
 *
 * Esto es SOLO presentación: el cálculo de dinero (lineTotal = qty × unitPrice)
 * es correcto y no se toca.
 *
 * ¿Por qué no entra `qty`? El precio por unidad física es
 * (qty × unitPrice) / (qty × designUnits) = unitPrice / designUnits — el qty
 * cancela: la unidad física cuesta lo mismo haya 1 o N packs en la línea.
 */

/**
 * Precio en centavos de UNA unidad física del diseño.
 *
 * Devuelve null cuando unitPrice no es divisible de forma exacta entre las
 * unidades: un "c/u" redondeado podría contradecir el total de línea
 * (p. ej. 2 × $2.500,50 c/u ≠ $5.000,01 si el redondeo cae distinto), así que
 * el caller muestra el precio de la línea SIN el rótulo "c/u". Cuando la
 * división es exacta en centavos, unidades × c/u === lineTotal siempre y el
 * redondeo a pesos de formatCOP es el mismo para ambos lados.
 */
export function physicalUnitPriceCents(
  unitPrice: number,
  designUnits: number | null,
): number | null {
  const units = designUnits ?? 1;
  if (units <= 1) return unitPrice;
  if (unitPrice % units !== 0) return null;
  return unitPrice / units;
}

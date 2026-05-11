/*
 * Helpers de formateo compartidos.
 *
 * Precios en DB siempre en centavos COP (Int) — mandato CLAUDE.md.
 * `formatCOP(450000)` → "$ 4.500" (4500 pesos colombianos).
 */

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatCOP(centavos: number): string {
  return copFormatter.format(centavos / 100);
}

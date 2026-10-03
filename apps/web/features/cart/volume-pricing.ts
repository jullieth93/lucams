/*
 * Precio por volumen (WholesaleTier) — resolución PURA del nivel aplicable.
 *
 * Regla de negocio (aprobada 2026-10-02): el precio por volumen es para TODOS
 * los clientes — sin flag de mayorista, sin login requerido (el checkout
 * soporta invitados y los tiers son descuento por volumen público).
 *
 * `WholesaleTier.unitPrice` es el precio unitario ABSOLUTO del nivel (centavos
 * COP), NO un porcentaje ni un descuento: REEMPLAZA el unitPrice de la línea.
 *
 * Reglas de aplicación (en orden):
 *   1. El precio base de la línea se calcula como siempre
 *      (`variant.price ?? product.basePrice` + multiplicadores por-ficha /
 *      multi-unidad si es personalizado).
 *   2. Precedencia por alcance: si el producto tiene niveles propios activos
 *      (productId = producto), se miran SOLO esos; los globales
 *      (productId = null, "todo el catálogo") aplican únicamente cuando el
 *      producto NO tiene niveles propios — aunque ningún nivel propio alcance
 *      el umbral de la qty actual.
 *   3. Dentro del pool aplicable, gana el nivel con MAYOR `minQty` tal que
 *      `minQty <= qty` de la línea.
 *   4. Nunca subir el precio: si el nivel resultante es más caro (o igual) que
 *      el base calculado, no se aplica (defensa anti-config errónea).
 *
 * Qué es "qty": la cantidad de la LÍNEA del carrito — las unidades que paga el
 * cliente. En diseños multi-unidad (un diseño CONTIENE N piezas, qty=1) la qty
 * cuenta packs/diseños, no las piezas internas: el nivel descuenta sobre el
 * precio unitario final de la línea (ya multiplicado), así que el umbral se
 * evalúa contra lo que el cliente ve en el stepper.
 *
 * Este módulo no toca DB: el service carga los tiers activos (isActive,
 * deletedAt null) con un select acotado y los pasa aquí. El filtro de
 * isActive/deletedAt se repite defensivamente en `resolveVolumeTierPrice` para
 * que el helper sea correcto aunque el caller pase tiers sin filtrar.
 */

export type VolumeTierInput = {
  /** null = nivel global ("todo el catálogo"). */
  productId: string | null;
  minQty: number;
  /** Precio unitario ABSOLUTO del nivel (centavos COP). */
  unitPrice: number;
  isActive: boolean;
  deletedAt: Date | null;
};

/**
 * Precio unitario del nivel aplicable a `qty` unidades de `productId`, o null
 * si ningún nivel alcanza el umbral. Ver reglas en el header del módulo.
 */
export function resolveVolumeTierPrice(
  tiers: readonly VolumeTierInput[],
  productId: string,
  qty: number,
): number | null {
  if (qty < 1) return null;
  const elegibles = tiers.filter((t) => t.isActive && t.deletedAt === null && t.minQty > 0);
  const propios = elegibles.filter((t) => t.productId === productId);
  // Precedencia: niveles propios del producto; si no tiene, los globales.
  const pool = propios.length > 0 ? propios : elegibles.filter((t) => t.productId === null);
  let best: VolumeTierInput | null = null;
  for (const t of pool) {
    if (t.minQty <= qty && (!best || t.minQty > best.minQty)) best = t;
  }
  return best?.unitPrice ?? null;
}

/**
 * unitPrice final de la línea: el nivel aplicable REEMPLAZA el base, pero
 * nunca lo encarece — un nivel más caro que el base es config errónea y se
 * ignora (se cobra el base).
 */
export function applyVolumePricing(
  baseUnitPrice: number,
  tiers: readonly VolumeTierInput[],
  productId: string,
  qty: number,
): number {
  const tierPrice = resolveVolumeTierPrice(tiers, productId, qty);
  if (tierPrice === null || tierPrice >= baseUnitPrice) return baseUnitPrice;
  return tierPrice;
}

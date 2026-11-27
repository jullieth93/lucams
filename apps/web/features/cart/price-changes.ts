/*
 * Tipos y formateo puro de cambios de precio en el carrito al entrar o confirmar
 * el checkout (D-2 · ADR-211).
 *
 * Copy customer-safe en español de Colombia (tuteo estricto, sin IDs internos).
 */

import { formatCOP } from "@/lib/format";

export type CartPriceChange = {
  itemId: string;
  productName: string;
  variantName: string;
  previousUnitPrice: number;
  currentUnitPrice: number;
  qty: number;
};

const MAX_PRICE_NOTICE_LEN = 240;

/**
 * Sanitiza un `priceNotice` proveniente de query string (recorta espacios,
 * descarta vacíos y acota longitud para evitar abuso visual en banners).
 */
export function sanitizePriceNotice(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_PRICE_NOTICE_LEN
    ? `${trimmed.slice(0, MAX_PRICE_NOTICE_LEN - 1)}…`
    : trimmed;
}

/**
 * Construye el aviso visible al comprador cuando una o más líneas del carrito
 * cambiaron respecto a la tarifa vigente del catálogo / escalas mayoristas.
 * Devuelve `null` si no hubo cambios.
 */
export function formatPriceChangesNotice(changes: ReadonlyArray<CartPriceChange>): string | null {
  if (changes.length === 0) return null;
  if (changes.length === 1) {
    const c = changes[0]!;
    return (
      `El precio de «${c.productName}» se actualizó de ${formatCOP(c.previousUnitPrice)} ` +
      `a ${formatCOP(c.currentUnitPrice)} según la tarifa vigente.`
    );
  }
  const summary = changes
    .slice(0, 3)
    .map(
      (c) =>
        `«${c.productName}»: ${formatCOP(c.previousUnitPrice)} → ${formatCOP(c.currentUnitPrice)}`,
    )
    .join("; ");
  const suffix = changes.length > 3 ? ` y ${changes.length - 3} más` : "";
  return `Actualizamos el precio de ${changes.length} productos en tu carrito según la tarifa vigente (${summary}${suffix}).`;
}

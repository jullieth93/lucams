/*
 * Category.visibleFilters → qué filtros muestra /productos en el contexto de
 * una categoría (PLAN_CATALOG_V2 decisión 7.6: lista vacía = todos aplican;
 * no vacía = override manual, mostrar SOLO esos y en ese orden).
 *
 * Vocabulario canónico (snake_case, el que siembra
 * packages/db/scripts/seed-catalog-v2.mjs — ej. ["sub_categoria","precio","ocasion"]):
 *   buscar         → caja de búsqueda del panel
 *   categoria      → árbol de categorías del panel
 *   sub_categoria  → mismo control que "categoria" (el árbol incluye las hijas)
 *   precio         → slider de rango de precios
 *   ocasion        → strip de ocasiones sobre el grid (fuera del panel)
 *   personalizable → checkbox "Personalizable"
 *   descuento      → checkbox "Con descuento"
 *   destacados     → checkbox "Destacados"
 *   orden          → select "Ordenar por"
 */

export const STOREFRONT_FILTER_KEYS = [
  "buscar",
  "categoria",
  "sub_categoria",
  "precio",
  "ocasion",
  "personalizable",
  "descuento",
  "destacados",
  "orden",
] as const;

export type StorefrontFilterKey = (typeof STOREFRONT_FILTER_KEYS)[number];

const KNOWN_KEYS = new Set<string>(STOREFRONT_FILTER_KEYS);

/**
 * Normaliza Category.visibleFilters a la lista ORDENADA y sin duplicados de
 * keys conocidas.
 *
 * - null/[] → null: comportamiento default (todos los filtros).
 * - Keys desconocidas se ignoran; si ninguna es conocida → null (fallback a
 *   todos: una lista mal digitada en DB no debe dejar la página sin filtros).
 */
export function resolveVisibleFilters(
  visibleFilters: string[] | null | undefined,
): StorefrontFilterKey[] | null {
  if (!visibleFilters || visibleFilters.length === 0) return null;
  const resolved: StorefrontFilterKey[] = [];
  for (const raw of visibleFilters) {
    const key = raw.trim().toLowerCase();
    if (KNOWN_KEYS.has(key) && !resolved.includes(key as StorefrontFilterKey)) {
      resolved.push(key as StorefrontFilterKey);
    }
  }
  return resolved.length > 0 ? resolved : null;
}

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

/** Labels es-CO para el admin (/admin/categorias). El orden del objeto sigue
 *  el orden canónico de STOREFRONT_FILTER_KEYS. */
export const STOREFRONT_FILTER_LABELS: Record<StorefrontFilterKey, string> = {
  buscar: "Búsqueda",
  categoria: "Categoría",
  sub_categoria: "Sub-categoría",
  precio: "Precio",
  ocasion: "Ocasión",
  personalizable: "Personalizable",
  descuento: "Descuento",
  destacados: "Destacados",
  orden: "Orden",
};

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

/**
 * Normalización al GUARDAR desde el admin (checkboxes llegan en orden de
 * marcado en el FormData): filtra a keys conocidas y retorna en el orden
 * CANÓNICO de STOREFRONT_FILTER_KEYS — output estable (diffs limpios en DB y
 * el storefront muestra las secciones en un orden predecible). Sin keys
 * conocidas → [] (vacío = todos los filtros, default de la decisión 7.6).
 */
export function toCanonicalVisibleFilters(input: string[]): StorefrontFilterKey[] {
  const picked = new Set(input.map((k) => k.trim().toLowerCase()));
  return STOREFRONT_FILTER_KEYS.filter((k) => picked.has(k));
}

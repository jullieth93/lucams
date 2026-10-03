/*
 * Fase 5 (2026-10-02) — matching puro de `DesignGalleryImage.variantFilter`, el
 * filtro que segrega los diseños prediseñados por ATRIBUTO DE VARIANTE (no solo
 * por producto/tag). Módulo SIN "server-only" para que lo compartan el data
 * layer server (design-gallery.ts), la validación del admin (disenos/actions.ts)
 * y los tests de Vitest sin mocks de DB.
 *
 * Modelo: `variantFilter` es un SUBSET de ProductVariant.attributes
 * (ej. {"sizeCm":"2×6"}). Un diseño con filtro se ofrece en el Estudio solo si
 * los attributes de la variante elegida CONTIENEN ese subset: toda clave del
 * filtro existe en los attributes con el mismo valor (los attributes pueden
 * traer claves extra, no pasa nada). null / filtro vacío = aplica a TODAS las
 * variantes del producto (comportamiento histórico; backfill natural).
 */

/** Filtro normalizado: objeto plano de clave → valor primitivo (string/number/boolean). */
export type VariantFilter = Record<string, string | number | boolean>;

/**
 * Atributos elegibles para el selector "Aplica a" del admin, en orden de
 * prioridad. Se ofrece el PRIMERO que tenga >1 valor distinto entre las
 * variantes activas del producto (con un solo valor el filtro equivaldría a
 * "todas": no aporta). sizeCm manda (es el caso real: separadores 2×6 vs
 * 4×4.2); si el producto no varía por tamaño, cae a color/shape/finish/…
 */
const FILTER_ATTRIBUTE_PRIORITY = [
  "sizeCm",
  "color",
  "shape",
  "finish",
  "size",
  "variantShape",
  "frameStyle",
  "variantStyle",
  "theme",
  "language",
  "magnet",
] as const;

/**
 * Normaliza el Json crudo de DB (o del form del admin) a un VariantFilter:
 * objeto plano con valores primitivos. Claves con valor null/undefined/objeto
 * se descartan; si no queda ninguna clave útil (o la entrada no es un objeto
 * plano), retorna null = "sin filtro" (aplica a todas las variantes) — ante
 * datos dudosos preferimos el comportamiento histórico a esconder el diseño.
 */
export function normalizeVariantFilter(raw: unknown): VariantFilter | null {
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const out: VariantFilter = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      if (value !== "") out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * ¿El diseño con `filter` aplica a una variante con `attributes`? Subset-match:
 * filter null/vacío/inválido → true (sin restricción). Con claves: TODA clave
 * del filtro debe existir en attributes con igualdad estricta de valor. Claves
 * extra en attributes no afectan; una clave del filtro ausente en attributes
 * (o con valor distinto) descarta el diseño para esa variante.
 */
export function matchesVariantFilter(
  filter: unknown,
  attributes: Record<string, unknown> | null | undefined,
): boolean {
  const normalized = normalizeVariantFilter(filter);
  if (!normalized) return true;
  const attrs = attributes ?? {};
  return Object.entries(normalized).every(([key, value]) => attrs[key] === value);
}

/**
 * Validación del admin: el filtro debe ser subset-match de AL MENOS UNA
 * variante activa real del producto (si no, el diseño quedaría inalcanzable en
 * el Estudio: nadie lo vería jamás). filter null → siempre válido.
 */
export function variantFilterMatchesAnyVariant(
  filter: unknown,
  variantsAttributes: Record<string, unknown>[],
): boolean {
  const normalized = normalizeVariantFilter(filter);
  if (!normalized) return true;
  return variantsAttributes.some((attrs) => matchesVariantFilter(normalized, attrs));
}

/**
 * ¿Dos filtros (crudos de DB/form) son el MISMO? Compara normalizados con
 * claves ordenadas: null ≡ filtro vacío/inválido ≡ null ("todas"). La usa el
 * filtro por chips de la grilla del admin (emparejar el variantFilter de cada
 * tarjeta con la opción elegida) sin depender del orden de claves del Json.
 */
export function sameVariantFilter(a: unknown, b: unknown): boolean {
  const na = normalizeVariantFilter(a);
  const nb = normalizeVariantFilter(b);
  if (na === null || nb === null) return na === nb;
  const ka = Object.keys(na).sort();
  const kb = Object.keys(nb).sort();
  return ka.length === kb.length && ka.every((key, i) => key === kb[i] && na[key] === nb[key]);
}

export type VariantFilterOption = {
  /** Clave de atributo elegida para el filtro (ej. "sizeCm"). */
  key: string;
  /** Valor del atributo (ej. "2×6"). */
  value: string | number | boolean;
  /** Label visible en el selector/badge (ej. "2×6", "Con imán"). */
  label: string;
  /** Filtro listo para persistir: { [key]: value }. */
  filter: VariantFilter;
};

/**
 * Opciones del selector "Aplica a" del admin para las variantes de un producto:
 * el primer atributo de FILTER_ATTRIBUTE_PRIORITY con >1 valor distinto, una
 * opción por valor (ordenada). [] = el producto no varía por ningún atributo
 * filtrable → el admin solo verá "Todas las variantes".
 */
export function buildVariantFilterOptions(
  variantsAttributes: Record<string, unknown>[],
): VariantFilterOption[] {
  for (const key of FILTER_ATTRIBUTE_PRIORITY) {
    const values = new Set<string | number | boolean>();
    for (const attrs of variantsAttributes) {
      const v = attrs[key];
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") values.add(v);
    }
    if (values.size <= 1) continue;
    return [...values]
      .sort((a, b) => String(a).localeCompare(String(b), "es", { numeric: true }))
      .map((value) => ({
        key,
        value,
        label: formatFilterValue(key, value),
        filter: { [key]: value },
      }));
  }
  return [];
}

/** Label corto de un valor de filtro (magnet es booleano: se traduce). */
function formatFilterValue(key: string, value: string | number | boolean): string {
  if (key === "magnet" && typeof value === "boolean") return value ? "Con imán" : "Sin imán";
  return String(value);
}

/**
 * Texto del badge del admin para un filtro persistido ("2×6"; multi-clave:
 * "2×6 · Con imán"). null/vacío → "Todas" (aplica a todas las variantes).
 */
export function describeVariantFilter(filter: unknown): string {
  const normalized = normalizeVariantFilter(filter);
  if (!normalized) return "Todas";
  return Object.entries(normalized)
    .map(([key, value]) => formatFilterValue(key, value))
    .join(" · ");
}

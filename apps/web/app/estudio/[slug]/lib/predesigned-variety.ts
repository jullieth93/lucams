/*
 * Paquete A (2026-10-02) — VARIEDAD de diseños prediseñados.
 *
 * Bug raíz: aplicar prediseñados a N slots cargaba N veces el MISMO diseño
 * (aplicar = 1 diseño→1 slot; "aplicar a todas" copiaba 1:1). La regla nueva:
 * al llenar varios slots vacíos con prediseñados se recorre el catálogo del
 * tag asignando diseños DISTINTOS a cada slot; solo cuando se agotan se repite
 * desde el inicio (round-robin). Nunca N slots con el mismo diseño habiendo
 * variedad en el catálogo.
 *
 * Helpers puros (sin deps) → mismos resultados en editor y tests.
 */

/**
 * Devuelve `count` diseños del catálogo en round-robin empezando en
 * `startIndex`: con `count <= items.length` no hay repetidos; al agotarse el
 * catálogo la selección vuelve al inicio. Catálogo vacío → [].
 */
export function roundRobinPredesigned<T>(items: readonly T[], count: number, startIndex = 0): T[] {
  if (items.length === 0 || count <= 0) return [];
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    out.push(items[(startIndex + i) % items.length]!);
  }
  return out;
}

/**
 * Badge de caras de la tarjeta de prediseñado (picker + sidebar):
 *  - null  → producto de 1 cara: sin badge (ruido).
 *  - "two" → producto de 2 caras Y el diseño trae cara B (imageUrlB).
 *  - "one" → producto de 2 caras pero el diseño NO trae cara B: el respaldo
 *            se imprime EN BLANCO (regla única, owner 2026-10-07 — ver faces.ts /
 *            blank-back-face.ts en features/personalization).
 */
export function predesignedFaceBadge(
  facesPerUnit: number | undefined,
  imageUrlB: string | null | undefined,
): "two" | "one" | null {
  if (facesPerUnit !== 2) return null;
  return imageUrlB ? "two" : "one";
}

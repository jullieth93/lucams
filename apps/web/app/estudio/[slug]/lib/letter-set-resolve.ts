/*
 * Ola 2A (Lucy 2026-07-22) — re-resolución de la variante de un set de letras cuando el
 * cliente cambia TEMA/IDIOMA dentro del Estudio (antes eran dimensiones de la PDP).
 * Pura y client-safe: sin imports de servidor → testeable sin mocks.
 *
 * Regla: conservar tamaño (sizeCm) e imantado de la variante actual; buscar en orden
 *   1. tamaño+imán+tema+idioma (exacta)
 *   2. tamaño+imán+idioma
 *   3. tamaño+imán (cualquier tema/idioma — la cotización muestra la línea más cercana)
 *   4. la variante actual (fallback defensivo)
 * El precio no cambia con tema/idioma en el catálogo actual → la línea queda precisa.
 */

/** Variante del producto con los attrs relevantes para re-resolver (tamaño/imán/tema/idioma). */
export type LetterSetVariant = {
  id: string;
  price: number | null;
  sizeCm?: string;
  magnet?: boolean;
  theme?: string;
  language?: string;
};

export function resolveLetterSetVariant(
  variants: LetterSetVariant[],
  currentId: string,
  opts: { theme: string | null; language: "es" | "en" },
): string {
  const current = variants.find((v) => v.id === currentId);
  if (!current) return currentId;
  const sameBuild = variants.filter(
    (v) => v.sizeCm === current.sizeCm && v.magnet === current.magnet,
  );
  const exact = sameBuild.find(
    (v) => (v.theme ?? null) === opts.theme && v.language === opts.language,
  );
  if (exact) return exact.id;
  const byLanguage = sameBuild.find((v) => v.language === opts.language);
  if (byLanguage) return byLanguage.id;
  return sameBuild[0]?.id ?? currentId;
}

/*
 * Rótulo de presentación del nombre de variante en el carrito (2026-10-05).
 *
 * Muchas variantes "sin imán" NO declaran el atributo estructurado
 * `magnet: false` (es opcional en el schema), así que el desglose de
 * describeVariantAttributes no emite "Sin imán (adhesivo)" y el cliente solo
 * ve el nombre libre ("Sin Imán") sin saber que es la versión adhesiva.
 * Regla de PRESENTACIÓN (no se muta data en DB): si el nombre libre indica
 * "sin imán" y el desglose no lo declara ya, se le agrega "(adhesivo)".
 *
 * Módulo PURO (sin server-only ni deps de react) → lo importan client y server.
 */

const SIN_IMAN_RE = /sin\s*im[aá]n/i;

export function variantNameDisplayLabel(variantName: string, breakdown: string[]): string {
  if (!SIN_IMAN_RE.test(variantName)) return variantName;
  // El desglose ya informa el "sin imán" (attrs.magnet === false) → no duplicar.
  if (breakdown.some((part) => SIN_IMAN_RE.test(part))) return variantName;
  return `${variantName} (adhesivo)`;
}

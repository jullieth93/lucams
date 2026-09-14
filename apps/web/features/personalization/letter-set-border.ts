/*
 * Nota de borde de los sets de letras (Abecedario Completo / Pack Vocales) para los resúmenes
 * del pedido (pantalla del pedido, carrito, checkout).
 *
 * Es una OPCIÓN DE DISEÑO que vive en `Design.metadata.withBorder` (Lucy 2026-09-05), no un
 * atributo de variante: el precio es el mismo con o sin borde y el PNG de producción ya la
 * refleja. Este helper solo traduce el metadata a una línea de texto.
 *
 * Default retrocompatible: los diseños guardados antes de la opción no traen la clave y se
 * tratan como CON borde (lo que siempre se imprimió). Solo metadata de set de letras
 * (`surface: "letterset"`) produce nota; cualquier otro diseño devuelve null.
 */

/** "Con borde" / "Sin borde" para un metadata de set de letras; null si no aplica. */
export function letterSetBorderNote(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  if (m.surface !== "letterset") return null;
  return m.withBorder === false ? "Sin borde" : "Con borde";
}

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
 *
 * Multi-set (ADR-157, 2026-10-22): el borde es POR SET (`metadata.units[k].withBorder`);
 * la clave raíz solo representa al set 0. Con varios sets la nota se resuelve sobre el
 * array: todos iguales → "Con borde" / "Sin borde" como siempre; mixtos → texto
 * generalista ("Borde: varía por set") — el detalle por set lo da el rótulo de cada
 * página del "Ver" paginado (designPreviewPageLabels).
 */

/** "Con borde" / "Sin borde" para un metadata de set de letras; null si no aplica. */
export function letterSetBorderNote(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  if (m.surface !== "letterset") return null;
  if (Array.isArray(m.units) && m.units.length > 1) {
    const borders = m.units.map((u) =>
      !u || typeof u !== "object" ? true : (u as { withBorder?: unknown }).withBorder !== false,
    );
    if (borders.every(Boolean)) return "Con borde";
    if (borders.every((b) => !b)) return "Sin borde";
    return "Borde: varía por set";
  }
  return m.withBorder === false ? "Sin borde" : "Con borde";
}

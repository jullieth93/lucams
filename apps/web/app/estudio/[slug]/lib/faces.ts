/*
 * Ola 3 (Lucy 2026-07-22) — CARAS por unidad física (separadores de libros 2 caras).
 *
 * El separador real es una tira doblada a la mitad: cada unidad física tiene 2 caras
 * con imagen propia (pueden ser la misma o distintas). Convención única del Estudio
 * y de producción (la misma para el canvas, el render y el frente 3D):
 *
 *   slotCount = unidades × facesPerUnit
 *   slot 2k   = unidad k · CARA A
 *   slot 2k+1 = unidad k · CARA B
 *
 * Helpers puros (sin deps) → mismos resultados en editor, tests y reportes.
 */

/** Total de slots de diseño para `units` unidades físicas. */
export function effectiveSlotCount(units: number, facesPerUnit: number | undefined): number {
  return units * (facesPerUnit === 2 ? 2 : 1);
}

/** Índice de unidad física (0-based) dueña de un slot. */
export function unitIndexOfSlot(slotIndex: number, facesPerUnit: number | undefined): number {
  return facesPerUnit === 2 ? Math.floor(slotIndex / 2) : slotIndex;
}

/** Cara del slot dentro de su unidad ("A" | "B"). Con 1 cara siempre "A". */
export function faceOfSlot(slotIndex: number, facesPerUnit: number | undefined): "A" | "B" {
  return facesPerUnit === 2 && slotIndex % 2 === 1 ? "B" : "A";
}

/**
 * Etiquetas compactas por slot para el grid agrupado: ["1A","1B","2A","2B",…].
 * Con 1 cara devuelve undefined (los productos normales usan su propio etiquetado).
 */
export function faceSlotLabels(
  units: number,
  facesPerUnit: number | undefined,
): string[] | undefined {
  if (facesPerUnit !== 2) return undefined;
  const labels: string[] = [];
  for (let u = 0; u < units; u++) labels.push(`${u + 1}A`, `${u + 1}B`);
  return labels;
}

/** Par de slots (cara A + cara B) de una unidad, para componer la tira desplegada. */
export function facePairOfUnit(unitIndex: number): { faceA: number; faceB: number } {
  return { faceA: unitIndex * 2, faceB: unitIndex * 2 + 1 };
}

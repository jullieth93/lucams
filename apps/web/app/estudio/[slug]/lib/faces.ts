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

/**
 * Cara B OPCIONAL (backOptional, 2026-09-22): faltantes de CARA A (slots
 * pares) — el guard de finalización exige solo las caras A; las B pueden
 * quedar vacías (el reverso sale negro en producción/preview). Productos
 * sin backOptional siguen exigiendo TODAS las caras (no usar este helper).
 */
export function missingFaceACount(
  slots: ReadonlyArray<{ slotIndex: number; assetUrl?: string | null }>,
): number {
  let n = 0;
  for (const s of slots) if (s.slotIndex % 2 === 0 && !s.assetUrl) n++;
  return n;
}

/**
 * Tamaño de la tira DESPLEGADA de un separador 2 caras a partir del sizeCm de
 * la CARA ("2×6" → "2×12"): el doblez parte la dimensión larga, así que al
 * desplegar se duplica la mayor y se conserva la menor. null si no parsea.
 * Separadores noFold (Alargados): NO hay despliegue — no usar este helper.
 */
export function deployedSizeCm(sizeCm: string | undefined): string | null {
  if (!sizeCm) return null;
  const m = sizeCm.match(/(\d+(?:[.,]\d+)?)\s*[×x]\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  const a = parseFloat(m[1]!.replace(",", "."));
  const b = parseFloat(m[2]!.replace(",", "."));
  const fmt = (n: number) => {
    const r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? String(r) : String(r);
  };
  return `${fmt(Math.min(a, b))}×${fmt(2 * Math.max(a, b))}`;
}

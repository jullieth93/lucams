/*
 * Resolución server-side de la variante de un pack desde el diseño guardado (ADR-209).
 *
 * Con el modelo unificado, cada `(sizeCm, magnet)` tiene UNA variante física base
 * (`1 unidad` en separadores o `1 pack de 6` en fotoimanes). Si un borrador o
 * recompra histórico traía un múltiplo (`photoSlots = 18` o `photoSlots = 3`) y
 * en el catálogo ya solo existe la variante base única de ese tamaño/imán, la
 * resolución cae de forma determinista a esa variante base (y el servidor cobra
 * el multiplicador exacto vía `designUnitPriceMultiplier`).
 */

import { parseVariantAttributes } from "./variant-schemas";

/** Variante del catálogo con los attrs relevantes para resolver un pack. */
export type PhotoPackVariant = {
  id: string;
  price: number | null;
  stock: number;
  attributes: unknown;
};

/** Datos de diseño que el Estudio persiste en canvasData V2 (raíz). */
export type PhotoPackDesignInfo = {
  photoSlots: number;
  sizeCm?: string;
  magnet?: boolean;
};

export function readPhotoPackDesignInfo(canvasData: unknown): PhotoPackDesignInfo | null {
  if (!canvasData || typeof canvasData !== "object") return null;
  const cd = canvasData as {
    version?: unknown;
    photoSlots?: unknown;
    sizeCm?: unknown;
    magnet?: unknown;
  };
  if (cd.version !== 2) return null;
  if (typeof cd.photoSlots !== "number" || !Number.isInteger(cd.photoSlots)) return null;
  const photoSlots = Math.min(60, Math.max(1, cd.photoSlots));
  const sizeCm = typeof cd.sizeCm === "string" && cd.sizeCm.length > 0 ? cd.sizeCm : undefined;
  const magnet = typeof cd.magnet === "boolean" ? cd.magnet : undefined;
  return { photoSlots, ...(sizeCm ? { sizeCm } : {}), ...(magnet !== undefined ? { magnet } : {}) };
}

function filterByMagnet<T extends PhotoPackVariant>(
  candidates: ReadonlyArray<T>,
  magnet?: boolean,
): T[] {
  if (
    candidates.length > 1 &&
    candidates.some((v) => parseVariantAttributes(v.attributes).magnet !== undefined)
  ) {
    const want = magnet ?? true;
    const byMagnet = candidates.filter((v) => parseVariantAttributes(v.attributes).magnet === want);
    if (byMagnet.length > 0) return [...byMagnet];
  }
  return [...candidates];
}

export function resolvePhotoPackVariant<T extends PhotoPackVariant>(
  variants: ReadonlyArray<T>,
  info: PhotoPackDesignInfo,
): T | null {
  // 1) Coincidencia exacta por photoSlots (+ sizeCm + magnet)
  let exact = variants.filter((v) => {
    const attrs = parseVariantAttributes(v.attributes);
    return attrs.photoSlots === info.photoSlots;
  });
  if (info.sizeCm !== undefined) {
    exact = exact.filter((v) => parseVariantAttributes(v.attributes).sizeCm === info.sizeCm);
  }
  if (exact.length > 0) {
    exact = filterByMagnet(exact, info.magnet);
    if (info.sizeCm !== undefined) return exact[0] ?? null;
    return exact.length === 1 ? exact[0]! : null;
  }

  // 2) Fallback ADR-209 (catálogo unificado a 1 unidad/pack base por tamaño × imán):
  //    aplica SOLO cuando para ese tamaño/imán existe un único photoSlots base en
  //    el catálogo y el diseño pide un múltiplo entero de esa base (borradores o
  //    recompras previos a la desactivación de variantes 2..6 / 2..4 packs).
  let bySize = variants.filter((v) => parseVariantAttributes(v.attributes).photoSlots != null);
  if (info.sizeCm !== undefined) {
    bySize = bySize.filter((v) => parseVariantAttributes(v.attributes).sizeCm === info.sizeCm);
  } else {
    const distinctSizes = new Set(
      bySize.map((v) => parseVariantAttributes(v.attributes).sizeCm ?? ""),
    );
    if (distinctSizes.size > 1) return null;
  }
  if (bySize.length === 0) return null;
  bySize = filterByMagnet(bySize, info.magnet);

  const distinctBaseSlots = new Set(
    bySize.map((v) => parseVariantAttributes(v.attributes).photoSlots!),
  );
  if (distinctBaseSlots.size !== 1) return null;

  const baseSlots = [...distinctBaseSlots][0]!;
  if (baseSlots <= 0 || info.photoSlots < baseSlots || info.photoSlots % baseSlots !== 0) {
    return null;
  }
  return info.sizeCm !== undefined ? (bySize[0] ?? null) : bySize.length === 1 ? bySize[0]! : null;
}

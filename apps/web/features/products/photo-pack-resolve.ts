/*
 * Lucy 2026-09-05 — "las fotos se eligen en el Estudio": resolución de la
 * variante de un pack de fotoimanes desde el DISEÑO guardado, no desde un
 * variantId que manda el cliente.
 *
 * Flujo: el Estudio persiste `photoSlots` (fotos por imán) y `sizeCm` en el
 * canvasData V2 del Design (auto-guardado). Al agregar al carrito SIN variantId,
 * el servidor (features/cart/service.ts → addPersonalizedToCart) lee esos campos
 * del canvasData de la DB y resuelve la variante exacta del catálogo. El precio
 * y el stock salen SIEMPRE de la variante resuelta server-side — la ruta del
 * dinero no confía en el cliente.
 *
 * Puro y client-safe (sin imports de servidor) → testeable sin mocks. Patrón:
 * lib/letter-set-resolve.ts del Estudio.
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
};

/**
 * Lee la info de pack persisteda en un canvasData V2 cualquiera (como viene de
 * la DB: Prisma Json). null si el diseño no declara photoSlots en la raíz
 * (diseños legacy de antes del control de N fotos, u otros kinds) → el caller
 * mantiene su fallback histórico (primera variante).
 *
 * No valida contra el catálogo: eso lo hace resolvePhotoPackVariant. Acá solo
 * se extrae con shape defensivo (cualquier Json viejo/raro no debe explotar).
 */
export function readPhotoPackDesignInfo(canvasData: unknown): PhotoPackDesignInfo | null {
  if (!canvasData || typeof canvasData !== "object") return null;
  const cd = canvasData as { version?: unknown; photoSlots?: unknown; sizeCm?: unknown };
  if (cd.version !== 2) return null;
  if (typeof cd.photoSlots !== "number" || !Number.isInteger(cd.photoSlots)) return null;
  const photoSlots = Math.min(50, Math.max(1, cd.photoSlots));
  const sizeCm = typeof cd.sizeCm === "string" && cd.sizeCm.length > 0 ? cd.sizeCm : undefined;
  return sizeCm ? { photoSlots, sizeCm } : { photoSlots };
}

/**
 * Resuelve la variante exacta del catálogo para (photoSlots [, sizeCm]):
 *   1. candidatas = variantes con attrs.photoSlots === photoSlots
 *   2. si hay sizeCm → entre las candidatas, la de attrs.sizeCm === sizeCm
 *   3. si NO hay sizeCm → la única candidata (si hay exactamente 1; si el
 *      catálogo repite ese photoSlots en varios tamaños es ambiguo → null)
 * Devuelve null cuando no hay variante exacta: el caller decide el error
 * (el carrito mapea eso a NO_DEFAULT_VARIANT — mensaje claro al cliente).
 *
 * No filtra por stock acá: el stock se evalúa después sobre la variante
 * resuelta (STOCK_UNAVAILABLE), igual que el resto del carrito.
 */
export function resolvePhotoPackVariant<T extends PhotoPackVariant>(
  variants: ReadonlyArray<T>,
  info: PhotoPackDesignInfo,
): T | null {
  const candidates = variants.filter((v) => {
    const attrs = parseVariantAttributes(v.attributes);
    return attrs.photoSlots === info.photoSlots;
  });
  if (candidates.length === 0) return null;
  if (info.sizeCm !== undefined) {
    return (
      candidates.find((v) => parseVariantAttributes(v.attributes).sizeCm === info.sizeCm) ?? null
    );
  }
  return candidates.length === 1 ? candidates[0] : null;
}

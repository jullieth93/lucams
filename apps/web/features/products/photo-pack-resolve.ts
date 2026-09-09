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
 * Lucy 2026-09-08 — "¿Con imán?" en los packs: el canvasData también persiste
 * `magnet` (la elección Con/Sin imán de la PDP) y la resolución la incluye, así
 * el par Con/Sin imán del catálogo NO vuelve ambiguo el match (misma combinación
 * photoSlots+sizeCm existe en las dos versiones). Diseños sin la clave (legacy)
 * resuelven a Con imán — lo que el producto siempre fue.
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
  /** Elección "¿Con imán?" de la PDP (2026-09-08). Ausente = legacy → Con imán. */
  magnet?: boolean;
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
  const cd = canvasData as {
    version?: unknown;
    photoSlots?: unknown;
    sizeCm?: unknown;
    magnet?: unknown;
  };
  if (cd.version !== 2) return null;
  if (typeof cd.photoSlots !== "number" || !Number.isInteger(cd.photoSlots)) return null;
  const photoSlots = Math.min(50, Math.max(1, cd.photoSlots));
  const sizeCm = typeof cd.sizeCm === "string" && cd.sizeCm.length > 0 ? cd.sizeCm : undefined;
  const magnet = typeof cd.magnet === "boolean" ? cd.magnet : undefined;
  return { photoSlots, ...(sizeCm ? { sizeCm } : {}), ...(magnet !== undefined ? { magnet } : {}) };
}

/**
 * Resuelve la variante exacta del catálogo para (photoSlots [, sizeCm] [, magnet]):
 *   1. candidatas = variantes con attrs.photoSlots === photoSlots
 *   2. si hay sizeCm → entre las candidatas, las de attrs.sizeCm === sizeCm
 *   3. "¿Con imán?" (2026-09-08): si las candidatas declaran la dimensión `magnet`
 *      (par Con/Sin imán del seed), se filtra por ella — el diseño sin la clave
 *      (legacy) quiere Con imán, que es lo que el producto siempre fue. Si el
 *      catálogo NO la declara, este paso no filtra nada (compat con ambientes
 *      donde el seed aún no corrió).
 *   4. si NO hay sizeCm → la única candidata (si hay exactamente 1; si el
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
  let candidates = variants.filter((v) => {
    const attrs = parseVariantAttributes(v.attributes);
    return attrs.photoSlots === info.photoSlots;
  });
  if (candidates.length === 0) return null;
  if (info.sizeCm !== undefined) {
    candidates = candidates.filter(
      (v) => parseVariantAttributes(v.attributes).sizeCm === info.sizeCm,
    );
    if (candidates.length === 0) return null;
  }
  // "¿Con imán?" — solo discrimina cuando el catálogo declara la dimensión en
  // las candidatas; sin el filtro, el par Con/Sin imán haría ambiguo el match.
  if (
    candidates.length > 1 &&
    candidates.some((v) => parseVariantAttributes(v.attributes).magnet !== undefined)
  ) {
    const want = info.magnet ?? true; // diseño legacy (sin la clave) = Con imán
    const byMagnet = candidates.filter((v) => parseVariantAttributes(v.attributes).magnet === want);
    if (byMagnet.length > 0) candidates = byMagnet;
  }
  if (info.sizeCm !== undefined) return candidates[0] ?? null;
  return candidates.length === 1 ? candidates[0] : null;
}

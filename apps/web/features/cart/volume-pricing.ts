/*
 * Precio por volumen (WholesaleTier) — resolución PURA del nivel aplicable.
 *
 * Regla de negocio (aprobada 2026-10-02): el precio por volumen es para TODOS
 * los clientes — sin flag de mayorista, sin login requerido (el checkout
 * soporta invitados y los tiers son descuento por volumen público).
 *
 * `WholesaleTier.unitPrice` es el precio unitario ABSOLUTO del nivel (centavos
 * COP), NO un porcentaje ni un descuento: REEMPLAZA el unitPrice de la línea.
 *
 * Reglas de aplicación (en orden):
 *   1. El precio base de la línea se calcula como siempre
 *      (`variant.price ?? product.basePrice` + multiplicadores por-ficha /
 *      multi-unidad si es personalizado).
 *   2. Precedencia por alcance: si el producto tiene niveles propios activos
 *      (productId = producto), se miran SOLO esos; los globales
 *      (productId = null, "todo el catálogo") aplican únicamente cuando el
 *      producto NO tiene niveles propios — aunque ningún nivel propio alcance
 *      el umbral de la qty actual.
 *   3. Dentro del pool aplicable, gana el nivel con MAYOR `minQty` tal que
 *      `minQty <= qty` de la línea.
 *   4. Nunca subir el precio: si el nivel resultante es más caro (o igual) que
 *      el base calculado, no se aplica (defensa anti-config errónea).
 *
 * Qué es "qty": la cantidad de la LÍNEA del carrito — las unidades que paga el
 * cliente. En diseños multi-unidad (un diseño CONTIENE N piezas, qty=1) la qty
 * cuenta packs/diseños, no las piezas internas: el nivel descuenta sobre el
 * precio unitario final de la línea (ya multiplicado), así que el umbral se
 * evalúa contra lo que el cliente ve en el stepper.
 *
 * Este módulo no toca DB: el service carga los tiers activos (isActive,
 * deletedAt null) con un select acotado y los pasa aquí. El filtro de
 * isActive/deletedAt se repite defensivamente en `resolveVolumeTierPrice` para
 * que el helper sea correcto aunque el caller pase tiers sin filtrar.
 */

import {
  parseVariantAttributes,
  PHOTO_PACK_UNITS_PER_PACK,
} from "@/features/products/variant-schemas";

export type VolumeTierInput = {
  /** null = nivel global ("todo el catálogo"). */
  productId: string | null;
  minQty: number;
  /** Precio unitario ABSOLUTO del nivel (centavos COP). */
  unitPrice: number;
  isActive: boolean;
  deletedAt: Date | null;
};

/**
 * Precio unitario del nivel aplicable a `qty` unidades de `productId`, o null
 * si ningún nivel alcanza el umbral. Ver reglas en el header del módulo.
 */
export function resolveVolumeTierPrice(
  tiers: readonly VolumeTierInput[],
  productId: string,
  qty: number,
): number | null {
  if (qty < 1) return null;
  const elegibles = tiers.filter((t) => t.isActive && t.deletedAt === null && t.minQty > 0);
  const propios = elegibles.filter((t) => t.productId === productId);
  // Precedencia: niveles propios del producto; si no tiene, los globales.
  const pool = propios.length > 0 ? propios : elegibles.filter((t) => t.productId === null);
  let best: VolumeTierInput | null = null;
  for (const t of pool) {
    if (t.minQty <= qty && (!best || t.minQty > best.minQty)) best = t;
  }
  return best?.unitPrice ?? null;
}

/**
 * unitPrice final de la línea: el nivel aplicable REEMPLAZA el base, pero
 * nunca lo encarece — un nivel más caro que el base es config errónea y se
 * ignora (se cobra el base).
 */
export function applyVolumePricing(
  baseUnitPrice: number,
  tiers: readonly VolumeTierInput[],
  productId: string,
  qty: number,
  physicalUnitMultiplier = 1,
): number {
  const multiplier = Math.max(1, Math.trunc(physicalUnitMultiplier) || 1);
  if (multiplier === 1) {
    const tierPrice = resolveVolumeTierPrice(tiers, productId, qty);
    if (tierPrice === null || tierPrice >= baseUnitPrice) return baseUnitPrice;
    return tierPrice;
  }
  const basePerPhysicalUnit = baseUnitPrice / multiplier;
  const tierPrice = resolveVolumeTierPrice(tiers, productId, qty * multiplier);
  if (tierPrice === null || tierPrice >= basePerPhysicalUnit) return baseUnitPrice;
  return tierPrice * multiplier;
}

export type VisibleVolumeTier = {
  minQty: number;
  unitPrice: number;
  savingsPct: number;
};
/**
 * Unitario con descuento por volumen para un conteo dado, sobre una escala YA
 * resuelta/visible (resolveVisibleVolumeTiers — precedencia y niveles que no
 * rebajan ya filtrados). Misma regla del servidor: gana el nivel con MAYOR
 * minQty ≤ qty y nunca sube el precio. Lo usan los totales VIVOS del cliente
 * (stepper de la PDP, modal de confirmación del Estudio) para que el precio
 * mostrado sea el que el carrito cobrará (bug owner 2026-11-07 — la bola
 * mostraba múltiplos de $10.000 con la promo 3×$27.000 / 5×$40.000 activa).
 */
export function unitPriceWithVolumeTier(
  baseUnitPrice: number,
  qty: number,
  tiers?: readonly Pick<VisibleVolumeTier, "minQty" | "unitPrice">[],
): number {
  if (!tiers?.length || qty < 1) return baseUnitPrice;
  let best: number | null = null;
  let bestMinQty = 0;
  for (const t of tiers) {
    if (t.minQty <= qty && t.minQty > bestMinQty) {
      best = t.unitPrice;
      bestMinQty = t.minQty;
    }
  }
  return best !== null && best < baseUnitPrice ? best : baseUnitPrice;
}

/**
 * Escala efectiva de descuentos por volumen para exhibir en la PDP ([CX-01]):
 *  - Respeta exactamente la misma precedencia (niveles propios del producto > globales).
 *  - Excluye niveles >= `baseUnitPrice` (nunca anuncia un "descuento" que no rebaja).
 *  - Si un umbral mayor está mal configurado con precio igual o más caro que un umbral
 *    menor ya activo, se omite para no prometer una escala incoherente.
 */
export function resolveVisibleVolumeTiers(
  tiers: readonly VolumeTierInput[],
  productId: string,
  baseUnitPrice: number,
): VisibleVolumeTier[] {
  if (baseUnitPrice <= 0) return [];
  const elegibles = tiers.filter((t) => t.isActive && t.deletedAt === null && t.minQty > 0);
  const propios = elegibles.filter((t) => t.productId === productId);
  const pool = propios.length > 0 ? propios : elegibles.filter((t) => t.productId === null);
  const sorted = [...pool].sort((a, b) => a.minQty - b.minQty || a.unitPrice - b.unitPrice);

  const out: VisibleVolumeTier[] = [];
  let runningCeiling = baseUnitPrice;
  let lastMinQty = -1;
  for (const t of sorted) {
    if (t.minQty === lastMinQty) continue;
    lastMinQty = t.minQty;
    if (t.unitPrice < runningCeiling && t.unitPrice >= 0) {
      const savingsPct = Math.max(
        1,
        Math.round(((baseUnitPrice - t.unitPrice) / baseUnitPrice) * 100),
      );
      out.push({ minQty: t.minQty, unitPrice: t.unitPrice, savingsPct });
      runningCeiling = t.unitPrice;
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// Packs de fotoimanes (ADR-101) — escala DERIVADA de las presentaciones
// (owner 2026-11-10): familias como Polaroid/Cuadrados venden por packs (1
// pack = 6 unidades) y su descuento vive en el PRECIO DE LA VARIANTE (y/o su
// compareAt de promo), no en WholesaleTier. Para que la PDP muestre el MISMO
// bloque «Ahorra llevando más» de los productos con tiers reales, derivamos la
// escala de las variantes: una entrada por presentación con ahorro real
// (unitario por pack que baja al subir de pack, o promo compareAt de esa
// opción). Sin ahorro real (precio lineal sin promo) no se muestra nada —
// anunciar «ahorro» donde no lo hay sería publicidad engañosa (Ley 1480).
// ──────────────────────────────────────────────────────────────────────────────

export type PackVolumeTier = {
  /** Número de packs de la presentación (1, 2, 3…). */
  packs: number;
  /** Precio TOTAL de la presentación (centavos COP). */
  totalPrice: number;
  /** Precio por pack (centavos COP). */
  packPrice: number;
  /** % de ahorro: el MAYOR entre la baja del precio por pack vs la presentación base y la promo (compareAt) de la opción. 0 si no hay ahorro real. */
  savingsPct: number;
};

export type PackVolumeTierGroup = {
  /** Clave del grupo (sizeCm + magnet) — la PDP la cruza con la variante elegida. */
  key: string;
  sizeCm: string | null;
  magnet: boolean | null;
  tiers: PackVolumeTier[];
};

type PackTierVariantInput = {
  price: number | null;
  compareAtPrice?: number | null;
  attributes: unknown;
};

/** Clave de grupo (tamaño × imán) de una variante pack — la misma que usa derivePackVolumeTiers. */
export function packVolumeTierGroupKey(attributes: unknown): string {
  const attrs = parseVariantAttributes(attributes);
  const sizeCm = typeof attrs.sizeCm === "string" ? attrs.sizeCm : null;
  const magnet = typeof attrs.magnet === "boolean" ? attrs.magnet : null;
  return `${sizeCm ?? ""}|${magnet ?? ""}`;
}

/**
 * Escala de presentaciones con ahorro para productos vendidos por packs de
 * unidades sueltas (variants con `photoSlots`). Agrupa por tamaño × imán,
 * ordena por photoSlots y calcula el ahorro de cada presentación. Entran solo
 * las presentaciones con ahorro ≥ 1 % (baja real del precio por pack al subir
 * de presentación o promo compareAt propia).
 */
export function derivePackVolumeTiers(
  variants: readonly PackTierVariantInput[],
  basePrice: number,
): PackVolumeTierGroup[] {
  type Entry = { photoSlots: number; totalPrice: number; compareAt: number | null };
  const groups = new Map<
    string,
    { sizeCm: string | null; magnet: boolean | null; list: Entry[] }
  >();
  for (const v of variants) {
    const attrs = parseVariantAttributes(v.attributes);
    const photoSlots = attrs.photoSlots;
    if (typeof photoSlots !== "number" || photoSlots <= 0) continue;
    const sizeCm = typeof attrs.sizeCm === "string" ? attrs.sizeCm : null;
    const magnet = typeof attrs.magnet === "boolean" ? attrs.magnet : null;
    const key = packVolumeTierGroupKey(v.attributes);
    const totalPrice = v.price ?? basePrice;
    const compareAt =
      v.compareAtPrice != null && v.compareAtPrice > totalPrice ? v.compareAtPrice : null;
    const group = groups.get(key) ?? { sizeCm, magnet, list: [] };
    group.list.push({ photoSlots, totalPrice, compareAt });
    groups.set(key, group);
  }

  const out: PackVolumeTierGroup[] = [];
  for (const [key, group] of groups) {
    const sorted = [...group.list].sort((a, b) => a.photoSlots - b.photoSlots);
    const packSize = sorted[0]?.photoSlots ?? 0;
    const baseEntry = sorted[0];
    if (packSize <= 0 || !baseEntry) continue;
    // Solo familias con semántica de PACK (unidades sueltas de a 6, ADR-101):
    // las tiras photobooth (3/4 fotos por tira) NO son packs — su photoSlots
    // cuenta fotos por tira y la etiqueta "packs" sería engañosa.
    if (packSize % PHOTO_PACK_UNITS_PER_PACK !== 0) continue;
    const basePackPrice = baseEntry.totalPrice; // la presentación mínima = 1 pack
    const tiers: PackVolumeTier[] = [];
    for (const entry of sorted) {
      const packs = entry.photoSlots / packSize;
      if (!Number.isInteger(packs) || packs < 1) continue;
      const packPrice = Math.round(entry.totalPrice / packs);
      const volumePct =
        packs > 1 && basePackPrice > 0 ? ((basePackPrice - packPrice) / basePackPrice) * 100 : 0;
      const promoPct =
        entry.compareAt !== null && entry.compareAt > 0
          ? ((entry.compareAt - entry.totalPrice) / entry.compareAt) * 100
          : 0;
      const savingsPct = Math.max(0, Math.round(Math.max(volumePct, promoPct)));
      if (savingsPct < 1) continue; // nunca anunciar «ahorro» sin rebaja real
      tiers.push({ packs, totalPrice: entry.totalPrice, packPrice, savingsPct });
    }
    if (tiers.length > 0) out.push({ key, sizeCm: group.sizeCm, magnet: group.magnet, tiers });
  }
  return out;
}

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
// Escala DERIVADA de las presentaciones (owner 2026-11-10/11): familias por
// packs (Polaroid/Cuadrados, ADR-101) y por cantidad (separadores) llevan su
// descuento por volumen en el PRECIO DE LA VARIANTE, no en WholesaleTier. Para
// que la PDP muestre el MISMO bloque «Ahorra llevando más» de los productos con
// tiers reales, derivamos la escala de las variantes.
//
// REGLA DE HONESTIDAD (owner): el bloque reporta ÚNICAMENTE ahorro por VOLUMEN
// (precio por unidad que baja al llevar más). La promo (compareAt) NUNCA entra
// al bloque — ella se muestra como precio tachado por presentación. Son dos
// mecanismos con dos visuales, sin mezcla. Sin ahorro por volumen real no se
// muestra nada (anunciarlo sería publicidad engañosa, Ley 1480).
// ──────────────────────────────────────────────────────────────────────────────

export type PackVolumeTier = {
  /** Unidades de la presentación (packs de 6 o cantidad de piezas). */
  units: number;
  /** Precio TOTAL de la presentación (centavos COP). */
  totalPrice: number;
  /** Precio por unidad (pack o pieza) de la presentación (centavos COP). */
  unitPrice: number;
  /** % de ahorro por volumen vs la presentación base del grupo. */
  savingsPct: number;
};

export type PackVolumeTierGroup = {
  /** Clave del grupo (sizeCm + magnet) — la PDP la cruza con la variante elegida. */
  key: string;
  sizeCm: string | null;
  magnet: boolean | null;
  /** Sustantivo de la unidad para las etiquetas: packs de 6 o piezas sueltas. */
  noun: "pack" | "unidad";
  tiers: PackVolumeTier[];
};

type PackTierVariantInput = {
  price: number | null;
  compareAtPrice?: number | null;
  attributes: unknown;
};

/** Clave de grupo (tamaño × imán × modo) de una variante — la misma que usa derivePackVolumeTiers. */
export function packVolumeTierGroupKey(attributes: unknown): string {
  const attrs = parseVariantAttributes(attributes);
  const sizeCm = typeof attrs.sizeCm === "string" ? attrs.sizeCm : null;
  const magnet = typeof attrs.magnet === "boolean" ? attrs.magnet : null;
  const photoSlots = typeof attrs.photoSlots === "number" ? attrs.photoSlots : null;
  const mode = photoSlots !== null && photoSlots >= PHOTO_PACK_UNITS_PER_PACK ? "pack" : "unidad";
  return `${sizeCm ?? ""}|${magnet ?? ""}|${mode}`;
}

/**
 * Escala de presentaciones con ahorro por VOLUMEN, derivada de las variantes:
 *  - Modo pack: variants con `photoSlots` múltiplo de PHOTO_PACK_UNITS_PER_PACK
 *    (6) — polaroid/cuadrados. La presentación mínima = 1 pack.
 *  - Modo cantidad: variants con `quantity` (separadores 1-6, recordatorios).
 * Agrupa por tamaño × imán y entra cada presentación cuyo precio por unidad
 * baja ≥ 1 % frente a la presentación base del grupo.
 */
export function derivePackVolumeTiers(
  variants: readonly PackTierVariantInput[],
  basePrice: number,
): PackVolumeTierGroup[] {
  type Entry = { units: number; totalPrice: number };
  const groups = new Map<
    string,
    { sizeCm: string | null; magnet: boolean | null; noun: "pack" | "unidad"; list: Entry[] }
  >();
  for (const v of variants) {
    const attrs = parseVariantAttributes(v.attributes);
    const photoSlots = typeof attrs.photoSlots === "number" ? attrs.photoSlots : null;
    const quantity = typeof attrs.quantity === "number" ? attrs.quantity : null;
    const sizeCm = typeof attrs.sizeCm === "string" ? attrs.sizeCm : null;
    const magnet = typeof attrs.magnet === "boolean" ? attrs.magnet : null;
    const key = packVolumeTierGroupKey(v.attributes);
    const totalPrice = v.price ?? basePrice;

    if (photoSlots !== null && photoSlots >= PHOTO_PACK_UNITS_PER_PACK) {
      // Modo pack: solo familias con semántica de PACK (unidades sueltas de a
      // 6). Las tiras photobooth (3/4 fotos por tira) NO son packs — su
      // photoSlots cuenta fotos por tira y la etiqueta "packs" sería engañosa.
      const group = groups.get(key) ?? { sizeCm, magnet, noun: "pack" as const, list: [] };
      group.list.push({ units: photoSlots / PHOTO_PACK_UNITS_PER_PACK, totalPrice });
      groups.set(key, group);
    } else if (quantity !== null && quantity > 0) {
      const group = groups.get(key) ?? { sizeCm, magnet, noun: "unidad" as const, list: [] };
      group.list.push({ units: quantity, totalPrice });
      groups.set(key, group);
    }
  }

  const out: PackVolumeTierGroup[] = [];
  for (const [key, group] of groups) {
    if (group.list.length < 2) continue; // sin escala que comparar
    const sorted = [...group.list].sort((a, b) => a.units - b.units);
    const baseEntry = sorted[0]!;
    if (baseEntry.units <= 0 || baseEntry.totalPrice <= 0) continue;
    const baseUnitPrice = baseEntry.totalPrice / baseEntry.units;
    const tiers: PackVolumeTier[] = [];
    for (const entry of sorted) {
      if (!Number.isInteger(entry.units)) continue;
      const unitPrice = Math.round(entry.totalPrice / entry.units);
      const savingsPct = Math.max(
        0,
        Math.round(((baseUnitPrice - unitPrice) / baseUnitPrice) * 100),
      );
      if (savingsPct < 1) continue; // nunca anunciar «ahorro» sin rebaja real
      tiers.push({ units: entry.units, totalPrice: entry.totalPrice, unitPrice, savingsPct });
    }
    if (tiers.length > 0) {
      out.push({ key, sizeCm: group.sizeCm, magnet: group.magnet, noun: group.noun, tiers });
    }
  }
  return out;
}

export type WholesaleTierScaleViolation =
  | { kind: "ABOVE_OR_EQUAL_BASE"; referencePrice: number }
  | { kind: "INVERTED_HIGHER_QTY"; conflictMinQty: number; conflictUnitPrice: number }
  | { kind: "INVERTED_LOWER_QTY"; conflictMinQty: number; conflictUnitPrice: number };

/**
 * Valida coherencia económica de un nivel mayorista candidato (creación, edición
 * o reactivación):
 *  1. Si aplica a un producto específico con `referencePrice > 0`, `unitPrice`
 *     DEBE ser estrictamente menor que `referencePrice` (un "descuento" mayorista
 *     nunca puede igualar ni superar el precio de venta regular).
 *  2. Si el nivel estará activo (`willBeActive`), la escala frente a los niveles
 *     hermanos activos del mismo alcance debe ser estrictamente decreciente:
 *     mayor `minQty` ⇒ menor `unitPrice`. Esto evita divergencia entre la PDP
 *     (`resolveVisibleVolumeTiers`) y el carrito (`resolveVolumeTierPrice`).
 */
export function validateWholesaleTierCandidate(opts: {
  minQty: number;
  unitPrice: number;
  willBeActive: boolean;
  referencePrice: number | null;
  activeSiblings: ReadonlyArray<{ minQty: number; unitPrice: number }>;
}): WholesaleTierScaleViolation | null {
  const { minQty, unitPrice, willBeActive, referencePrice, activeSiblings } = opts;

  if (referencePrice !== null && referencePrice > 0 && unitPrice >= referencePrice) {
    return { kind: "ABOVE_OR_EQUAL_BASE", referencePrice };
  }

  if (!willBeActive) return null;

  const sorted = [...activeSiblings].sort((a, b) => a.minQty - b.minQty);
  for (const s of sorted) {
    if (s.minQty < minQty && unitPrice >= s.unitPrice) {
      return {
        kind: "INVERTED_HIGHER_QTY",
        conflictMinQty: s.minQty,
        conflictUnitPrice: s.unitPrice,
      };
    }
    if (s.minQty > minQty && unitPrice <= s.unitPrice) {
      return {
        kind: "INVERTED_LOWER_QTY",
        conflictMinQty: s.minQty,
        conflictUnitPrice: s.unitPrice,
      };
    }
  }

  return null;
}

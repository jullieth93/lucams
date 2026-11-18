/*
 * Precio por volumen (WholesaleTier) — resolución PURA del nivel aplicable (ADR-209).
 *
 * Reglas de aplicación (en orden):
 *   1. El precio base de la unidad comercial se calcula desde la variante activa
 *      (`variant.price ?? product.basePrice`). En diseños multi-unidad la tanda
 *      aporta `physicalUnitMultiplier` (`designUnits`) unidades comerciales.
 *   2. Precedencia estricta por alcance:
 *      - Primero niveles activos de la OPCIÓN específica (`variantId === selectedVariantId`).
 *      - Si la opción no tiene niveles propios, niveles del PRODUCTO (`productId === product.id && variantId === null`).
 *      - Si el producto tampoco tiene niveles propios, niveles GLOBALES (`productId === null && variantId === null`).
 *   3. Solo niveles con `minQty >= 2` (1 unidad conserva siempre su precio base público y de feeds).
 *   4. Dentro del pool aplicable, gana el nivel con MAYOR `minQty` tal que `minQty <= totalUnits`.
 *   5. Nunca subir el precio: si el nivel resultante es mayor o igual al base unitario, se ignora.
 */

export type VolumeTierInput = {
  /** null = nivel global ("todo el catálogo"). */
  productId: string | null;
  /** null/undefined = aplica a todas las opciones del producto (o global). */
  variantId?: string | null;
  minQty: number;
  /** Precio unitario ABSOLUTO del nivel (centavos COP por unidad comercial). */
  unitPrice: number;
  isActive: boolean;
  deletedAt: Date | null;
};

function selectApplicablePool(
  tiers: readonly VolumeTierInput[],
  productId: string,
  variantId?: string | null,
): VolumeTierInput[] {
  const elegibles = tiers.filter((t) => t.isActive && t.deletedAt === null && t.minQty >= 2);
  if (variantId) {
    const porVariante = elegibles.filter(
      (t) => t.productId === productId && (t.variantId ?? null) === variantId,
    );
    if (porVariante.length > 0) return porVariante;
  }
  const porProducto = elegibles.filter(
    (t) => t.productId === productId && (t.variantId ?? null) === null,
  );
  if (porProducto.length > 0) return porProducto;
  return elegibles.filter((t) => t.productId === null && (t.variantId ?? null) === null);
}

/**
 * Precio unitario del nivel aplicable a `qty` unidades comerciales de `(productId, variantId)`,
 * o null si ningún nivel alcanza el umbral.
 */
export function resolveVolumeTierPrice(
  tiers: readonly VolumeTierInput[],
  productId: string,
  qty: number,
  variantId?: string | null,
): number | null {
  if (qty < 2) return null;
  const pool = selectApplicablePool(tiers, productId, variantId);
  let best: VolumeTierInput | null = null;
  for (const t of pool) {
    if (t.minQty <= qty && (!best || t.minQty > best.minQty)) best = t;
  }
  return best?.unitPrice ?? null;
}

/**
 * unitPrice final de la línea: el nivel aplicable REEMPLAZA el base de la unidad
 * comercial (multiplicado por las unidades de la tanda si `physicalUnitMultiplier > 1`),
 * evaluando el umbral contra `qty * physicalUnitMultiplier` (la tanda completa),
 * pero nunca encarece el precio base.
 */
export function applyVolumePricing(
  baseUnitPrice: number,
  tiers: readonly VolumeTierInput[],
  productId: string,
  qty: number,
  physicalUnitMultiplier = 1,
  variantId?: string | null,
): number {
  const multiplier = Math.max(1, Math.trunc(physicalUnitMultiplier) || 1);
  if (multiplier === 1) {
    const tierPrice = resolveVolumeTierPrice(tiers, productId, qty, variantId);
    if (tierPrice === null || tierPrice >= baseUnitPrice) return baseUnitPrice;
    return tierPrice;
  }
  const basePerCommercialUnit = baseUnitPrice / multiplier;
  const tierPrice = resolveVolumeTierPrice(tiers, productId, qty * multiplier, variantId);
  if (tierPrice === null || tierPrice >= basePerCommercialUnit) return baseUnitPrice;
  return tierPrice * multiplier;
}

export type VisibleVolumeTier = {
  minQty: number;
  unitPrice: number;
  savingsPct: number;
};

/**
 * Unitario con descuento por volumen para un conteo dado, sobre una escala YA
 * resuelta/visible (`resolveVisibleVolumeTiers`). Lo usan los totales vivos del
 * cliente (stepper de la PDP y modal de confirmación del Estudio).
 */
export function unitPriceWithVolumeTier(
  baseUnitPrice: number,
  qty: number,
  tiers?: readonly Pick<VisibleVolumeTier, "minQty" | "unitPrice">[],
): number {
  if (!tiers?.length || qty < 2) return baseUnitPrice;
  let best: number | null = null;
  let bestMinQty = 0;
  for (const t of tiers) {
    if (t.minQty >= 2 && t.minQty <= qty && t.minQty > bestMinQty) {
      best = t.unitPrice;
      bestMinQty = t.minQty;
    }
  }
  return best !== null && best < baseUnitPrice ? best : baseUnitPrice;
}

/**
 * Escala efectiva de descuentos por volumen para exhibir en la PDP ([CX-01], ADR-209):
 *  - Respeta precedencia `opción (variantId) > producto (productId) > global (null)`.
 *  - Excluye niveles que superen el tope del selector del producto (`maxQty`) para
 *    jamás prometer en la ficha escalas que el selector no permite elegir.
 *  - Excluye niveles >= `baseUnitPrice` (nunca anuncia un "descuento" que no rebaja).
 *  - Omite niveles mal configurados no decrecientes para no prometer una escala incoherente.
 */
export function resolveVisibleVolumeTiers(
  tiers: readonly VolumeTierInput[],
  productId: string,
  baseUnitPrice: number,
  variantId?: string | null,
  maxQty?: number | null,
): VisibleVolumeTier[] {
  if (baseUnitPrice <= 0) return [];
  const pool = selectApplicablePool(tiers, productId, variantId);
  const maxAllowed =
    typeof maxQty === "number" && Number.isInteger(maxQty) && maxQty >= 2 ? maxQty : null;
  const sorted = [...pool]
    .filter((t) => (maxAllowed !== null ? t.minQty <= maxAllowed : true))
    .sort((a, b) => a.minQty - b.minQty || a.unitPrice - b.unitPrice);

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

/**
 * Etiqueta de cantidad para un tramo de volumen (ADR-209):
 * cuando `minQty` coincide exactamente con el tope del selector (`maxQty`), omite el
 * signo `+` (ej. `"6 packs"` o `"15 unid."` en vez de `"6+"` / `"15+"`).
 */
export function formatVolumeTierQtyLabel(
  minQty: number,
  opts?: { maxQty?: number | null; isPack?: boolean; unitLabel?: string },
): string {
  const atCap = typeof opts?.maxQty === "number" && opts.maxQty >= 2 && minQty >= opts.maxQty;
  const suffix = opts?.unitLabel ?? (opts?.isPack ? "packs" : "unid.");
  return `${minQty}${atCap ? "" : "+"} ${suffix}`;
}

export type WholesaleTierScaleViolation =
  | { kind: "EXCEEDS_MAX_UNITS"; maxAllowedQty: number }
  | { kind: "ABOVE_OR_EQUAL_BASE"; referencePrice: number }
  | { kind: "INVERTED_HIGHER_QTY"; conflictMinQty: number; conflictUnitPrice: number }
  | { kind: "INVERTED_LOWER_QTY"; conflictMinQty: number; conflictUnitPrice: number };

/**
 * Valida coherencia económica y de límites de un nivel mayorista candidato (creación,
 * edición o reactivación) contra el tope del selector (`maxAllowedQty`), el precio de
 * referencia de su alcance (opción o producto) y los hermanos activos del mismo alcance.
 */
export function validateWholesaleTierCandidate(opts: {
  minQty: number;
  unitPrice: number;
  willBeActive: boolean;
  referencePrice: number | null;
  activeSiblings: ReadonlyArray<{ minQty: number; unitPrice: number }>;
  maxAllowedQty?: number | null;
}): WholesaleTierScaleViolation | null {
  const { minQty, unitPrice, willBeActive, referencePrice, activeSiblings, maxAllowedQty } = opts;

  if (
    typeof maxAllowedQty === "number" &&
    Number.isInteger(maxAllowedQty) &&
    maxAllowedQty >= 2 &&
    minQty > maxAllowedQty
  ) {
    return { kind: "EXCEEDS_MAX_UNITS", maxAllowedQty };
  }

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

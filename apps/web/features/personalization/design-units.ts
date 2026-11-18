/*
 * Modelo MULTI-UNIDAD del Estudio y topes canónicos de compra directa (ADR-209).
 *
 * "Unidades" = N unidades comerciales del producto diseñadas por separado en una
 * misma tanda del Estudio (`1..15` piezas sueltas/tiras/separadores/bolas, `1..6`
 * packs de 6 fotoimanes, `1..4` calendarios de 12 meses, `1..10` sets de letras).
 *
 * En Vista Previa y en `/carrito`, el cliente puede multiplicar su tanda por
 * `qty` («Copias iguales de esta tanda») siempre que el total físico de la línea
 * no supere `MAX_SELF_SERVICE_PHYSICAL_UNITS` (`100` unidades; `16 packs = 96`
 * imanes en packs de 6).
 *
 * Módulo PURO (sin server-only, sin Prisma): lo usan el editor (client), el
 * carrito, los pedidos, las métricas y el spec de producción (server).
 */

/** Shape mínima que leen estos helpers (compatible con el Json de Prisma). */
export type DesignUnitsShape = {
  version?: unknown;
  slotCount?: unknown;
  unitCount?: unknown;
  unitSlots?: unknown;
  photoSlots?: unknown;
  slots?: unknown;
};

const intOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : null;

function positiveInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

/** ¿El canvasData es V2 y declara el modelo multi-unidad? */
export function declaresUnits(canvasData: unknown): boolean {
  if (!canvasData || typeof canvasData !== "object") return false;
  const cd = canvasData as DesignUnitsShape;
  return cd.version === 2 && intOrNull(cd.unitSlots) !== null;
}

/**
 * Slots de diseño por unidad física. Si el diseño no los declara (legacy), se
 * deriva: con unitCount declarado, reparte slotCount; si no, toda la pila de
 * slots es UNA unidad (comportamiento pre-ola).
 */
export function unitSlotsOf(canvasData: unknown, slotCountFallback = 1): number {
  const cd = (canvasData ?? {}) as DesignUnitsShape;
  const declared = intOrNull(cd.unitSlots);
  if (declared !== null) return declared;
  const slotCount = intOrNull(cd.slotCount) ?? slotCountFallback;
  const unitCount = intOrNull(cd.unitCount);
  if (unitCount !== null && unitCount > 1) {
    return Math.max(1, Math.round(slotCount / unitCount));
  }
  return Math.max(1, slotCount);
}

/** Unidades comerciales dentro del diseño (≥ 1). Ausente = 1 (legacy). */
export function unitCountOf(canvasData: unknown, variantPhotoSlots?: number | null): number {
  const cd = (canvasData ?? {}) as DesignUnitsShape;
  const declared = intOrNull(cd.unitCount);
  if (declared !== null) return declared;
  const slotCount = intOrNull(cd.slotCount) ?? 1;
  const unitSlots = intOrNull(cd.unitSlots);
  if (unitSlots !== null && unitSlots > 0 && unitSlots < slotCount) {
    return Math.ceil(slotCount / unitSlots);
  }
  const vSlots = positiveInt(variantPhotoSlots);
  if (
    cd.version === 2 &&
    vSlots === 6 &&
    slotCount > 6 &&
    slotCount % 6 === 0 &&
    slotCount <= MAX_PHOTO_PACK_DESIGN_UNITS * 6 &&
    (!Array.isArray(cd.slots) || cd.slots.length === slotCount)
  ) {
    return slotCount / 6;
  }
  return 1;
}

/**
 * Unidades comerciales reales que contiene un diseño para MOSTRAR en UI/correos/admin.
 *
 * Lee primero el canvas (`unitCountOf`); como fallback usa `metadata.unitCount`
 * (escrito en finalize y en sets de letras). Devuelve null cuando no hay diseño.
 */
export function designDisplayUnits(
  design: { canvasData?: unknown; metadata?: unknown } | null | undefined,
  variantPhotoSlots?: number | null,
): number | null {
  if (!design) return null;
  const fromCanvas = unitCountOf(design.canvasData, variantPhotoSlots);
  if (fromCanvas > 1) return fromCanvas;
  const meta = design.metadata as { unitCount?: unknown } | null | undefined;
  const n = meta && typeof meta === "object" ? meta.unitCount : undefined;
  if (typeof n === "number" && Number.isInteger(n) && n >= 1) return n;
  return fromCanvas;
}

/** Índice de unidad (0-based) dueña de un slot. */
export function unitIndexOfSlot(slotIndex: number, unitSlots: number): number {
  return Math.floor(slotIndex / Math.max(1, unitSlots));
}

/** Rango [start, end) de slotIndex de una unidad dentro del array plano. */
export function unitSlotRange(
  unitIndex: number,
  unitSlots: number,
): { start: number; end: number } {
  const start = unitIndex * Math.max(1, unitSlots);
  return { start, end: start + Math.max(1, unitSlots) };
}

/**
 * Cuántos slots describe `gridLayout`: con el modelo multi-unidad activo
 * (unitCount > 1, unitSlots > 1) y FUERA del modo de caras agrupadas
 * (separadores, que ya apilan tarjetas-unidad), el layout describe la grilla
 * de UNA unidad (unitSlots); en cualquier otro caso, el diseño completo
 * (slotCount) — retrocompatible con diseños de una sola unidad.
 */
export function gridSlotCountForLayout(opts: {
  unitCount: number;
  unitSlots: number;
  slotCount: number;
  facesPerUnit?: number;
}): number {
  const multiUnit = opts.unitCount > 1 && opts.facesPerUnit !== 2;
  return multiUnit ? opts.unitSlots : opts.slotCount;
}

/**
 * Fotos por unidad física según el producto/plantilla (para construir el
 * modelo en el editor):
 *   - calendario mes-a-mes → photoSlots (12 tarjetas por calendario).
 *   - separadores / bola dúplex (facesPerUnit=2) → 1 foto por cara.
 *   - tira photobooth (plantilla gridCols=1/gridGap=0) → photoSlots por tira.
 *   - packs de 6 fotoimanes (photoSlots múltiplo de 6) → photoSlots por pack (6).
 *   - resto → 1: cada pieza es su propia unidad.
 */
export function photosPerUnitForEditor(opts: {
  isCalendarMonth: boolean;
  facesPerUnit: number;
  photoSlots: number;
  unitTemplate: unknown;
  isPackOfSix?: boolean;
}): number {
  if (opts.isCalendarMonth) return Math.max(1, opts.photoSlots);
  if (opts.facesPerUnit === 2) return 1;
  if (opts.isPackOfSix) return Math.max(1, opts.photoSlots);
  const tpl = opts.unitTemplate as { gridCols?: unknown; gridGap?: unknown } | null;
  const isStrip = tpl?.gridCols === 1 && tpl?.gridGap === 0;
  if (isStrip) return Math.max(1, opts.photoSlots);
  return 1;
}

/** Tope técnico de lienzos en un mismo diseño (cubre 15 tiras × 4 fotos = 60). */
export const MAX_DESIGN_SLOTS = 60;
/** Tope general de diseños distintos en una tanda de Estudio (ADR-209). */
export const MAX_DESIGN_UNITS = 15;
/** Tope en calendarios de 12 meses (4 × 12 = 48 <= CALENDAR_PAGE_CACHE_LIMIT). */
export const MAX_CALENDAR_DESIGN_UNITS = 4;
/** Tope en packs de 6 fotoimanes (6 packs × 6 = 36 fotos por tanda). */
export const MAX_PHOTO_PACK_DESIGN_UNITS = 6;
/** Tope de sets de letras por diseño (un PNG por ficha vía RenderJob — ADR-188). */
export const MAX_LETTER_SET_UNITS = 10;
/** Tope máximo de unidades físicas por línea en compra directa antes de B2B. */
export const MAX_SELF_SERVICE_PHYSICAL_UNITS = 100;

export function maxUnitsForProduct(
  unitSlots: number,
  opts?: { isCalendar?: boolean; isPackOfSix?: boolean; isLetterSet?: boolean },
): number {
  if (opts?.isLetterSet) return MAX_LETTER_SET_UNITS;
  const normalizedSlots = Math.max(1, Math.trunc(unitSlots) || 1);
  if (opts?.isCalendar || normalizedSlots === 12) return MAX_CALENDAR_DESIGN_UNITS;
  if (opts?.isPackOfSix || normalizedSlots === 6) return MAX_PHOTO_PACK_DESIGN_UNITS;
  return Math.min(MAX_DESIGN_UNITS, Math.max(1, Math.floor(MAX_DESIGN_SLOTS / normalizedSlots)));
}

/**
 * Tope exacto del selector de unidades en la PDP y en `/admin/mayorista` (ADR-209):
 * ninguna escala mayorista puede exigir una cantidad mínima superior a las unidades
 * que el selector del producto/opción permite escoger directamente (`15` unid. en
 * separadores/bola/mini-libros/tiras/nombre, `6` packs en fotoimanes Polaroid/Cuadrados,
 * `4` sets en calendario, `10` packs en sets de letras y `100` en stock físico directo).
 */
export function maxSelectorUnitsForProduct(opts: {
  slug?: string | null;
  personalizationKind?: string | null;
  personalizationSchema?: unknown;
  variantAttrs?: unknown;
  allVariantsAttrs?: readonly unknown[];
}): { maxUnits: number; unitSingular: string; unitPlural: string; isPack: boolean } {
  const schema = (opts.personalizationSchema ?? {}) as Record<string, unknown>;
  const vAttrs = (opts.variantAttrs ?? {}) as Record<string, unknown>;
  const allAttrs = (opts.allVariantsAttrs ?? [vAttrs]).map(
    (a) => (a ?? {}) as Record<string, unknown>,
  );

  const letterSet = schema.letterSet;
  if (letterSet === "full" || letterSet === "vowels") {
    return {
      maxUnits: MAX_LETTER_SET_UNITS,
      unitSingular: "pack",
      unitPlural: "packs",
      isPack: true,
    };
  }

  const isNamePerTile =
    vAttrs.variant === "name" || allAttrs.some((attrs) => attrs.variant === "name");
  if (isNamePerTile) {
    return {
      maxUnits: MAX_DESIGN_UNITS,
      unitSingular: "unidad",
      unitPlural: "unidades",
      isPack: false,
    };
  }

  const kind = opts.personalizationKind ?? "NONE";
  if (kind === "CALENDAR_PHOTO_MONTH") {
    return {
      maxUnits: MAX_CALENDAR_DESIGN_UNITS,
      unitSingular: "set",
      unitPlural: "sets",
      isPack: false,
    };
  }

  const facesPerUnit = positiveInt(vAttrs.facesPerUnit) ?? positiveInt(schema.facesPerUnit) ?? 1;
  const variantPhotoSlots = positiveInt(vAttrs.photoSlots);
  const schemaPhotoSlots = positiveInt(schema.photoSlots);
  const effectivePhotoSlots = variantPhotoSlots ?? schemaPhotoSlots ?? 1;
  const isPackOfSix =
    opts.slug === "set-fotoimanes-polaroid" ||
    opts.slug === "set-fotoimanes-cuadrados" ||
    (kind !== "NONE" &&
      facesPerUnit !== 2 &&
      schema.freeUnitDesign !== true &&
      effectivePhotoSlots === 6);

  if (isPackOfSix) {
    return {
      maxUnits: MAX_PHOTO_PACK_DESIGN_UNITS,
      unitSingular: "pack",
      unitPlural: "packs",
      isPack: true,
    };
  }

  if (kind !== "NONE") {
    const unitSlots = facesPerUnit === 2 ? 2 : Math.max(1, effectivePhotoSlots);
    return {
      maxUnits: maxUnitsForProduct(unitSlots),
      unitSingular: "unidad",
      unitPlural: "unidades",
      isPack: false,
    };
  }

  return {
    maxUnits: MAX_SELF_SERVICE_PHYSICAL_UNITS,
    unitSingular: "unidad",
    unitPlural: "unidades",
    isPack: false,
  };
}

/**
 * Piezas físicas para el tope de compra directa (100) que aporta 1 unidad comercial:
 * - En packs de 6 fotoimanes: 6 imanes por pack → máx. 16 packs (96 imanes).
 * - En el resto de familias: 1 unidad comercial (separador, tira, bola, calendario, set).
 */
export function capPiecesPerCommercialUnit(opts: {
  isPackOfSix?: boolean;
  variantAttrs?: unknown;
  productSlug?: string | null;
}): number {
  if (opts.isPackOfSix) return 6;
  if (
    opts.productSlug === "set-fotoimanes-polaroid" ||
    opts.productSlug === "set-fotoimanes-cuadrados"
  ) {
    return 6;
  }
  const attrs = (opts.variantAttrs ?? {}) as Record<string, unknown>;
  const photoSlots = positiveInt(attrs.photoSlots);
  if (photoSlots !== null && photoSlots >= 6 && photoSlots % 6 === 0) {
    return 6;
  }
  return 1;
}

/** Máximo de copias (`qty`) permitidas en Vista Previa y Carrito para una tanda. */
export function maxCopiesForDesignUnits(designUnits: number, piecesPerCommercialUnit = 1): number {
  const units = Math.max(1, Math.trunc(designUnits) || 1);
  const perUnit = Math.max(1, Math.trunc(piecesPerCommercialUnit) || 1);
  return Math.max(1, Math.floor(MAX_SELF_SERVICE_PHYSICAL_UNITS / (units * perUnit)));
}

/** Total de piezas físicas contra el tope de 100 en compra directa. */
export function linePhysicalUnitsForCap(opts: {
  qty: number;
  designUnits?: number;
  piecesPerCommercialUnit?: number;
}): number {
  const qty = Math.max(0, Math.trunc(opts.qty) || 0);
  const units = Math.max(1, Math.trunc(opts.designUnits ?? 1) || 1);
  const perUnit = Math.max(1, Math.trunc(opts.piecesPerCommercialUnit ?? 1) || 1);
  return qty * units * perUnit;
}

/**
 * Multiplicador del precio de variante por las unidades del diseño (ruta del dinero).
 *
 * `facesPerUnit` y `variantPhotoSlots` vienen del servidor (producto y variante en DB)
 * cuando están disponibles, impidiendo que un `photoSlots` alterado en cliente subcobre,
 * y permitiendo que borradores legados de packs múltiples resuelvan contra la variante base.
 */
export function designUnitPriceMultiplier(
  canvasData: unknown,
  facesPerUnit = 1,
  variantPhotoSlots?: number | null,
): number {
  const faces = Math.max(1, positiveInt(facesPerUnit) ?? 1);
  const serverPhotoSlots = positiveInt(variantPhotoSlots);

  if (!declaresUnits(canvasData)) {
    if (canvasData && typeof canvasData === "object" && serverPhotoSlots !== null) {
      const cd = canvasData as DesignUnitsShape;
      if (cd.version === 2) {
        const slotCount = intOrNull(cd.slotCount) ?? 1;
        const covered = serverPhotoSlots * faces;
        if (slotCount > covered) {
          return Math.max(1, Math.ceil(slotCount / covered));
        }
      }
    }
    return 1;
  }

  const cd = canvasData as DesignUnitsShape;
  const slotCount = intOrNull(cd.slotCount) ?? 1;
  const declaredPhotoSlots = intOrNull(cd.photoSlots);
  const declaredUnitSlots = intOrNull(cd.unitSlots);
  let covered: number;
  if (declaredPhotoSlots !== null) {
    covered = (serverPhotoSlots ?? declaredPhotoSlots) * faces;
  } else if (faces > 1 && serverPhotoSlots !== null) {
    covered = serverPhotoSlots * faces;
  } else if (serverPhotoSlots !== null && declaredUnitSlots !== 12) {
    covered = serverPhotoSlots;
  } else {
    covered = declaredUnitSlots ?? 1;
  }
  return Math.max(1, Math.ceil(slotCount / Math.max(1, covered)));
}

/**
 * Unidades declaradas por un diseño de SET DE LETRAS (metadata, no canvasData).
 */
export function letterSetUnitCount(metadata: unknown): number {
  if (!metadata || typeof metadata !== "object") return 1;
  const m = metadata as { surface?: unknown; unitCount?: unknown };
  if (m.surface !== "letterset") return 1;
  const n = m.unitCount;
  return typeof n === "number" && Number.isInteger(n) && n >= 1
    ? Math.min(MAX_LETTER_SET_UNITS, n)
    : 1;
}

/** Unidades comerciales por copia de una línea (diseños en canvas × sets de letras). */
export function commercialDesignUnitsForItem(input: {
  customDesign?: unknown;
  metadata?: unknown;
  variantAttrs?: unknown;
  productSchema?: unknown;
  design?: { canvasData?: unknown; metadata?: unknown } | null;
  variant?: {
    attributes?: unknown;
    product?: { personalizationSchema?: unknown } | null;
  } | null;
}): number {
  const variantAttrs = (input.variantAttrs ?? input.variant?.attributes ?? {}) as Record<
    string,
    unknown
  >;
  const productSchema = (input.productSchema ??
    input.variant?.product?.personalizationSchema ??
    {}) as Record<string, unknown>;
  const canvasData = input.customDesign ?? input.design?.canvasData;
  const designMeta = input.design?.metadata ?? input.metadata;
  const facesPerUnit = positiveInt(productSchema.facesPerUnit) ?? 1;
  const variantPhotoSlots = positiveInt(variantAttrs.photoSlots);
  return (
    designUnitPriceMultiplier(canvasData, facesPerUnit, variantPhotoSlots) *
    letterSetUnitCount(designMeta)
  );
}

/**
 * Unidades físicas que una línea descuenta de inventario y declara a logística.
 * Tolera tanto el contrato plano (`variantAttrs`, `productSchema`) como una fila
 * `OrderItem` / `CartItem` hidratada de Prisma (`variant.attributes`, `design.canvasData`).
 */
export function inventoryUnitsForOrderItem(input: {
  qty: number;
  designUnits?: number | null;
  customDesign?: unknown;
  metadata?: unknown;
  variantAttrs?: unknown;
  productSchema?: unknown;
  design?: { canvasData?: unknown; metadata?: unknown } | null;
  variant?: {
    attributes?: unknown;
    product?: { personalizationSchema?: unknown } | null;
  } | null;
}): number {
  const variantAttrs = (input.variantAttrs ?? input.variant?.attributes ?? {}) as Record<
    string,
    unknown
  >;
  const packUnits = positiveInt(variantAttrs.quantity) ?? 1;
  const explicitDesignUnits = positiveInt(input.designUnits);
  const designUnits = explicitDesignUnits ?? commercialDesignUnitsForItem(input);
  return input.qty * packUnits * designUnits;
}

/**
 * Valor declarado POR unidad física para cotización/guía (ShipmentItem.qty
 * cuenta unidades FÍSICAS — inventoryUnits).
 */
export function declaredValueCopPerInventoryUnit(input: {
  unitPriceCop: number;
  qty: number;
  inventoryUnits: number;
}): number {
  if (input.qty < 1 || input.inventoryUnits <= input.qty) return input.unitPriceCop;
  return Math.round((input.unitPriceCop * input.qty) / input.inventoryUnits);
}

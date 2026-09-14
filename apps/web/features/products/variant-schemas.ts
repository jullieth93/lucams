/*
 * M.3.b.CAT.1 — Zod schemas para ProductVariant.attributes.
 *
 * `ProductVariant.attributes` es Prisma Json libre, pero para que el storefront
 * + editor + carrito puedan leerlo consistentemente, validamos con Zod runtime
 * y exponemos type-safe TS.
 *
 * Convención: cada variant declara los attributes que la diferencian dentro
 * de la familia (cantidad de fotos, tamaño físico, color, finish). Estos
 * attributes OVERRIDEAN los del `product.personalizationSchema` cuando el
 * cliente elige esa variante en el storefront.
 *
 * Ejemplos:
 *   - Variant "Polaroid Set 6 unidades" → { photoSlots: 6, sizeCm: "7×9" }
 *   - Variant "Polaroid Set 12 unidades" → { photoSlots: 12, sizeCm: "6×8" }
 *   - Variant "Cuadro 20×20 cm" → { sizeCm: "20×20" }
 */

import { z } from "zod";

export const ProductVariantAttributesSchema = z.object({
  /** Tamaño físico del producto. Override de product.personalizationSchema.sizeCm. */
  sizeCm: z.string().optional(),
  /** Cantidad de slots de foto. Override de product.personalizationSchema.photoSlots. */
  photoSlots: z.number().int().min(1).max(50).optional(),
  /**
   * Cantidad de UNIDADES del set/pack (distinto de photoSlots). Ej: recordatorios
   * pre-armados x20 invitados, separadores x10, mini calendarios x20. Cada unidad
   * NO se personaliza con foto individual del cliente — comparten diseño base o
   * son items genéricos del pack.
   *
   * Diferencia conceptual:
   *  - photoSlots = N huecos donde el cliente sube N fotos distintas para N imanes.
   *  - quantity   = N unidades idénticas (o variantes pre-diseñadas) del producto.
   */
  quantity: z.number().int().min(1).max(500).optional(),
  /** Forma física. Override. */
  shape: z.enum(["rectangle", "circle", "heart", "custom"]).optional(),
  /** Acabado del material. Override. "glass" = frente vidrio premium. */
  finish: z.enum(["matte", "glossy", "soft-touch", "glass"]).optional(),
  /** Color de fondo del producto (ej. boxes en rosa vs azul). Solo presentación. */
  color: z.string().optional(),
  /** cornerRadius en px sobre stage del unitTemplate. Override. */
  cornerRadiusPx: z.number().int().min(0).max(500).optional(),
  /** Aspect ratio (ej. "1:1", "4:5"). Override. */
  aspectRatio: z.string().optional(),
  /**
   * ADR-057 — Discriminador de sub-tipo dentro de la familia, para que el Estudio
   * ramifique por variante hacia la superficie correcta (no solo "foto"). Ej. el
   * Abecedario usa "full"/"vowels" (sets fijos → carrito directo) vs "name" (escribir
   * un nombre → fichas). Antes se DESCARTABA en el merge → el editor no distinguía.
   */
  variant: z.string().optional(),
  /**
   * Etiqueta de forma visible de la familia (separadores: "cuadrado" | "rectangular").
   * La distinción en PDP/Estudio la hacen `sizeCm`/`aspectRatio`; esta etiqueta es
   * metadata de la variante (nombres, reportes).
   */
  variantShape: z.string().optional(),
  /** Cantidad fija de piezas/letras del set (ej. abecedario completo = 27). */
  letterCount: z.number().int().min(1).max(50).optional(),
  /** Mín. de letras para la variante "nombre" (ej. abecedario = 3). */
  letterCountMin: z.number().int().min(1).max(50).optional(),
  /** Máx. de letras para la variante "nombre" (ej. abecedario = 10). */
  letterCountMax: z.number().int().min(1).max(50).optional(),
  /**
   * ADR-057 — Nivel de tamaño (mini/clasica/grande) para agrupar variantes por
   * tamaño en el editor. `sizeCm` sigue siendo la medida física; `size` es la etiqueta.
   */
  size: z.string().optional(),
  /** ADR-057 — true = con imán (default), false = sin imán / adhesivo (más barato). */
  magnet: z.boolean().optional(),
  /** ADR-057 — idioma del producto (ej. abecedario "es"/"en"). Dimensión "Idioma". */
  language: z.string().optional(),
  /**
   * Catálogo WhatsApp D3 (2026-07-22) — color del marco impreso del fotoimán
   * ("blanco" | "negro"). Dimensión "Marco" en la PDP. El Estudio aún NO renderiza
   * el marco en el canvas (pendiente Frente E): viaja como dato para la cotización.
   */
  frameStyle: z.string().optional(),
  /**
   * Catálogo WhatsApp C1 (2026-07-22) — estilo visual de la Polaroid
   * ("blanco-clasico" | "pasteles" | "instagram"). Dimensión "Estilo" en la PDP.
   */
  variantStyle: z.string().optional(),
  /**
   * Catálogo WhatsApp C2 (2026-07-22) — tema de las fichas ilustradas
   * ("animales" | "frutas" | "profesiones"). Dimensión "Tema" en la PDP.
   */
  theme: z.string().optional(),
  /**
   * ADR-057 — precio POR FICHA (Nombre Personalizado): `price` de la variante es el
   * precio de UNA ficha; el total = nº de letras × price. El gate canónico sigue siendo
   * `variant === "name"`; esto documenta el modelo y evita que se strippee al parsear.
   */
  pricePerTile: z.boolean().optional(),
});

export type ProductVariantAttributes = z.infer<typeof ProductVariantAttributesSchema>;

/**
 * Variantes que el cliente puede ELEGIR: descarta la variante "Default"/"Única" vacía
 * (sin attributes) que createProduct autocrea, cuando hay al menos una variante real.
 * ADR-057 cert: la ficha y el VariantSelector DEBEN derivar de aquí para no
 * desincronizarse (galería/precio vs chip resaltado).
 */
export function selectableVariants<T extends { attributes: unknown }>(variants: T[]): T[] {
  const withAttrs = variants.filter(
    (v) => Object.keys(parseVariantAttributes(v.attributes)).length > 0,
  );
  return withAttrs.length > 0 ? withAttrs : variants;
}

/**
 * Parsea attributes Json con default vacío si malformed. Backward-compat:
 * variants viejas con attributes={} retornan objeto vacío sin error.
 */
export function parseVariantAttributes(raw: unknown): ProductVariantAttributes {
  const parsed = ProductVariantAttributesSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

/**
 * Reporte Lucy 2026-08-25 (separadores-magneticos: 12 opciones = 2 diseños ×
 * 6 cantidades; tuvo que subir 45 fotos distintas en Supabase Storage cuando
 * solo había 2 diseños): las fotos de PORTADA se gestionan por DISEÑO —lo que
 * cambia cómo luce el producto: tamaño, forma, color…— NO por cantidad.
 *
 * Estas claves de attributes NO distinguen diseño y se excluyen de la firma:
 *  - quantity / photoSlots: cuántas unidades/fotos lleva el set (el diseño es el mismo).
 *  - pricePerTile: es pricing por ficha (ADR-057), no presentación.
 *  - magnet (2026-09-08, "¿Con imán?" para TODOS los productos): el imán va en la
 *    parte de ATRÁS — la portada (frente) de la opción Con imán y de la Sin imán
 *    es la misma foto. Sin esta exclusión Lucy tendría que subir las fotos de
 *    portada DOS veces por diseño (mismo reporte del 2026-08-25).
 *
 * Las opciones del mismo diseño comparten el mismo array de fotos (las URLs de
 * Storage se escriben una sola vez y se referencian desde cada opción).
 */
const COVER_SIGNATURE_IGNORED_KEYS: ReadonlySet<string> = new Set([
  "quantity",
  "photoSlots",
  "pricePerTile",
  "magnet",
]);

/**
 * Firma visual de una variante: JSON estable de las entries de sus attributes
 * con las claves ordenadas alfabéticamente, EXCLUYENDO las que no cambian el
 * diseño (COVER_SIGNATURE_IGNORED_KEYS) y los valores undefined. Dos variantes
 * del mismo producto con la misma firma son el mismo diseño → comparten fotos
 * de portada (ver variant-images.tsx e image-actions.ts del admin).
 */
export function variantCoverSignature(attrs: ProductVariantAttributes): string {
  const entries = Object.entries(attrs)
    .filter(([key, value]) => value !== undefined && !COVER_SIGNATURE_IGNORED_KEYS.has(key))
    .sort(([keyA], [keyB]) => (keyA < keyB ? -1 : keyA > keyB ? 1 : 0));
  return JSON.stringify(entries);
}

/**
 * Agrupa variantes por firma de portada (mismo diseño). Parsea attributes con
 * parseVariantAttributes: attributes malformed → {} → firma vacía ("[]"), el
 * grupo de las opciones "sin diseño declarado".
 */
export function groupVariantsByCoverSignature<T extends { id: string; attributes: unknown }>(
  variants: T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const variant of variants) {
    const signature = variantCoverSignature(parseVariantAttributes(variant.attributes));
    const group = groups.get(signature);
    if (group) {
      group.push(variant);
    } else {
      groups.set(signature, [variant]);
    }
  }
  return groups;
}

/**
 * true si dos arrays de fotos (URLs) tienen el mismo contenido EN EL MISMO
 * ORDEN — el orden importa: la primera foto es la portada del diseño.
 */
export function sameImageArrays(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((url, idx) => url === b[idx]);
}

/**
 * Claves de attributes que el form de /admin/productos/[id]/variants EDITA
 * explícitamente (parseAttributesFromForm). Toda otra clave conocida del schema
 * (frameStyle, variantStyle, theme, language, size, letterCount…) NO tiene
 * campo en el form. `magnet` entró al form el 2026-09-08 ("¿Con imán?" first-class:
 * select Sí/No con precio por opción — regla Lucy: TODOS los productos ofrecen
 * las dos opciones).
 */
const FORM_MANAGED_ATTRIBUTE_KEYS: ReadonlySet<string> = new Set([
  "sizeCm",
  "photoSlots",
  "quantity",
  "color",
  "aspectRatio",
  "shape",
  "finish",
  "magnet",
]);

/**
 * Ola 2A (catálogo WhatsApp, Lucy 2026-07-22) — dimensiones que YA NO se muestran como
 * grupo de chips en la PDP porque se eligen DENTRO del Estudio (plantilla/estilo visual).
 * Las variantes y sus attributes NO se tocan (viajan como dato para preselección y
 * cotización); solo se oculta el grupo del selector:
 *   - Polaroid: "Estilo" (variantStyle) → marco de color en el Estudio.
 *   - Fotoimanes Cuadrados: "Marco" (frameStyle) → marco de color en el Estudio.
 *   - Pack Vocales: "Tema" (theme) → tema en el Estudio.
 * (2026-08-12) "Idioma" (language) YA NO se oculta en abecedario-completo ni
 * pack-vocales: ambos productos dejaron de ser personalizables (kind NONE,
 * compra directa) — ocultar Idioma dejaba al cliente sin forma de elegirlo
 * (bug reportado por Lucy en STG: solo se podía comprar el idioma por defecto).
 * Llave = slug del producto (familia). Valor = claves de attributes a ocultar.
 */
export const PDP_HIDDEN_DIMENSION_KEYS: Readonly<Record<string, readonly string[]>> = {
  // Regla 2026-09-08b (Lucy, unificación "Unidades"): la PDP muestra UN solo
  // concepto de cantidad — la dimensión "Unidades" (pack size: cuántas piezas
  // trae el set) — en TODAS las familias de tamaño variable, polaroid y
  // cuadrados incluidos (antes elegían el N DENTRO del Estudio). El N elegido
  // viaja en ?variant= → el Estudio abre con ese N (merge de la variante sobre
  // el schema: su control de N arranca en ese valor) y, si el cliente lo cambia
  // allá, el carrito re-resuelve la variante desde el canvasData guardado
  // (photo-pack-resolve.ts) — una sola fuente de verdad al cobrar.
  // (2026-09-09, owner) EXCEPCIÓN híbrida: tiras-magneticas-fotos muestra DOS
  // selectores ("Fotos por tira" = composición + "Unidades" = copias) — ver
  // PDP_PACK_PLUS_COPIES_SLUGS.
  // Lo que sigue oculto acá es lo que se elige como PLANTILLA/estilo en el
  // Estudio (variantStyle/frameStyle/theme), nunca la cantidad.
  "set-fotoimanes-polaroid": ["variantStyle"],
  "set-fotoimanes-cuadrados": ["frameStyle"],
  "pack-vocales": ["theme"],
  // Separadores: quantity == photoSlots 1:1 (cada separador lleva 1 foto por
  // cara): se oculta photoSlots (dato técnico del Estudio) y queda quantity →
  // grupo "Unidades" con stepper 1..6 (label vía PDP_DIMENSION_LABEL_OVERRIDES).
  "separadores-magneticos": ["photoSlots"],
  "separadores-alargados": ["photoSlots"],
  // Tiras: quantity es 1 en todas las variantes (la tira es 1 unidad); la
  // elección de composición es photoSlots (3 ó 4 fotos por tira, 1:1 con el
  // tamaño) → se oculta quantity (además tiene 1 solo valor → ni siquiera
  // entraría al selector) y photoSlots queda visible. (2026-09-09, owner) Esa
  // dimensión se RELABELA a "Fotos por tira" (PDP_DIMENSION_LABEL_OVERRIDES)
  // porque "Unidades" pasa a ser el stepper de copias (PDP_PACK_PLUS_COPIES_SLUGS).
  "tiras-magneticas-fotos": ["quantity"],
};

/**
 * (2026-09-09, owner) — Excepción HÍBRIDA a la regla 2026-09-08b ("un concepto
 * de cantidad por producto"): Tiras Magnéticas muestra DOS selectores en la PDP:
 *   - "Fotos por tira" (chips 3/4 — COMPOSICIÓN, dimensión photoSlots del
 *     VariantSelector: fija la variante, el tamaño físico y el N del Estudio);
 *   - "Unidades" (stepper 1..99 — COPIAS, CartItem.qty: cuántas tiras idénticas;
 *     viaja como ?copies=N al Estudio y de ahí al carrito, igual que en los
 *     productos de composición fija).
 * El resto de los packs de tamaño variable (separadores/polaroid/cuadrados)
 * sigue con UN solo concepto: su "Unidades" es el pack size y NO renderizan el
 * stepper de copias (se ajusta en el carrito).
 */
export const PDP_PACK_PLUS_COPIES_SLUGS: ReadonlySet<string> = new Set(["tiras-magneticas-fotos"]);

/**
 * (2026-09-09, owner) — dims de cantidad que se quedan en CHIPS aunque sus
 * valores sean numéricos (excepción al stepper universal de pack size del
 * VariantSelector): la COMPOSICIÓN de los híbridos (PDP_PACK_PLUS_COPIES_SLUGS).
 * En tiras, photoSlots ("Fotos por tira", 3/4) es composición — el stepper
 * "Unidades" de esa ficha es el de COPIAS (CopiesQtyInput). Llave = slug del
 * producto → claves de attributes excluidas del stepper.
 */
export const PDP_QUANTITY_CHIP_DIMS: Readonly<Record<string, readonly string[]>> = {
  "tiras-magneticas-fotos": ["photoSlots"],
};

/**
 * Regla 2026-09-08b (Lucy) — UN concepto, UN label: la dimensión de pack size se
 * llama "Unidades" en TODA PDP. La CLAVE que lo transporta varía por familia:
 * en separadores es `quantity`; en polaroid/cuadrados es `photoSlots`
 * (quantity == photoSlots y el dedupe conserva photoSlots, primera en
 * VISIBLE_DIMENSIONS). Los valores mantienen su sustantivo descriptivo
 * ("3 fotos" en tiras — la tira es UNA pieza con 3 fotos); lo unificado es el
 * nombre de la dimensión. Llave = slug del producto → dimKey → label visible.
 *
 * EXCEPCIÓN (2026-09-09, owner): en tiras la dimensión photoSlots se relabela
 * "Fotos por tira" (es COMPOSICIÓN, no cantidad de compra) porque "Unidades"
 * pasa a nombrar el stepper de copias que convive en la misma ficha
 * (PDP_PACK_PLUS_COPIES_SLUGS) — dos conceptos, dos labels distintos.
 */
export const PDP_DIMENSION_LABEL_OVERRIDES: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  "separadores-magneticos": { quantity: "Unidades" },
  "separadores-alargados": { quantity: "Unidades" },
  // (2026-09-09, owner) Tiras híbrido: photoSlots = "Fotos por tira" (composición);
  // "Unidades" es el stepper de copias del buy-box (PDP_PACK_PLUS_COPIES_SLUGS).
  "tiras-magneticas-fotos": { photoSlots: "Fotos por tira" },
  "set-fotoimanes-polaroid": { photoSlots: "Unidades" },
  "set-fotoimanes-cuadrados": { photoSlots: "Unidades" },
  // (2026-09-07) Cobertura preventiva: INACTIVOS hoy; si Lucy los reactiva, su
  // pack size (sus variantes del seed FI-CIRC/FI-COR declaran SOLO photoSlots)
  // también sale como "Unidades" — no se oculta nada en PDP_HIDDEN_DIMENSION_KEYS.
  "set-fotoimanes-circulares": { photoSlots: "Unidades" },
  "set-fotoimanes-corazon": { photoSlots: "Unidades" },
};

/**
 * Default "Con imán" (regla 2026-09-08b — ¿Con imán? en TODOS los productos):
 * cuando TODAS las variantes seleccionables del producto son idénticas salvo por
 * `magnet` (mismo diseño, solo cambia con/sin imán) y hay al menos una de cada
 * opción, la PDP preselecciona la primera variante CON imán — el cliente no debe
 * hacer un click para quedarse con el default que la mayoría quiere. Devuelve
 * esa variante, o null si el producto tiene más dimensiones de elección (esas
 * siguen con selección guiada: el re-anchor del selector prefiere Con imán).
 */
export function conImanDefaultVariant<T extends { attributes: unknown }>(
  variants: readonly T[],
): T | null {
  if (variants.length < 2) return null;
  let sawCon = false;
  let sawSin = false;
  let signature: string | null = null;
  for (const v of variants) {
    const attrs = parseVariantAttributes(v.attributes);
    const { magnet, ...rest } = attrs;
    if (magnet === true) sawCon = true;
    else if (magnet === false) sawSin = true;
    else return null; // variante sin la dimensión: no aplica el default
    const sig = JSON.stringify(
      Object.entries(rest)
        .filter(([, value]) => value !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    if (signature === null) signature = sig;
    else if (signature !== sig) return null; // difieren en más que el imán
  }
  if (!sawCon || !sawSin) return null;
  return variants.find((v) => parseVariantAttributes(v.attributes).magnet === true) ?? null;
}

/**
 * Lucy 2026-09-05 — packs de fotoimanes (PHOTO_PACK con variantes que declaran
 * photoSlots). Regla 2026-09-08b: la PDP muestra la dimensión "Unidades" (pack
 * size) en TODAS las familias y la selección fija la variante (precio EXACTO;
 * "Desde" solo antes de elegir); el Estudio abre con ese N vía ?variant= y, si
 * el cliente cambia el N allá, la cantidad de fotos se re-resuelve en el
 * servidor al agregar al carrito, desde el canvasData guardado del diseño (ver
 * features/products/photo-pack-resolve.ts).
 */
export function isPhotoPackCatalog(
  kind: string,
  variants: ReadonlyArray<{ attributes: unknown }>,
): boolean {
  if (kind !== "PHOTO_PACK") return false;
  return variants.some((v) => parseVariantAttributes(v.attributes).photoSlots != null);
}

/** Tamaños físicos distintos declarados en las variantes (attrs.sizeCm), sin vacíos. */
export function photoPackDistinctSizes(variants: ReadonlyArray<{ attributes: unknown }>): string[] {
  const sizes = new Set<string>();
  for (const v of variants) {
    const sizeCm = parseVariantAttributes(v.attributes).sizeCm;
    if (sizeCm) sizes.add(sizeCm);
  }
  return [...sizes];
}

/**
 * Precio "Desde $X" de un pack: el mínimo efectivo entre las variantes
 * (price override o basePrice). NUNCA basePrice solo: en varios packs el
 * basePrice quedó desactualizado vs el menor price de variante (ej.
 * set-fotoimanes-cuadrados: basePrice 45.000 vs variante desde 16.000).
 */
export function photoPackMinPrice(
  variants: ReadonlyArray<{ price: number | null }>,
  basePrice: number,
): number {
  if (variants.length === 0) return basePrice;
  return Math.min(...variants.map((v) => v.price ?? basePrice));
}

/**
 * Merge para el update del admin: las claves del form mandan, pero las claves
 * que el form NO puede expresar se PRESERVAN del valor existente en vez de
 * perderse. Sin esto, editar el precio de una variante desde /admin/productos
 * BORRABA silenciosamente sus dimensiones sin campo en el form (ej. frameStyle
 * del fotoimán, variantStyle de la Polaroid, theme/language del Pack Vocales —
 * catálogo WhatsApp 2026-07-22; ya pasaba con size/variantShape, y con magnet
 * hasta que entró al form el 2026-09-08).
 */
export function mergePreservingUnmanagedAttributes(
  existingRaw: unknown,
  formAttrs: ProductVariantAttributes,
): ProductVariantAttributes {
  const existing = parseVariantAttributes(existingRaw);
  const preserved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(existing)) {
    if (value === undefined || FORM_MANAGED_ATTRIBUTE_KEYS.has(key)) continue;
    preserved[key] = value;
  }
  return { ...preserved, ...formAttrs };
}

/**
 * Genera el label human-readable de una variant a partir de sus attributes.
 * Ej. { photoSlots: 12, sizeCm: "6×8" } → "12 fotos · 6×8 cm"
 * Ej. { sizeCm: "20×20" } → "20×20 cm"
 * Ej. {} → "Estándar"
 */
export function generateVariantLabel(attrs: ProductVariantAttributes): string {
  const parts: string[] = [];
  if (attrs.quantity) parts.push(`${attrs.quantity} unidades`);
  if (attrs.photoSlots) parts.push(`${attrs.photoSlots} fotos`);
  if (attrs.sizeCm) parts.push(`${attrs.sizeCm} cm`);
  if (attrs.color) parts.push(attrs.color);
  if (parts.length === 0) return "Estándar";
  return parts.join(" · ");
}

// ─────────────────── Admin CRUD schemas (Lucy edita variants) ───────────────────

/**
 * Parsea los attributes opcionales que vienen del form de
 * /admin/productos/[id]/variants (todos como strings `attr_*`) y los convierte
 * a tipo fuerte. Vacíos quedan undefined para que Zod los omita.
 * Las claves que parsea son exactamente FORM_MANAGED_ATTRIBUTE_KEYS.
 *
 * ¿Con imán? (2026-09-08b — first-class en el form): select Sí/No; vacío =
 * sin definir (no se escribe la clave). Antes `magnet` se preservaba del valor
 * existente pero no se podía EDITAR desde el admin.
 */
export function parseAttributesFromForm(fd: FormData): ProductVariantAttributes {
  const attrs: ProductVariantAttributes = {};
  const sizeCm = String(fd.get("attr_sizeCm") ?? "").trim();
  if (sizeCm) attrs.sizeCm = sizeCm;
  const photoSlots = String(fd.get("attr_photoSlots") ?? "").trim();
  if (photoSlots) {
    const n = Number(photoSlots);
    if (Number.isInteger(n) && n > 0) attrs.photoSlots = n;
  }
  const quantity = String(fd.get("attr_quantity") ?? "").trim();
  if (quantity) {
    const n = Number(quantity);
    if (Number.isInteger(n) && n > 0) attrs.quantity = n;
  }
  const color = String(fd.get("attr_color") ?? "").trim();
  if (color) attrs.color = color;
  const aspectRatio = String(fd.get("attr_aspectRatio") ?? "").trim();
  if (aspectRatio) attrs.aspectRatio = aspectRatio;
  const shape = String(fd.get("attr_shape") ?? "").trim();
  if (shape && ["rectangle", "circle", "heart", "custom"].includes(shape)) {
    attrs.shape = shape as ProductVariantAttributes["shape"];
  }
  const finish = String(fd.get("attr_finish") ?? "").trim();
  if (finish && ["matte", "glossy", "soft-touch", "glass"].includes(finish)) {
    attrs.finish = finish as ProductVariantAttributes["finish"];
  }
  const magnet = String(fd.get("attr_magnet") ?? "").trim();
  if (magnet === "true") attrs.magnet = true;
  else if (magnet === "false") attrs.magnet = false;
  return attrs;
}

/**
 * Input para crear variant nueva. SKU debe ser único globalmente
 * (constraint Prisma). Si se omite price=null, hereda product.basePrice.
 * stock=0 default (sin enforcement hasta Fase 4 inventario).
 */
export const VariantCreateSchema = z.object({
  productId: z.string().cuid(),
  name: z.string().trim().min(1, "Nombre requerido").max(120),
  sku: z
    .string()
    .trim()
    .min(2, "SKU requerido")
    .max(80)
    .regex(/^[A-Z0-9_-]+$/i, "Solo letras, números, guion y guion bajo"),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /** Precio override en centavos COP. null = hereda basePrice del producto. */
  price: z.number().int().min(0).max(100_000_000).nullable().optional(),
  /** Precio tachado (promo) en centavos COP. null = sin promo. */
  compareAtPrice: z.number().int().min(0).max(100_000_000).nullable().optional(),
  stock: z.number().int().min(0).max(100_000).default(0),
  isActive: z.boolean().default(true),
  attributes: ProductVariantAttributesSchema.default({}),
});

export type VariantCreateInput = z.infer<typeof VariantCreateSchema>;

/**
 * Input para editar variant existente. Todos los campos opcionales — admin
 * cambia solo lo que toca.
 */
export const VariantUpdateSchema = z.object({
  id: z.string().cuid(),
  name: z.string().trim().min(1).max(120).optional(),
  sku: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[A-Z0-9_-]+$/i, "Solo letras, números, guion y guion bajo")
    .optional(),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  price: z.number().int().min(0).max(100_000_000).nullable().optional(),
  compareAtPrice: z.number().int().min(0).max(100_000_000).nullable().optional(),
  stock: z.number().int().min(0).max(100_000).optional(),
  isActive: z.boolean().optional(),
  attributes: ProductVariantAttributesSchema.optional(),
});

export type VariantUpdateInput = z.infer<typeof VariantUpdateSchema>;

/**
 * Mergea attributes de variant sobre personalizationSchema del producto.
 * El variant tiene prioridad: cualquier field declarado en variant override
 * el del producto base. Fields no declarados en variant heredan del producto.
 */
export function mergeVariantOverProduct<
  P extends Record<string, unknown>,
  V extends ProductVariantAttributes,
>(productSchema: P | undefined, variantAttrs: V | undefined): P & V {
  const base = (productSchema ?? {}) as P;
  const overrides = (variantAttrs ?? {}) as V;
  return { ...base, ...overrides } as P & V;
}

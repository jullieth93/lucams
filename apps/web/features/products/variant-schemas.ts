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

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
  /** Forma física. Override. */
  shape: z.enum(["rectangle", "circle", "heart", "custom"]).optional(),
  /** Acabado del material. Override. */
  finish: z.enum(["matte", "glossy", "soft-touch"]).optional(),
  /** Color de fondo del producto (ej. boxes en rosa vs azul). Solo presentación. */
  color: z.string().optional(),
  /** cornerRadius en px sobre stage del unitTemplate. Override. */
  cornerRadiusPx: z.number().int().min(0).max(500).optional(),
  /** Aspect ratio (ej. "1:1", "4:5"). Override. */
  aspectRatio: z.string().optional(),
});

export type ProductVariantAttributes = z.infer<typeof ProductVariantAttributesSchema>;

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
  if (attrs.photoSlots) parts.push(`${attrs.photoSlots} fotos`);
  if (attrs.sizeCm) parts.push(`${attrs.sizeCm} cm`);
  if (attrs.color) parts.push(attrs.color);
  if (parts.length === 0) return "Estándar";
  return parts.join(" · ");
}

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

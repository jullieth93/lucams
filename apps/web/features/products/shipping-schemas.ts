/*
 * Zod schemas para datos de envío del producto.
 *
 * Lucy 2026-05-21: Aveonline necesita peso + dimensiones REALES para
 * cotizar bien. No usar hardcoded placeholders (500g + 10×10×10 cm).
 *
 * Storage: Product.physicalSpecs (Json existente) extiende con weightGrams
 * + widthCm + heightCm + depthCm. ProductVariant.attributes puede tener
 * un key `_shipping` (con underscore prefix para no chocar con attributes
 * de cliente como sizeCm, photoSlots) que overridea por variant.
 *
 * Para productos consolidados (M.3.b.CAT) donde Set 6 vs Set 20 pesan
 * distinto, cada variant debería overridear. Para productos simples,
 * el peso del Product base aplica a todas las variants.
 */

import { z } from "zod";

/**
 * Shipping dims requeridas por Aveonline:
 *   - peso: gramos enteros (Aveonline pide kg, lo dividimos al enviar).
 *   - dimensiones: cm enteros (ancho × alto × largo).
 *
 * Mínimos defensivos:
 *   - weightGrams >= 50 (50g, peso mínimo razonable de un imán pequeño)
 *   - dims >= 1 cm (algo tiene que medir)
 *
 * Máximos defensivos:
 *   - weightGrams <= 50000 (50 kg, paquete enorme)
 *   - dims <= 100 cm (paquete bulk)
 */
export const ShippingDimsSchema = z.object({
  weightGrams: z.number().int().min(50).max(50_000),
  widthCm: z.number().int().min(1).max(100),
  heightCm: z.number().int().min(1).max(100),
  depthCm: z.number().int().min(1).max(100),
});
export type ShippingDims = z.infer<typeof ShippingDimsSchema>;

/**
 * Esquema completo de physicalSpecs (extiende lo que ya había + dims).
 * Todos los campos opcionales individualmente; pero al cotizar, validamos
 * que los 4 críticos (weight + dims) estén presentes.
 */
export const PhysicalSpecsSchema = z
  .object({
    material: z.string().max(120).optional(),
    thicknessMm: z.number().min(0).max(50).optional(),
    magnetType: z.string().max(60).optional(),
    weightGrams: z.number().int().min(50).max(50_000).optional(),
    widthCm: z.number().int().min(1).max(100).optional(),
    heightCm: z.number().int().min(1).max(100).optional(),
    depthCm: z.number().int().min(1).max(100).optional(),
    packaging: z.string().max(200).optional(),
    includes: z.array(z.string().max(200)).max(20).optional(),
    careInstructions: z.string().max(500).optional(),
    countryOfOrigin: z.string().length(2).default("CO").optional(),
  })
  .passthrough(); // permite keys legacy sin romper
export type PhysicalSpecs = z.infer<typeof PhysicalSpecsSchema>;

/**
 * Lee y valida physicalSpecs de un producto (puede venir como unknown del DB).
 * Retorna objeto parseado o vacío si falla parse (tolerante con datos legacy).
 */
export function parsePhysicalSpecs(input: unknown): PhysicalSpecs {
  const result = PhysicalSpecsSchema.safeParse(input ?? {});
  return result.success ? result.data : {};
}

/**
 * Lee override de shipping desde variant.attributes._shipping si existe.
 * Returns null si no hay override (caller usa producto base).
 */
export function parseVariantShippingOverride(attributes: unknown): ShippingDims | null {
  if (!attributes || typeof attributes !== "object") return null;
  const override = (attributes as Record<string, unknown>)._shipping;
  if (!override) return null;
  const result = ShippingDimsSchema.safeParse(override);
  return result.success ? result.data : null;
}

/**
 * Resuelve los shipping dims efectivos para una variant específica:
 *  1. Si variant.attributes._shipping está completo → usar ese
 *  2. Sino, usar product.physicalSpecs (si tiene los 4 campos)
 *  3. Si falta cualquiera → null (caller debe lanzar error)
 *
 * Esto significa: NUNCA asumir valores. Si no hay dims configuradas,
 * la cotización falla con error claro a admin.
 */
export function getEffectiveShippingDims(
  productPhysicalSpecs: unknown,
  variantAttributes: unknown,
): ShippingDims | null {
  // 1. Variant override
  const variantOverride = parseVariantShippingOverride(variantAttributes);
  if (variantOverride) return variantOverride;

  // 2. Product base
  const specs = parsePhysicalSpecs(productPhysicalSpecs);
  if (
    typeof specs.weightGrams === "number" &&
    typeof specs.widthCm === "number" &&
    typeof specs.heightCm === "number" &&
    typeof specs.depthCm === "number"
  ) {
    return {
      weightGrams: specs.weightGrams,
      widthCm: specs.widthCm,
      heightCm: specs.heightCm,
      depthCm: specs.depthCm,
    };
  }

  return null;
}

export class MissingShippingDimsError extends Error {
  constructor(
    public productSlug: string,
    public variantId: string | null,
  ) {
    super(
      `El producto "${productSlug}"${variantId ? ` (variant ${variantId})` : ""} no tiene peso/dimensiones configurados. Configúralos en /admin/productos.`,
    );
    this.name = "MissingShippingDimsError";
  }
}

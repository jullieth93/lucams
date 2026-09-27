import { z } from "zod";

/**
 * PLAN_CATALOG_V2 3.9 — Schema validación cupones.
 *
 * Tipos: PERCENT (value = % 1-100), FIXED (value = COP centavos), FREE_SHIPPING (value ignorado).
 */
const CouponBaseSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[A-Z0-9_-]+$/, "Solo mayúsculas, números, guiones bajos y guiones."),
  type: z.enum(["PERCENT", "FIXED", "FREE_SHIPPING"]),
  value: z.number().int().min(0).max(10_000_000),
  description: z.string().max(200).optional().nullable(),
  isPublic: z.boolean().default(false),
  isActive: z.boolean().default(true),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date(),
  minOrder: z.number().int().min(0).optional().nullable(),
  maxUses: z.number().int().min(1).optional().nullable(),
  maxUsesPerCustomer: z.number().int().min(1).optional().nullable(),
  requiresMinQuantity: z.number().int().min(1).optional().nullable(),
  appliesToCategories: z.array(z.string()).default([]),
  appliesToProductSlugs: z.array(z.string()).default([]),
});

// A5-04 (remediación R6, 2026-09-27): PERCENT tope 1-100. Antes el max global
// de 10_000_000 permitía crear un cupón de 150% que al aplicarse se clampeaba
// en silencio al 100% del subtotal (redemption.ts) — el admin creía haber
// configurado otra cosa. El servicio valida la misma regla (defensa en capas);
// aquí el error llega al form ANTES de tocar la DB. Tolera entrada parcial
// (update): solo dispara cuando type y value vienen en el payload.
function percentRangeCheck(
  data: { type?: "PERCENT" | "FIXED" | "FREE_SHIPPING"; value?: number | null },
  ctx: z.RefinementCtx,
) {
  if (data.type === "PERCENT" && data.value != null && (data.value < 1 || data.value > 100)) {
    ctx.addIssue({
      code: "custom",
      path: ["value"],
      message: "Para descuento %, el valor debe estar entre 1 y 100.",
    });
  }
}

export const CouponCreateSchema = CouponBaseSchema.superRefine(percentRangeCheck);
export type CouponCreateInput = z.infer<typeof CouponCreateSchema>;

export const CouponUpdateSchema = CouponBaseSchema.partial()
  .extend({
    id: z.string().cuid(),
  })
  .superRefine(percentRangeCheck);
export type CouponUpdateInput = z.infer<typeof CouponUpdateSchema>;

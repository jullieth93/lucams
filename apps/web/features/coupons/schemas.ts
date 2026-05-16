import { z } from "zod";

/**
 * PLAN_CATALOG_V2 3.9 — Schema validación cupones.
 *
 * Tipos: PERCENT (value = % 1-100), FIXED (value = COP centavos), FREE_SHIPPING (value ignorado).
 */
export const CouponCreateSchema = z.object({
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
export type CouponCreateInput = z.infer<typeof CouponCreateSchema>;

export const CouponUpdateSchema = CouponCreateSchema.partial().extend({
  id: z.string().cuid(),
});
export type CouponUpdateInput = z.infer<typeof CouponUpdateSchema>;

import { z } from "zod";

/**
 * PLAN_CATALOG_V2 3.9 — Schema validación cupones.
 *
 * Tipos:
 *   - PERCENT: `value` = porcentaje entero 1..100.
 *   - FIXED: `value` = centavos COP enteros 100..10_000_000 ($1..$100.000 COP).
 *   - FREE_SHIPPING: `value` se normaliza a 0.
 */
const CouponBaseSchema = z.object({
  code: z
    .string()
    .min(3, "El código debe tener al menos 3 caracteres.")
    .max(40, "El código no puede superar 40 caracteres.")
    .regex(/^[A-Z0-9_-]+$/, "Solo mayúsculas, números, guiones bajos y guiones."),
  type: z.enum(["PERCENT", "FIXED", "FREE_SHIPPING"]),
  value: z
    .number()
    .int("El valor debe ser un número entero.")
    .min(0)
    .max(10_000_000, "Para descuento fijo en pesos, el máximo permitido es $100.000 COP."),
  description: z
    .string()
    .max(200, "La descripción no puede superar 200 caracteres.")
    .optional()
    .nullable(),
  isPublic: z.boolean().default(false),
  isActive: z.boolean().default(true),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date(),
  minOrder: z
    .number()
    .int()
    .min(0)
    .max(500_000_000, "El pedido mínimo no puede superar $5.000.000 COP.")
    .optional()
    .nullable(),
  maxUses: z
    .number()
    .int()
    .min(1, "El máximo de usos debe ser al menos 1.")
    .max(1_000_000, "El límite global no puede superar 1.000.000 usos.")
    .optional()
    .nullable(),
  maxUsesPerCustomer: z
    .number()
    .int()
    .min(1, "El máximo por cliente debe ser al menos 1.")
    .max(1_000_000, "El límite por cliente no puede superar 1.000.000 usos.")
    .optional()
    .nullable(),
  requiresMinQuantity: z
    .number()
    .int()
    .min(1, "La cantidad mínima debe ser al menos 1 unidad.")
    .max(100_000, "La cantidad mínima no puede superar 100.000 unidades.")
    .optional()
    .nullable(),
  appliesToCategories: z.array(z.string()).default([]),
  appliesToProductSlugs: z.array(z.string()).default([]),
});

function couponRefinements(
  data: {
    type?: "PERCENT" | "FIXED" | "FREE_SHIPPING";
    value?: number | null;
    maxUses?: number | null;
    maxUsesPerCustomer?: number | null;
  },
  ctx: z.RefinementCtx,
) {
  if (data.type === "PERCENT" && data.value != null && (data.value < 1 || data.value > 100)) {
    ctx.addIssue({
      code: "custom",
      path: ["value"],
      message: "Para descuento %, el valor debe estar entre 1 y 100.",
    });
  }
  if (data.type === "FIXED" && data.value != null && data.value < 100) {
    ctx.addIssue({
      code: "custom",
      path: ["value"],
      message: "Para descuento fijo en pesos, el valor debe ser al menos $1 COP.",
    });
  }
  if (
    data.maxUses != null &&
    data.maxUsesPerCustomer != null &&
    data.maxUsesPerCustomer > data.maxUses
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["maxUsesPerCustomer"],
      message: "El límite por cliente no puede superar el límite total de usos.",
    });
  }
}

export const CouponCreateSchema = CouponBaseSchema.superRefine(couponRefinements);
export type CouponCreateInput = z.infer<typeof CouponCreateSchema>;

export const CouponUpdateSchema = CouponBaseSchema.partial()
  .extend({
    id: z.string().cuid(),
  })
  .superRefine(couponRefinements);
export type CouponUpdateInput = z.infer<typeof CouponUpdateSchema>;

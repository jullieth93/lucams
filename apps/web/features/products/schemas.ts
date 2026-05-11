/*
 * Schemas Zod para CRUD de productos en admin.
 *
 * Patrón documentado en docs/CONVENTIONS.md § capa de servicio:
 * schemas.ts vive aparte de service.ts y actions.ts. Server actions
 * importan estos schemas para validar input antes de pasarlo al service.
 *
 * Reglas:
 *  - Precios en CENTAVOS COP (Int), nunca floats — mandato CLAUDE.md.
 *  - Slug en kebab-case (validación regex).
 *  - SKU alphanumeric + guiones, único en DB.
 *  - description min 10 chars (evita placeholders).
 */

import { z } from "zod";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const skuRegex = /^[A-Z0-9-]+$/;

export const ProductCreateSchema = z.object({
  name: z
    .string()
    .min(2, "Nombre muy corto (mín 2 chars)")
    .max(120, "Máximo 120 chars"),
  slug: z
    .string()
    .min(2, "Slug muy corto")
    .max(80, "Máximo 80 chars")
    .regex(slugRegex, "Solo minúsculas, números y guiones (ej. iman-foto-personalizado)"),
  description: z
    .string()
    .min(10, "Descripción muy corta (mín 10 chars)")
    .max(5000, "Máximo 5000 chars"),
  basePrice: z
    .number({ message: "Precio inválido" })
    .int("Debe ser un entero (centavos COP)")
    .nonnegative("No puede ser negativo")
    .max(100_000_000, "Demasiado alto"),
  compareAtPrice: z
    .number()
    .int()
    .nonnegative()
    .max(100_000_000)
    .optional()
    .nullable(),
  cost: z.number().int().nonnegative().max(100_000_000).optional().nullable(),
  sku: z
    .string()
    .min(2)
    .max(40)
    .regex(skuRegex, "Solo mayúsculas, números y guiones (ej. IMAN-FOTO-A4)"),
  categoryId: z.string().cuid("Categoría inválida"),
  isPersonalizable: z.boolean().default(false),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  seoTitle: z.string().max(70).optional().nullable(),
  seoDescription: z.string().max(160).optional().nullable(),
});

export type ProductCreateInput = z.infer<typeof ProductCreateSchema>;

export const ProductUpdateSchema = ProductCreateSchema.partial().extend({
  id: z.string().cuid(),
});

export type ProductUpdateInput = z.infer<typeof ProductUpdateSchema>;
